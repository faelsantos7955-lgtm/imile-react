"""
api/routes/monitoramento.py — Monitoramento Diário de Entregas
"""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log
from api.limiter import limiter
from api.upload_utils import validar_arquivo
import pandas as pd
import io, re
from datetime import date as _date_cls
from typing import List, Optional

router = APIRouter()


# ══════════════════════════════════════════════════════════════════
#  HELPERS — processar_fontes
# ══════════════════════════════════════════════════════════════════

async def _ler_excel_files(files: List[UploadFile], sheet_name=0) -> list:
    """Lê múltiplos UploadFiles como DataFrames (sheet_name fixa)."""
    dfs = []
    for f in files:
        content = await f.read()
        try:
            dfs.append(pd.read_excel(io.BytesIO(content), sheet_name=sheet_name))
        except Exception:
            pass
    return dfs


async def _ler_estoque_files(files: List[UploadFile]) -> list:
    """Lê Estoque priorizando aba 'details'."""
    dfs = []
    for f in files:
        content = await f.read()
        try:
            xls = pd.ExcelFile(io.BytesIO(content))
            sheet = 'details' if 'details' in xls.sheet_names else xls.sheet_names[0]
            dfs.append(pd.read_excel(xls, sheet_name=sheet))
        except Exception:
            pass
    return dfs


def _norm_ds(series: pd.Series) -> pd.Series:
    return series.astype(str).str.strip().str.upper()


def _parse_rdc(dfs: list) -> pd.DataFrame:
    if not dfs:
        return pd.DataFrame(columns=['ds', 'rdc_ds'])
    df = pd.concat(dfs, ignore_index=True)
    col = next((c for c in df.columns if c in ('Delivery Station', 'Destination Statio')), None)
    if not col:
        return pd.DataFrame(columns=['ds', 'rdc_ds'])
    df['ds'] = _norm_ds(df[col])
    return df[df['ds'].str.startswith('DS')].groupby('ds').size().reset_index(name='rdc_ds')


def _parse_recebidos(dfs: list) -> tuple:
    """Retorna (DataFrame com recebimento, data_ref str | None)."""
    if not dfs:
        return pd.DataFrame(columns=['ds', 'recebimento']), None
    df = pd.concat(dfs, ignore_index=True)
    col = next((c for c in df.columns if c in ('Scan Station', 'Delivery Station')), None)
    if not col:
        return pd.DataFrame(columns=['ds', 'recebimento']), None
    df['ds'] = _norm_ds(df[col])
    df = df[df['ds'].str.startswith('DS')]

    data_ref = None
    time_col = next((c for c in df.columns if 'Scan Time' in str(c) or 'Scan time' in str(c)), None)
    if time_col:
        ts = pd.to_datetime(df[time_col], errors='coerce').dropna()
        if not ts.empty:
            data_ref = ts.dt.date.mode()[0].isoformat()

    return df.groupby('ds').size().reset_index(name='recebimento'), data_ref


def _parse_expedidos(dfs: list) -> pd.DataFrame:
    if not dfs:
        return pd.DataFrame(columns=['ds', 'volume_saida', 'qtd_motoristas'])
    df = pd.concat(dfs, ignore_index=True)
    col_ds = next((c for c in df.columns if c in ('Scan station', 'Scan Station')), None)
    col_da = next((c for c in df.columns if c == 'DA Code'), None)
    col_wb = next((c for c in df.columns if c in ('Waybill No.', 'Waybill Number')), None)
    if not col_ds:
        return pd.DataFrame(columns=['ds', 'volume_saida', 'qtd_motoristas'])
    df['ds'] = _norm_ds(df[col_ds])
    df = df[df['ds'].str.startswith('DS')]
    agg = {}
    if col_wb:
        agg['volume_saida'] = (col_wb, 'count')
    if col_da:
        agg['qtd_motoristas'] = (col_da, 'nunique')
    if not agg:
        return df.groupby('ds').size().reset_index(name='volume_saida').assign(qtd_motoristas=0)
    result = df.groupby('ds').agg(**agg).reset_index()
    for c in ('volume_saida', 'qtd_motoristas'):
        if c not in result.columns:
            result[c] = 0
    return result


def _parse_assinaturas(dfs: list) -> pd.DataFrame:
    if not dfs:
        return pd.DataFrame(columns=['ds', 'entregue'])
    df = pd.concat(dfs, ignore_index=True)
    col = next((c for c in df.columns if c in ('Scan Station', 'Scan station')), None)
    if not col:
        return pd.DataFrame(columns=['ds', 'entregue'])
    df['ds'] = _norm_ds(df[col])
    return df[df['ds'].str.startswith('DS')].groupby('ds').size().reset_index(name='entregue')


def _parse_estoque(dfs: list) -> tuple:
    """Retorna (est_ds, est_motorista, est_7d) — três DataFrames."""
    empty_ds  = pd.DataFrame(columns=['ds', 'estoque_ds'])
    empty_mot = pd.DataFrame(columns=['ds', 'estoque_motorista'])
    empty_7d  = pd.DataFrame(columns=['ds', 'estoque_7d'])
    if not dfs:
        return empty_ds, empty_mot, empty_7d
    df = pd.concat(dfs, ignore_index=True)
    col_ds     = next((c for c in df.columns if c in ('lastScanSite', 'ds')), None)
    col_status = next((c for c in df.columns if c in ('lastScanStatus', 'status')), None)
    col_age    = next((c for c in df.columns if c in ('ageFirstReceive', 'age')), None)
    if not col_ds:
        return empty_ds, empty_mot, empty_7d
    df['ds'] = _norm_ds(df[col_ds])
    df = df[df['ds'].str.startswith('DS')]
    AGE_7D = {'7-10D', '11-13D', '14-16D', '17-20D', '≥21D'}
    est_ds  = (df[df[col_status] == 'Arrive'].groupby('ds').size().reset_index(name='estoque_ds')
               if col_status else empty_ds)
    est_mot = (df[df[col_status] == 'Out For Delivery'].groupby('ds').size().reset_index(name='estoque_motorista')
               if col_status else empty_mot)
    est_7d  = (df[df[col_age].isin(AGE_7D)].groupby('ds').size().reset_index(name='estoque_7d')
               if col_age else empty_7d)
    return est_ds, est_mot, est_7d


def _parse_supervisores(content: bytes) -> pd.DataFrame:
    df = pd.read_excel(io.BytesIO(content))
    cols = {}
    for c in df.columns:
        cu = str(c).upper()
        if 'SIGLA' in cu:
            cols['ds'] = c
        elif 'REGION' in cu or 'REGIÃO' in cu:
            cols.setdefault('regiao', c)
        elif 'SUPERV' in cu:
            cols.setdefault('supervisor', c)
    if 'ds' not in cols:
        raise ValueError("Coluna SIGLA não encontrada no arquivo Supervisores")
    keep = [cols['ds'], cols.get('regiao', cols['ds']), cols.get('supervisor', cols['ds'])]
    result = df[keep].copy()
    result.columns = ['ds', 'regiao', 'supervisor']
    result['ds'] = _norm_ds(result['ds'])
    return result.dropna(subset=['ds'])


def _safe_int(v):
    try:
        if v is None or v == '' or v == '-':
            return 0
        return int(float(v))
    except (ValueError, TypeError):
        return 0


def _safe_float(v):
    try:
        if v is None or v == '' or v == '-' or v == '0':
            return 0.0
        return round(float(v), 4)
    except (ValueError, TypeError):
        return 0.0


def _ler_relatorio(conteudo: bytes):
    """Lê a aba Relatorio do Excel de monitoramento."""
    buf = io.BytesIO(conteudo)
    df = pd.read_excel(buf, sheet_name='Relatorio', header=0)
    df.columns = df.columns.str.strip()

    # Primeira coluna = DS, renomear
    first_col = df.columns[0]
    col_map = {
        first_col:     'ds',
        df.columns[1]:  'supervisor',
        df.columns[2]:  'regiao',
        df.columns[3]:  'rdc_ds',
        df.columns[4]:  'estoque_ds',
        df.columns[5]:  'estoque_motorista',
        df.columns[6]:  'estoque_total',
        df.columns[7]:  'estoque_7d',
        df.columns[8]:  'recebimento',
        df.columns[9]:  'volume_total',
        df.columns[10]: 'pendencia_scan',
        df.columns[11]: 'volume_saida',
        df.columns[12]: 'taxa_expedicao',
        df.columns[13]: 'qtd_motoristas',
        df.columns[14]: 'eficiencia_pessoal',
        df.columns[15]: 'entregue',
        df.columns[16]: 'eficiencia_assinatura',
    }
    df.rename(columns=col_map, inplace=True)

    # Pular linha "Total" e linhas sem DS
    df = df[df['ds'].astype(str).str.startswith('DS', na=False)].copy()
    df['ds'] = df['ds'].astype(str).str.strip().str.upper()
    df['supervisor'] = df['supervisor'].fillna('').str.strip().str.upper()
    df['regiao'] = df['regiao'].fillna('').str.strip()

    # Remover DS duplicados, manter apenas a primeira ocorrência
    df = df.drop_duplicates(subset=['ds'], keep='first')

    # Extrair data de referência da primeira coluna
    # Formatos possíveis: timestamp Excel, "2026-03-06", "06-03" (DD-MM), "20-02 DS" (DD-MM texto)
    data_ref = ''
    from datetime import date as _date
    first_col_str = str(first_col).strip() if pd.notna(first_col) else ''
    try:
        ts = pd.Timestamp(first_col)
        if not pd.isna(ts):
            data_ref = ts.date().isoformat()
    except Exception:
        pass
    if not data_ref:
        # YYYY-MM-DD explícito
        m = re.search(r'(\d{4}-\d{2}-\d{2})', first_col_str)
        if m:
            data_ref = m.group(1)
    if not data_ref:
        # DD-MM (ex: "20-02", "06-03", "20-02 DS")
        m = re.search(r'(\d{1,2})-(\d{1,2})', first_col_str)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            year = _date.today().year
            try:
                data_ref = _date(year, month, day).isoformat()
            except ValueError:
                pass
    if not data_ref:
        data_ref = _date.today().isoformat()

    return df, data_ref


def _peek_data_ref_monitoramento(conteudo: bytes) -> str | None:
    """Extrai data_ref lendo apenas o cabeçalho da aba Relatorio."""
    try:
        df = pd.read_excel(io.BytesIO(conteudo), sheet_name='Relatorio', header=0, nrows=0)
        first_col = str(df.columns[0]).strip() if len(df.columns) else ''
        if not first_col:
            return None
        try:
            ts = pd.Timestamp(first_col)
            if not pd.isna(ts):
                return ts.date().isoformat()
        except Exception:
            pass
        m = re.search(r'(\d{4}-\d{2}-\d{2})', first_col)
        if m:
            return m.group(1)
        m = re.search(r'(\d{1,2})-(\d{1,2})', first_col)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            try:
                return _date_cls(_date_cls.today().year, month, day).isoformat()
            except ValueError:
                pass
    except Exception:
        pass
    return None


# ── GET /uploads ──────────────────────────────────────────────
@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM monitoramento_uploads ORDER BY criado_em DESC LIMIT 30")
    ).mappings().all()
    return [dict(r) for r in rows]


# ── DELETE /upload/{id} ───────────────────────────────────────
@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM monitoramento_diario WHERE upload_id = :id"), {"id": upload_id})
    db.execute(text("DELETE FROM monitoramento_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log("upload_deletado", f"monitoramento_uploads:{upload_id}", {}, user)
    return {"ok": True}


# ── GET /upload/{id} ──────────────────────────────────────────
@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    up = db.execute(
        text("SELECT * FROM monitoramento_uploads WHERE id = :id"), {"id": upload_id}
    ).mappings().first()
    if not up:
        raise HTTPException(404, "Não encontrado")

    rows = db.execute(
        text("SELECT * FROM monitoramento_diario WHERE upload_id = :uid ORDER BY ds"),
        {"uid": upload_id}
    ).mappings().all()
    rows = [dict(r) for r in rows]

    totais = {
        'rdc_ds': sum(r.get('rdc_ds', 0) or 0 for r in rows),
        'estoque_ds': sum(r.get('estoque_ds', 0) or 0 for r in rows),
        'estoque_motorista': sum(r.get('estoque_motorista', 0) or 0 for r in rows),
        'estoque_total': sum(r.get('estoque_total', 0) or 0 for r in rows),
        'estoque_7d': sum(r.get('estoque_7d', 0) or 0 for r in rows),
        'recebimento': sum(r.get('recebimento', 0) or 0 for r in rows),
        'volume_total': sum(r.get('volume_total', 0) or 0 for r in rows),
        'volume_saida': sum(r.get('volume_saida', 0) or 0 for r in rows),
        'qtd_motoristas': sum(r.get('qtd_motoristas', 0) or 0 for r in rows),
        'entregue': sum(r.get('entregue', 0) or 0 for r in rows),
    }
    vt = totais['volume_total']
    nm = totais['qtd_motoristas']
    totais['taxa_expedicao'] = round(totais['volume_saida'] / vt, 4) if vt else 0
    totais['eficiencia_pessoal'] = round(totais['volume_saida'] / nm, 2) if nm else 0
    totais['eficiencia_assinatura'] = round(totais['entregue'] / nm, 2) if nm else 0

    return {
        'upload': dict(up),
        'totais': totais,
        'dados': rows,
    }


# ── POST /processar-fontes ────────────────────────────────────
@router.post("/processar-fontes")
@limiter.limit("5/minute")
async def processar_fontes(
    request: Request,
    rdc:          List[UploadFile] = File(default=[]),
    recebidos:    List[UploadFile] = File(default=[]),
    expedidos:    List[UploadFile] = File(default=[]),
    estoque:      List[UploadFile] = File(default=[]),
    assinaturas:  List[UploadFile] = File(default=[]),
    supervisores: Optional[UploadFile] = File(default=None),
    data_ref_manual: Optional[str] = Form(default=None),
    skip_if_exists:  bool           = Form(default=False),
    user: dict    = Depends(require_admin),
    db: Session   = Depends(get_db),
):
    """Processa fontes brutas (LoadingScan, Arrival, etc.) e gera o relatório diário."""
    # 1. Ler arquivos
    rdc_dfs   = await _ler_excel_files(rdc)
    recv_dfs  = await _ler_excel_files(recebidos)
    exp_dfs   = await _ler_excel_files(expedidos)
    est_dfs   = await _ler_estoque_files(estoque)
    assin_dfs = await _ler_excel_files(assinaturas)

    # 2. Parsear cada fonte
    rdc_count               = _parse_rdc(rdc_dfs)
    recv_count, data_ref_auto = _parse_recebidos(recv_dfs)
    exp_agg                 = _parse_expedidos(exp_dfs)
    assin_count             = _parse_assinaturas(assin_dfs)
    est_ds, est_mot, est_7d = _parse_estoque(est_dfs)

    data_ref = data_ref_manual or data_ref_auto or _date_cls.today().isoformat()

    if skip_if_exists:
        existing = db.execute(
            text("SELECT id FROM monitoramento_uploads WHERE data_ref = :dr"), {"dr": data_ref}
        ).mappings().first()
        if existing:
            return {"skipped": True, "data_ref": data_ref, "upload_id": existing["id"]}

    # 3. Supervisores → base de DS + supervisor/região
    sup_df = None
    if supervisores:
        sup_content = await supervisores.read()
        try:
            sup_df = _parse_supervisores(sup_content)
        except ValueError:
            pass

    if sup_df is not None and not sup_df.empty:
        ds_base = sup_df[['ds', 'regiao', 'supervisor']].drop_duplicates(subset=['ds'])
    else:
        # Derivar DS list da união de todas as fontes
        all_ds: set = set()
        for df_src in (rdc_count, recv_count, exp_agg, assin_count, est_ds, est_mot, est_7d):
            if 'ds' in df_src.columns:
                all_ds.update(df_src['ds'].dropna().tolist())
        if not all_ds:
            raise HTTPException(400, "Nenhuma DS encontrada nos arquivos enviados")
        ds_base = pd.DataFrame({'ds': sorted(all_ds), 'regiao': '', 'supervisor': ''})

    ds_base = ds_base[ds_base['ds'].str.startswith('DS', na=False)].drop_duplicates(subset=['ds'])
    if ds_base.empty:
        raise HTTPException(400, "Nenhuma DS encontrada nos arquivos enviados")

    # 4. Merge tudo
    df = ds_base.copy()
    for merge_df in (rdc_count, recv_count, exp_agg, assin_count, est_ds, est_mot, est_7d):
        if not merge_df.empty and 'ds' in merge_df.columns:
            df = df.merge(merge_df, on='ds', how='left')

    # 5. Colunas numéricas → inteiros
    for col in ('rdc_ds', 'recebimento', 'volume_saida', 'qtd_motoristas', 'entregue',
                'estoque_ds', 'estoque_motorista', 'estoque_7d'):
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = df[col].fillna(0).astype(int)

    # 6. Colunas derivadas
    df['estoque_total']  = df['estoque_ds'] + df['estoque_motorista']
    df['volume_total']   = df['recebimento']
    df['pendencia_scan'] = (df['volume_total'] - df['volume_saida']).clip(lower=0)
    vt = df['volume_total'].replace(0, float('nan'))
    nm = df['qtd_motoristas'].replace(0, float('nan'))
    df['taxa_expedicao']        = (df['volume_saida'] / vt).fillna(0).round(4)
    df['eficiencia_pessoal']    = (df['volume_saida'] / nm).fillna(0).round(2)
    df['eficiencia_assinatura'] = (df['entregue'] / nm).fillna(0).round(2)

    # 7. Persistir
    total_ds = len(df)
    row = db.execute(
        text("""
            INSERT INTO monitoramento_uploads (data_ref, criado_por, total_ds)
            VALUES (:data_ref, :criado_por, :total_ds)
            RETURNING id
        """),
        {"data_ref": data_ref, "criado_por": user["email"], "total_ds": total_ds}
    ).mappings().first()
    uid = row["id"]
    db.commit()

    rows_db = []
    for _, r in df.iterrows():
        rows_db.append({
            "upload_id": uid,
            "ds": str(r['ds']),
            "supervisor": str(r.get('supervisor', '') or ''),
            "regiao": str(r.get('regiao', '') or ''),
            "rdc_ds": int(r['rdc_ds']),
            "estoque_ds": int(r['estoque_ds']),
            "estoque_motorista": int(r['estoque_motorista']),
            "estoque_total": int(r['estoque_total']),
            "estoque_7d": int(r['estoque_7d']),
            "recebimento": int(r['recebimento']),
            "volume_total": int(r['volume_total']),
            "pendencia_scan": int(r['pendencia_scan']),
            "volume_saida": int(r['volume_saida']),
            "taxa_expedicao": float(r['taxa_expedicao']),
            "qtd_motoristas": int(r['qtd_motoristas']),
            "eficiencia_pessoal": float(r['eficiencia_pessoal']),
            "entregue": int(r['entregue']),
            "eficiencia_assinatura": float(r['eficiencia_assinatura']),
        })

    for i in range(0, len(rows_db), 500):
        db.execute(
            text("""
                INSERT INTO monitoramento_diario
                    (upload_id, ds, supervisor, regiao, rdc_ds, estoque_ds, estoque_motorista,
                     estoque_total, estoque_7d, recebimento, volume_total, pendencia_scan,
                     volume_saida, taxa_expedicao, qtd_motoristas, eficiencia_pessoal,
                     entregue, eficiencia_assinatura)
                VALUES (:upload_id, :ds, :supervisor, :regiao, :rdc_ds, :estoque_ds, :estoque_motorista,
                        :estoque_total, :estoque_7d, :recebimento, :volume_total, :pendencia_scan,
                        :volume_saida, :taxa_expedicao, :qtd_motoristas, :eficiencia_pessoal,
                        :entregue, :eficiencia_assinatura)
            """),
            rows_db[i:i+500]
    )
    db.commit()
    audit_log("processar_fontes", f"monitoramento_uploads:{uid}", {"data_ref": data_ref, "total_ds": total_ds}, user)

    return {"upload_id": uid, "total_ds": total_ds, "data_ref": data_ref}


# ── POST /processar ───────────────────────────────────────────
@router.post("/processar")
@limiter.limit("10/minute")
async def processar_monitoramento(
    request: Request,
    file: UploadFile = File(...),
    skip_if_exists: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conteudo = await validar_arquivo(file)

    if skip_if_exists:
        data_ref_peek = _peek_data_ref_monitoramento(conteudo)
        if data_ref_peek:
            existing = db.execute(
                text("SELECT id FROM monitoramento_uploads WHERE data_ref = :dr"), {"dr": data_ref_peek}
            ).mappings().first()
            if existing:
                return {"skipped": True, "data_ref": data_ref_peek, "upload_id": existing["id"]}

    buf = io.BytesIO(conteudo)
    xls = pd.ExcelFile(buf)

    if 'Relatorio' not in xls.sheet_names:
        raise HTTPException(400, "Aba 'Relatorio' não encontrada no arquivo. Envie o relatório diário no formato correto.")

    buf.seek(0)
    df, data_ref = _ler_relatorio(conteudo)

    if df.empty:
        raise HTTPException(400, "Nenhuma DS encontrada no arquivo")

    row = db.execute(
        text("""
            INSERT INTO monitoramento_uploads (data_ref, criado_por, total_ds)
            VALUES (:data_ref, :criado_por, :total_ds)
            RETURNING id
        """),
        {"data_ref": data_ref, "criado_por": user["email"], "total_ds": len(df)}
    ).mappings().first()
    uid = row["id"]
    db.commit()

    rows_db = []
    for _, r in df.iterrows():
        rows_db.append({
            "upload_id": uid,
            "ds": str(r.get('ds', '')),
            "supervisor": str(r.get('supervisor', '')),
            "regiao": str(r.get('regiao', '')),
            "rdc_ds": _safe_int(r.get('rdc_ds', 0)),
            "estoque_ds": _safe_int(r.get('estoque_ds', 0)),
            "estoque_motorista": _safe_int(r.get('estoque_motorista', 0)),
            "estoque_total": _safe_int(r.get('estoque_total', 0)),
            "estoque_7d": _safe_int(r.get('estoque_7d', 0)),
            "recebimento": _safe_int(r.get('recebimento', 0)),
            "volume_total": _safe_int(r.get('volume_total', 0)),
            "pendencia_scan": _safe_int(r.get('pendencia_scan', 0)),
            "volume_saida": _safe_int(r.get('volume_saida', 0)),
            "taxa_expedicao": _safe_float(r.get('taxa_expedicao', 0)),
            "qtd_motoristas": _safe_int(r.get('qtd_motoristas', 0)),
            "eficiencia_pessoal": _safe_float(r.get('eficiencia_pessoal', 0)),
            "entregue": _safe_int(r.get('entregue', 0)),
            "eficiencia_assinatura": _safe_float(r.get('eficiencia_assinatura', 0)),
        })

    for i in range(0, len(rows_db), 500):
        db.execute(
            text("""
                INSERT INTO monitoramento_diario
                    (upload_id, ds, supervisor, regiao, rdc_ds, estoque_ds, estoque_motorista,
                     estoque_total, estoque_7d, recebimento, volume_total, pendencia_scan,
                     volume_saida, taxa_expedicao, qtd_motoristas, eficiencia_pessoal,
                     entregue, eficiencia_assinatura)
                VALUES (:upload_id, :ds, :supervisor, :regiao, :rdc_ds, :estoque_ds, :estoque_motorista,
                        :estoque_total, :estoque_7d, :recebimento, :volume_total, :pendencia_scan,
                        :volume_saida, :taxa_expedicao, :qtd_motoristas, :eficiencia_pessoal,
                        :entregue, :eficiencia_assinatura)
            """),
            rows_db[i:i+500]
        )
    db.commit()

    return {"upload_id": uid, "total_ds": len(df), "data_ref": data_ref}

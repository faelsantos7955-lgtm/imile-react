"""
api/routes/notracking_upload.py — Processamento do relatório No Tracking (断更)
"""
import io
import uuid
import logging
import threading
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import text

from api.deps import get_db, get_current_user, require_admin, audit_log, _engine
from api.limiter import limiter
from api.upload_utils import validar_arquivo

log = logging.getLogger("notracking")

router = APIRouter()

_ENGINE = "openpyxl"
try:
    import python_calamine  # noqa: F401
    _ENGINE = "calamine"
except ImportError:
    pass

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _make_db() -> Session:
    return sessionmaker(bind=_engine(), autocommit=False, autoflush=False)()


FAIXAS_ORDER = ['<1', '1 ≤ X < 3', '3 ≤ X < 5', '5 ≤ X < 7',
                '7 ≤ X < 10', '10 ≤ X < 16', '16 ≤ X < 20', 'X ≥ 20']

FAIXAS_7D_MAIS = {'7 ≤ X < 10', '10 ≤ X < 16', '16 ≤ X < 20', 'X ≥ 20'}

STATUS_REMOVER = {
    'transferência concluída',
    'envio',
    'entregue',
    'em transferência',
    'descarregado',
    'coleta concluída',
    'pedido finalizado anormal',
}

_ABAS = ['BD', 'SemMovimentaçãoBase', 'Sem Movimentação', 'SemMovimentacao']


def _calc_faixa(aging: float) -> str:
    if aging < 1:   return '<1'
    if aging < 3:   return '1 ≤ X < 3'
    if aging < 5:   return '3 ≤ X < 5'
    if aging < 7:   return '5 ≤ X < 7'
    if aging < 10:  return '7 ≤ X < 10'
    if aging < 16:  return '10 ≤ X < 16'
    if aging < 20:  return '16 ≤ X < 20'
    return 'X ≥ 20'


def _mapear_colunas(df: pd.DataFrame) -> dict:
    mapa = {}
    for c in df.columns:
        cs = str(c).strip()
        cl = cs.lower()

        if 'etiqueta' in cl or 'número da' in cl or cs in (
            'Waybill number', 'Waybill No', 'Waybill No.', 'WaybillNo',
            'Tracking No.', 'Tracking Number',
        ):
            mapa[c] = 'etiqueta'
        elif 'último status' in cl or cs in (
            'Last Scan Type', 'LastScanType', 'Status',
        ) or ('status' in cl and 'último' in cl):
            mapa[c] = 'status'
        elif 'statusocorr' in cl or 'status ocorr' in cl:
            mapa[c] = 'status_ocorrencia'
        elif cs == 'Current branch name':
            mapa[c] = 'station'
        elif cs in ('Station',) and 'station' not in mapa.values():
            mapa[c] = 'station'
        elif cs in ('DS²', 'DS2', 'DS') and 'station' not in mapa.values():
            mapa[c] = 'station'
        elif cs in ('SUPERVISOR', 'Supervisor', 'Responsável', 'Responsavel'):
            mapa[c] = 'supervisor'
        elif cs in ('Regional', 'Região', 'Regiao') and 'regional' not in mapa.values():
            mapa[c] = 'regional'
        elif cs in ('AGING', 'Aging', 'No Tracking Time (D)', 'Age', 'Dias sem tracking', '大于10D', '大于10d'):
            mapa[c] = 'aging'
        elif cs in ('DIAS EM ABERTO', 'RangeSemMovimentação', 'Range', 'Faixa'):
            mapa[c] = 'faixa'
        elif 'valor declarado' in cl or cs in (
            'Uploaded Declared Value', 'Declared Value',
        ):
            mapa[c] = 'valor'

    return mapa


def _ler_aba(conteudo: bytes) -> pd.DataFrame:
    buf = io.BytesIO(conteudo)
    try:
        xl = pd.ExcelFile(buf, engine=_ENGINE)
    except Exception:
        xl = pd.ExcelFile(io.BytesIO(conteudo))

    aba = next((a for a in _ABAS if a in xl.sheet_names), None)
    if aba is None:
        aba = xl.sheet_names[0]

    df = xl.parse(aba)
    df.columns = df.columns.str.strip()
    return df


def _processar(conteudo: bytes) -> dict:
    df = _ler_aba(conteudo)

    mapa = _mapear_colunas(df)
    df = df.rename(columns=mapa)

    obrigatorias = ['etiqueta', 'station']
    faltando = [c for c in obrigatorias if c not in df.columns]
    if faltando:
        raise HTTPException(
            400,
            f"Colunas obrigatórias não encontradas: {faltando}. "
            f"Colunas disponíveis: {list(df.columns)}"
        )

    df = df.dropna(subset=['etiqueta']).copy()
    etiqueta_num = pd.to_numeric(df['etiqueta'], errors='coerce')
    if etiqueta_num.notna().any():
        df = df[etiqueta_num.notna()].copy()
        df['etiqueta'] = etiqueta_num[etiqueta_num.notna()].astype('int64').astype(str)
    else:
        df['etiqueta'] = df['etiqueta'].astype(str).str.strip()
        df = df[df['etiqueta'].str.match(r'^\d+$')].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum waybill válido encontrado.")

    df['station'] = df['station'].fillna('').astype(str).str.strip().str.upper()
    df = df[df['station'].str.startswith('SP')].copy()
    if df.empty:
        raise HTTPException(400, "Nenhum pacote de São Paulo encontrado. Verifique se as stations começam com 'SP'.")

    df['status']   = df['status'].fillna('').astype(str).str.strip() \
                     if 'status' in df.columns else pd.Series('', index=df.index)
    df['supervisor'] = df['supervisor'].fillna('').astype(str).str.strip().str.upper() \
                       if 'supervisor' in df.columns else pd.Series('', index=df.index)
    df['regional'] = df['regional'].fillna('').astype(str).str.strip() \
                     if 'regional' in df.columns else pd.Series('', index=df.index)
    df['valor']    = pd.to_numeric(df['valor'], errors='coerce').fillna(0) \
                     if 'valor' in df.columns else pd.Series(0.0, index=df.index)
    df['aging']    = pd.to_numeric(df['aging'], errors='coerce').fillna(0) \
                     if 'aging' in df.columns else pd.Series(0.0, index=df.index)

    has_status = 'status' in df.columns and df['status'].ne('').any()
    if has_status:
        mask_remover = df['status'].str.lower().isin(STATUS_REMOVER)
        df = df[~mask_remover].copy()

    if 'status_ocorrencia' in df.columns:
        mask_ok = df['status_ocorrencia'].fillna('').str.strip().str.lower() == 'considerar'
        if mask_ok.any():
            df = df[mask_ok].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum pacote restante após aplicar filtros de status.")

    if 'faixa' in df.columns and df['faixa'].fillna('').astype(str).str.strip().ne('').any():
        df['faixa'] = df['faixa'].fillna('').astype(str).str.strip()
        mask_aging_ok = df['aging'].between(0, 999)
        df.loc[~mask_aging_ok, 'aging'] = df.loc[~mask_aging_ok, 'faixa'].map(
            lambda f: {'<1': 0, '1 ≤ X < 3': 1, '3 ≤ X < 5': 3,
                       '5 ≤ X < 7': 5, '7 ≤ X < 10': 7, '10 ≤ X < 16': 10,
                       '16 ≤ X < 20': 16, 'X ≥ 20': 20}.get(f, 0)
        )
    else:
        df.loc[df['aging'] > 999, 'aging'] = 20
        df['faixa'] = df['aging'].apply(_calc_faixa)

    df['is_7d'] = df['faixa'].isin(FAIXAS_7D_MAIS)

    total         = len(df)
    valor_total   = round(float(df['valor'].sum()), 2)
    total_7d_mais = int(df['is_7d'].sum())
    data_ref      = date.today().isoformat()

    grp_ds = (
        df.groupby(['station', 'supervisor', 'regional'], dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'), total_7d_mais=('is_7d', 'sum'))
        .reset_index()
    )
    por_ds = sorted([
        {
            'station':       str(r['station']),
            'supervisor':    str(r['supervisor']),
            'regional':      str(r['regional']),
            'total':         int(r['total']),
            'valor_total':   round(float(r['valor_total']), 2),
            'total_7d_mais': int(r['total_7d_mais']),
        }
        for _, r in grp_ds.iterrows()
        if r['station']
    ], key=lambda x: x['total'], reverse=True)

    grp_sup = (
        df.groupby(['supervisor', 'regional'], dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'), total_7d_mais=('is_7d', 'sum'))
        .reset_index()
    )
    por_sup = sorted([
        {
            'supervisor':    str(r['supervisor']),
            'regional':      str(r['regional']),
            'total':         int(r['total']),
            'valor_total':   round(float(r['valor_total']), 2),
            'total_7d_mais': int(r['total_7d_mais']),
        }
        for _, r in grp_sup.iterrows()
        if r['supervisor']
    ], key=lambda x: x['total'], reverse=True)

    grp_sta = (
        df.groupby('status', dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    por_status = sorted([
        {
            'status':      str(r['status']) if r['status'] else 'Sem status',
            'total':       int(r['total']),
            'valor_total': round(float(r['valor_total']), 2),
        }
        for _, r in grp_sta.iterrows()
    ], key=lambda x: x['total'], reverse=True)

    grp_fai = (
        df.groupby('faixa', dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    faixa_idx = {f: i for i, f in enumerate(FAIXAS_ORDER)}
    por_faixa = sorted([
        {
            'faixa':       str(r['faixa']),
            'total':       int(r['total']),
            'valor_total': round(float(r['valor_total']), 2),
            'pct':         round(int(r['total']) / total * 100, 2) if total else 0,
        }
        for _, r in grp_fai.iterrows()
        if r['faixa']
    ], key=lambda x: faixa_idx.get(x['faixa'], 99))

    return {
        'total':         total,
        'valor_total':   valor_total,
        'total_7d_mais': total_7d_mais,
        'data_ref':      data_ref,
        'por_ds':        por_ds,
        'por_sup':       por_sup,
        'por_status':    por_status,
        'por_faixa':     por_faixa,
    }


def _run_job(job_id: str, conteudo: bytes, user: dict):
    db = _make_db()

    def _set(update: dict):
        with _jobs_lock:
            _jobs[job_id].update(update)

    try:
        _set({"fase": "processando"})
        resultado = _processar(conteudo)

        _set({"fase": "salvando"})

        existing = db.execute(
            text("SELECT id FROM notracking_uploads WHERE data_ref = :dr"),
            {"dr": resultado['data_ref']}
        ).mappings().first()
        if existing:
            old_id = existing["id"]
            for tbl in ("notracking_por_ds", "notracking_por_sup", "notracking_por_status", "notracking_por_faixa"):
                try:
                    db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
                except Exception:
                    pass
            db.execute(text("DELETE FROM notracking_uploads WHERE id = :id"), {"id": old_id})
            db.commit()

        row = db.execute(
            text("""
                INSERT INTO notracking_uploads (data_ref, criado_por, total, valor_total, total_7d_mais)
                VALUES (:data_ref, :criado_por, :total, :valor_total, :total_7d_mais)
                RETURNING id
            """),
            {
                "data_ref":      resultado['data_ref'],
                "criado_por":    user["email"],
                "total":         resultado['total'],
                "valor_total":   resultado['valor_total'],
                "total_7d_mais": resultado['total_7d_mais'],
            }
        ).mappings().first()
        uid = row["id"]
        db.commit()

        if resultado['por_ds']:
            rows = [{"upload_id": uid, **r} for r in resultado['por_ds']]
            for i in range(0, len(rows), 1000):
                db.execute(
                    text("INSERT INTO notracking_por_ds (upload_id, station, supervisor, regional, total, valor_total, total_7d_mais) VALUES (:upload_id, :station, :supervisor, :regional, :total, :valor_total, :total_7d_mais)"),
                    rows[i:i+1000]
                )
            db.commit()

        if resultado['por_sup']:
            db.execute(
                text("INSERT INTO notracking_por_sup (upload_id, supervisor, regional, total, valor_total, total_7d_mais) VALUES (:upload_id, :supervisor, :regional, :total, :valor_total, :total_7d_mais)"),
                [{"upload_id": uid, **r} for r in resultado['por_sup']]
            )
            db.commit()

        if resultado['por_status']:
            db.execute(
                text("INSERT INTO notracking_por_status (upload_id, status, total, valor_total) VALUES (:upload_id, :status, :total, :valor_total)"),
                [{"upload_id": uid, **r} for r in resultado['por_status']]
            )
            db.commit()

        if resultado['por_faixa']:
            db.execute(
                text("INSERT INTO notracking_por_faixa (upload_id, faixa, total, valor_total, pct) VALUES (:upload_id, :faixa, :total, :valor_total, :pct)"),
                [{"upload_id": uid, **r} for r in resultado['por_faixa']]
            )
            db.commit()

        audit_log("upload_processado", f"notracking_uploads:{uid}", {"total": resultado['total']}, user)
        log.info("[job:%s] notracking concluído — upload_id=%d total=%d", job_id, uid, resultado['total'])
        _set({"status": "done", "upload_id": uid, "total": resultado['total'], "data_ref": resultado['data_ref']})

    except Exception as e:
        log.error("[job:%s] ERRO: %s", job_id, e, exc_info=True)
        db.rollback()
        _set({"status": "error", "erro": str(e)})
    finally:
        db.close()


@router.post("/processar")
@limiter.limit("10/minute")
async def processar_notracking(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conteudo = await validar_arquivo(file)
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {"status": "processing", "fase": "iniciando"}
    threading.Thread(target=_run_job, args=(job_id, conteudo, user), daemon=True).start()
    return {"job_id": job_id, "status": "processing"}


@router.get("/job/{job_id}")
def status_job(job_id: str, user: dict = Depends(get_current_user)):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job não encontrado — o servidor pode ter reiniciado.")
    return job


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    for tbl in ("notracking_por_ds", "notracking_por_sup", "notracking_por_status", "notracking_por_faixa"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
        except Exception:
            raise HTTPException(500, f"Erro ao deletar {tbl}")
    db.execute(text("DELETE FROM notracking_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log("upload_deletado", f"notracking_uploads:{upload_id}", {}, user)
    return {"ok": True}

"""
api/routes/monitoramento.py — Monitoramento Diário de Entregas
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from api.deps import get_supabase, get_current_user, require_admin
from api.limiter import limiter
from api.upload_utils import validar_arquivo
import pandas as pd
import io, re

router = APIRouter()


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

    # Extrair data do nome da primeira coluna (ex: "03-03 DS")
    # FIX: first_col pode ser NaN quando a coluna não tem nome no Excel
    data_ref = ''
    first_col_str = str(first_col) if pd.notna(first_col) else ''
    match = re.search(r'(\d{2}-\d{2})', first_col_str)
    if match:
        data_ref = match.group(1)

    return df, data_ref


def _computar_do_raw(conteudo: bytes):
    """Fallback: computa KPIs a partir das abas brutas caso Relatorio não exista."""
    buf = io.BytesIO(conteudo)
    xls = pd.ExcelFile(buf)

    # Supervisores
    sup_df = pd.read_excel(xls, sheet_name='Supervisores' if 'Supervisores' in xls.sheet_names else xls.sheet_names[0])
    sup_df.columns = sup_df.columns.str.strip()
    sigla_col = [c for c in sup_df.columns if 'SIGLA' in c.upper()]
    sup_col = [c for c in sup_df.columns if 'SUPERVISOR' in c.upper()]
    reg_col = [c for c in sup_df.columns if 'REGION' in c.upper()]

    sup_map = {}
    if sigla_col and sup_col:
        for _, r in sup_df.iterrows():
            ds = str(r[sigla_col[0]]).strip().upper()
            sup_map[ds] = {
                'supervisor': str(r[sup_col[0]]).strip().upper() if pd.notna(r[sup_col[0]]) else '',
                'regiao': str(r[reg_col[0]]).strip() if reg_col and pd.notna(r[reg_col[0]]) else '',
            }

    all_ds = sorted(sup_map.keys())

    rdc = pd.read_excel(xls, sheet_name='RDC_') if 'RDC_' in xls.sheet_names else pd.DataFrame()
    rdc_col = 'Destination Statio' if 'Destination Statio' in rdc.columns else (rdc.columns[12] if len(rdc.columns) > 12 else None)

    est = pd.read_excel(xls, sheet_name='Estoque_') if 'Estoque_' in xls.sheet_names else pd.DataFrame()
    est_ds_col = 'last_scan_station' if 'last_scan_station' in est.columns else (est.columns[10] if len(est.columns) > 10 else None)

    est7 = pd.read_excel(xls, sheet_name='Estoque +7') if 'Estoque +7' in xls.sheet_names else pd.DataFrame()
    est7_ds_col = 'last_scan_station' if 'last_scan_station' in est7.columns else (est7.columns[10] if len(est7.columns) > 10 else None)

    rec = pd.read_excel(xls, sheet_name='Pacotes recebidos hoje_') if 'Pacotes recebidos hoje_' in xls.sheet_names else pd.DataFrame()
    rec_ds_col = 'Scan Station' if 'Scan Station' in rec.columns else (rec.columns[10] if len(rec.columns) > 10 else None)

    exp = pd.read_excel(xls, sheet_name='Pacotes expedidos de hoje_') if 'Pacotes expedidos de hoje_' in xls.sheet_names else pd.DataFrame()
    exp_ds_col = 'Scan station' if 'Scan station' in exp.columns else (exp.columns[24] if len(exp.columns) > 24 else None)
    exp_da_col = 'DA Name' if 'DA Name' in exp.columns else (exp.columns[6] if len(exp.columns) > 6 else None)

    ass = pd.read_excel(xls, sheet_name='Assinaturas-Entregas de hoje_') if 'Assinaturas-Entregas de hoje_' in xls.sheet_names else pd.DataFrame()
    ass_ds_col = 'Scan Station' if 'Scan Station' in ass.columns else (ass.columns[15] if len(ass.columns) > 15 else None)

    def count_ds(df, col, ds):
        if df.empty or col is None:
            return 0
        return int((df[col].fillna('').str.strip().str.upper() == ds).sum())

    rows = []
    for ds in all_ds:
        info = sup_map.get(ds, {})
        rdc_count = count_ds(rdc, rdc_col, ds)
        est_total = count_ds(est, est_ds_col, ds)
        est7_count = count_ds(est7, est7_ds_col, ds)
        receb = count_ds(rec, rec_ds_col, ds)
        vol_total = est_total + receb
        saida = count_ds(exp, exp_ds_col, ds)

        if not exp.empty and exp_ds_col and exp_da_col:
            mask = exp[exp_ds_col].fillna('').str.strip().str.upper() == ds
            drivers = exp.loc[mask, exp_da_col].dropna().str.strip()
            drivers = drivers[drivers != '']
            n_drivers = drivers.nunique()
        else:
            n_drivers = 0

        entreg = count_ds(ass, ass_ds_col, ds)
        taxa_exp = round(saida / vol_total, 4) if vol_total else 0
        ef_pessoal = round(saida / n_drivers, 2) if n_drivers else 0
        ef_assin = round(entreg / n_drivers, 2) if n_drivers else 0

        rows.append({
            'ds': ds,
            'supervisor': info.get('supervisor', ''),
            'regiao': info.get('regiao', ''),
            'rdc_ds': rdc_count,
            'estoque_ds': est_total,
            'estoque_motorista': 0,
            'estoque_total': est_total,
            'estoque_7d': est7_count,
            'recebimento': receb,
            'volume_total': vol_total,
            'pendencia_scan': rdc_count - receb,
            'volume_saida': saida,
            'taxa_expedicao': taxa_exp,
            'qtd_motoristas': n_drivers,
            'eficiencia_pessoal': ef_pessoal,
            'entregue': entreg,
            'eficiencia_assinatura': ef_assin,
        })

    # Remover DS duplicados, manter apenas a primeira ocorrência
    df = pd.DataFrame(rows)
    df = df.drop_duplicates(subset=['ds'], keep='first')
    return df, ''


# ── GET /uploads ──────────────────────────────────────────────
@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    return sb.table("monitoramento_uploads").select("*").order("criado_em", desc=True).limit(30).execute().data or []


# ── DELETE /upload/{id} ───────────────────────────────────────
@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin)):
    sb = get_supabase()
    sb.table("monitoramento_diario").delete().eq("upload_id", upload_id).execute()
    sb.table("monitoramento_uploads").delete().eq("id", upload_id).execute()
    return {"ok": True}


# ── GET /upload/{id} ──────────────────────────────────────────
@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    up = sb.table("monitoramento_uploads").select("*").eq("id", upload_id).execute()
    if not up.data:
        raise HTTPException(404, "Não encontrado")

    rows = sb.table("monitoramento_diario").select("*").eq("upload_id", upload_id).order("ds").execute().data or []

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
        'upload': up.data[0],
        'totais': totais,
        'dados': rows,
    }


# ── POST /processar ───────────────────────────────────────────
@router.post("/processar")
@limiter.limit("10/minute")
async def processar_monitoramento(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    conteudo = await validar_arquivo(file)
    buf = io.BytesIO(conteudo)
    xls = pd.ExcelFile(buf)

    if 'Relatorio' in xls.sheet_names:
        buf.seek(0)
        df, data_ref = _ler_relatorio(conteudo)
    else:
        buf.seek(0)
        df, data_ref = _computar_do_raw(conteudo)

    if df.empty:
        raise HTTPException(400, "Nenhuma DS encontrada no arquivo")

    sb = get_supabase()
    up = sb.table("monitoramento_uploads").insert({
        "data_ref": data_ref,
        "criado_por": user["email"],
        "total_ds": len(df),
    }).execute()
    uid = up.data[0]["id"]

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
        sb.table("monitoramento_diario").insert(rows_db[i:i+500]).execute()

    return {"upload_id": uid, "total_ds": len(df), "data_ref": data_ref}

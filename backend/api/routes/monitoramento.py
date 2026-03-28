"""
api/routes/monitoramento.py — Monitoramento Diário de Entregas
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from api.deps import get_supabase, get_current_user, require_admin, audit_log
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

    # Extrair data de referência da primeira coluna (que é uma data no Excel)
    data_ref = ''
    try:
        ts = pd.Timestamp(first_col)
        if not pd.isna(ts):
            data_ref = ts.date().isoformat()
    except Exception:
        first_col_str = str(first_col) if pd.notna(first_col) else ''
        match = re.search(r'(\d{4}-\d{2}-\d{2})', first_col_str)
        if match:
            data_ref = match.group(1)

    return df, data_ref



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
    audit_log("upload_deletado", f"monitoramento_uploads:{upload_id}", {}, user)
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

    if 'Relatorio' not in xls.sheet_names:
        raise HTTPException(400, "Aba 'Relatorio' não encontrada no arquivo. Envie o relatório diário no formato correto.")

    buf.seek(0)
    df, data_ref = _ler_relatorio(conteudo)

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

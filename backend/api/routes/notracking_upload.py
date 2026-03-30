"""
api/routes/notracking_upload.py — Processamento do relatório No Tracking (断更)
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from api.deps import get_supabase, get_current_user, require_admin, audit_log
from api.limiter import limiter
from api.upload_utils import validar_arquivo
import pandas as pd
import io
from datetime import date

router = APIRouter()

FAIXAS_ORDER = ['<1', '1 ≤ X < 3', '3 ≤ X < 5', '5 ≤ X < 7',
                '7 ≤ X < 10', '10 ≤ X < 16', '16 ≤ X < 20', 'X ≥ 20']


def _mapear_colunas(df: pd.DataFrame) -> pd.DataFrame:
    """Mapeia colunas do arquivo para nomes internos."""
    col_map = {}
    for c in df.columns:
        cs = str(c).strip()
        if 'Etiqueta' in cs or 'Número da' in cs:
            col_map[c] = 'etiqueta'
        elif 'status' in cs.lower() and 'último' in cs.lower():
            col_map[c] = 'status'
        elif 'Valor Declarado' in cs:
            col_map[c] = 'valor'
        elif cs == 'Station':
            col_map[c] = 'station'
        elif cs == 'AGING':
            col_map[c] = 'aging'
        elif 'DIAS EM ABERTO' in cs:
            col_map[c] = 'faixa'
        elif cs == 'SUPERVISOR':
            col_map[c] = 'supervisor'
        elif cs == 'Regional':
            col_map[c] = 'regional'
        elif cs == 'departamento':
            col_map[c] = 'departamento'
    df = df.rename(columns=col_map)
    return df


def _processar(conteudo: bytes) -> dict:
    buf = io.BytesIO(conteudo)
    try:
        xl = pd.ExcelFile(buf)
    except Exception:
        raise HTTPException(400, "Arquivo inválido. Envie o Excel de No Tracking.")

    if 'BD' not in xl.sheet_names:
        raise HTTPException(400, f"Aba 'BD' não encontrada. Abas presentes: {xl.sheet_names}")

    buf.seek(0)
    df = xl.parse('BD')
    df.columns = df.columns.str.strip()
    df = _mapear_colunas(df)

    obrigatorias = ['etiqueta', 'status', 'station', 'aging', 'faixa', 'supervisor', 'regional', 'valor']
    faltando = [c for c in obrigatorias if c not in df.columns]
    if faltando:
        raise HTTPException(400, f"Colunas não encontradas no arquivo: {faltando}. Verifique se a aba BD está correta.")

    df = df.dropna(subset=['etiqueta']).copy()
    df['etiqueta'] = df['etiqueta'].astype(str).str.strip()
    df = df[df['etiqueta'].str.match(r'^\d+$')].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum pacote válido encontrado na aba BD.")

    df['station']    = df['station'].fillna('').astype(str).str.strip().str.upper()
    df['supervisor'] = df['supervisor'].fillna('').astype(str).str.strip().str.upper()
    df['regional']   = df['regional'].fillna('').astype(str).str.strip()
    df['status']     = df['status'].fillna('').astype(str).str.strip()
    df['faixa']      = df['faixa'].fillna('').astype(str).str.strip()
    df['valor']      = pd.to_numeric(df['valor'], errors='coerce').fillna(0)
    df['aging']      = pd.to_numeric(df['aging'], errors='coerce').fillna(0)
    df['is_7d']      = df['aging'] >= 7

    total         = len(df)
    valor_total   = round(float(df['valor'].sum()), 2)
    total_7d_mais = int(df['is_7d'].sum())
    data_ref      = date.today().isoformat()

    # ── Por DS ──────────────────────────────────────────────
    grp_ds = (
        df.groupby(['station', 'supervisor', 'regional'], dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'), total_7d_mais=('is_7d', 'sum'))
        .reset_index()
    )
    por_ds = sorted([
        {
            'station':      r['station'],
            'supervisor':   r['supervisor'],
            'regional':     r['regional'],
            'total':        int(r['total']),
            'valor_total':  round(float(r['valor_total']), 2),
            'total_7d_mais': int(r['total_7d_mais']),
        }
        for _, r in grp_ds.iterrows()
        if r['station']
    ], key=lambda x: x['total'], reverse=True)

    # ── Por Supervisor ───────────────────────────────────────
    grp_sup = (
        df.groupby(['supervisor', 'regional'], dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'), total_7d_mais=('is_7d', 'sum'))
        .reset_index()
    )
    por_sup = sorted([
        {
            'supervisor':    r['supervisor'],
            'regional':      r['regional'],
            'total':         int(r['total']),
            'valor_total':   round(float(r['valor_total']), 2),
            'total_7d_mais': int(r['total_7d_mais']),
        }
        for _, r in grp_sup.iterrows()
        if r['supervisor']
    ], key=lambda x: x['total'], reverse=True)

    # ── Por Status ───────────────────────────────────────────
    grp_sta = (
        df.groupby('status', dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    por_status = sorted([
        {
            'status':      r['status'],
            'total':       int(r['total']),
            'valor_total': round(float(r['valor_total']), 2),
        }
        for _, r in grp_sta.iterrows()
        if r['status']
    ], key=lambda x: x['total'], reverse=True)

    # ── Por Faixa de Aging ────────────────────────────────────
    grp_fai = (
        df.groupby('faixa', dropna=False)
        .agg(total=('etiqueta', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    faixa_idx = {f: i for i, f in enumerate(FAIXAS_ORDER)}
    por_faixa = sorted([
        {
            'faixa':       r['faixa'],
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


@router.post("/processar")
@limiter.limit("10/minute")
async def processar_notracking(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    conteudo  = await validar_arquivo(file)
    resultado = _processar(conteudo)

    sb = get_supabase()
    up = sb.table("notracking_uploads").insert({
        "data_ref":      resultado['data_ref'],
        "criado_por":    user["email"],
        "total":         resultado['total'],
        "valor_total":   resultado['valor_total'],
        "total_7d_mais": resultado['total_7d_mais'],
    }).execute()
    uid = up.data[0]["id"]

    if resultado['por_ds']:
        rows = [{"upload_id": uid, **r} for r in resultado['por_ds']]
        for i in range(0, len(rows), 500):
            sb.table("notracking_por_ds").insert(rows[i:i+500]).execute()

    if resultado['por_sup']:
        sb.table("notracking_por_sup").insert(
            [{"upload_id": uid, **r} for r in resultado['por_sup']]
        ).execute()

    if resultado['por_status']:
        sb.table("notracking_por_status").insert(
            [{"upload_id": uid, **r} for r in resultado['por_status']]
        ).execute()

    if resultado['por_faixa']:
        sb.table("notracking_por_faixa").insert(
            [{"upload_id": uid, **r} for r in resultado['por_faixa']]
        ).execute()

    audit_log("upload_processado", f"notracking_uploads:{uid}", {"total": resultado['total']}, user)
    return {"upload_id": uid, "total": resultado['total'], "data_ref": resultado['data_ref']}


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin)):
    sb = get_supabase()
    for tbl in ("notracking_por_ds", "notracking_por_sup", "notracking_por_status", "notracking_por_faixa"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            raise HTTPException(500, f"Erro ao deletar {tbl}")
    sb.table("notracking_uploads").delete().eq("id", upload_id).execute()
    audit_log("upload_deletado", f"notracking_uploads:{upload_id}", {}, user)
    return {"ok": True}

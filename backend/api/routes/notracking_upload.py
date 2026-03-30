"""
api/routes/notracking_upload.py — Processamento do relatório No Tracking (断更)

Aceita o arquivo "Waybill atualizada" / BD com as seguintes colunas:
  Número da Etiqueta, Último status, Station, AGING, DIAS EM ABERTO,
  SUPERVISOR, Regional, Valor Declarado (Enviado)

Statuses removidos automaticamente antes do processamento:
  Transferência concluída, Envio, Entregue, em transferência,
  descarregado, Coleta concluída, Pedido finalizado anormal
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

FAIXAS_7D_MAIS = {'7 ≤ X < 10', '10 ≤ X < 16', '16 ≤ X < 20', 'X ≥ 20'}

# Statuses que indicam pacote finalizado — removidos do No Tracking
STATUS_REMOVER = {
    'transferência concluída',
    'envio',
    'entregue',
    'em transferência',
    'descarregado',
    'coleta concluída',
    'pedido finalizado anormal',
}

# Abas aceitas, em ordem de prioridade
_ABAS = ['BD', 'SemMovimentaçãoBase', 'Sem Movimentação', 'SemMovimentacao']


def _calc_faixa(aging: float) -> str:
    """Calcula faixa de aging em dias."""
    if aging < 1:   return '<1'
    if aging < 3:   return '1 ≤ X < 3'
    if aging < 5:   return '3 ≤ X < 5'
    if aging < 7:   return '5 ≤ X < 7'
    if aging < 10:  return '7 ≤ X < 10'
    if aging < 16:  return '10 ≤ X < 16'
    if aging < 20:  return '16 ≤ X < 20'
    return 'X ≥ 20'


def _mapear_colunas(df: pd.DataFrame) -> dict:
    """
    Retorna mapa {col_original: nome_interno}.
    Suporta o formato BD com colunas em português.
    """
    mapa = {}
    for c in df.columns:
        cs = str(c).strip()
        cl = cs.lower()

        # Waybill / etiqueta
        if 'etiqueta' in cl or 'número da' in cl or cs in (
            'Waybill number', 'Waybill No', 'Waybill No.', 'WaybillNo',
            'Tracking No.', 'Tracking Number',
        ):
            mapa[c] = 'etiqueta'

        # Status (Último status no BD)
        elif 'último status' in cl or cs in (
            'Last Scan Type', 'LastScanType', 'Status',
        ) or ('status' in cl and 'último' in cl):
            mapa[c] = 'status'

        # Statusocorrência (Considerar/Desconsiderar)
        elif 'statusocorr' in cl or 'status ocorr' in cl:
            mapa[c] = 'status_ocorrencia'

        # Station / DS
        elif cs == 'Current branch name':
            mapa[c] = 'station'
        elif cs in ('Station',) and 'station' not in mapa.values():
            mapa[c] = 'station'
        elif cs in ('DS²', 'DS2', 'DS') and 'station' not in mapa.values():
            mapa[c] = 'station'

        # Supervisor
        elif cs in ('SUPERVISOR', 'Supervisor', 'Responsável', 'Responsavel'):
            mapa[c] = 'supervisor'

        # Regional
        elif cs in ('Regional', 'Região', 'Regiao') and 'regional' not in mapa.values():
            mapa[c] = 'regional'

        # Aging em dias
        elif cs in ('AGING', 'Aging', 'No Tracking Time (D)', 'Age', 'Dias sem tracking'):
            mapa[c] = 'aging'

        # Faixa / bucket de aging (já calculado no arquivo)
        elif cs in ('DIAS EM ABERTO', 'RangeSemMovimentação', 'Range', 'Faixa'):
            mapa[c] = 'faixa'

        # Valor declarado
        elif 'valor declarado' in cl or cs in (
            'Uploaded Declared Value', 'Declared Value',
        ):
            mapa[c] = 'valor'

    return mapa


def _ler_aba(conteudo: bytes) -> pd.DataFrame:
    """Lê a melhor aba disponível do Excel."""
    buf = io.BytesIO(conteudo)
    try:
        xl = pd.ExcelFile(buf)
    except Exception:
        raise HTTPException(400, "Arquivo inválido. Envie um arquivo Excel (.xlsx).")

    aba = next((a for a in _ABAS if a in xl.sheet_names), None)
    if aba is None:
        aba = xl.sheet_names[0]

    buf.seek(0)
    df = xl.parse(aba)
    df.columns = df.columns.str.strip()
    return df


def _processar(conteudo: bytes) -> dict:
    df = _ler_aba(conteudo)

    mapa = _mapear_colunas(df)
    df = df.rename(columns=mapa)

    # Validar colunas mínimas
    obrigatorias = ['etiqueta', 'station']
    faltando = [c for c in obrigatorias if c not in df.columns]
    if faltando:
        raise HTTPException(
            400,
            f"Colunas obrigatórias não encontradas: {faltando}. "
            f"Colunas disponíveis: {list(df.columns)}"
        )

    # Limpar etiqueta — manter apenas linhas com código numérico válido
    # A coluna pode vir como float64 (ex: 6090625265685.0) ou string
    df = df.dropna(subset=['etiqueta']).copy()
    etiqueta_num = pd.to_numeric(df['etiqueta'], errors='coerce')
    if etiqueta_num.notna().any():
        # Coluna numérica (float64): converte para int depois string
        df = df[etiqueta_num.notna()].copy()
        df['etiqueta'] = etiqueta_num[etiqueta_num.notna()].astype('int64').astype(str)
    else:
        # Coluna string: filtra apenas dígitos
        df['etiqueta'] = df['etiqueta'].astype(str).str.strip()
        df = df[df['etiqueta'].str.match(r'^\d+$')].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum waybill válido encontrado.")

    # Normalizar campos
    df['station']  = df['station'].fillna('').astype(str).str.strip().str.upper()
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

    # ── Filtro de status: remove pacotes finalizados ──────────────────────────
    has_status = 'status' in df.columns and df['status'].ne('').any()
    if has_status:
        mask_remover = df['status'].str.lower().isin(STATUS_REMOVER)
        df = df[~mask_remover].copy()

    # Filtro alternativo: manter apenas "Considerar" se coluna existir
    if 'status_ocorrencia' in df.columns:
        mask_ok = df['status_ocorrencia'].fillna('').str.strip().str.lower() == 'considerar'
        if mask_ok.any():
            df = df[mask_ok].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum pacote restante após aplicar filtros de status.")

    # ── Faixa de aging ────────────────────────────────────────────────────────
    # Prefere coluna DIAS EM ABERTO do arquivo; se vazia/ausente, calcula do AGING
    # AGING > 1000 é valor inválido (artefato do sistema) — usa faixa existente ou fallback
    if 'faixa' in df.columns and df['faixa'].fillna('').astype(str).str.strip().ne('').any():
        df['faixa'] = df['faixa'].fillna('').astype(str).str.strip()
        # Para aging inválido (>1000), usa a faixa já calculada no arquivo
        mask_aging_ok = df['aging'].between(0, 999)
        df.loc[~mask_aging_ok, 'aging'] = df.loc[~mask_aging_ok, 'faixa'].map(
            lambda f: {'<1': 0, '1 ≤ X < 3': 1, '3 ≤ X < 5': 3,
                       '5 ≤ X < 7': 5, '7 ≤ X < 10': 7, '10 ≤ X < 16': 10,
                       '16 ≤ X < 20': 16, 'X ≥ 20': 20}.get(f, 0)
        )
    else:
        # Sanitiza aging inválido
        df.loc[df['aging'] > 999, 'aging'] = 20
        df['faixa'] = df['aging'].apply(_calc_faixa)

    # is_7d — derivado da faixa (mais confiável que AGING bruto)
    df['is_7d'] = df['faixa'].isin(FAIXAS_7D_MAIS)

    total         = len(df)
    valor_total   = round(float(df['valor'].sum()), 2)
    total_7d_mais = int(df['is_7d'].sum())
    data_ref      = date.today().isoformat()

    # ── Por DS ────────────────────────────────────────────────────────────────
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

    # ── Por Supervisor ────────────────────────────────────────────────────────
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

    # ── Por Status ────────────────────────────────────────────────────────────
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

    # ── Por Faixa de Aging ────────────────────────────────────────────────────
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

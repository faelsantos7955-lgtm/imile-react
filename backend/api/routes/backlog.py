"""
api/routes/backlog.py — Backlog SLA com persistência no banco
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from api.deps import get_supabase, get_current_user
import pandas as pd
import io
from datetime import datetime

router = APIRouter()

FAIXAS        = ['1-3', '3-5', '5-7', '7-10', '10-15', '15-20', 'Backlog >20']
FAIXAS_LABELS = ['1D≤X<3D', '3D≤X<5D', '5D≤X<7D', '7D≤X<10D', '10D≤X<15D', '15D≤X<20D', '≥20D']
DB_COLS       = ['f_1_3', 'f_3_5', 'f_5_7', 'f_7_10', 'f_10_15', 'f_15_20', 'f_20_mais']


def _faixas_to_dict(row):
    return {f: row.get(col, 0) or 0 for f, col in zip(FAIXAS, DB_COLS)}


def _ler_excel(conteudo: bytes):
    buf = io.BytesIO(conteudo)
    df = pd.read_excel(buf, sheet_name='Backlog_Details',
                       dtype={'waybillNo': str, 'range_backlog': str,
                              'CARGOS.SUPERVISOR ': str, 'process': str,
                              'lastScanStatus': str, 'actual_region': str})
    df.rename(columns={'CARGOS.SUPERVISOR ': 'supervisor', 'actual_region': 'regiao',
                       'lastScanSite': 'ds', 'clientName': 'cliente',
                       'stageStatus': 'estagio', 'lastScanStatus': 'motivo'}, inplace=True)
    df['supervisor'] = df['supervisor'].fillna('Sem Supervisor').str.strip().str.upper()
    df['ds']         = df['ds'].fillna('').str.strip().str.upper()
    df['regiao']     = df['regiao'].fillna('').str.strip()
    df['motivo']     = df['motivo'].fillna('Outros').str.strip()
    df['range_backlog'] = df['range_backlog'].fillna('1-3').str.strip()

    buf.seek(0)
    df_res = pd.read_excel(buf, sheet_name='Resume_', dtype={'CARGOS.SUPERVISOR ': str})
    df_res.rename(columns={'CARGOS.SUPERVISOR ': 'supervisor', 'lastScanSite': 'ds',
                            'clientName': 'cliente', 'actual region': 'regiao'}, inplace=True)
    df_res['supervisor'] = df_res['supervisor'].fillna('').str.strip().str.upper()
    return df, df_res


def _faixa_row(grp, orders):
    faixas   = {f: int((grp['range_backlog'] == f).sum()) for f in FAIXAS}
    total_7d = sum(faixas.get(f, 0) for f in ['7-10', '10-15', '15-20', 'Backlog >20'])
    return {'orders': orders, 'backlog': len(grp),
            'pct_backlog': round(len(grp) / orders * 100, 1) if orders else 0,
            'faixas': faixas, 'total_7d': total_7d}


def _processar(df, df_res):
    dc  = df[df['process'].isin(['DC-LH', 'DC'])]
    dfs = df[df['process'] == 'DS']
    dc_res = df_res[df_res['process'].isin(['DC-LH', 'DC'])] if 'process' in df_res.columns else pd.DataFrame()
    ds_res = df_res[df_res['process'] == 'DS']               if 'process' in df_res.columns else df_res

    def orders(df_r, col, val):
        g = df_r[df_r[col] == val] if col in df_r.columns else pd.DataFrame()
        return int(g['orders'].sum()) if len(g) and 'orders' in g.columns else 0

    # ── Por RDC (LH) ──────────────────────────────────────────
    por_rdc = []
    for nome in sorted(dc['ds'].dropna().unique()):
        grp = dc[dc['ds'] == nome]
        row = _faixa_row(grp, orders(dc_res, 'ds', nome) or len(grp))
        row['nome']   = nome
        row['regiao'] = grp['regiao'].mode().iloc[0] if len(grp) else ''
        por_rdc.append(row)

    # ── Por Supervisor ─────────────────────────────────────────
    por_supervisor = []
    for nome in sorted(dfs['supervisor'].dropna().unique()):
        grp = dfs[dfs['supervisor'] == nome]
        row = _faixa_row(grp, orders(ds_res, 'supervisor', nome) or len(grp))
        row['nome'] = nome
        por_supervisor.append(row)

    # ── Por DS ────────────────────────────────────────────────
    por_ds = []
    for nome in sorted(dfs['ds'].dropna().unique()):
        grp = dfs[dfs['ds'] == nome]
        sup = grp['supervisor'].mode().iloc[0] if len(grp) else ''
        row = _faixa_row(grp, orders(ds_res, 'ds', nome) or len(grp))
        row['nome']      = nome
        row['supervisor'] = sup
        por_ds.append(row)
    por_ds.sort(key=lambda x: x['total_7d'], reverse=True)
    for i, r in enumerate(por_ds, 1):
        r['prioridade'] = i

    # ── Por Motivo ────────────────────────────────────────────
    por_motivo = []
    for motivo in sorted(df['motivo'].dropna().unique()):
        grp = df[df['motivo'] == motivo]
        # orders = total de pedidos únicos com esse motivo (usa Resume_ se disponível)
        ord_motivo = len(grp)
        row = _faixa_row(grp, ord_motivo)
        row['nome'] = motivo
        por_motivo.append(row)
    por_motivo.sort(key=lambda x: x['backlog'], reverse=True)

    total = len(df)
    kpis = {
        'total':       total,
        'na_ds':       int((df['estagio'] == 'Delivery').sum()),
        'em_transito': int((df['estagio'] == 'In Transit').sum()),
        'total_7d':    sum(r['total_7d'] for r in por_ds),
        'pct_7d':      round(sum(r['total_7d'] for r in por_ds) / total * 100, 1) if total else 0,
        'por_faixa':   {f: int((df['range_backlog'] == f).sum()) for f in FAIXAS},
        'data_ref':    datetime.now().date().isoformat(),
    }
    return kpis, por_rdc, por_supervisor, por_ds, por_motivo


# ── GET /uploads ──────────────────────────────────────────────
@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    return sb.table("backlog_uploads").select("*").order("criado_em", desc=True).limit(30).execute().data or []


# ── GET /upload/{id} ──────────────────────────────────────────
@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    up = sb.table("backlog_uploads").select("*").eq("id", upload_id).execute()
    if not up.data:
        raise HTTPException(404, "Não encontrado")
    u = up.data[0]

    rdc  = sb.table("backlog_por_rdc").select("*").eq("upload_id", upload_id).execute().data or []
    sups = sb.table("backlog_por_supervisor").select("*").eq("upload_id", upload_id).execute().data or []
    dss  = sb.table("backlog_por_ds").select("*").eq("upload_id", upload_id).order("prioridade").execute().data or []
    mot  = sb.table("backlog_por_motivo").select("*").eq("upload_id", upload_id).order("backlog", desc=True).execute().data or []

    fmt   = lambda rows: [{**r, 'faixas': _faixas_to_dict(r)} for r in rows]
    total = u['total'] or 1

    return {
        'kpis': {
            'total':       u['total'],
            'na_ds':       u['na_ds'],
            'em_transito': u['em_transito'],
            'total_7d':    u['total_7d'],
            'pct_7d':      round(u['total_7d'] / total * 100, 1),
            'por_faixa':   {f: sum(r.get(col, 0) or 0 for r in dss) for f, col in zip(FAIXAS, DB_COLS)},
            'data_ref':    u['data_ref'],
        },
        'por_rdc':        fmt(rdc),
        'por_supervisor': fmt(sups),
        'por_ds':         fmt(dss),
        'por_motivo':     fmt(mot),
    }


# ── POST /processar ───────────────────────────────────────────
@router.post("/processar")
async def processar_backlog(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    conteudo = await file.read()
    try:
        df, df_res = _ler_excel(conteudo)
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {e}")

    kpis, por_rdc, por_supervisor, por_ds, por_motivo = _processar(df, df_res)

    sb = get_supabase()
    up = sb.table("backlog_uploads").insert({
        "data_ref":    kpis['data_ref'],
        "criado_por":  user["email"],
        "total":       kpis['total'],
        "total_7d":    kpis['total_7d'],
        "na_ds":       kpis['na_ds'],
        "em_transito": kpis['em_transito'],
    }).execute()
    uid = up.data[0]["id"]

    def to_db(rows, extras=[]):
        result = []
        for r in rows:
            row = {"upload_id": uid, "nome": r['nome'], "orders": r['orders'],
                   "backlog": r['backlog'], "pct_backlog": r['pct_backlog'], "total_7d": r['total_7d']}
            for f, col in zip(FAIXAS, DB_COLS):
                row[col] = r['faixas'].get(f, 0)
            for k in extras:
                row[k] = r.get(k, '')
            result.append(row)
        return result

    sb.table("backlog_por_rdc").insert(to_db(por_rdc, ['regiao'])).execute()
    sb.table("backlog_por_supervisor").insert(to_db(por_supervisor)).execute()
    sb.table("backlog_por_ds").insert(to_db(por_ds, ['supervisor', 'prioridade'])).execute()
    sb.table("backlog_por_motivo").insert(to_db(por_motivo)).execute()

    return {"upload_id": uid, "kpis": kpis,
            "por_rdc": por_rdc, "por_supervisor": por_supervisor,
            "por_ds": por_ds, "por_motivo": por_motivo}


# ── POST /excel/{upload_id} ───────────────────────────────────
@router.post("/excel/{upload_id}")
def excel_backlog(upload_id: int, user: dict = Depends(get_current_user)):
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    sb = get_supabase()
    up = sb.table("backlog_uploads").select("*").eq("id", upload_id).execute()
    if not up.data:
        raise HTTPException(404, "Não encontrado")
    u = up.data[0]

    rdc  = sb.table("backlog_por_rdc").select("*").eq("upload_id", upload_id).execute().data or []
    sups = sb.table("backlog_por_supervisor").select("*").eq("upload_id", upload_id).execute().data or []
    dss  = sb.table("backlog_por_ds").select("*").eq("upload_id", upload_id).order("prioridade").execute().data or []
    mot  = sb.table("backlog_por_motivo").select("*").eq("upload_id", upload_id).order("backlog", desc=True).execute().data or []

    CORES_FAIXA = {'1-3': '92D050', '3-5': 'FFFF00', '5-7': 'FFC000', '7-10': 'FF7F00',
                   '10-15': 'FF0000', '15-20': 'C00000', 'Backlog >20': '7030A0'}
    HDR  = PatternFill('solid', fgColor='1F3864')
    AZUL = PatternFill('solid', fgColor='2E75B6')
    VERD = PatternFill('solid', fgColor='375623')
    LROX = PatternFill('solid', fgColor='7030A0')
    ALT  = PatternFill('solid', fgColor='D9E1F2')
    BRD  = Border(left=Side(style='thin'), right=Side(style='thin'),
                  top=Side(style='thin'), bottom=Side(style='thin'))
    CTR  = Alignment(horizontal='center', vertical='center', wrap_text=True)
    LFT  = Alignment(horizontal='left', vertical='center')
    HFNT = Font(name='Calibri', bold=True, color='FFFFFF', size=10)
    BFNT = Font(name='Calibri', size=10)

    wb = Workbook()
    ws = wb.active
    ws.title = 'BACKLOG'
    ws.sheet_view.showGridLines = False

    ws.merge_cells('C1:P1')
    t = ws.cell(1, 3, f'BACKLOG 超时未完结  —  {u["data_ref"]}')
    t.font = Font(name='Calibri', bold=True, color='FFFFFF', size=14)
    t.fill = HDR
    t.alignment = CTR
    ws.row_dimensions[1].height = 32

    def write_section(cur, titulo, rows, fill, show_sup=False, show_regiao=False, show_motivo=False):
        ws.merge_cells(f'C{cur}:P{cur}')
        h = ws.cell(cur, 3, titulo)
        h.fill = fill; h.font = HFNT; h.alignment = CTR
        ws.row_dimensions[cur].height = 22
        cur += 1

        hdr = []
        if show_regiao: hdr.append('Região')
        if show_sup:    hdr.append('Supervisor')
        hdr += ['Nome', 'Orders', 'Backlog', '% Backlog'] + FAIXAS_LABELS + ['>7D']
        if show_sup:    hdr.append('Prioridade')

        for ci, txt in enumerate(hdr, 3):
            c = ws.cell(cur, ci, txt)
            c.fill = fill; c.font = HFNT; c.alignment = CTR; c.border = BRD
        ws.row_dimensions[cur].height = 36
        cur += 1

        for i, row in enumerate(rows):
            rf = ALT if i % 2 == 0 else None
            vals = []
            if show_regiao: vals.append(row.get('regiao', ''))
            if show_sup:    vals.append(row.get('supervisor', ''))
            vals += [row['nome'], row['orders'], row['backlog'],
                     round(row['pct_backlog'] / 100, 4)]
            for col in DB_COLS:
                vals.append(row.get(col, 0) or 0)
            vals.append(row['total_7d'])
            if show_sup: vals.append(row.get('prioridade', ''))

            offset = 3 + (1 if show_regiao else 0) + (1 if show_sup else 0)

            for ci, val in enumerate(vals, 3):
                c = ws.cell(cur, ci, val)
                c.font = BFNT; c.border = BRD; c.alignment = CTR
                if rf: c.fill = rf
                if ci in (3, 4): c.alignment = LFT
                pct_col = offset + 2
                if ci == pct_col: c.number_format = '0.0%'
                fo = ci - (offset + 3)
                if 0 <= fo < len(FAIXAS):
                    cor = CORES_FAIXA.get(FAIXAS[fo], 'FFFFFF')
                    if isinstance(val, (int, float)) and val > 0:
                        c.fill = PatternFill('solid', fgColor=cor)
                        c.font = Font(name='Calibri', size=10, bold=True,
                                      color='FFFFFF' if FAIXAS[fo] not in ('1-3', '3-5') else '000000')
            cur += 1
        return cur + 1

    cur = 3
    cur = write_section(cur, 'LH — Por RDC',            rdc,  AZUL, show_regiao=True)
    cur = write_section(cur, 'DS — Por Supervisor',      sups, VERD)
    cur = write_section(cur, 'DS — Detalhado por Base',  dss,  HDR,  show_sup=True)
    cur = write_section(cur, 'DS — Por Motivo (Último Status)', mot, LROX)

    for col, w in [(3, 20), (4, 14), (5, 12), (6, 12), (7, 10)] + [(8 + i, 9) for i in range(9)]:
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.freeze_panes = 'C4'

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename=Backlog_SLA_{u["data_ref"]}.xlsx'})

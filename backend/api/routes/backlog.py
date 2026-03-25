"""
api/routes/backlog.py — Backlog SLA com persistência + filtro por cliente
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from api.deps import get_supabase, get_current_user
from api.limiter import limiter
from api.upload_utils import validar_arquivo
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
                       dtype={'waybillNo': str, 'range_backlog': str, 'process': str, 'actual_region': str})
    df.columns = df.columns.str.strip()
    df.rename(columns={'CARGOS.SUPERVISOR': 'supervisor', 'actual_region': 'regiao',
                       'lastScanSite': 'ds', 'clientName': 'cliente',
                       'stageStatus': 'estagio', 'lastScanStatus': 'motivo'}, inplace=True)
    df['supervisor']    = df['supervisor'].fillna('Sem Supervisor').str.strip().str.upper()
    df['ds']            = df['ds'].fillna('').str.strip().str.upper()
    df['regiao']        = df['regiao'].fillna('').str.strip()
    df['motivo']        = df['motivo'].fillna('Outros').str.strip()
    df['cliente']       = df['cliente'].fillna('Sem Cliente').str.strip()
    df['range_backlog'] = df['range_backlog'].fillna('1-3').str.strip()

    buf.seek(0)
    df_res = pd.read_excel(buf, sheet_name='Resume_')
    df_res.columns = df_res.columns.str.strip()
    df_res.rename(columns={'CARGOS.SUPERVISOR': 'supervisor', 'lastScanSite': 'ds',
                            'clientName': 'cliente', 'actual region': 'regiao'}, inplace=True)
    df_res['supervisor'] = df_res['supervisor'].fillna('').str.strip().str.upper()
    df_res['ds']         = df_res['ds'].fillna('').str.strip().str.upper() if 'ds' in df_res.columns else ''
    df_res['orders']     = pd.to_numeric(df_res['orders'], errors='coerce').fillna(0).astype(int) if 'orders' in df_res.columns else 0
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

    por_rdc = []
    for nome in sorted(dc['ds'].dropna().unique()):
        grp = dc[dc['ds'] == nome]
        row = _faixa_row(grp, orders(dc_res, 'ds', nome) or len(grp))
        row['nome']   = nome
        row['regiao'] = grp['regiao'].mode().iloc[0] if len(grp) else ''
        por_rdc.append(row)

    por_supervisor = []
    for nome in sorted(dfs['supervisor'].dropna().unique()):
        grp = dfs[dfs['supervisor'] == nome]
        row = _faixa_row(grp, orders(ds_res, 'supervisor', nome) or len(grp))
        row['nome'] = nome
        por_supervisor.append(row)

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

    por_motivo = []
    for motivo in sorted(df['motivo'].dropna().unique()):
        grp = df[df['motivo'] == motivo]
        row = _faixa_row(grp, len(grp))
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




@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    return sb.table("backlog_uploads").select("*").order("criado_em", desc=True).limit(30).execute().data or []


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(get_current_user)):
    if not user.get("role") == "admin":
        raise HTTPException(403, "Acesso negado")
    sb = get_supabase()
    for tbl in ("backlog_detalhes", "backlog_por_cliente", "backlog_por_motivo", "backlog_por_ds", "backlog_por_supervisor", "backlog_por_rdc"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            pass
    sb.table("backlog_uploads").delete().eq("id", upload_id).execute()
    return {"ok": True}


@router.get("/clientes/{upload_id}")
def listar_clientes(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    rows = sb.table("backlog_por_cliente").select("*").eq("upload_id", upload_id).order("backlog", desc=True).execute().data or []
    return rows


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, cliente: str = Query(None), user: dict = Depends(get_current_user)):
    sb = get_supabase()

    if cliente:
        # Agregar direto no banco via SQL functions (sem limite de 1000)
        params = {"p_upload_id": upload_id, "p_cliente": cliente}

        kpis_raw = sb.rpc("backlog_cliente_kpis", params).execute().data
        if not kpis_raw:
            raise HTTPException(404, "Sem dados para esse cliente")

        up = sb.table("backlog_uploads").select("data_ref").eq("id", upload_id).execute()
        data_ref = up.data[0]['data_ref'] if up.data else ''

        # Buscar orders reais das tabelas pré-agregadas
        dss_orders  = sb.table("backlog_por_ds").select("nome,orders").eq("upload_id", upload_id).execute().data or []
        sups_orders = sb.table("backlog_por_supervisor").select("nome,orders").eq("upload_id", upload_id).execute().data or []
        rdc_orders  = sb.table("backlog_por_rdc").select("nome,orders").eq("upload_id", upload_id).execute().data or []
        orders_ds  = {r['nome']: r['orders'] for r in dss_orders}
        orders_sup = {r['nome']: r['orders'] for r in sups_orders}
        orders_rdc = {r['nome']: r['orders'] for r in rdc_orders}

        por_rdc  = sb.rpc("backlog_cliente_por_rdc", params).execute().data or []
        por_sup  = sb.rpc("backlog_cliente_por_supervisor", params).execute().data or []
        por_ds   = sb.rpc("backlog_cliente_por_ds", params).execute().data or []
        por_mot  = sb.rpc("backlog_cliente_por_motivo", params).execute().data or []

        # Adicionar orders, pct_backlog e faixas dict
        def enrich(rows, orders_map):
            for r in rows:
                ords = orders_map.get(r['nome'], 0) or r['backlog']
                r['orders'] = ords
                r['pct_backlog'] = round(r['backlog'] / ords * 100, 1) if ords else 0
                r['faixas'] = {f: r.get(col, 0) or 0 for f, col in zip(FAIXAS, DB_COLS)}
            return rows

        # Prioridade nos DS
        por_ds_enriched = enrich(por_ds, orders_ds)
        por_ds_enriched.sort(key=lambda x: x.get('total_7d', 0), reverse=True)
        for i, r in enumerate(por_ds_enriched, 1):
            r['prioridade'] = i

        kpis = kpis_raw
        kpis['data_ref'] = data_ref

        return {
            'kpis': kpis,
            'por_rdc':        enrich(por_rdc, orders_rdc),
            'por_supervisor': enrich(por_sup, orders_sup),
            'por_ds':         por_ds_enriched,
            'por_motivo':     enrich(por_mot, {r['nome']: r['backlog'] for r in por_mot}),
        }

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


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_backlog(request: Request, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    conteudo = await validar_arquivo(file)
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

    detalhes = []
    for _, r in df.iterrows():
        detalhes.append({
            "upload_id": uid,
            "waybill":   str(r.get('waybillNo', '')),
            "cliente":   str(r.get('cliente', '')),
            "supervisor": str(r.get('supervisor', '')),
            "ds":        str(r.get('ds', '')),
            "process":   str(r.get('process', '')),
            "range_backlog": str(r.get('range_backlog', '')),
            "motivo":    str(r.get('motivo', '')),
            "estagio":   str(r.get('estagio', '')),
            "regiao":    str(r.get('regiao', '')),
        })
    for i in range(0, len(detalhes), 500):
        sb.table("backlog_detalhes").insert(detalhes[i:i+500]).execute()

    return {"upload_id": uid, "kpis": kpis,
            "por_rdc": por_rdc, "por_supervisor": por_supervisor,
            "por_ds": por_ds, "por_motivo": por_motivo}


@router.post("/excel/{upload_id}")
@limiter.limit("20/minute")
def excel_backlog(request: Request, upload_id: int, user: dict = Depends(get_current_user)):
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

    CORES_FAIXA = {'1-3': '92D050', '3-5': 'FFFF00', '5-7': 'FFC000', '7-10': 'EF4444',
                   '10-15': 'DC2626', '15-20': 'B91C1C', 'Backlog >20': '7F1D1D'}
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
    t = ws.cell(1, 3, f'BACKLOG  —  {u["data_ref"]}')
    t.font = Font(name='Calibri', bold=True, color='FFFFFF', size=14)
    t.fill = HDR; t.alignment = CTR
    ws.row_dimensions[1].height = 32

    def write_section(cur, titulo, rows, fill, show_sup=False, show_regiao=False):
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
            vals += [row['nome'], row['orders'], row['backlog'], round(row['pct_backlog'] / 100, 4)]
            for col in DB_COLS: vals.append(row.get(col, 0) or 0)
            vals.append(row['total_7d'])
            if show_sup: vals.append(row.get('prioridade', ''))
            offset = 3 + (1 if show_regiao else 0) + (1 if show_sup else 0)
            for ci, val in enumerate(vals, 3):
                c = ws.cell(cur, ci, val)
                c.font = BFNT; c.border = BRD; c.alignment = CTR
                if rf: c.fill = rf
                if ci in (3, 4): c.alignment = LFT
                if ci == offset + 2: c.number_format = '0.0%'
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
    cur = write_section(cur, 'LH — Por RDC', rdc, AZUL, show_regiao=True)
    cur = write_section(cur, 'DS — Por Supervisor', sups, VERD)
    cur = write_section(cur, 'DS — Detalhado por Base', dss, HDR, show_sup=True)
    cur = write_section(cur, 'DS — Por Motivo', mot, LROX)

    for col, w in [(3, 20), (4, 14), (5, 12), (6, 12), (7, 10)] + [(8 + i, 9) for i in range(9)]:
        ws.column_dimensions[get_column_letter(col)].width = w
    ws.freeze_panes = 'C4'

    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename=Backlog_SLA_{u["data_ref"]}.xlsx'})

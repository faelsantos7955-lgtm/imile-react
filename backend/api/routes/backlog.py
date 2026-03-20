"""
api/routes/backlog.py — Backlog SLA processing
Upload do arquivo Excel → processa → retorna dados para o portal
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from api.deps import get_current_user
import pandas as pd
import numpy as np
import io
from datetime import datetime

router = APIRouter()

FAIXAS      = ['1-3', '3-5', '5-7', '7-10', '10-15', '15-20', 'Backlog >20']
FAIXAS_COLS = ['1D≤X<3D', '3D≤X<5D', '5D≤X<7D', '7D≤X<10D', '10D≤X<15D', '15D≤X<20D', '≥20D']


def _ler_excel(conteudo: bytes):
    """Lê o arquivo e retorna os DataFrames necessários."""
    buf = io.BytesIO(conteudo)
    df = pd.read_excel(buf, sheet_name='Backlog_Details',
                       dtype={'waybillNo': str, 'range_backlog': str,
                              'CARGOS.SUPERVISOR ': str, 'process': str})
    df.rename(columns={
        'CARGOS.SUPERVISOR ': 'supervisor',
        'actual_region':      'regiao',
        'lastScanSite':       'ds',
        'clientName':         'cliente',
        'stageStatus':        'estagio',
        'cityType':           'tipo_cidade',
    }, inplace=True)
    df['supervisor'] = df['supervisor'].fillna('Sem Supervisor').str.strip().str.upper()
    df['ds']         = df['ds'].fillna('').str.strip().str.upper()
    df['range_backlog'] = df['range_backlog'].fillna('1-3').str.strip()

    buf.seek(0)
    df_res = pd.read_excel(buf, sheet_name='Resume_',
                           dtype={'CARGOS.SUPERVISOR ': str})
    df_res.rename(columns={
        'CARGOS.SUPERVISOR ': 'supervisor',
        'lastScanSite':       'ds',
        'clientName':         'cliente',
        'actual region':      'regiao',
    }, inplace=True)
    df_res['supervisor'] = df_res['supervisor'].fillna('').str.strip().str.upper()

    return df, df_res


def _faixa_row(grp: pd.DataFrame, orders: int = 0) -> dict:
    """Monta dict com contagens por faixa para um grupo."""
    total_backlog = len(grp)
    pct = round(total_backlog / orders * 100, 1) if orders > 0 else 0
    faixas_dict = {f: int((grp['range_backlog'] == f).sum()) for f in FAIXAS}
    total_7d = sum(faixas_dict.get(f, 0) for f in ['7-10', '10-15', '15-20', 'Backlog >20'])
    return {
        'orders':        orders,
        'backlog':       total_backlog,
        'pct_backlog':   pct,
        'faixas':        faixas_dict,
        'total_7d':      total_7d,
    }


@router.post("/processar")
async def processar_backlog(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    Processa o arquivo Excel de Backlog SLA e retorna:
    - por_rdc: agregação por DC/RDC
    - por_supervisor: agregação por supervisor
    - por_ds: agregação por DS (com supervisor e prioridade)
    - kpis: totais gerais
    """
    conteudo = await file.read()
    try:
        df, df_res = _ler_excel(conteudo)
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {e}")

    # ── Seção 1: Por RDC (process DC-LH ou DC) ───────────────
    dc = df[df['process'].isin(['DC-LH', 'DC'])]
    dc_res = df_res[df_res['process'].isin(['DC-LH', 'DC'])]
    por_rdc = []
    for rdc in sorted(dc['ds'].dropna().unique()):
        grp   = dc[dc['ds'] == rdc]
        grp_r = dc_res[dc_res['ds'] == rdc]
        orders = int(grp_r['orders'].sum()) if 'orders' in grp_r.columns else len(grp)
        row = _faixa_row(grp, orders)
        row['nome'] = rdc
        por_rdc.append(row)

    # ── Seção 2: Por Supervisor (process DS) ─────────────────
    ds = df[df['process'] == 'DS']
    ds_res = df_res[df_res['process'] == 'DS'] if 'process' in df_res.columns else df_res
    por_supervisor = []
    for sup in sorted(ds['supervisor'].dropna().unique()):
        grp   = ds[ds['supervisor'] == sup]
        grp_r = ds_res[ds_res['supervisor'] == sup] if 'supervisor' in ds_res.columns else pd.DataFrame()
        orders = int(grp_r['orders'].sum()) if len(grp_r) and 'orders' in grp_r.columns else len(grp)
        row = _faixa_row(grp, orders)
        row['nome'] = sup
        por_supervisor.append(row)

    # ── Seção 3: Por DS (com supervisor e prioridade) ─────────
    por_ds = []
    for ds_name in sorted(ds['ds'].dropna().unique()):
        grp = ds[ds['ds'] == ds_name]
        sup = grp['supervisor'].mode().iloc[0] if len(grp) else ''
        grp_r = ds_res[ds_res['ds'] == ds_name] if 'ds' in ds_res.columns else pd.DataFrame()
        orders = int(grp_r['orders'].sum()) if len(grp_r) and 'orders' in grp_r.columns else len(grp)
        row = _faixa_row(grp, orders)
        row['nome']       = ds_name
        row['supervisor'] = sup
        por_ds.append(row)

    # Ordena por total_7d para prioridade
    por_ds.sort(key=lambda x: x['total_7d'], reverse=True)
    for i, r in enumerate(por_ds, 1):
        r['prioridade'] = i

    # ── KPIs gerais ───────────────────────────────────────────
    total = len(df)
    kpis = {
        'total':       total,
        'na_ds':       int((df['estagio'] == 'Delivery').sum()),
        'em_transito': int((df['estagio'] == 'In Transit').sum()),
        'total_7d':    sum(r['total_7d'] for r in por_ds),
        'pct_7d':      round(sum(r['total_7d'] for r in por_ds) / total * 100, 1) if total else 0,
        'por_faixa':   {f: int((df['range_backlog'] == f).sum()) for f in FAIXAS},
        'data_ref':    datetime.now().strftime('%d/%m/%Y'),
    }

    return {
        'kpis':           kpis,
        'por_rdc':        por_rdc,
        'por_supervisor': por_supervisor,
        'por_ds':         por_ds,
    }


@router.post("/excel")
async def excel_backlog(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """Gera Excel idêntico ao original com os dados processados."""
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    conteudo = await file.read()
    try:
        df, df_res = _ler_excel(conteudo)
    except Exception as e:
        raise HTTPException(400, f"Erro: {e}")

    # Reutiliza lógica de processamento
    dc  = df[df['process'].isin(['DC-LH', 'DC'])]
    dfs = df[df['process'] == 'DS']
    dc_res = df_res[df_res['process'].isin(['DC-LH','DC'])] if 'process' in df_res.columns else pd.DataFrame()
    ds_res = df_res[df_res['process'] == 'DS'] if 'process' in df_res.columns else df_res

    def get_orders_rdc(rdc):
        grp_r = dc_res[dc_res['ds'] == rdc] if 'ds' in dc_res.columns else pd.DataFrame()
        return int(grp_r['orders'].sum()) if len(grp_r) and 'orders' in grp_r.columns else len(dc[dc['ds']==rdc])

    def get_orders_sup(sup):
        grp_r = ds_res[ds_res['supervisor'] == sup] if 'supervisor' in ds_res.columns else pd.DataFrame()
        return int(grp_r['orders'].sum()) if len(grp_r) and 'orders' in grp_r.columns else len(dfs[dfs['supervisor']==sup])

    def get_orders_ds(ds_name):
        grp_r = ds_res[ds_res['ds'] == ds_name] if 'ds' in ds_res.columns else pd.DataFrame()
        return int(grp_r['orders'].sum()) if len(grp_r) and 'orders' in grp_r.columns else len(dfs[dfs['ds']==ds_name])

    # Styles
    HDR = PatternFill('solid', fgColor='1F3864')
    AZUL = PatternFill('solid', fgColor='2E75B6')
    VERDE = PatternFill('solid', fgColor='375623')
    ALT = PatternFill('solid', fgColor='D9E1F2')
    CORES_FAIXA = {
        '1-3': '92D050', '3-5': 'FFFF00', '5-7': 'FFC000',
        '7-10': 'FF7F00', '10-15': 'FF0000', '15-20': 'C00000', 'Backlog >20': '7030A0'
    }
    BRD = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'),  bottom=Side(style='thin')
    )
    CTR = Alignment(horizontal='center', vertical='center', wrap_text=True)
    LFT = Alignment(horizontal='left', vertical='center')
    HFNT = Font(name='Calibri', bold=True, color='FFFFFF', size=10)
    BFNT = Font(name='Calibri', size=10)

    def write_header_row(ws, row, cols, fill=None):
        for ci, txt in enumerate(cols, 3):
            c = ws.cell(row, ci, txt)
            c.fill = fill or HDR
            c.font = HFNT; c.alignment = CTR; c.border = BRD
        ws.row_dimensions[row].height = 36

    def write_data_row(ws, row_num, nome, orders, grp, fill_nome=None, extra_cols=None, alt=False):
        row_fill = ALT if alt else None
        vals = [nome, orders, len(grp),
                round(len(grp)/orders*100, 1) if orders else 0]
        for f in FAIXAS:
            vals.append(int((grp['range_backlog'] == f).sum()))
        total_7d = sum(int((grp['range_backlog'] == f).sum()) for f in ['7-10','10-15','15-20','Backlog >20'])
        vals.append(total_7d)
        if extra_cols:
            vals.extend(extra_cols)

        for ci, val in enumerate(vals, 3):
            c = ws.cell(row_num, ci, val)
            c.font = BFNT; c.border = BRD; c.alignment = CTR
            if row_fill: c.fill = row_fill
            if ci == 3:  # nome
                c.alignment = LFT
                if fill_nome: c.fill = fill_nome; c.font = Font(name='Calibri', bold=True, color='FFFFFF', size=10)
            if ci == 6:  # % backlog
                c.number_format = '0.0%'
                v = val/100 if val > 1 else val
                ws.cell(row_num, ci, v)
                ws.cell(row_num, ci).font = BFNT
                ws.cell(row_num, ci).border = BRD; ws.cell(row_num, ci).alignment = CTR
            # Colore faixas
            faixa_offset = ci - 7
            if 0 <= faixa_offset < len(FAIXAS):
                f = FAIXAS[faixa_offset]
                cor = CORES_FAIXA.get(f, 'FFFFFF')
                if val and val > 0:
                    c.fill = PatternFill('solid', fgColor=cor)
                    c.font = Font(name='Calibri', size=10, bold=True,
                                  color='FFFFFF' if f not in ('1-3','3-5') else '000000')

    wb = Workbook()
    ws = wb.active
    ws.title = 'BACKLOG'
    ws.sheet_view.showGridLines = False

    # Título geral
    ws.merge_cells('C1:O1')
    t = ws.cell(1, 3, f'BACKLOG 超时未完结  —  {datetime.now().strftime("%d/%m/%Y")}')
    t.font = Font(name='Calibri', bold=True, color='FFFFFF', size=14)
    t.fill = HDR; t.alignment = CTR; ws.row_dimensions[1].height = 32

    cur = 3

    # ── Seção 1: Por RDC ──────────────────────────────────────
    ws.merge_cells(f'C{cur}:O{cur}')
    h = ws.cell(cur, 3, 'LH - Region')
    h.fill = AZUL; h.font = HFNT; h.alignment = CTR
    ws.row_dimensions[cur].height = 22; cur += 1

    COLS_HDR = ['Region', 'Orders\n库存', 'BACKLOG', '% Backlog'] + FAIXAS_COLS + ['>7D Total']
    write_header_row(ws, cur, COLS_HDR, AZUL); cur += 1

    for i, rdc in enumerate(sorted(dc['ds'].dropna().unique())):
        grp = dc[dc['ds'] == rdc]
        orders = get_orders_rdc(rdc)
        write_data_row(ws, cur, rdc, orders, grp, alt=(i%2==0))
        cur += 1

    cur += 1

    # ── Seção 2: Por Supervisor ───────────────────────────────
    ws.merge_cells(f'C{cur}:O{cur}')
    h = ws.cell(cur, 3, 'DS — Por Supervisor')
    h.fill = VERDE; h.font = HFNT; h.alignment = CTR
    ws.row_dimensions[cur].height = 22; cur += 1

    write_header_row(ws, cur, COLS_HDR, VERDE); cur += 1

    for i, sup in enumerate(sorted(dfs['supervisor'].dropna().unique())):
        grp = dfs[dfs['supervisor'] == sup]
        orders = get_orders_sup(sup)
        write_data_row(ws, cur, sup, orders, grp, alt=(i%2==0))
        cur += 1

    cur += 1

    # ── Seção 3: Por DS ───────────────────────────────────────
    ws.merge_cells(f'C{cur}:R{cur}')
    h = ws.cell(cur, 3, 'DS — Detalhado por Base')
    h.fill = HDR; h.font = HFNT; h.alignment = CTR
    ws.row_dimensions[cur].height = 22; cur += 1

    COLS_DS = ['Supervisor', 'DS', 'Orders\n库存', 'BACKLOG', '% Backlog'] + FAIXAS_COLS + ['>7D', 'Prioridade']
    for ci, txt in enumerate(COLS_DS, 3):
        c = ws.cell(cur, ci, txt)
        c.fill = HDR; c.font = HFNT; c.alignment = CTR; c.border = BRD
    ws.row_dimensions[cur].height = 36; cur += 1

    # Ordena por >7D
    ds_sorted = []
    for ds_name in dfs['ds'].dropna().unique():
        grp = dfs[dfs['ds'] == ds_name]
        sup = grp['supervisor'].mode().iloc[0] if len(grp) else ''
        total_7d = int(sum((grp['range_backlog'] == f).sum() for f in ['7-10','10-15','15-20','Backlog >20']))
        ds_sorted.append((ds_name, sup, grp, total_7d))
    ds_sorted.sort(key=lambda x: x[3], reverse=True)

    for i, (ds_name, sup, grp, total_7d) in enumerate(ds_sorted):
        orders = get_orders_ds(ds_name)
        alt = i % 2 == 0
        row_fill = ALT if alt else None
        pct = round(len(grp)/orders*100, 1) if orders else 0

        vals = [sup, ds_name, orders, len(grp), pct]
        for f in FAIXAS:
            vals.append(int((grp['range_backlog'] == f).sum()))
        vals.extend([total_7d, i+1])

        for ci, val in enumerate(vals, 3):
            c = ws.cell(cur, ci, val)
            c.font = BFNT; c.border = BRD; c.alignment = CTR
            if row_fill: c.fill = row_fill
            if ci in (3,4): c.alignment = LFT
            if ci == 7:  # %
                v = val/100 if isinstance(val, (int,float)) and val > 1 else val
                ws.cell(cur, ci, v).number_format = '0.0%'
                ws.cell(cur, ci).font = BFNT; ws.cell(cur, ci).border = BRD
                ws.cell(cur, ci).alignment = CTR
                if row_fill: ws.cell(cur, ci).fill = row_fill
            faixa_offset = ci - 8
            if 0 <= faixa_offset < len(FAIXAS):
                f = FAIXAS[faixa_offset]
                cor = CORES_FAIXA.get(f, 'FFFFFF')
                if isinstance(val, (int,float)) and val > 0:
                    c.fill = PatternFill('solid', fgColor=cor)
                    c.font = Font(name='Calibri', size=10, bold=True,
                                  color='FFFFFF' if f not in ('1-3','3-5') else '000000')
            if ci == 3+len(vals)-1:  # Prioridade
                c.fill = PatternFill('solid', fgColor='1F3864')
                c.font = Font(name='Calibri', bold=True, color='FFFFFF', size=10)
        cur += 1

    # Larguras das colunas
    for col, w in [(3,18),(4,14),(5,12),(6,12),(7,10)] + [(8+i,9) for i in range(8)]:
        ws.column_dimensions[get_column_letter(col)].width = w

    ws.freeze_panes = 'C4'

    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)

    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=Backlog_SLA.xlsx'}
    )

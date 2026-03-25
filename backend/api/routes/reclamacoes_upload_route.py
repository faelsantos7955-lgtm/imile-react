"""
api/routes/reclamacoes_upload_route.py — Upload de Reclamações via portal
Self-contained: não depende de modulos/
"""
import io
from collections import defaultdict
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()


def _ler_bilhete(buf):
    """Lê arquivo de bilhete de reclamações."""
    df = pd.read_excel(buf, dtype=str)
    df.columns = df.columns.str.strip()
    return df


def _extrair_data_ref(df):
    """Extrai data de referência do campo Create Time."""
    if 'Create Time' in df.columns:
        datas = pd.to_datetime(df['Create Time'], dayfirst=True, errors='coerce').dropna()
        if not datas.empty:
            return datas.dt.date.mode().iloc[0]
    return date.today()


def _agregar_por_supervisor(df):
    """Agrega reclamações por supervisor."""
    if 'SUPERVISOR' not in df.columns:
        return []
    grp = df.groupby('SUPERVISOR').size().reset_index(name='dia_total')
    grp = grp.sort_values('dia_total', ascending=False)
    return [{'supervisor': r['SUPERVISOR'], 'dia_total': int(r['dia_total']), 'mes_total': int(r['dia_total'])}
            for _, r in grp.iterrows()]


def _agregar_por_station(df):
    """Agrega reclamações por station."""
    col = None
    for c in ['Inventory Station', 'inventory_station', 'Station']:
        if c in df.columns:
            col = c
            break
    if not col:
        return []
    grp = df.groupby(col).size().reset_index(name='dia_total')
    grp = grp.sort_values('dia_total', ascending=False)
    result = []
    for _, r in grp.iterrows():
        sup = ''
        if 'SUPERVISOR' in df.columns:
            mask = df[col] == r[col]
            sups = df.loc[mask, 'SUPERVISOR'].dropna()
            if not sups.empty:
                sup = sups.mode().iloc[0]
        result.append({'station': str(r[col]), 'supervisor': sup, 'dia_total': int(r['dia_total']), 'mes_total': int(r['dia_total'])})
    return result


def _top5_motoristas(df, inativos=None):
    """Top 5 motoristas com mais reclamações."""
    inativos = inativos or set()
    col_mot = None
    for c in ['Motorista', 'DA Name', 'da_name', 'Driver Name']:
        if c in df.columns:
            col_mot = c
            break
    if not col_mot:
        return []

    df_filt = df[~df[col_mot].isin(inativos)] if inativos else df
    grp = df_filt.groupby(col_mot).size().reset_index(name='total')
    grp = grp.sort_values('total', ascending=False).head(5)

    result = []
    for _, r in grp.iterrows():
        mot = str(r[col_mot])
        ds = ''
        sup = ''
        col_ds = next((c for c in ['Inventory Station', 'Station', 'DS'] if c in df.columns), None)
        if col_ds:
            mask = df[col_mot] == mot
            vals = df.loc[mask, col_ds].dropna()
            if not vals.empty:
                ds = vals.mode().iloc[0]
        if 'SUPERVISOR' in df.columns:
            mask = df[col_mot] == mot
            vals = df.loc[mask, 'SUPERVISOR'].dropna()
            if not vals.empty:
                sup = vals.mode().iloc[0]
        result.append({
            'motorista': mot,
            'id_motorista': mot,
            'ds': ds,
            'supervisor': sup,
            'total': int(r['total']),
        })
    return result


def _adicionar_supervisor(df, sb):
    """Adiciona coluna SUPERVISOR via tabela config_supervisores."""
    if 'SUPERVISOR' in df.columns:
        return df
    # Buscar mapeamento do banco
    res = sb.table("config_supervisores").select("sigla,supervisor").execute()
    if not res.data:
        df['SUPERVISOR'] = 'Sem Supervisor'
        return df
    sup_map = {r['sigla'].strip().upper(): r['supervisor'] for r in res.data if r.get('sigla')}

    # Encontrar coluna de station
    col_sta = None
    for c in ['Inventory Station', 'inventory_station', 'Station']:
        if c in df.columns:
            col_sta = c
            break
    if col_sta:
        df['SUPERVISOR'] = df[col_sta].fillna('').str.strip().str.upper().map(sup_map).fillna('Sem Supervisor')
    else:
        df['SUPERVISOR'] = 'Sem Supervisor'
    return df


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_reclamacoes(
    request: Request,
    file: UploadFile = File(..., description="Bilhete de Reclamação (.xlsx)"),
    user: dict = Depends(get_current_user),
):
    """
    Recebe o bilhete de reclamações, processa e salva no Supabase.
    Versão simplificada que aceita apenas o bilhete (arquivo principal).
    """
    sb = get_supabase()
    conteudo = await validar_arquivo(file)

    try:
        df = _ler_bilhete(io.BytesIO(conteudo))
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {e}")

    if df.empty:
        raise HTTPException(400, "Arquivo vazio")

    # Adicionar supervisor
    df = _adicionar_supervisor(df, sb)

    # Data de referência
    data_ref = _extrair_data_ref(df)

    # Inativos
    res_i = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = {r["id_motorista"] for r in (res_i.data or [])}

    # Agregar
    por_sup = _agregar_por_supervisor(df)
    por_sta = _agregar_por_station(df)
    top5 = _top5_motoristas(df, inativos)

    # Week
    semana_ref = 0
    if 'Create Time' in df.columns:
        datas = pd.to_datetime(df['Create Time'], dayfirst=True, errors='coerce')
        if not datas.dropna().empty:
            semana_ref = int(datas.dropna().dt.isocalendar().week.mode().iloc[0])

    # Remove upload anterior da mesma data
    existing = sb.table("reclamacoes_uploads").select("id").eq("data_ref", data_ref.isoformat()).execute()
    if existing.data:
        old_id = existing.data[0]["id"]
        for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
            sb.table(tbl).delete().eq("upload_id", old_id).execute()
        sb.table("reclamacoes_uploads").delete().eq("id", old_id).execute()

    # Criar upload
    n_mot = 0
    for c in ['Motorista', 'DA Name', 'da_name', 'Driver Name']:
        if c in df.columns:
            n_mot = int(df[c].notna().sum())
            break

    col_sta = next((c for c in ['Inventory Station', 'inventory_station', 'Station'] if c in df.columns), None)
    n_sta = int(df[col_sta].nunique()) if col_sta else 0

    up = sb.table("reclamacoes_uploads").insert({
        "data_ref":    data_ref.isoformat(),
        "n_registros": len(df),
        "n_sup":       int(df['SUPERVISOR'].nunique()) if 'SUPERVISOR' in df.columns else 0,
        "n_sta":       n_sta,
        "n_mot":       n_mot,
        "semana_ref":  semana_ref,
    }).execute()
    uid = up.data[0]["id"]

    # Salvar por supervisor
    if por_sup:
        rows = [{"upload_id": uid, **r} for r in por_sup]
        sb.table("reclamacoes_por_supervisor").insert(rows).execute()

    # Salvar por station
    if por_sta:
        rows = [{"upload_id": uid, **r} for r in por_sta]
        sb.table("reclamacoes_por_station").insert(rows).execute()

    # Salvar top 5
    if top5:
        rows = [{"upload_id": uid, **r} for r in top5]
        sb.table("reclamacoes_top5").insert(rows).execute()

    return {
        "upload_id":   uid,
        "data_ref":    data_ref.isoformat(),
        "n_registros": len(df),
        "n_sup":       int(df['SUPERVISOR'].nunique()) if 'SUPERVISOR' in df.columns else 0,
        "n_sta":       n_sta,
        "n_mot":       n_mot,
        "top5":        top5,
    }

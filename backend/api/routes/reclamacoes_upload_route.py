"""
api/routes/reclamacoes_upload_route.py — Upload de Reclamações via portal
Self-contained: não depende de modulos/
"""
import io
from collections import defaultdict
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_current_user, get_db
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


def _adicionar_supervisor(df, db: Session):
    """Adiciona coluna SUPERVISOR via tabela config_supervisores."""
    if 'SUPERVISOR' in df.columns:
        return df
    rows = db.execute(text("SELECT sigla, region FROM config_supervisores")).mappings().all()
    if not rows:
        df['SUPERVISOR'] = 'Sem Região'
        return df
    sup_map = {r['sigla'].strip().upper(): r['region'] for r in rows if r.get('sigla')}

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
    db: Session = Depends(get_db),
):
    conteudo = await validar_arquivo(file)

    try:
        df = _ler_bilhete(io.BytesIO(conteudo))
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {e}")

    if df.empty:
        raise HTTPException(400, "Arquivo vazio")

    df = _adicionar_supervisor(df, db)

    data_ref = _extrair_data_ref(df)

    inativos_rows = db.execute(
        text("SELECT id_motorista FROM motoristas_status WHERE ativo = false")
    ).mappings().all()
    inativos = {r["id_motorista"] for r in inativos_rows}

    por_sup = _agregar_por_supervisor(df)
    por_sta = _agregar_por_station(df)
    top5 = _top5_motoristas(df, inativos)

    semana_ref = 0
    if 'Create Time' in df.columns:
        datas = pd.to_datetime(df['Create Time'], dayfirst=True, errors='coerce')
        if not datas.dropna().empty:
            semana_ref = int(datas.dropna().dt.isocalendar().week.mode().iloc[0])

    existing = db.execute(
        text("SELECT id FROM reclamacoes_uploads WHERE data_ref = :dr"),
        {"dr": data_ref.isoformat()}
    ).mappings().first()
    if existing:
        old_id = existing["id"]
        for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
        db.execute(text("DELETE FROM reclamacoes_uploads WHERE id = :id"), {"id": old_id})
        db.commit()

    n_mot = 0
    for c in ['Motorista', 'DA Name', 'da_name', 'Driver Name']:
        if c in df.columns:
            n_mot = int(df[c].notna().sum())
            break

    col_sta = next((c for c in ['Inventory Station', 'inventory_station', 'Station'] if c in df.columns), None)
    n_sta = int(df[col_sta].nunique()) if col_sta else 0

    row = db.execute(
        text("""
            INSERT INTO reclamacoes_uploads (data_ref, n_registros, n_sup, n_sta, n_mot, semana_ref)
            VALUES (:data_ref, :n_registros, :n_sup, :n_sta, :n_mot, :semana_ref)
            RETURNING id
        """),
        {
            "data_ref":    data_ref.isoformat(),
            "n_registros": len(df),
            "n_sup":       int(df['SUPERVISOR'].nunique()) if 'SUPERVISOR' in df.columns else 0,
            "n_sta":       n_sta,
            "n_mot":       n_mot,
            "semana_ref":  semana_ref,
        }
    ).mappings().first()
    uid = row["id"]
    db.commit()

    if por_sup:
        db.execute(
            text("INSERT INTO reclamacoes_por_supervisor (upload_id, supervisor, dia_total, mes_total) VALUES (:upload_id, :supervisor, :dia_total, :mes_total)"),
            [{"upload_id": uid, **r} for r in por_sup]
        )
        db.commit()

    if por_sta:
        db.execute(
            text("INSERT INTO reclamacoes_por_station (upload_id, station, supervisor, dia_total, mes_total) VALUES (:upload_id, :station, :supervisor, :dia_total, :mes_total)"),
            [{"upload_id": uid, **r} for r in por_sta]
        )
        db.commit()

    if top5:
        db.execute(
            text("INSERT INTO reclamacoes_top5 (upload_id, motorista, id_motorista, ds, supervisor, total) VALUES (:upload_id, :motorista, :id_motorista, :ds, :supervisor, :total)"),
            [{"upload_id": uid, **r} for r in top5]
        )
        db.commit()

    return {
        "upload_id":   uid,
        "data_ref":    data_ref.isoformat(),
        "n_registros": len(df),
        "n_sup":       int(df['SUPERVISOR'].nunique()) if 'SUPERVISOR' in df.columns else 0,
        "n_sta":       n_sta,
        "n_mot":       n_mot,
        "top5":        top5,
    }

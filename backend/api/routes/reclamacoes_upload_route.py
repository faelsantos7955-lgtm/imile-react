"""
api/routes/reclamacoes_upload_route.py — Upload de Reclamações via portal
Self-contained: não depende de modulos/
"""
import io
import logging
import threading
from datetime import date, datetime
from typing import List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_current_user, get_db, _session_factory
from api.jobs import create_job, get_job, update_job
from api.limiter import limiter
from api.upload_utils import validar_arquivo
from api.lark_utils import notify_reclamacoes

log = logging.getLogger("reclamacoes")

router = APIRouter()

_ENGINE = "openpyxl"
try:
    import python_calamine  # noqa: F401
    _ENGINE = "calamine"
except ImportError:
    pass


def _make_db() -> Session:
    return _session_factory()()


_STA_COLS = ['Inventory Station', 'inventory_station', 'InventoryStation',
             'Station', 'station_code', 'DS', 'DS²', 'Base',
             'Estação', 'Estacao', 'Branch', 'Sigla']
_MOT_COLS = ['DA Name', 'da_name', 'DAName', 'Motorista',
             'Driver Name', 'Driver', 'driver_name',
             'Entregador', 'Nome DA', 'courier', 'Courier Name']
_SUP_COLS = ['SUPERVISOR', 'Supervisor', 'supervisor',
             'Regional', 'Região', 'Regiao', 'region']


def _is_rec_sheet(cols: list) -> bool:
    cl = [str(c).lower() for c in cols]
    has_mot = any(k in c for c in cl for k in ['da name', 'motorista', 'driver', 'entregador', 'courier'])
    has_sta = any(k in c for c in cl for k in ['station', 'inventory', 'estação', 'estacao', 'base'])
    return (has_mot or has_sta) and len(cols) >= 3


def _ler_bilhete(buf):
    try:
        all_sheets = pd.read_excel(buf, sheet_name=None, dtype=str, engine=_ENGINE)
    except Exception:
        buf.seek(0)
        all_sheets = pd.read_excel(buf, sheet_name=None, dtype=str)
    frames = []
    for sheet_name, df in all_sheets.items():
        if df.empty:
            continue
        df.columns = df.columns.str.strip()
        if _is_rec_sheet(list(df.columns)):
            frames.append(df)
    if not frames:
        first_name = next(iter(all_sheets))
        df = all_sheets[first_name]
        df.columns = df.columns.str.strip()
        return df
    return pd.concat(frames, ignore_index=True)


def _extrair_data_ref(df):
    col = next(
        (c for c in df.columns if any(k in c.lower() for k in ['create time', 'create_time', 'data criação', 'data de criação', 'criado em', 'date'])),
        None,
    )
    if col:
        datas = pd.to_datetime(df[col], dayfirst=False, errors='coerce').dropna()
        if not datas.empty:
            return datas.dt.date.mode().iloc[0]
    return date.today()


def _find_col(df, candidates):
    cols_lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        cl = cand.lower()
        if cl in cols_lower:
            return cols_lower[cl]
        match = next((orig for low, orig in cols_lower.items() if cl in low), None)
        if match:
            return match
    return None


def _sup_col(df): return _find_col(df, _SUP_COLS)
def _sta_col(df): return _find_col(df, _STA_COLS)
def _mot_col(df): return _find_col(df, _MOT_COLS)


def _agregar_por_supervisor(df):
    col = _sup_col(df)
    if not col:
        return []
    grp = df[df[col].notna()].groupby(col).size().reset_index(name='dia_total')
    grp = grp.sort_values('dia_total', ascending=False)
    return [{'supervisor': str(r[col]), 'dia_total': int(r['dia_total']), 'mes_total': int(r['dia_total'])}
            for _, r in grp.iterrows()]


def _agregar_por_station(df):
    col = _sta_col(df)
    if not col:
        return []
    df2 = df[df[col].notna()].copy()
    grp = df2.groupby(col).size().reset_index(name='dia_total')
    grp = grp.sort_values('dia_total', ascending=False)
    col_sup = _sup_col(df)
    sup_map = {}
    if col_sup:
        sup_map = (
            df2[df2[col_sup].notna()]
            .groupby(col)[col_sup]
            .agg(lambda s: s.mode().iloc[0])
            .to_dict()
        )
    return [
        {
            'station': str(r[col]),
            'supervisor': str(sup_map.get(r[col], '')),
            'dia_total': int(r['dia_total']),
            'mes_total': int(r['dia_total']),
        }
        for _, r in grp.iterrows()
    ]


def _top5_motoristas(df, inativos=None):
    inativos = inativos or set()
    col_mot = _mot_col(df)
    if not col_mot:
        return []

    df_filt = df[~df[col_mot].isin(inativos)] if inativos else df
    grp = df_filt.groupby(col_mot).size().reset_index(name='total')
    grp = grp.sort_values('total', ascending=False).head(5)

    col_ds  = _sta_col(df)
    col_sup = _sup_col(df)

    ds_map: dict = {}
    if col_ds:
        ds_map = (
            df_filt[df_filt[col_ds].notna()]
            .groupby(col_mot)[col_ds]
            .agg(lambda s: s.mode().iloc[0])
            .to_dict()
        )

    sup_map: dict = {}
    if col_sup:
        sup_map = (
            df_filt[df_filt[col_sup].notna()]
            .groupby(col_mot)[col_sup]
            .agg(lambda s: s.mode().iloc[0])
            .to_dict()
        )

    return [
        {
            'motorista': str(r[col_mot]),
            'id_motorista': str(r[col_mot]),
            'ds': str(ds_map.get(r[col_mot], '')),
            'supervisor': str(sup_map.get(r[col_mot], '')),
            'total': int(r['total']),
        }
        for _, r in grp.iterrows()
    ]


def _norm_key(s: str) -> str:
    import re
    return re.sub(r'[-_\s]', '', str(s)).upper()


def _adicionar_supervisor(df, db: Session):
    if _sup_col(df):
        col = _sup_col(df)
        if col != 'SUPERVISOR':
            df = df.rename(columns={col: 'SUPERVISOR'})
        return df
    rows = db.execute(text("SELECT sigla, region FROM config_supervisores")).mappings().all()
    if not rows:
        df['SUPERVISOR'] = 'Sem Região'
        return df
    sup_map      = {r['sigla'].strip().upper(): r['region'] for r in rows if r.get('sigla')}
    sup_map_norm = {_norm_key(k): v for k, v in sup_map.items()}

    col_sta = _sta_col(df)
    if col_sta:
        def _lookup(val):
            v = str(val).strip().upper() if val and str(val).strip() else ''
            if not v:
                return 'Sem Supervisor'
            return sup_map.get(v) or sup_map_norm.get(_norm_key(v)) or 'Sem Supervisor'
        df['SUPERVISOR'] = df[col_sta].apply(_lookup)
    else:
        df['SUPERVISOR'] = 'Sem Supervisor'
    return df


# ── Modelos para /salvar (processamento local no cliente) ────

class RecSupItem(BaseModel):
    supervisor: str; dia_total: int; mes_total: int

class RecStaItem(BaseModel):
    station: str; supervisor: str = ''; dia_total: int; mes_total: int

class RecTop5Item(BaseModel):
    motorista: str; id_motorista: str; ds: str = ''; supervisor: str = ''; total: int

class SalvarReclamacoesPayload(BaseModel):
    data_ref: str
    n_registros: int; n_sup: int = 0; n_sta: int = 0; n_mot: int = 0; semana_ref: int = 0
    por_supervisor: List[RecSupItem] = []
    por_station: List[RecStaItem] = []
    top5: List[RecTop5Item] = []


@router.post("/salvar")
def salvar_reclamacoes(payload: SalvarReclamacoesPayload, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.execute(
        text("SELECT id FROM reclamacoes_uploads WHERE data_ref = :dr"),
        {"dr": payload.data_ref}
    ).mappings().first()
    if existing:
        old_id = existing["id"]
        for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
        db.execute(text("DELETE FROM reclamacoes_uploads WHERE id = :id"), {"id": old_id})
        db.commit()

    row = db.execute(
        text("""
            INSERT INTO reclamacoes_uploads (data_ref, n_registros, n_sup, n_sta, n_mot, semana_ref)
            VALUES (:data_ref, :n_registros, :n_sup, :n_sta, :n_mot, :semana_ref)
            RETURNING id
        """),
        {
            "data_ref":    payload.data_ref,
            "n_registros": payload.n_registros,
            "n_sup":       payload.n_sup,
            "n_sta":       payload.n_sta,
            "n_mot":       payload.n_mot,
            "semana_ref":  payload.semana_ref,
        }
    ).mappings().first()
    uid = row["id"]
    db.commit()

    if payload.por_supervisor:
        db.execute(
            text("INSERT INTO reclamacoes_por_supervisor (upload_id, supervisor, dia_total, mes_total) VALUES (:upload_id, :supervisor, :dia_total, :mes_total)"),
            [{"upload_id": uid, **r.model_dump()} for r in payload.por_supervisor]
        )
        db.commit()

    if payload.por_station:
        db.execute(
            text("INSERT INTO reclamacoes_por_station (upload_id, station, supervisor, dia_total, mes_total) VALUES (:upload_id, :station, :supervisor, :dia_total, :mes_total)"),
            [{"upload_id": uid, **r.model_dump()} for r in payload.por_station]
        )
        db.commit()

    if payload.top5:
        db.execute(
            text("INSERT INTO reclamacoes_top5 (upload_id, motorista, id_motorista, ds, supervisor, total) VALUES (:upload_id, :motorista, :id_motorista, :ds, :supervisor, :total)"),
            [{"upload_id": uid, **r.model_dump()} for r in payload.top5]
        )
        db.commit()

    notify_reclamacoes(payload.model_dump(), user["email"])
    return {
        "upload_id":   uid,
        "data_ref":    payload.data_ref,
        "n_registros": payload.n_registros,
        "n_sup":       payload.n_sup,
        "n_sta":       payload.n_sta,
        "n_mot":       payload.n_mot,
        "top5":        [r.model_dump() for r in payload.top5],
    }


def _run_job(job_id: str, conteudos: list[bytes], user: dict):
    db = _make_db()

    def _set(update: dict):
        update_job(job_id, **update)

    try:
        _set({"fase": "lendo"})

        frames = []
        for c in conteudos:
            frames.append(_ler_bilhete(io.BytesIO(c)))

        df = pd.concat(frames, ignore_index=True) if len(frames) > 1 else frames[0]

        if df.empty:
            raise ValueError("Arquivo vazio")

        _set({"fase": "processando"})
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
        col_time = next((c for c in df.columns if 'create time' in c.lower() or 'create_time' in c.lower()), None)
        if col_time:
            datas = pd.to_datetime(df[col_time], dayfirst=False, errors='coerce')
            if not datas.dropna().empty:
                semana_ref = int(datas.dropna().dt.isocalendar().week.mode().iloc[0])

        col_mot_name = _mot_col(df)
        n_mot = int(df[col_mot_name].notna().sum()) if col_mot_name else 0
        col_sta_name = _sta_col(df)
        n_sta = int(df[col_sta_name].nunique()) if col_sta_name else 0
        col_sup_name = _sup_col(df) or 'SUPERVISOR'

        _set({"fase": "salvando"})

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

        row = db.execute(
            text("""
                INSERT INTO reclamacoes_uploads (data_ref, n_registros, n_sup, n_sta, n_mot, semana_ref)
                VALUES (:data_ref, :n_registros, :n_sup, :n_sta, :n_mot, :semana_ref)
                RETURNING id
            """),
            {
                "data_ref":    data_ref.isoformat(),
                "n_registros": len(df),
                "n_sup":       int(df[col_sup_name].nunique()) if col_sup_name in df.columns else 0,
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

        resultado = {
            "upload_id":   uid,
            "data_ref":    data_ref.isoformat(),
            "n_registros": len(df),
            "n_sup":       int(df['SUPERVISOR'].nunique()) if 'SUPERVISOR' in df.columns else 0,
            "n_sta":       n_sta,
            "n_mot":       n_mot,
            "top5":        top5,
        }
        notify_reclamacoes(resultado, user["email"])
        log.info("[job:%s] reclamacoes concluído — upload_id=%d n_registros=%d", job_id, uid, len(df))
        _set({"status": "done", **resultado})

    except Exception as e:
        log.error("[job:%s] ERRO: %s", job_id, e, exc_info=True)
        db.rollback()
        _set({"status": "error", "erro": str(e)})
    finally:
        db.close()


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_reclamacoes(
    request: Request,
    files: List[UploadFile] = File(..., description="Bilhete e/ou Carta de Reclamação (.xlsx)"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado.")

    conteudos = []
    for f in files:
        c = await validar_arquivo(f)
        conteudos.append(c)

    job_id = create_job()
    threading.Thread(target=_run_job, args=(job_id, conteudos, user), daemon=True).start()
    return {"job_id": job_id, "status": "processing"}


@router.get("/job/{job_id}")
def status_job(job_id: str, user: dict = Depends(get_current_user)):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(404, "Job não encontrado.")
    return job

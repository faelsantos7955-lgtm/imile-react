"""
api/jobs.py — Estado de jobs persistido em PostgreSQL.

Substitui dicts in-memory que não sobrevivem a múltiplos workers/instâncias.
Status (status/fase/erro) ficam em colunas, qualquer payload extra em JSONB.
"""
import json
import uuid
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from api.deps import _session_factory

log = logging.getLogger("jobs")

_COL_FIELDS = {"status", "fase", "erro"}


def ensure_schema(db: Session) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS jobs (
            id            UUID         PRIMARY KEY,
            status        TEXT         NOT NULL DEFAULT 'processing',
            fase          TEXT,
            payload       JSONB        NOT NULL DEFAULT '{}'::jsonb,
            erro          TEXT,
            criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_jobs_criado_em ON jobs(criado_em)"))
    db.commit()


def create_job() -> str:
    """Insere job em status 'processing' e retorna o id."""
    job_id = str(uuid.uuid4())
    db = _session_factory()()
    try:
        db.execute(
            text("INSERT INTO jobs (id, status, fase) VALUES (:id, 'processing', 'iniciando')"),
            {"id": job_id},
        )
        db.commit()
    finally:
        db.close()
    return job_id


def update_job(job_id: str, **fields) -> None:
    """Atualiza status/fase/erro nas colunas; demais chaves vão pro payload jsonb (merge)."""
    if not fields:
        return
    col_updates = {k: v for k, v in fields.items() if k in _COL_FIELDS}
    payload_delta = {k: v for k, v in fields.items() if k not in _COL_FIELDS}

    sets = []
    params = {"id": job_id}
    for k, v in col_updates.items():
        sets.append(f"{k} = :{k}")
        params[k] = v
    if payload_delta:
        sets.append("payload = payload || CAST(:payload_delta AS jsonb)")
        params["payload_delta"] = json.dumps(payload_delta, default=str)
    sets.append("atualizado_em = NOW()")

    db = _session_factory()()
    try:
        db.execute(text(f"UPDATE jobs SET {', '.join(sets)} WHERE id = :id"), params)
        db.commit()
    except Exception:
        db.rollback()
        log.exception("update_job falhou para %s", job_id)
    finally:
        db.close()


def get_job(job_id: str) -> Optional[dict]:
    """Retorna dict achatado (payload merged com colunas) ou None."""
    db = _session_factory()()
    try:
        row = db.execute(
            text("SELECT id, status, fase, payload, erro FROM jobs WHERE id = :id"),
            {"id": job_id},
        ).mappings().first()
    finally:
        db.close()
    if not row:
        return None
    payload = row["payload"] or {}
    out = {**payload}
    out["job_id"] = str(row["id"])
    out["status"] = row["status"]
    if row["fase"]:
        out["fase"] = row["fase"]
    if row["erro"]:
        out["erro"] = row["erro"]
    return out

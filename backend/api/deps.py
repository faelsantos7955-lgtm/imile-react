"""
api/deps.py — Dependências compartilhadas (SQLAlchemy + JWT)
"""
import os
import json
import logging
from functools import lru_cache
from typing import Generator

from fastapi import BackgroundTasks, Depends, HTTPException, Header
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from jose import JWTError, jwt

log = logging.getLogger(__name__)

# ── Engine SQLAlchemy ─────────────────────────────────────────

@lru_cache()
def _engine():
    url = os.getenv("DATABASE_URL", "").strip().lstrip("=").strip()
    if not url:
        raise RuntimeError("DATABASE_URL não configurada")

    # SQLAlchemy 2.x requer "postgresql://", não "postgres://"
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    # Neon exige SSL; se a URL não tiver sslmode, injeta require
    if "sslmode=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"

    return create_engine(
        url,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args={"connect_timeout": 30},
    )


@lru_cache()
def _session_factory():
    return sessionmaker(bind=_engine(), autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = _session_factory()()
    try:
        yield db
    finally:
        db.close()


# ── JWT ───────────────────────────────────────────────────────

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SECRET_KEY ausente ou curta demais — defina uma chave aleatória de no mínimo 32 caracteres."
    )
ALGORITHM = "HS256"


async def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> dict:
    """Valida o Bearer token JWT e retorna o perfil do usuário."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")

    row = db.execute(
        text("SELECT id, email, nome, role, bases, paginas, ativo FROM usuarios WHERE id = :id"),
        {"id": user_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=403, detail="Usuário sem perfil no portal")
    if not row["ativo"]:
        raise HTTPException(status_code=403, detail="Conta desativada")

    return {
        "id":      str(row["id"]),
        "email":   row["email"],
        "nome":    row["nome"] or "",
        "role":    row["role"] or "viewer",
        "bases":   row["bases"] or [],
        "paginas": row["paginas"] or [],
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return user


def audit_log_sync(action: str, target: str, detail: dict, user: dict) -> None:
    """Grava no audit_log de forma síncrona — para threads de background sem BackgroundTasks."""
    db = _session_factory()()
    try:
        db.execute(
            text("""
                INSERT INTO audit_log (acao, alvo, detalhe, email, user_id)
                VALUES (:acao, :alvo, CAST(:detalhe AS jsonb), :email, :user_id)
            """),
            {
                "acao":    action,
                "alvo":    target,
                "detalhe": json.dumps(detail or {}, default=str),
                "email":   user.get("email", ""),
                "user_id": user.get("id", ""),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        log.exception("Falha ao gravar audit_log: action=%s target=%s user=%s",
                      action, target, user.get("email"))
    finally:
        db.close()


def audit_log(
    background_tasks: BackgroundTasks,
    action: str,
    target: str,
    detail: dict,
    user: dict,
) -> None:
    """Agenda gravação em audit_log fora do response (não bloqueia o request)."""
    background_tasks.add_task(audit_log_sync, action, target, detail, user)

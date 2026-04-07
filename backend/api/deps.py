"""
api/deps.py — Dependências compartilhadas (SQLAlchemy + JWT)
"""
import os
import logging
from functools import lru_cache
from typing import Generator

from fastapi import Depends, HTTPException, Header
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
    return create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=10)


def get_db() -> Generator[Session, None, None]:
    SessionLocal = sessionmaker(bind=_engine(), autocommit=False, autoflush=False)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── JWT ───────────────────────────────────────────────────────

SECRET_KEY  = os.getenv("SECRET_KEY", "changeme-secret-key-32chars-min!!")
ALGORITHM   = "HS256"


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


def audit_log(action: str, target: str, detail: dict, user: dict) -> None:
    """Registra ação administrativa na tabela audit_log."""
    try:
        db_gen = get_db()
        db = next(db_gen)
        db.execute(
            text("""
                INSERT INTO audit_log (acao, alvo, detalhe, email, user_id)
                VALUES (:acao, :alvo, :detalhe, :email, :user_id)
            """),
            {
                "acao":    action,
                "alvo":    target,
                "detalhe": str(detail),
                "email":   user.get("email", ""),
                "user_id": user.get("id", ""),
            },
        )
        db.commit()
    except Exception:
        log.error("Falha ao gravar audit_log: action=%s target=%s user=%s",
                  action, target, user.get("email"))
    finally:
        try:
            db_gen.close()
        except Exception:
            pass

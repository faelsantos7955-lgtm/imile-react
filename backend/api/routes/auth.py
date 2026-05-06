"""
api/routes/auth.py — Login, registro e perfil (JWT próprio + PostgreSQL)
"""
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Response, Cookie
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from jose import jwt, JWTError
from passlib.context import CryptContext

from api.deps import get_db, get_current_user, SECRET_KEY, ALGORITHM

router = APIRouter()

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TTL  = int(os.getenv("ACCESS_TOKEN_MINUTES",  "60"))    # 1 hora
REFRESH_TTL = int(os.getenv("REFRESH_TOKEN_DAYS",    "30"))    # 30 dias

_COOKIE_OPTS = dict(
    key="refresh_token",
    httponly=True,
    secure=True,
    samesite="lax",
    max_age=60 * 60 * 24 * REFRESH_TTL,
    path="/api/auth/refresh",
)


# ── Helpers JWT ───────────────────────────────────────────────

def hash_password_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _make_access_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL)
    return jwt.encode({"sub": user_id, "exp": exp, "type": "access"}, SECRET_KEY, algorithm=ALGORITHM)


def _make_refresh_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL)
    return jwt.encode({"sub": user_id, "exp": exp, "type": "refresh"}, SECRET_KEY, algorithm=ALGORITHM)


def _decode_refresh(token: str) -> str:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "refresh":
        raise ValueError("Token não é do tipo refresh")
    return payload["sub"]


# ── Schemas ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    nome: str
    email: str
    motivo: str = ""


class DefinirSenhaRequest(BaseModel):
    token: str
    senha: str


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/login")
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id, email, nome, role, bases, paginas, ativo, password_hash FROM usuarios WHERE email = :email"),
        {"email": req.email.strip().lower()},
    ).mappings().first()

    if not row:
        raise HTTPException(401, "Email ou senha incorretos")
    if not row["ativo"]:
        raise HTTPException(403, "Conta desativada")
    if not row["password_hash"] or not pwd_ctx.verify(req.password, row["password_hash"]):
        raise HTTPException(401, "Email ou senha incorretos")

    user_id = str(row["id"])
    access  = _make_access_token(user_id)
    refresh = _make_refresh_token(user_id)

    response.set_cookie(value=refresh, **_COOKIE_OPTS)

    return {
        "access_token": access,
        "user": {
            "id":      user_id,
            "email":   row["email"],
            "nome":    row["nome"] or "",
            "role":    row["role"] or "viewer",
            "bases":   row["bases"] or [],
            "paginas": row["paginas"] or [],
        },
    }


@router.post("/refresh")
def refresh(response: Response, refresh_token: str = Cookie(None)):
    if not refresh_token:
        raise HTTPException(401, "Sessão expirada — faça login novamente")
    try:
        user_id = _decode_refresh(refresh_token)
    except JWTError:
        raise HTTPException(401, "Refresh token inválido ou expirado")
    except Exception:
        raise HTTPException(401, "Sessão inválida")

    new_access  = _make_access_token(user_id)
    new_refresh = _make_refresh_token(user_id)
    response.set_cookie(value=new_refresh, **_COOKIE_OPTS)

    return {"access_token": new_access}


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    try:
        db.execute(
            text("""
                INSERT INTO solicitacoes_acesso (nome, email, motivo, status)
                VALUES (:nome, :email, :motivo, 'pendente')
            """),
            {
                "nome":   req.nome.strip(),
                "email":  req.email.strip().lower(),
                "motivo": req.motivo.strip(),
            },
        )
        db.commit()
        return {"ok": True, "message": "Solicitação enviada"}
    except Exception:
        db.rollback()
        raise HTTPException(500, "Erro interno ao enviar solicitação")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    return {"ok": True}


@router.post("/definir-senha")
def definir_senha(req: DefinirSenhaRequest, db: Session = Depends(get_db)):
    if len(req.senha) < 8:
        raise HTTPException(422, "A senha deve ter pelo menos 8 caracteres")
    token_hash = hash_password_token(req.token)
    row = db.execute(
        text("SELECT email FROM password_tokens WHERE token = :token AND usado = false AND expires_at > NOW()"),
        {"token": token_hash}
    ).mappings().first()
    if not row:
        raise HTTPException(400, "Link inválido ou expirado")
    hash_ = pwd_ctx.hash(req.senha)
    db.execute(
        text("UPDATE usuarios SET password_hash = :hash WHERE email = :email"),
        {"hash": hash_, "email": row["email"]}
    )
    db.execute(
        text("UPDATE password_tokens SET usado = true WHERE token = :token"),
        {"token": token_hash}
    )
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user

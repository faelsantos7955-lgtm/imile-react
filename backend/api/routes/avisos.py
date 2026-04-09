"""
api/routes/avisos.py — Quadro de Avisos (Bulletin Board)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from api.deps import get_db, get_current_user, require_admin

router = APIRouter()

TIPOS = ["info", "aviso", "urgente"]

# ── auto-create tables ─────────────────────────────────────────
def _ensure_tables(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS avisos (
            id         SERIAL PRIMARY KEY,
            titulo     VARCHAR(200) NOT NULL,
            conteudo   TEXT DEFAULT '',
            tipo       VARCHAR(20) DEFAULT 'info',
            criado_por VARCHAR(200),
            criado_em  TIMESTAMP DEFAULT NOW(),
            ativo      BOOLEAN DEFAULT TRUE
        )
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS aviso_leituras (
            aviso_id   INTEGER NOT NULL,
            user_email VARCHAR(200) NOT NULL,
            lido_em    TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (aviso_id, user_email)
        )
    """))
    db.commit()


class AvisoCreate(BaseModel):
    titulo: str
    conteudo: Optional[str] = ""
    tipo: Optional[str] = "info"


class AvisoUpdate(BaseModel):
    titulo: Optional[str] = None
    conteudo: Optional[str] = None
    tipo: Optional[str] = None
    ativo: Optional[bool] = None


# ── Listar avisos ativos (todos os usuários logados) ──────────
@router.get("")
def listar(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _ensure_tables(db)
    email = user.get("email", "")
    rows = db.execute(text("""
        SELECT a.id, a.titulo, a.conteudo, a.tipo, a.criado_por, a.criado_em, a.ativo,
               (r.user_email IS NOT NULL) AS lido,
               r.lido_em
        FROM avisos a
        LEFT JOIN aviso_leituras r
               ON r.aviso_id = a.id AND r.user_email = :email
        WHERE a.ativo = TRUE
        ORDER BY a.criado_em DESC
    """), {"email": email}).mappings().all()
    return [dict(r) for r in rows]


# ── Contar não lidos (para badge no menu) ─────────────────────
@router.get("/nao-lidos")
def nao_lidos(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _ensure_tables(db)
    email = user.get("email", "")
    row = db.execute(text("""
        SELECT COUNT(*) AS total
        FROM avisos a
        LEFT JOIN aviso_leituras r
               ON r.aviso_id = a.id AND r.user_email = :email
        WHERE a.ativo = TRUE AND r.user_email IS NULL
    """), {"email": email}).mappings().first()
    return {"total": row["total"] if row else 0}


# ── Marcar como lido ──────────────────────────────────────────
@router.post("/{id}/lido")
def marcar_lido(id: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _ensure_tables(db)
    email = user.get("email", "")
    db.execute(text("""
        INSERT INTO aviso_leituras (aviso_id, user_email)
        VALUES (:aviso_id, :email)
        ON CONFLICT (aviso_id, user_email) DO NOTHING
    """), {"aviso_id": id, "email": email})
    db.commit()
    return {"ok": True}


# ── Marcar todos como lidos ───────────────────────────────────
@router.post("/marcar-todos-lidos")
def marcar_todos_lidos(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _ensure_tables(db)
    email = user.get("email", "")
    db.execute(text("""
        INSERT INTO aviso_leituras (aviso_id, user_email)
        SELECT id, :email FROM avisos WHERE ativo = TRUE
        ON CONFLICT (aviso_id, user_email) DO NOTHING
    """), {"email": email})
    db.commit()
    return {"ok": True}


# ── Admin: listar todos (ativos e inativos) com contagem ──────
@router.get("/admin/todos")
def admin_listar(db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    _ensure_tables(db)
    rows = db.execute(text("""
        SELECT a.id, a.titulo, a.conteudo, a.tipo, a.criado_por, a.criado_em, a.ativo,
               COUNT(r.user_email) AS total_lidos
        FROM avisos a
        LEFT JOIN aviso_leituras r ON r.aviso_id = a.id
        GROUP BY a.id
        ORDER BY a.criado_em DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


# ── Admin: criar aviso ────────────────────────────────────────
@router.post("")
def criar(body: AvisoCreate, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    _ensure_tables(db)
    if body.tipo not in TIPOS:
        raise HTTPException(400, f"Tipo inválido. Opções: {', '.join(TIPOS)}")
    db.execute(text("""
        INSERT INTO avisos (titulo, conteudo, tipo, criado_por)
        VALUES (:titulo, :conteudo, :tipo, :criado_por)
    """), {
        "titulo": body.titulo.strip(),
        "conteudo": body.conteudo or "",
        "tipo": body.tipo,
        "criado_por": user.get("email", ""),
    })
    db.commit()
    return {"ok": True}


# ── Admin: editar aviso ───────────────────────────────────────
@router.patch("/{id}")
def editar(id: int, body: AvisoUpdate, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    _ensure_tables(db)
    fields = []
    params = {"id": id}
    if body.titulo is not None:
        fields.append("titulo = :titulo"); params["titulo"] = body.titulo.strip()
    if body.conteudo is not None:
        fields.append("conteudo = :conteudo"); params["conteudo"] = body.conteudo
    if body.tipo is not None:
        if body.tipo not in TIPOS:
            raise HTTPException(400, f"Tipo inválido.")
        fields.append("tipo = :tipo"); params["tipo"] = body.tipo
    if body.ativo is not None:
        fields.append("ativo = :ativo"); params["ativo"] = body.ativo
    if not fields:
        raise HTTPException(400, "Nenhum campo para atualizar.")
    result = db.execute(text(f"UPDATE avisos SET {', '.join(fields)} WHERE id = :id"), params)
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Aviso não encontrado.")
    return {"ok": True}


# ── Admin: excluir aviso ──────────────────────────────────────
@router.delete("/{id}")
def excluir(id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    _ensure_tables(db)
    result = db.execute(text("DELETE FROM avisos WHERE id = :id"), {"id": id})
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Aviso não encontrado.")
    return {"ok": True}

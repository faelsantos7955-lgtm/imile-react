"""
api/routes/extravios.py — Listagem e detalhe de uploads de Extravios
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM extravios_uploads ORDER BY criado_em DESC LIMIT 30")
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    up = db.execute(
        text("SELECT * FROM extravios_uploads WHERE id = :id"), {"id": upload_id}
    ).mappings().first()
    if not up:
        raise HTTPException(404, "Upload não encontrado")

    por_ds = db.execute(
        text("SELECT * FROM extravios_por_ds WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_motivo = db.execute(
        text("SELECT * FROM extravios_por_motivo WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_semana = db.execute(
        text("SELECT * FROM extravios_por_semana WHERE upload_id = :uid ORDER BY semana"),
        {"uid": upload_id}
    ).mappings().all()

    return {
        "upload":     dict(up),
        "por_ds":     [dict(r) for r in por_ds],
        "por_motivo": [dict(r) for r in por_motivo],
        "por_semana": [dict(r) for r in por_semana],
    }

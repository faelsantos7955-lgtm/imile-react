"""
api/routes/notracking.py — Listagem e detalhe de uploads de No Tracking (断更)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM notracking_uploads ORDER BY data_ref DESC")
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    up = db.execute(
        text("SELECT * FROM notracking_uploads WHERE id = :id"), {"id": upload_id}
    ).mappings().first()
    if not up:
        raise HTTPException(404, "Upload não encontrado")

    por_ds = db.execute(
        text("SELECT * FROM notracking_por_ds WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_sup = db.execute(
        text("SELECT * FROM notracking_por_sup WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_status = db.execute(
        text("SELECT * FROM notracking_por_status WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_faixa = db.execute(
        text("SELECT * FROM notracking_por_faixa WHERE upload_id = :uid"),
        {"uid": upload_id}
    ).mappings().all()

    return {
        "upload":     dict(up),
        "por_ds":     [dict(r) for r in por_ds],
        "por_sup":    [dict(r) for r in por_sup],
        "por_status": [dict(r) for r in por_status],
        "por_faixa":  [dict(r) for r in por_faixa],
    }

"""
api/routes/not_arrived.py — Listagem, detalhe e exclusão de uploads Not Arrived
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log
from api.upload_utils import deletar_upload_handler

log = logging.getLogger("not_arrived")
router = APIRouter()

_TABELA_MAE = "not_arrived_uploads"
_TABELAS_FILHAS = (
    "not_arrived_por_estacao", "not_arrived_por_regiao",
    "not_arrived_por_operacao", "not_arrived_por_supervisor",
    "not_arrived_tendencia",
)


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT id, data_ref, criado_por, total, total_dc, total_ds,
                   total_entregues, pct_entregues, criado_em
            FROM not_arrived_uploads ORDER BY criado_em DESC LIMIT 60
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    estacao = db.execute(
        text("SELECT * FROM not_arrived_por_estacao WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    regiao = db.execute(
        text("SELECT * FROM not_arrived_por_regiao WHERE upload_id = :uid"),
        {"uid": upload_id}
    ).mappings().all()
    operacao = db.execute(
        text("SELECT * FROM not_arrived_por_operacao WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    supervisor = db.execute(
        text("SELECT * FROM not_arrived_por_supervisor WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()

    return {
        "por_estacao":    [dict(r) for r in estacao],
        "por_regiao":     [dict(r) for r in regiao],
        "por_operacao":   [dict(r) for r in operacao],
        "por_supervisor": [dict(r) for r in supervisor],
    }


@router.get("/upload/{upload_id}/tendencia")
def tendencia_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT supervisor, data, total FROM not_arrived_tendencia WHERE upload_id = :uid ORDER BY data"),
        {"uid": upload_id}
    ).mappings().all()
    return [dict(r) for r in rows]


@router.delete("/upload/{upload_id}")
def deletar_upload(
    upload_id: int,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    deletar_upload_handler(db, log, _TABELA_MAE, _TABELAS_FILHAS, upload_id)
    audit_log(background_tasks, "upload_deletado", f"not_arrived_uploads:{upload_id}", {}, user)
    return {"ok": True}

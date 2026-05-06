"""
api/routes/na.py — Listagem, detalhe e exclusão de uploads Not Arrived (有发未到)
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT id, data_ref, criado_por, total, total_offload, total_arrive,
                   grd10d, threshold_col, criado_em
            FROM na_uploads ORDER BY data_ref DESC
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    supervisor = db.execute(
        text("SELECT * FROM na_por_supervisor WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    ds = db.execute(
        text("SELECT * FROM na_por_ds WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    processo = db.execute(
        text("SELECT * FROM na_por_processo WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()

    return {
        "por_supervisor": [dict(r) for r in supervisor],
        "por_ds":         [dict(r) for r in ds],
        "por_processo":   [dict(r) for r in processo],
    }


@router.get("/upload/{upload_id}/tendencia")
def tendencia_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT supervisor, ds, data, total FROM na_tendencia WHERE upload_id = :uid ORDER BY data"),
        {"uid": upload_id}
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/historico/supervisores")
def historico_supervisores(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna totais por supervisor em cada upload, para gráfico de tendência."""
    uploads = db.execute(
        text("SELECT id, data_ref FROM na_uploads ORDER BY data_ref")
    ).mappings().all()
    if not uploads:
        return []

    uid_to_date = {u["id"]: u["data_ref"] for u in uploads}
    uids = list(uid_to_date.keys())

    sup_data = db.execute(
        text("SELECT upload_id, supervisor, total, grd10d FROM na_por_supervisor WHERE upload_id = ANY(:uids)"),
        {"uids": uids}
    ).mappings().all()

    result = [
        {
            "data_ref":   uid_to_date[row["upload_id"]],
            "supervisor": row["supervisor"],
            "total":      row["total"],
            "grd10d":     row["grd10d"],
        }
        for row in sup_data
        if row["upload_id"] in uid_to_date
    ]
    return sorted(result, key=lambda r: (r["data_ref"], r["supervisor"]))


@router.delete("/upload/{upload_id}")
def deletar_upload(
    upload_id: int,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    for tbl in ("na_tendencia", "na_por_supervisor", "na_por_ds", "na_por_processo"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
        except Exception:
            raise HTTPException(500, f"Erro ao deletar dados de {tbl}")
    db.execute(text("DELETE FROM na_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log(background_tasks, "upload_deletado", f"na_uploads:{upload_id}", {}, user)
    return {"ok": True}

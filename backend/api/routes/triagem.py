"""
api/routes/triagem.py — Dados de triagem
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT id, data_ref, criado_por, total, qtd_ok, qtd_erro, taxa, tem_arrival, qtd_recebidos
            FROM triagem_uploads ORDER BY criado_em DESC LIMIT 30
        """)
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    r_ds = db.execute(
        text("SELECT * FROM triagem_por_ds WHERE upload_id = :uid"), {"uid": upload_id}
    ).mappings().all()
    top5 = db.execute(
        text("SELECT * FROM triagem_top5 WHERE upload_id = :uid ORDER BY total_erros DESC"), {"uid": upload_id}
    ).mappings().all()
    r_sup = db.execute(
        text("SELECT * FROM triagem_por_supervisor WHERE upload_id = :uid"), {"uid": upload_id}
    ).mappings().all()

    return {
        "por_ds": [dict(r) for r in r_ds],
        "top5": [dict(r) for r in top5],
        "por_supervisor": [dict(r) for r in r_sup],
    }


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade", "triagem_detalhes"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
        except Exception:
            logger.error("Falha ao deletar tabela %s para upload_id=%s", tbl, upload_id)
            raise HTTPException(500, f"Erro ao deletar dados de {tbl}")
    db.execute(text("DELETE FROM triagem_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log("upload_deletado", f"triagem_uploads:{upload_id}", {}, user)
    return {"ok": True}


@router.get("/upload/{upload_id}/detalhes")
def detalhes_upload(
    upload_id: int,
    ds:           str           = Query(default=""),
    status:       str           = Query(default=""),
    foi_recebido: Optional[bool] = Query(default=None),
    busca:        str           = Query(default=""),
    page:         int           = Query(default=0, ge=0),
    limit:        int           = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Waybills NOK/Fora de um upload com filtros e paginação."""
    conditions = ["upload_id = :upload_id"]
    params: dict = {"upload_id": upload_id}

    if ds:
        conditions.append("ds_destino = :ds")
        params["ds"] = ds.strip().upper()
    if status in ("nok", "fora"):
        conditions.append("status = :status")
        params["status"] = status
    if foi_recebido is not None:
        conditions.append("foi_recebido = :foi_recebido")
        params["foi_recebido"] = foi_recebido
    if busca:
        conditions.append("waybill ILIKE :busca")
        params["busca"] = f"%{busca.strip()}%"

    where = " AND ".join(conditions)
    params["limit"] = limit
    params["offset"] = page * limit

    rows = db.execute(
        text(f"SELECT * FROM triagem_detalhes WHERE {where} ORDER BY status, waybill LIMIT :limit OFFSET :offset"),
        params
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/upload/{upload_id}/cidades/{ds}")
def cidades_por_ds(upload_id: int, ds: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna breakdown por cidade de uma DS específica para um upload de triagem."""
    try:
        rows = db.execute(
            text("SELECT * FROM triagem_por_cidade WHERE upload_id = :uid AND ds = :ds ORDER BY nok DESC"),
            {"uid": upload_id, "ds": ds}
        ).mappings().all()
        return [dict(r) for r in rows]
    except Exception:
        return []

"""
api/routes/triagem.py — Dados de triagem
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT id, data_ref, criado_por, total, qtd_ok, qtd_erro, COALESCE(qtd_fora, 0) AS qtd_fora, taxa, tem_arrival, qtd_recebidos
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


@router.get("/supervisores")
def get_supervisores(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna mapa sigla → region da tabela config_supervisores."""
    rows = db.execute(text("SELECT sigla, region FROM config_supervisores")).mappings().all()
    return {r["sigla"].strip().upper(): r["region"] for r in rows if r.get("sigla")}


# ── Modelos para /salvar (processamento local no cliente) ─────

class PorDsItem(BaseModel):
    ds: str; total: int; ok: int; nok: int; fora: int; taxa: float
    recebidos: int = 0; recebidos_nok: int = 0

class Top5Item(BaseModel):
    ds: str; nok: int

class PorSupItem(BaseModel):
    supervisor: str; total: int; ok: int; nok: int; fora: int; taxa: float

class PorCidadeItem(BaseModel):
    ds: str; cidade: str; ok: int; nok: int; total: int; taxa: float

class DetalheItem(BaseModel):
    waybill: str; ds_destino: str; ds_entrega: str
    cidade: str; status: str; foi_recebido: bool = False

class SalvarTriagemPayload(BaseModel):
    data_ref: str
    total: int; qtd_ok: int; qtd_erro: int; qtd_fora: int = 0
    taxa: float; tem_arrival: bool = False; qtd_recebidos: int = 0
    por_ds: List[PorDsItem] = []
    top5: List[Top5Item] = []
    por_supervisor: List[PorSupItem] = []
    por_cidade: List[PorCidadeItem] = []
    detalhes: List[DetalheItem] = []


@router.post("/salvar")
def salvar_triagem(payload: SalvarTriagemPayload, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Recebe resultado já processado localmente e salva no banco."""
    # Remove upload anterior com a mesma data_ref
    existing = db.execute(
        text("SELECT id FROM triagem_uploads WHERE data_ref = :dr"), {"dr": payload.data_ref}
    ).mappings().first()
    if existing:
        old_id = existing["id"]
        for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade", "triagem_detalhes"):
            try:
                db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
            except Exception:
                pass
        db.execute(text("DELETE FROM triagem_uploads WHERE id = :id"), {"id": old_id})
        db.commit()

    row = db.execute(
        text("""
            INSERT INTO triagem_uploads
              (data_ref, criado_por, total, qtd_ok, qtd_erro, qtd_fora, taxa, tem_arrival, qtd_recebidos)
            VALUES
              (:data_ref, :criado_por, :total, :qtd_ok, :qtd_erro, :qtd_fora, :taxa, :tem_arrival, :qtd_recebidos)
            RETURNING id
        """),
        {
            "data_ref":      payload.data_ref,
            "criado_por":    user["email"],
            "total":         payload.total,
            "qtd_ok":        payload.qtd_ok,
            "qtd_erro":      payload.qtd_erro,
            "qtd_fora":      payload.qtd_fora,
            "taxa":          payload.taxa,
            "tem_arrival":   payload.tem_arrival,
            "qtd_recebidos": payload.qtd_recebidos,
        }
    ).mappings().first()
    uid = row["id"]
    db.commit()

    BATCH = 2000
    if payload.por_ds:
        db.execute(
            text("INSERT INTO triagem_por_ds (upload_id, ds, total, ok, nok, fora, taxa, recebidos, recebidos_nok) VALUES (:upload_id, :ds, :total, :ok, :nok, :fora, :taxa, :recebidos, :recebidos_nok)"),
            [{"upload_id": uid, **r.model_dump()} for r in payload.por_ds]
        )
        db.commit()

    if payload.top5:
        db.execute(
            text("INSERT INTO triagem_top5 (upload_id, ds, total_erros) VALUES (:upload_id, :ds, :total_erros)"),
            [{"upload_id": uid, "ds": r.ds, "total_erros": r.nok} for r in payload.top5]
        )
        db.commit()

    if payload.por_supervisor:
        db.execute(
            text("INSERT INTO triagem_por_supervisor (upload_id, supervisor, total, ok, nok, fora, taxa) VALUES (:upload_id, :supervisor, :total, :ok, :nok, :fora, :taxa)"),
            [{"upload_id": uid, **r.model_dump()} for r in payload.por_supervisor]
        )
        db.commit()

    cidades = [{"upload_id": uid, **r.model_dump()} for r in payload.por_cidade]
    for i in range(0, len(cidades), BATCH):
        db.execute(
            text("INSERT INTO triagem_por_cidade (upload_id, ds, cidade, ok, nok, total, taxa) VALUES (:upload_id, :ds, :cidade, :ok, :nok, :total, :taxa)"),
            cidades[i:i+BATCH]
        )
    if cidades:
        db.commit()

    det_rows = [{"upload_id": uid, **r.model_dump()} for r in payload.detalhes]
    for i in range(0, len(det_rows), BATCH):
        db.execute(
            text("INSERT INTO triagem_detalhes (upload_id, waybill, ds_destino, ds_entrega, cidade, status, foi_recebido) VALUES (:upload_id, :waybill, :ds_destino, :ds_entrega, :cidade, :status, :foi_recebido)"),
            det_rows[i:i+BATCH]
        )
    if det_rows:
        db.commit()

    return {"upload_id": uid, "data_ref": payload.data_ref}


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

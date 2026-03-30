"""
api/routes/triagem.py — Dados de triagem
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from api.deps import get_supabase, get_current_user, require_admin, audit_log

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (sb.table("triagem_uploads")
           .select("id,data_ref,criado_por,total,qtd_ok,qtd_erro,taxa,tem_arrival,qtd_recebidos")
           .order("criado_em", desc=True).limit(30).execute())
    return res.data or []


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    r_ds  = sb.table("triagem_por_ds").select("*").eq("upload_id", upload_id).execute().data or []
    top5  = sb.table("triagem_top5").select("*").eq("upload_id", upload_id).order("total_erros", desc=True).execute().data or []
    r_sup = sb.table("triagem_por_supervisor").select("*").eq("upload_id", upload_id).execute().data or []

    return {
        "por_ds": r_ds,
        "top5": top5,
        "por_supervisor": r_sup,
    }


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin)):
    sb = get_supabase()
    for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade", "triagem_detalhes"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            logger.error("Falha ao deletar tabela %s para upload_id=%s", tbl, upload_id)
            raise HTTPException(500, f"Erro ao deletar dados de {tbl}")
    sb.table("triagem_uploads").delete().eq("id", upload_id).execute()
    audit_log("upload_deletado", f"triagem_uploads:{upload_id}", {}, user)
    return {"ok": True}


@router.get("/upload/{upload_id}/detalhes")
def detalhes_upload(
    upload_id: int,
    ds:           str           = Query(default=""),
    status:       str           = Query(default=""),   # 'nok' | 'fora' | ''
    foi_recebido: Optional[bool] = Query(default=None),
    busca:        str           = Query(default=""),   # waybill parcial
    page:         int           = Query(default=0, ge=0),
    limit:        int           = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """Waybills NOK/Fora de um upload com filtros e paginação."""
    sb = get_supabase()
    q  = sb.table("triagem_detalhes").select("*").eq("upload_id", upload_id)
    if ds:
        q = q.eq("ds_destino", ds.strip().upper())
    if status in ("nok", "fora"):
        q = q.eq("status", status)
    if foi_recebido is not None:
        q = q.eq("foi_recebido", foi_recebido)
    if busca:
        q = q.ilike("waybill", f"%{busca.strip()}%")
    q = q.order("status").order("waybill").range(page * limit, page * limit + limit - 1)
    return q.execute().data or []


@router.get("/upload/{upload_id}/cidades/{ds}")
def cidades_por_ds(upload_id: int, ds: str, user: dict = Depends(get_current_user)):
    """Retorna breakdown por cidade de uma DS específica para um upload de triagem."""
    sb = get_supabase()
    try:
        res = (sb.table("triagem_por_cidade")
               .select("*")
               .eq("upload_id", upload_id)
               .eq("ds", ds)
               .order("nok", desc=True)
               .execute())
        return res.data or []
    except Exception:
        return []

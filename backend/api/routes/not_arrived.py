"""
api/routes/not_arrived.py — Listagem, detalhe e exclusão de uploads Not Arrived
"""
from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_supabase, get_current_user, require_admin, audit_log

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("not_arrived_uploads")
        .select("id,data_ref,criado_por,total,total_dc,total_ds,total_entregues,pct_entregues,criado_em")
        .order("criado_em", desc=True)
        .limit(60)
        .execute()
    )
    return res.data or []


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    estacao = (
        sb.table("not_arrived_por_estacao").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )
    regiao = (
        sb.table("not_arrived_por_regiao").select("*")
        .eq("upload_id", upload_id)
        .execute().data or []
    )
    operacao = (
        sb.table("not_arrived_por_operacao").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )
    supervisor = (
        sb.table("not_arrived_por_supervisor").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )

    return {
        "por_estacao":    estacao,
        "por_regiao":     regiao,
        "por_operacao":   operacao,
        "por_supervisor": supervisor,
    }


@router.get("/upload/{upload_id}/tendencia")
def tendencia_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("not_arrived_tendencia").select("supervisor,data,total")
        .eq("upload_id", upload_id)
        .order("data")
        .execute()
    )
    return res.data or []


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin)):
    sb = get_supabase()
    for tbl in ("not_arrived_por_estacao", "not_arrived_por_regiao",
                "not_arrived_por_operacao", "not_arrived_por_supervisor",
                "not_arrived_tendencia"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            raise HTTPException(500, f"Erro ao deletar dados de {tbl}")
    sb.table("not_arrived_uploads").delete().eq("id", upload_id).execute()
    audit_log("upload_deletado", f"not_arrived_uploads:{upload_id}", {}, user)
    return {"ok": True}

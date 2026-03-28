"""
api/routes/na.py — Listagem, detalhe e exclusão de uploads Not Arrived (有发未到)
"""
from fastapi import APIRouter, Depends, HTTPException

from api.deps import get_supabase, get_current_user, require_admin, audit_log

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("na_uploads")
        .select("id,data_ref,criado_por,total,total_offload,total_arrive,grd10d,threshold_col,criado_em")
        .order("criado_em", desc=True)
        .limit(60)
        .execute()
    )
    return res.data or []


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    supervisor = (
        sb.table("na_por_supervisor").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )
    ds = (
        sb.table("na_por_ds").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )
    processo = (
        sb.table("na_por_processo").select("*")
        .eq("upload_id", upload_id)
        .order("total", desc=True)
        .execute().data or []
    )

    return {
        "por_supervisor": supervisor,
        "por_ds":         ds,
        "por_processo":   processo,
    }


@router.get("/upload/{upload_id}/tendencia")
def tendencia_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (
        sb.table("na_tendencia").select("supervisor,ds,data,total")
        .eq("upload_id", upload_id)
        .order("data")
        .execute()
    )
    return res.data or []


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin)):
    sb = get_supabase()
    for tbl in ("na_tendencia", "na_por_supervisor", "na_por_ds", "na_por_processo"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            raise HTTPException(500, f"Erro ao deletar dados de {tbl}")
    sb.table("na_uploads").delete().eq("id", upload_id).execute()
    audit_log("upload_deletado", f"na_uploads:{upload_id}", {}, user)
    return {"ok": True}

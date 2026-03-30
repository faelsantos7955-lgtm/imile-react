"""
api/routes/notracking.py — Listagem e detalhe de uploads de No Tracking (断更)
"""
from fastapi import APIRouter, Depends, HTTPException
from api.deps import get_supabase, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    return (
        sb.table("notracking_uploads").select("*")
        .order("criado_em", desc=True).limit(30).execute().data or []
    )


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    up = sb.table("notracking_uploads").select("*").eq("id", upload_id).execute()
    if not up.data:
        raise HTTPException(404, "Upload não encontrado")

    por_ds     = sb.table("notracking_por_ds").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []
    por_sup    = sb.table("notracking_por_sup").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []
    por_status = sb.table("notracking_por_status").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []
    por_faixa  = sb.table("notracking_por_faixa").select("*").eq("upload_id", upload_id).execute().data or []

    return {
        "upload":     up.data[0],
        "por_ds":     por_ds,
        "por_sup":    por_sup,
        "por_status": por_status,
        "por_faixa":  por_faixa,
    }

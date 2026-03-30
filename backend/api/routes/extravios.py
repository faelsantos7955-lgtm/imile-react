"""
api/routes/extravios.py — Listagem e detalhe de uploads de Extravios
"""
from fastapi import APIRouter, Depends, HTTPException
from api.deps import get_supabase, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    return (
        sb.table("extravios_uploads").select("*")
        .order("criado_em", desc=True).limit(30).execute().data or []
    )


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()
    up = sb.table("extravios_uploads").select("*").eq("id", upload_id).execute()
    if not up.data:
        raise HTTPException(404, "Upload não encontrado")

    por_ds     = sb.table("extravios_por_ds").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []
    por_motivo = sb.table("extravios_por_motivo").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []
    por_semana = sb.table("extravios_por_semana").select("*").eq("upload_id", upload_id).order("semana").execute().data or []

    return {
        "upload":     up.data[0],
        "por_ds":     por_ds,
        "por_motivo": por_motivo,
        "por_semana": por_semana,
    }

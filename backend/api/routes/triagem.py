"""
api/routes/triagem.py — Dados de triagem
"""
from fastapi import APIRouter, Depends, HTTPException
from api.deps import get_supabase, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (sb.table("triagem_uploads")
           .select("id,data_ref,criado_por,total,qtd_ok,qtd_erro,taxa")
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
def deletar_upload(upload_id: int, user: dict = Depends(get_current_user)):
    if not user.get("role") == "admin":
        raise HTTPException(403, "Acesso negado")
    sb = get_supabase()
    for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade"):
        try:
            sb.table(tbl).delete().eq("upload_id", upload_id).execute()
        except Exception:
            pass
    sb.table("triagem_uploads").delete().eq("id", upload_id).execute()
    return {"ok": True}


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

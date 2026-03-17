"""
api/routes/reclamacoes.py — Reclamações + motoristas por semana
"""
from fastapi import APIRouter, Depends
from api.deps import get_supabase, get_current_user

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (sb.table("reclamacoes_uploads").select("*")
           .order("criado_em", desc=True).limit(30).execute())
    return res.data or []


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    r_sup = sb.table("reclamacoes_por_supervisor").select("*").eq("upload_id", upload_id).execute().data or []
    r_sta = sb.table("reclamacoes_por_station").select("*").eq("upload_id", upload_id).execute().data or []
    top5  = sb.table("reclamacoes_top5").select("*").eq("upload_id", upload_id).order("total", desc=True).execute().data or []

    # Filtra inativos do top5 em tempo real
    inativos_res = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = [r["id_motorista"] for r in (inativos_res.data or [])]
    n_filtrados = 0
    if inativos:
        antes = len(top5)
        top5 = [t for t in top5 if t.get("motorista") not in inativos][:5]
        n_filtrados = antes - len(top5)

    return {
        "por_supervisor": r_sup,
        "por_station": r_sta,
        "top5": top5,
        "n_inativos_filtrados": n_filtrados,
    }


@router.get("/motoristas")
def motoristas(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("motoristas_status").select("*").execute()
    return res.data or []


@router.get("/motoristas-semana")
def motoristas_por_semana(user: dict = Depends(get_current_user)):
    """Top 5 motoristas ofensores por semana (últimos 4 uploads)."""
    sb = get_supabase()

    # Pega últimos 4 uploads
    uploads = (sb.table("reclamacoes_uploads").select("id,data_ref")
               .order("criado_em", desc=True).limit(4).execute().data or [])

    if not uploads:
        return {"semanas": []}

    # Inativos
    inativos_res = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = {r["id_motorista"] for r in (inativos_res.data or [])}

    semanas = []
    for u in uploads:
        top = (sb.table("reclamacoes_top5").select("motorista,total")
               .eq("upload_id", u["id"]).order("total", desc=True).execute().data or [])
        # Filtra inativos
        top = [t for t in top if t["motorista"] not in inativos][:5]
        semanas.append({
            "data_ref": u["data_ref"],
            "upload_id": u["id"],
            "motoristas": top,
        })

    return {"semanas": semanas}

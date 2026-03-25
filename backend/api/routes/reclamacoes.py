"""
api/routes/reclamacoes.py — Reclamações + motoristas por semana
"""
from fastapi import APIRouter, Depends, HTTPException
from api.deps import get_supabase, get_current_user
from collections import defaultdict

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = (sb.table("reclamacoes_uploads").select("*")
           .order("criado_em", desc=True).limit(30).execute())
    return res.data or []


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(get_current_user)):
    if not user.get("role") == "admin":
        raise HTTPException(403, "Acesso negado")
    sb = get_supabase()
    for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
        sb.table(tbl).delete().eq("upload_id", upload_id).execute()
    sb.table("reclamacoes_uploads").delete().eq("id", upload_id).execute()
    return {"ok": True}


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user)):
    sb = get_supabase()

    r_sup = sb.table("reclamacoes_por_supervisor").select("*").eq("upload_id", upload_id).execute().data or []
    r_sta = sb.table("reclamacoes_por_station").select("*").eq("upload_id", upload_id).execute().data or []

    # ── Pega os 3 uploads mais recentes (incluindo o selecionado) ──
    # Busca a data do upload atual para pegar os 3 anteriores a ele
    upload_atual = sb.table("reclamacoes_uploads").select("id,criado_em").eq("id", upload_id).execute().data
    criado_em_atual = upload_atual[0]["criado_em"] if upload_atual else None

    if criado_em_atual:
        ultimos_3 = (
            sb.table("reclamacoes_uploads")
            .select("id")
            .lte("criado_em", criado_em_atual)
            .order("criado_em", desc=True)
            .limit(3)
            .execute().data or []
        )
    else:
        ultimos_3 = [{"id": upload_id}]

    ids_3dias = [u["id"] for u in ultimos_3]

    # Inativos
    inativos_res = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = {r["id_motorista"] for r in (inativos_res.data or [])}

    # Busca top de todos os 3 uploads e acumula por motorista
    acumulado = defaultdict(lambda: {"total": 0, "id_motorista": "", "ds": "", "supervisor": ""})
    n_filtrados = 0

    for uid in ids_3dias:
        registros = (
            sb.table("reclamacoes_top5")
            .select("*")
            .eq("upload_id", uid)
            .order("total", desc=True)
            .execute().data or []
        )
        for t in registros:
            motorista = t.get("motorista", "")
            if motorista in inativos:
                n_filtrados += 1
                continue
            acumulado[motorista]["total"] += t.get("total", 0)
            # Mantém os dados do registro mais recente (primeiro uid é o mais recente)
            if not acumulado[motorista]["id_motorista"]:
                acumulado[motorista]["id_motorista"] = t.get("id_motorista", "")
                acumulado[motorista]["ds"]           = t.get("ds", "")
                acumulado[motorista]["supervisor"]   = t.get("supervisor", "")
                acumulado[motorista]["motorista"]    = motorista

    # Ordena por total acumulado e retorna top 5
    top5 = sorted(acumulado.values(), key=lambda x: x["total"], reverse=True)[:5]

    return {
        "por_supervisor": r_sup,
        "por_station": r_sta,
        "top5": top5,
        "n_inativos_filtrados": n_filtrados,
        "dias_acumulados": len(ids_3dias),  # info extra: quantos dias foram somados
    }


@router.get("/motoristas")
def motoristas(user: dict = Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("motoristas_status").select("*").execute()
    return res.data or []


@router.get("/motoristas-semana")
def motoristas_por_semana(user: dict = Depends(get_current_user)):
    """Top 5 motoristas ofensores com total acumulado dos últimos 3 uploads."""
    sb = get_supabase()

    # Pega últimos 4 uploads para ter 4 "pontos" no histórico semanal
    uploads = (sb.table("reclamacoes_uploads").select("id,data_ref,criado_em")
               .order("criado_em", desc=True).limit(6).execute().data or [])

    if not uploads:
        return {"semanas": []}

    # Inativos
    inativos_res = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = {r["id_motorista"] for r in (inativos_res.data or [])}

    semanas = []
    # Para cada upload, acumula os 3 dias anteriores (incluindo ele)
    for i, u in enumerate(uploads[:4]):
        # Janela de 3 uploads: o atual + 2 anteriores na lista
        janela = uploads[i:i+3]
        ids_janela = [j["id"] for j in janela]

        acumulado = defaultdict(lambda: {"total": 0, "motorista": ""})

        for uid in ids_janela:
            top = (sb.table("reclamacoes_top5").select("motorista,total")
                   .eq("upload_id", uid).order("total", desc=True).limit(20).execute().data or [])
            for t in top:
                motorista = t["motorista"]
                if motorista in inativos:
                    continue
                acumulado[motorista]["total"]     += t["total"]
                acumulado[motorista]["motorista"]  = motorista

        top5 = sorted(acumulado.values(), key=lambda x: x["total"], reverse=True)[:5]

        semanas.append({
            "data_ref":  u["data_ref"],
            "upload_id": u["id"],
            "motoristas": top5,
        })

    return {"semanas": semanas}

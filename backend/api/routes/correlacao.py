"""
api/routes/correlacao.py — Correlação Backlog × Reclamações por DS
"""
from fastapi import APIRouter, Depends
from api.deps import get_supabase, get_current_user

router = APIRouter()


@router.get("/dados")
def correlacao_dados(user: dict = Depends(get_current_user)):
    """
    Junta o último upload de backlog com o último upload de reclamações,
    retorna dados por DS para scatter plot e tabela de risco.
    """
    sb = get_supabase()

    # Último upload de backlog
    bl_up = (
        sb.table("backlog_uploads").select("id,data_ref")
        .order("criado_em", desc=True).limit(1).execute().data
    )
    # Último upload de reclamações
    rec_up = (
        sb.table("reclamacoes_uploads").select("id,data_ref")
        .order("criado_em", desc=True).limit(1).execute().data
    )

    if not bl_up:
        return {"backlog_data_ref": None, "rec_data_ref": None, "dados": []}

    bl_uid = bl_up[0]["id"]
    bl_data = (
        sb.table("backlog_por_ds")
        .select("nome,backlog,total_7d,orders,prioridade,supervisor")
        .eq("upload_id", bl_uid)
        .execute().data or []
    )

    rec_map: dict = {}
    rec_data_ref = None
    if rec_up:
        rec_uid = rec_up[0]["id"]
        rec_data_ref = rec_up[0].get("data_ref")
        rows = (
            sb.table("reclamacoes_por_station")
            .select("station,dia_total,supervisor")
            .eq("upload_id", rec_uid)
            .execute().data or []
        )
        for r in rows:
            key = (r.get("station") or "").strip().upper()
            if key:
                rec_map[key] = r

    result = []
    for b in bl_data:
        nome = (b.get("nome") or "").strip().upper()
        if not nome:
            continue
        rec      = rec_map.get(nome, {})
        orders   = int(b.get("orders", 0) or 0)
        backlog  = int(b.get("backlog", 0) or 0)
        total_7d = int(b.get("total_7d", 0) or 0)
        recl     = int(rec.get("dia_total", 0) or 0)
        pct_7d   = round(total_7d / orders * 100, 1) if orders else 0.0

        result.append({
            "ds":         nome,
            "supervisor": b.get("supervisor") or rec.get("supervisor") or "",
            "orders":     orders,
            "backlog":    backlog,
            "total_7d":   total_7d,
            "pct_7d":     pct_7d,
            "reclamacoes": recl,
        })

    # Ordena por risco descendente (maior pct_7d + mais reclamações primeiro)
    max_7d  = max((r["pct_7d"]     for r in result), default=1) or 1
    max_rec = max((r["reclamacoes"] for r in result), default=1) or 1
    for r in result:
        r["risco"] = round((r["pct_7d"] / max_7d * 50) + (r["reclamacoes"] / max_rec * 50), 1)
    result.sort(key=lambda x: x["risco"], reverse=True)

    return {
        "backlog_data_ref": bl_up[0].get("data_ref"),
        "rec_data_ref":     rec_data_ref,
        "dados":            result,
    }

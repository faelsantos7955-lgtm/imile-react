"""
api/routes/correlacao.py — Correlação Backlog × Reclamações por DS
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user

router = APIRouter()


@router.get("/dados")
def correlacao_dados(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Junta o último upload de backlog com o último upload de reclamações,
    retorna dados por DS para scatter plot e tabela de risco.
    """
    # Último upload de backlog
    bl_up = db.execute(
        text("SELECT id, data_ref FROM backlog_uploads ORDER BY criado_em DESC LIMIT 1")
    ).mappings().first()

    # Último upload de reclamações
    rec_up = db.execute(
        text("SELECT id, data_ref FROM reclamacoes_uploads ORDER BY criado_em DESC LIMIT 1")
    ).mappings().first()

    if not bl_up:
        return {"backlog_data_ref": None, "rec_data_ref": None, "dados": []}

    bl_uid = bl_up["id"]
    bl_data_rows = db.execute(
        text("SELECT nome, backlog, total_7d, orders, prioridade, supervisor FROM backlog_por_ds WHERE upload_id = :uid"),
        {"uid": bl_uid}
    ).mappings().all()
    bl_data = [dict(r) for r in bl_data_rows]

    rec_map: dict = {}
    rec_data_ref = None
    if rec_up:
        rec_uid = rec_up["id"]
        rec_data_ref = rec_up["data_ref"]
        rows = db.execute(
            text("SELECT station, dia_total, supervisor FROM reclamacoes_por_station WHERE upload_id = :uid"),
            {"uid": rec_uid}
        ).mappings().all()
        for r in rows:
            key = (r["station"] or "").strip().upper()
            if key:
                rec_map[key] = dict(r)

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
        "backlog_data_ref": bl_up["data_ref"],
        "rec_data_ref":     rec_data_ref,
        "dados":            result,
    }

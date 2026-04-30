"""
api/routes/reclamacoes.py — Reclamações + motoristas por semana
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log
from collections import defaultdict

router = APIRouter()


@router.get("/uploads")
def listar_uploads(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM reclamacoes_uploads ORDER BY data_ref DESC")
    ).mappings().all()
    return [dict(r) for r in rows]


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
        db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
    db.execute(text("DELETE FROM reclamacoes_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log("upload_deletado", f"reclamacoes_uploads:{upload_id}", {}, user)
    return {"ok": True}


@router.get("/upload/{upload_id}")
def detalhe_upload(upload_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    r_sup = db.execute(
        text("SELECT * FROM reclamacoes_por_supervisor WHERE upload_id = :uid"), {"uid": upload_id}
    ).mappings().all()
    r_sta = db.execute(
        text("SELECT * FROM reclamacoes_por_station WHERE upload_id = :uid"), {"uid": upload_id}
    ).mappings().all()

    upload_atual = db.execute(
        text("SELECT id, criado_em FROM reclamacoes_uploads WHERE id = :id"), {"id": upload_id}
    ).mappings().first()
    criado_em_atual = upload_atual["criado_em"] if upload_atual else None

    if criado_em_atual:
        ultimos_3 = db.execute(
            text("SELECT id FROM reclamacoes_uploads WHERE criado_em <= :ce ORDER BY criado_em DESC LIMIT 3"),
            {"ce": criado_em_atual}
        ).mappings().all()
    else:
        ultimos_3 = [{"id": upload_id}]

    ids_3dias = [u["id"] for u in ultimos_3]

    inativos_rows = db.execute(
        text("SELECT id_motorista FROM motoristas_status WHERE ativo = false")
    ).mappings().all()
    inativos = {r["id_motorista"] for r in inativos_rows}

    all_registros = db.execute(
        text("SELECT * FROM reclamacoes_top5 WHERE upload_id = ANY(:ids) ORDER BY total DESC"),
        {"ids": ids_3dias}
    ).mappings().all()

    by_upload = defaultdict(list)
    for r in all_registros:
        by_upload[r["upload_id"]].append(dict(r))

    acumulado = defaultdict(lambda: {"total": 0, "id_motorista": "", "ds": "", "supervisor": ""})
    n_filtrados = 0

    for uid in ids_3dias:
        for t in by_upload[uid]:
            motorista = t.get("motorista", "")
            if motorista in inativos:
                n_filtrados += 1
                continue
            acumulado[motorista]["total"] += t.get("total", 0)
            if not acumulado[motorista]["id_motorista"]:
                acumulado[motorista]["id_motorista"] = t.get("id_motorista", "")
                acumulado[motorista]["ds"]           = t.get("ds", "")
                acumulado[motorista]["supervisor"]   = t.get("supervisor", "")
                acumulado[motorista]["motorista"]    = motorista

    top5 = sorted(acumulado.values(), key=lambda x: x["total"], reverse=True)[:5]

    return {
        "por_supervisor": [dict(r) for r in r_sup],
        "por_station": [dict(r) for r in r_sta],
        "top5": top5,
        "n_inativos_filtrados": n_filtrados,
        "dias_acumulados": len(ids_3dias),
    }


@router.get("/motoristas")
def motoristas(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM motoristas_status")).mappings().all()
    return [dict(r) for r in rows]


@router.get("/motoristas-semana")
def motoristas_por_semana(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Top 5 motoristas ofensores com total acumulado dos últimos 3 uploads."""
    uploads = db.execute(
        text("SELECT id, data_ref, criado_em FROM reclamacoes_uploads ORDER BY criado_em DESC LIMIT 6")
    ).mappings().all()

    if not uploads:
        return {"semanas": []}

    inativos_rows = db.execute(
        text("SELECT id_motorista FROM motoristas_status WHERE ativo = false")
    ).mappings().all()
    inativos = {r["id_motorista"] for r in inativos_rows}

    all_ids = [u["id"] for u in uploads]
    all_top = db.execute(
        text("SELECT motorista, total, upload_id FROM reclamacoes_top5 WHERE upload_id = ANY(:ids)"),
        {"ids": all_ids}
    ).mappings().all()

    by_upload = defaultdict(list)
    for t in all_top:
        by_upload[t["upload_id"]].append(dict(t))

    uploads_list = [dict(u) for u in uploads]
    semanas = []
    for i, u in enumerate(uploads_list[:4]):
        janela = uploads_list[i:i+3]
        ids_janela = [j["id"] for j in janela]

        acumulado = defaultdict(lambda: {"total": 0, "motorista": ""})
        for uid in ids_janela:
            for t in by_upload[uid]:
                motorista = t["motorista"]
                if motorista in inativos:
                    continue
                acumulado[motorista]["total"]    += t["total"]
                acumulado[motorista]["motorista"] = motorista

        top5 = sorted(acumulado.values(), key=lambda x: x["total"], reverse=True)[:5]
        semanas.append({
            "data_ref":   u["data_ref"],
            "upload_id":  u["id"],
            "motoristas": top5,
        })

    return {"semanas": semanas}

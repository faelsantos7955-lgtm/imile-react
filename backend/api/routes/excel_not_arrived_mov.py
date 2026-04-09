"""
api/routes/excel_not_arrived_mov.py — Excel Not Arrived com Movimentação
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user
from api.limiter import limiter
from api.routes.excel_base import (
    _HF, _HFNT, _BFNT, _CTR, _BRD, _AF,
    _titulo_aba, _write_header, _write_data, _auto_width, _to_stream,
)
import pandas as pd
from openpyxl import Workbook

router = APIRouter()


@router.get("/not-arrived-mov/{upload_id}")
@limiter.limit("10/minute")
def excel_not_arrived_mov(
    upload_id: int, request: Request,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    up_row = db.execute(
        text("SELECT * FROM not_arrived_uploads WHERE id = :id"), {"id": upload_id}
    ).mappings().first()
    if not up_row:
        raise HTTPException(404, "Upload não encontrado.")
    up = dict(up_row)
    data_ref = up.get("data_ref", "")

    est_rows = db.execute(
        text("SELECT oc_name, oc_code, tipo, regiao, supervisor, total, entregues FROM not_arrived_por_estacao WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_estacao = [dict(r) for r in est_rows]

    sup_rows = db.execute(
        text("SELECT supervisor, total, total_dc, total_ds, entregues FROM not_arrived_por_supervisor WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_sup = [dict(r) for r in sup_rows]

    reg_rows = db.execute(
        text("SELECT regiao, tipo, total FROM not_arrived_por_regiao WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_reg = [dict(r) for r in reg_rows]

    op_rows = db.execute(
        text("SELECT operacao, total FROM not_arrived_por_operacao WHERE upload_id = :uid ORDER BY total DESC"),
        {"uid": upload_id}
    ).mappings().all()
    por_op = [dict(r) for r in op_rows]

    wb = Workbook()

    # ── Aba "Por Estação" ─────────────────────────────────────
    ws = wb.active
    ws.title = "Por Estação"
    _titulo_aba(ws, f"Not Arrived Mov. — Por Estação — {data_ref}", 8)
    _write_header(ws, ["#", "Estação", "Código", "Tipo", "Região", "Supervisor", "Total", "Entregues"], 2)
    rows = []
    for i, d in enumerate(por_estacao, 1):
        pct_ent = round(d["entregues"] / d["total"] * 100, 1) if d["total"] else 0
        rows.append({
            "#": i,
            "Estação": d["oc_name"] or "—",
            "Código": d["oc_code"] or "—",
            "Tipo": d["tipo"] or "—",
            "Região": d["regiao"] or "—",
            "Supervisor": d["supervisor"] or "—",
            "Total": d["total"],
            "Entregues": d["entregues"],
        })
    df_est = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["#", "Estação", "Código", "Tipo", "Região", "Supervisor", "Total", "Entregues"])
    _write_data(ws, df_est, 3)
    _auto_width(ws)
    ws.freeze_panes = "A3"

    # ── Aba "Por Supervisor" ──────────────────────────────────
    ws2 = wb.create_sheet("Por Supervisor")
    _titulo_aba(ws2, f"Not Arrived Mov. — Por Supervisor — {data_ref}", 5)
    _write_header(ws2, ["Supervisor", "Total", "Total DC", "Total DS", "Entregues"], 2)
    rows2 = []
    for d in por_sup:
        rows2.append({
            "Supervisor": d["supervisor"] or "—",
            "Total": d["total"],
            "Total DC": d["total_dc"],
            "Total DS": d["total_ds"],
            "Entregues": d["entregues"],
        })
    df_sup = pd.DataFrame(rows2) if rows2 else pd.DataFrame(columns=["Supervisor", "Total", "Total DC", "Total DS", "Entregues"])
    _write_data(ws2, df_sup, 3)
    _auto_width(ws2)
    ws2.freeze_panes = "A3"

    # ── Aba "Por Região" ──────────────────────────────────────
    ws3 = wb.create_sheet("Por Região")
    _titulo_aba(ws3, f"Not Arrived Mov. — Por Região — {data_ref}", 3)
    _write_header(ws3, ["Região", "Tipo", "Total"], 2)
    rows3 = [{"Região": d["regiao"], "Tipo": d["tipo"], "Total": d["total"]} for d in por_reg]
    df_reg = pd.DataFrame(rows3) if rows3 else pd.DataFrame(columns=["Região", "Tipo", "Total"])
    _write_data(ws3, df_reg, 3)
    _auto_width(ws3)
    ws3.freeze_panes = "A3"

    # ── Aba "Por Operação" ────────────────────────────────────
    ws4 = wb.create_sheet("Por Operação")
    _titulo_aba(ws4, f"Not Arrived Mov. — Por Operação — {data_ref}", 2)
    _write_header(ws4, ["Operação", "Total"], 2)
    rows4 = [{"Operação": d["operacao"], "Total": d["total"]} for d in por_op]
    df_op = pd.DataFrame(rows4) if rows4 else pd.DataFrame(columns=["Operação", "Total"])
    _write_data(ws4, df_op, 3)
    _auto_width(ws4)
    ws4.freeze_panes = "A3"

    fname = f"NotArrivedMov_{data_ref}.xlsx"
    return StreamingResponse(
        _to_stream(wb),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"},
    )

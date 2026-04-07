"""
api/routes/historico.py — Histórico + Evolução por DS
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user
import pandas as pd
import numpy as np

router = APIRouter()


@router.get("/periodo")
def periodo(
    data_ini: str = Query(...), data_fim: str = Query(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user["bases"]:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref >= :ini AND data_ref <= :fim AND scan_station = ANY(:bases)"),
            {"ini": data_ini, "fim": data_fim, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref >= :ini AND data_ref <= :fim"),
            {"ini": data_ini, "fim": data_fim}
        ).mappings().all()

    data = [dict(r) for r in rows]
    if not data:
        return {"resumo": {}, "por_dia": [], "por_ds": []}

    df = pd.DataFrame(data)
    rec = int(df["recebido"].sum()); exp = int(df["expedido"].sum())
    ent = int(df["entregas"].sum()); dias = df["data_ref"].nunique()

    por_dia = (df.groupby("data_ref", as_index=False)
               .agg(recebido=("recebido","sum"), expedido=("expedido","sum"), entregas=("entregas","sum")))
    por_dia["taxa_exp"] = np.where(por_dia["recebido"]>0, (por_dia["expedido"]/por_dia["recebido"]).round(4), 0)
    por_dia = por_dia.sort_values("data_ref").to_dict("records")

    por_ds = (df.groupby(["scan_station","region"], as_index=False)
              .agg(recebido=("recebido","sum"), expedido=("expedido","sum"), entregas=("entregas","sum")))
    por_ds["taxa_exp"] = np.where(por_ds["recebido"]>0, (por_ds["expedido"]/por_ds["recebido"]).round(4), 0)
    por_ds = por_ds.sort_values("recebido", ascending=False).to_dict("records")

    return {
        "resumo": {"recebido": rec, "expedido": exp, "entregas": ent,
                    "taxa_exp": round(exp/rec, 4) if rec else 0, "dias": dias},
        "por_dia": por_dia,
        "por_ds": por_ds,
    }


@router.get("/evolucao-ds")
def evolucao_ds(
    data_ini: str = Query(...), data_fim: str = Query(...),
    ds: str = Query(None, description="DS específica ou vazio para top 10"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Evolução diária de uma DS específica ou top 10 por volume."""
    if user["bases"]:
        rows = db.execute(
            text("SELECT data_ref, scan_station, recebido, expedido, entregas, taxa_exp FROM expedicao_diaria WHERE data_ref >= :ini AND data_ref <= :fim AND scan_station = ANY(:bases)"),
            {"ini": data_ini, "fim": data_fim, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT data_ref, scan_station, recebido, expedido, entregas, taxa_exp FROM expedicao_diaria WHERE data_ref >= :ini AND data_ref <= :fim"),
            {"ini": data_ini, "fim": data_fim}
        ).mappings().all()

    data = [dict(r) for r in rows]
    if not data:
        return {"series": [], "ds_list": []}

    df = pd.DataFrame(data)

    if ds:
        ds_list = [ds]
    else:
        ds_list = (df.groupby("scan_station")["recebido"].sum()
                   .nlargest(10).index.tolist())

    df = df[df["scan_station"].isin(ds_list)]

    series = []
    for ds_name in ds_list:
        df_ds = df[df["scan_station"] == ds_name].sort_values("data_ref")
        series.append({
            "ds": ds_name,
            "data": [
                {"data_ref": r["data_ref"], "taxa_exp": round(float(r["taxa_exp"]), 4),
                 "recebido": int(r["recebido"]), "expedido": int(r["expedido"])}
                for _, r in df_ds.iterrows()
            ]
        })

    all_ds = sorted(df["scan_station"].unique().tolist())
    return {"series": series, "ds_list": all_ds}

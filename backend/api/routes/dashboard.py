"""
api/routes/dashboard.py — Dashboard + Heatmap + Funil
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user
import pandas as pd
pd.set_option('future.no_silent_downcasting', True)

router = APIRouter()


@router.get("/datas")
def datas_disponiveis(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user["bases"]:
        rows = db.execute(
            text("SELECT data_ref FROM expedicao_diaria WHERE scan_station = ANY(:bases)"),
            {"bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(text("SELECT data_ref FROM expedicao_diaria")).mappings().all()
    if not rows:
        return []
    return sorted(set(r["data_ref"] for r in rows), reverse=True)


@router.get("/dia/{data_ref}")
def dados_dia(data_ref: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user["bases"]:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref = :dr AND scan_station = ANY(:bases)"),
            {"dr": data_ref, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref = :dr"),
            {"dr": data_ref}
        ).mappings().all()

    data = [dict(r) for r in rows]
    if not data:
        return {"kpis": {}, "stations": [], "alertas": [], "ds_disponiveis": []}

    df = pd.DataFrame(data)
    rec = int(df["recebido"].sum()); exp = int(df["expedido"].sum()); ent = int(df["entregas"].sum())
    nds = len(df); nok = int(df["atingiu_meta"].sum())

    alertas = df[df["taxa_exp"] < df["meta"]].sort_values("taxa_exp")["scan_station"].head(8).tolist()
    ranking = (df[["scan_station","region","recebido","expedido","entregas",
                    "taxa_exp","taxa_ent","meta","atingiu_meta"]]
               .sort_values("taxa_exp", ascending=False).to_dict("records"))

    return {
        "kpis": {
            "recebido": rec, "expedido": exp, "entregas": ent,
            "taxa_exp": round(exp/rec, 4) if rec else 0,
            "taxa_ent": round(ent/rec, 4) if rec else 0,
            "n_ds": nds, "n_ok": nok, "n_abaixo": nds - nok,
        },
        "stations": ranking,
        "alertas": alertas,
        "ds_disponiveis": sorted(df["scan_station"].unique().tolist()),
    }


@router.get("/charts/{data_ref}")
def chart_data(data_ref: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user["bases"]:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref = :dr AND scan_station = ANY(:bases)"),
            {"dr": data_ref, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM expedicao_diaria WHERE data_ref = :dr"),
            {"dr": data_ref}
        ).mappings().all()

    if not rows:
        return {"volume_ds": [], "taxa_ds": [], "donut": {}, "funil": {}}

    df = pd.DataFrame([dict(r) for r in rows]).sort_values("recebido", ascending=False)
    rec = int(df["recebido"].sum()); exp = int(df["expedido"].sum()); ent = int(df["entregas"].sum())

    return {
        "volume_ds": [
            {"ds": r["scan_station"], "recebido": int(r["recebido"]),
             "expedido": int(r["expedido"]), "entregas": int(r["entregas"])}
            for _, r in df.iterrows()
        ],
        "taxa_ds": [
            {"ds": r["scan_station"], "taxa_exp": round(float(r["taxa_exp"]), 4),
             "meta": round(float(r["meta"]), 4), "atingiu": bool(r["atingiu_meta"])}
            for _, r in df.sort_values("taxa_exp", ascending=True).iterrows()
        ],
        "donut": {
            "expedido": exp,
            "backlog": max(rec - exp, 0),
            "taxa": round(exp/rec, 4) if rec else 0,
        },
        "funil": {
            "recebido": rec,
            "expedido": exp,
            "entregas": ent,
            "taxa_exp": round(exp/rec, 4) if rec else 0,
            "taxa_ent": round(ent/rec, 4) if rec else 0,
            "perda_exp": rec - exp,
            "perda_ent": exp - ent,
        }
    }


@router.get("/heatmap/{data_ref}")
def heatmap_data(data_ref: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dados para heatmap DS × Cidade."""
    if user["bases"]:
        rows = db.execute(
            text("SELECT * FROM expedicao_cidades WHERE data_ref = :dr AND scan_station = ANY(:bases)"),
            {"dr": data_ref, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM expedicao_cidades WHERE data_ref = :dr"),
            {"dr": data_ref}
        ).mappings().all()

    if not rows:
        return {"heatmap_exp": [], "heatmap_ent": [], "ds_list": [], "city_list": []}

    df = pd.DataFrame([dict(r) for r in rows])

    # Top 15 cidades por volume
    top_cities = df.groupby("destination_city")["recebido"].sum().nlargest(15).index.tolist()
    df = df[df["destination_city"].isin(top_cities)]

    ds_list = sorted(df["scan_station"].unique().tolist())
    city_list = sorted(top_cities)

    # Monta matriz para heatmap
    def _matrix(col):
        pivot = df.pivot_table(index="scan_station", columns="destination_city",
                       values=col, aggfunc="mean").astype(float).fillna(0.0)
        pivot = pivot.reindex(index=ds_list, columns=city_list, fill_value=0)
        return [[round(float(pivot.loc[ds, city]), 4) for city in city_list] for ds in ds_list]

    return {
        "heatmap_exp": _matrix("taxa_exp"),
        "heatmap_ent": _matrix("taxa_ent"),
        "ds_list": ds_list,
        "city_list": city_list,
    }


@router.get("/cidades/{data_ref}")
def cidades_dia(data_ref: str, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if user["bases"]:
        rows = db.execute(
            text("SELECT * FROM expedicao_cidades WHERE data_ref = :dr AND scan_station = ANY(:bases)"),
            {"dr": data_ref, "bases": user["bases"]}
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM expedicao_cidades WHERE data_ref = :dr"),
            {"dr": data_ref}
        ).mappings().all()
    return [dict(r) for r in rows]

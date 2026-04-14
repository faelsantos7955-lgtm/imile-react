"""
api/routes/triagem_upload.py — Upload de LoadingScan + Arrival para Triagem DC×DS

Lógica LoadingScan:
  OK   = Destination Statio == Delivery Station
  NOK  = Destination Statio != Delivery Station (ambos preenchidos)
  Fora = Delivery Station vazio ou fora do mapa de DS

Lógica Arrival (opcional):
  Recebidos     = waybills do LoadingScan que aparecem no arquivo Arrival
  Recebidos NOK = waybills NOK do LoadingScan que aparecem no Arrival
"""
import io
from datetime import date

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_current_user, get_db
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()

_ENGINE = "openpyxl"
try:
    import python_calamine  # noqa: F401
    _ENGINE = "calamine"
except ImportError:
    pass

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_triagem_detalhes_upload   ON triagem_detalhes(upload_id)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_detalhes_ds       ON triagem_detalhes(upload_id, ds_destino)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_detalhes_status   ON triagem_detalhes(upload_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_por_ds_upload     ON triagem_por_ds(upload_id)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_por_cidade_upload ON triagem_por_cidade(upload_id)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_por_sup_upload    ON triagem_por_supervisor(upload_id)",
    "CREATE INDEX IF NOT EXISTS idx_triagem_top5_upload       ON triagem_top5(upload_id)",
]

def _ensure_schema(db: Session) -> None:
    """Cria coluna e índices se ainda não existirem (idempotente)."""
    try:
        db.execute(text("ALTER TABLE triagem_uploads ADD COLUMN IF NOT EXISTS qtd_fora INTEGER DEFAULT 0"))
        db.commit()
    except Exception:
        db.rollback()
    for ddl in _INDEXES:
        try:
            db.execute(text(ddl))
            db.commit()
        except Exception:
            db.rollback()

_ARRIVAL_WB_COLS = [
    "Waybill No.", "Waybill Number", "waybill_no", "WaybillNo",
    "Tracking No.", "Tracking Number", "WAYBILL NO.", "WAYBILL NUMBER",
    "运单号", "单号",
]


def _lc(s: pd.Series) -> pd.Series:
    return s.fillna("").astype(str).str.strip().str.upper()


_LS_COLS = ["Waybill No.", "Destination Statio", "Delivery Station", "Consignee City", "Scan Time"]


def _ler_loading_scans(conteudos: list[bytes]) -> pd.DataFrame:
    frames = []
    for c in conteudos:
        try:
            header = pd.read_excel(io.BytesIO(c), nrows=0, engine=_ENGINE)
            header.columns = header.columns.str.strip()
            presentes = [col for col in _LS_COLS if col in header.columns]
            df = pd.read_excel(io.BytesIO(c), usecols=presentes, engine=_ENGINE)
            df.columns = df.columns.str.strip()
            frames.append(df)
        except Exception:
            continue
    if not frames:
        raise HTTPException(400, "Nenhum arquivo LoadingScan pôde ser lido.")
    return pd.concat(frames, ignore_index=True)


def _ler_arrival(conteudos: list[bytes]) -> set[str]:
    """Retorna conjunto de waybills presentes nos arquivos Arrival."""
    waybills: set[str] = set()
    for c in conteudos:
        try:
            header = pd.read_excel(io.BytesIO(c), nrows=0, engine=_ENGINE)
            header.columns = header.columns.str.strip()

            col = next((x for x in _ARRIVAL_WB_COLS if x in header.columns), None)
            if col is None:
                lower_map = {x.lower(): x for x in header.columns}
                col = next(
                    (lower_map[x.lower()] for x in _ARRIVAL_WB_COLS if x.lower() in lower_map),
                    None,
                )
            if col is None:
                col = next(
                    (c for c in header.columns if any(k in c.lower() for k in ("waybill", "tracking", "运单"))),
                    None,
                )
            if col is None:
                raise HTTPException(
                    400,
                    f"Coluna de waybill não encontrada no Arrival. "
                    f"Colunas disponíveis: {list(header.columns)}. "
                    f"Esperado um de: {_ARRIVAL_WB_COLS}"
                )
            # Lê só a coluna de waybill — muito mais rápido para arquivos grandes
            df = pd.read_excel(io.BytesIO(c), usecols=[col], engine=_ENGINE)
            waybills.update(_lc(df[col].dropna()))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Erro ao ler arquivo Arrival: {e}")
    return waybills


def _processar(df: pd.DataFrame, db: Session, arrival_set: set[str] | None = None) -> dict:
    col_dest  = "Destination Statio"
    col_deliv = "Delivery Station"
    col_wb    = "Waybill No."
    col_city  = "Consignee City"
    col_time  = "Scan Time"

    for col in (col_dest, col_wb):
        if col not in df.columns:
            raise HTTPException(400, f"Coluna obrigatória ausente no LoadingScan: '{col}'")

    df = df.drop_duplicates(subset=[col_wb], keep="first").copy()

    df["_dest"]  = _lc(df[col_dest])
    df["_deliv"] = _lc(df[col_deliv]) if col_deliv in df.columns else ""
    df["_city"]  = _lc(df[col_city])  if col_city  in df.columns else ""
    df["_wb"]    = _lc(df[col_wb])

    dest_empty  = df["_dest"]  == ""
    deliv_empty = df["_deliv"] == ""
    match       = df["_dest"]  == df["_deliv"]
    df["_status"] = np.select(
        [dest_empty | deliv_empty, match],
        ["fora",                   "ok"],
        default="nok",
    )

    data_ref: str = date.today().isoformat()
    if col_time in df.columns:
        datas = pd.to_datetime(df[col_time], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.mode().iloc[0].isoformat()

    status_counts = df["_status"].value_counts()
    total    = len(df)
    qtd_ok   = int(status_counts.get("ok",   0))
    qtd_nok  = int(status_counts.get("nok",  0))
    qtd_fora = int(status_counts.get("fora", 0))
    taxa     = round(qtd_ok / total * 100, 2) if total else 0.0

    tem_arrival = arrival_set is not None
    if tem_arrival:
        df["_recebido"] = df["_wb"].isin(arrival_set)
        qtd_recebidos = int(df["_recebido"].sum())
    else:
        df["_recebido"] = False
        qtd_recebidos = 0

    # ── Detalhes (NOK + Fora) — to_dict é ~100x mais rápido que iterrows ──
    mask_det = df["_status"].isin(["nok", "fora"])
    df_det = df.loc[mask_det, ["_wb", "_dest", "_deliv", "_city", "_status", "_recebido"]].copy()
    df_det = df_det.rename(columns={
        "_wb": "waybill", "_dest": "ds_destino", "_deliv": "ds_entrega",
        "_city": "cidade", "_status": "status", "_recebido": "foi_recebido",
    })
    df_det["foi_recebido"] = df_det["foi_recebido"].astype(bool)
    detalhes = df_det.to_dict("records")

    # ── Por DS — groupby vetorizado ──
    ds_agg = (
        df[df["_dest"] != ""]
        .groupby("_dest")["_status"]
        .value_counts()
        .unstack(fill_value=0)
        .reindex(columns=["ok", "nok", "fora"], fill_value=0)
    )
    ds_agg["total"] = ds_agg.sum(axis=1)
    ds_agg["taxa"]  = (ds_agg["ok"] / ds_agg["total"] * 100).round(2)

    if tem_arrival:
        rec_by_ds     = df[df["_dest"] != ""].groupby("_dest")["_recebido"].sum()
        rec_nok_by_ds = (
            df[(df["_dest"] != "") & (df["_status"] == "nok")]
            .groupby("_dest")["_recebido"].sum()
        )
        ds_agg["recebidos"]     = rec_by_ds.reindex(ds_agg.index, fill_value=0)
        ds_agg["recebidos_nok"] = rec_nok_by_ds.reindex(ds_agg.index, fill_value=0)
    else:
        ds_agg["recebidos"]     = 0
        ds_agg["recebidos_nok"] = 0

    por_ds_rows = [
        {
            "ds": ds, "total": int(r["total"]),
            "ok": int(r["ok"]), "nok": int(r["nok"]), "fora": int(r["fora"]),
            "taxa": float(r["taxa"]),
            "recebidos": int(r["recebidos"]), "recebidos_nok": int(r["recebidos_nok"]),
        }
        for ds, r in ds_agg.iterrows()
    ]
    top5 = sorted(por_ds_rows, key=lambda r: r["nok"], reverse=True)[:5]

    # ── Por Supervisor ──
    res_sup = db.execute(text("SELECT sigla, region FROM config_supervisores")).mappings().all()
    sup_map = {r["sigla"].strip().upper(): r["region"] for r in res_sup if r.get("sigla")}

    df["_sup"] = df["_dest"].map(sup_map).fillna("Sem Região")
    sup_agg = (
        df.groupby("_sup")["_status"]
        .value_counts()
        .unstack(fill_value=0)
        .reindex(columns=["ok", "nok", "fora"], fill_value=0)
    )
    sup_agg["total"] = sup_agg.sum(axis=1)
    sup_agg["taxa"]  = (sup_agg["ok"] / sup_agg["total"] * 100).round(2)
    por_sup_rows = [
        {
            "supervisor": sup, "total": int(r["total"]),
            "ok": int(r["ok"]), "nok": int(r["nok"]), "fora": int(r["fora"]),
            "taxa": float(r["taxa"]),
        }
        for sup, r in sup_agg.iterrows()
    ]

    # ── Por Cidade ──
    cidade_agg = (
        df[df["_dest"] != ""]
        .assign(_city=df["_city"].replace("", "Sem Cidade"))
        .groupby(["_dest", "_city"])["_status"]
        .value_counts()
        .unstack(fill_value=0)
        .reindex(columns=["ok", "nok"], fill_value=0)
    )
    cidade_agg["total"] = cidade_agg.sum(axis=1)
    cidade_agg["taxa"]  = (cidade_agg["ok"] / cidade_agg["total"] * 100).round(2)
    por_cidade_rows = [
        {
            "ds": ds, "cidade": city,
            "ok": int(r["ok"]), "nok": int(r["nok"]),
            "total": int(r["total"]), "taxa": float(r["taxa"]),
        }
        for (ds, city), r in cidade_agg.iterrows()
    ]

    return {
        "data_ref":      data_ref,
        "total":         total,
        "qtd_ok":        qtd_ok,
        "qtd_erro":      qtd_nok,
        "qtd_fora":      qtd_fora,
        "taxa":          taxa,
        "tem_arrival":   tem_arrival,
        "qtd_recebidos": qtd_recebidos,
        "por_ds":        por_ds_rows,
        "top5":          top5,
        "por_supervisor": por_sup_rows,
        "por_cidade":    por_cidade_rows,
        "detalhes":      detalhes,
    }


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_triagem(
    request:       Request,
    files:         List[UploadFile] = File(..., description="Todos os arquivos (LoadingScan primeiro, depois Arrival)"),
    arrival_count: int              = Form(default=0, description="Quantos dos últimos arquivos são Arrival"),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado.")

    if arrival_count > 0 and arrival_count < len(files):
        ls_uploads  = files[:-arrival_count]
        arr_uploads = files[-arrival_count:]
    elif arrival_count > 0 and arrival_count == len(files):
        raise HTTPException(400, "Nenhum arquivo LoadingScan enviado — todos os arquivos foram marcados como Arrival.")
    else:
        ls_uploads  = files
        arr_uploads = []

    conteudos = [await validar_arquivo(f) for f in ls_uploads]

    arrival_set: set[str] | None = None
    if arr_uploads:
        arr_bytes = [await validar_arquivo(f) for f in arr_uploads]
        arrival_set = _ler_arrival(arr_bytes)

    df = _ler_loading_scans(conteudos)

    try:
        resultado = _processar(df, db, arrival_set=arrival_set)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar: {e}")

    _ensure_schema(db)

    try:
        data_ref = resultado["data_ref"]

        existing = db.execute(
            text("SELECT id FROM triagem_uploads WHERE data_ref = :dr"), {"dr": data_ref}
        ).mappings().first()
        if existing:
            old_id = existing["id"]
            for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade", "triagem_detalhes"):
                try:
                    db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
                except Exception:
                    pass
            db.execute(text("DELETE FROM triagem_uploads WHERE id = :id"), {"id": old_id})
            db.commit()

        row = db.execute(
            text("""
                INSERT INTO triagem_uploads (data_ref, criado_por, total, qtd_ok, qtd_erro, qtd_fora, taxa, tem_arrival, qtd_recebidos)
                VALUES (:data_ref, :criado_por, :total, :qtd_ok, :qtd_erro, :qtd_fora, :taxa, :tem_arrival, :qtd_recebidos)
                RETURNING id
            """),
            {
                "data_ref":       data_ref,
                "criado_por":     user["email"],
                "total":          resultado["total"],
                "qtd_ok":         resultado["qtd_ok"],
                "qtd_erro":       resultado["qtd_erro"],
                "qtd_fora":       resultado["qtd_fora"],
                "taxa":           resultado["taxa"],
                "tem_arrival":    resultado["tem_arrival"],
                "qtd_recebidos":  resultado["qtd_recebidos"],
            }
        ).mappings().first()
        uid = row["id"]
        db.commit()

        if resultado["por_ds"]:
            db.execute(
                text("INSERT INTO triagem_por_ds (upload_id, ds, total, ok, nok, fora, taxa, recebidos, recebidos_nok) VALUES (:upload_id, :ds, :total, :ok, :nok, :fora, :taxa, :recebidos, :recebidos_nok)"),
                [{"upload_id": uid, **r} for r in resultado["por_ds"]]
            )
            db.commit()

        if resultado["top5"]:
            db.execute(
                text("INSERT INTO triagem_top5 (upload_id, ds, total_erros) VALUES (:upload_id, :ds, :total_erros)"),
                [{"upload_id": uid, "ds": r["ds"], "total_erros": r["nok"]} for r in resultado["top5"]]
            )
            db.commit()

        if resultado["por_supervisor"]:
            db.execute(
                text("INSERT INTO triagem_por_supervisor (upload_id, supervisor, total, ok, nok, fora, taxa) VALUES (:upload_id, :supervisor, :total, :ok, :nok, :fora, :taxa)"),
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            )
            db.commit()

        cidades = [{"upload_id": uid, **r} for r in resultado["por_cidade"]]
        BATCH = 2000
        for i in range(0, len(cidades), BATCH):
            db.execute(
                text("INSERT INTO triagem_por_cidade (upload_id, ds, cidade, ok, nok, total, taxa) VALUES (:upload_id, :ds, :cidade, :ok, :nok, :total, :taxa)"),
                cidades[i:i+BATCH]
            )
        db.commit()

        if resultado["detalhes"]:
            det_rows = [{"upload_id": uid, **r} for r in resultado["detalhes"]]
            for i in range(0, len(det_rows), BATCH):
                db.execute(
                    text("INSERT INTO triagem_detalhes (upload_id, waybill, ds_destino, ds_entrega, cidade, status, foi_recebido) VALUES (:upload_id, :waybill, :ds_destino, :ds_entrega, :cidade, :status, :foi_recebido)"),
                    det_rows[i:i+BATCH]
                )
            db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"Erro ao salvar no banco: {e}")

    return {
        "upload_id":      uid,
        "data_ref":       data_ref,
        "total":          resultado["total"],
        "qtd_ok":         resultado["qtd_ok"],
        "qtd_erro":       resultado["qtd_erro"],
        "qtd_fora":       resultado["qtd_fora"],
        "taxa":           resultado["taxa"],
        "tem_arrival":    resultado["tem_arrival"],
        "qtd_recebidos":  resultado["qtd_recebidos"],
    }

"""
api/routes/na_upload.py — Upload e processamento do relatório 有发未到 (Not Arrived SP)
Fonte de dados: aba Export (colunas Destination Station, Supervisor, 日期, Process, Situation)
"""
import io
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_current_user, get_db
from api.limiter import limiter
from api.upload_utils import validar_arquivo, detectar_aba

router = APIRouter()


_NA_COLS_KEY = {"Destination Station", "Supervisor", "日期"}


def _processar_export(xl: pd.ExcelFile) -> dict:
    """
    Lê aba Export (ou aba detectada automaticamente) e deriva todos os dados.
    """
    if "Export" in xl.sheet_names:
        aba = "Export"
    else:
        aba = detectar_aba(xl, _NA_COLS_KEY)
        if aba is None:
            raise HTTPException(
                400,
                f"Aba 'Export' não encontrada e nenhuma aba alternativa foi detectada. "
                f"Abas presentes: {xl.sheet_names}. "
                f"Esperado colunas: {sorted(_NA_COLS_KEY)}"
            )

    df = xl.parse(aba)
    df.columns = df.columns.str.strip()

    for col in ("Destination Station", "Supervisor", "日期"):
        if col not in df.columns:
            raise HTTPException(400, f"Coluna '{col}' não encontrada na aba Export.")

    df["_ds"]  = df["Destination Station"].astype(str).str.strip()
    df["_sup"] = df["Supervisor"].astype(str).str.strip().str.upper()

    df["_data_parsed"] = pd.to_datetime(df["日期"], errors="coerce")
    df["_data_str"]    = df["_data_parsed"].dt.date.apply(
        lambda d: d.isoformat() if pd.notna(d) else None
    )

    threshold_name = "大于10D"
    mask_thr = df["_data_parsed"].isna()
    thr_vals = df.loc[mask_thr, "日期"].dropna().astype(str).str.strip().unique()
    for v in thr_vals:
        if "大于" in v:
            threshold_name = v
            break

    SKIP = {"NAN", "NONE", "", "NA", "N/A"}
    mask_valid = (
        ~df["_ds"].str.upper().isin(SKIP) &
        ~df["_sup"].str.upper().isin(SKIP) &
        df["_ds"].notna() &
        df["_sup"].notna()
    )
    df = df[mask_valid].copy()

    total = len(df)

    offloaded = 0
    arrived   = 0
    if "Situation" in df.columns:
        offloaded = int((df["Situation"] == "Offloaded").sum())
        arrived   = int((df["Situation"] == "Arrive").sum())

    data_ref = date.today().isoformat()
    datas_validas = df["_data_parsed"].dropna()
    if not datas_validas.empty:
        data_ref = datas_validas.dt.date.max().isoformat()

    data_ref_dt = pd.Timestamp(data_ref)
    _text_thr = df["_data_parsed"].isna()
    _date_thr = (
        df["_data_parsed"].notna() &
        ((data_ref_dt - df["_data_parsed"]).dt.days >= 10)
    )
    df["_is_thr"] = _text_thr | _date_thr
    total_grd_pre = int(df["_is_thr"].sum())

    # Renomeia colunas com prefixo _ para evitar bug do itertuples
    df = df.rename(columns={"_sup": "supervisor", "_ds": "ds",
                             "_data_str": "data_str", "_is_thr": "is_thr",
                             "_data_parsed": "data_parsed"})

    tendencia: list[dict] = []
    df_dated = df[df["data_str"].notna()].copy()
    if not df_dated.empty:
        grp_tend = (
            df_dated.groupby(["supervisor", "ds", "data_str"])
            .size()
            .reset_index(name="total")
        )
        tendencia = [
            {
                "supervisor": r["supervisor"],
                "ds":         r["ds"],
                "data":       r["data_str"],
                "total":      int(r["total"]),
            }
            for r in grp_tend.to_dict("records")
        ]

    grp_ds = df.groupby(["supervisor", "ds"]).agg(
        total=("supervisor", "size"),
        grd10d=("is_thr", "sum"),
    ).reset_index()
    por_ds = [
        {
            "supervisor": r["supervisor"],
            "ds":         r["ds"],
            "total":      int(r["total"]),
            "grd10d":     int(r["grd10d"]),
        }
        for r in grp_ds.to_dict("records")
    ]

    grp_sup = df.groupby("supervisor").agg(
        total=("supervisor", "size"),
        grd10d=("is_thr", "sum"),
    ).reset_index()
    por_supervisor = [
        {
            "supervisor": r["supervisor"],
            "total":      int(r["total"]),
            "grd10d":     int(r["grd10d"]),
        }
        for r in grp_sup.to_dict("records")
    ]

    total_grd = int(df["is_thr"].sum())

    por_processo: list[dict] = []
    if "Process" in df.columns:
        grp_proc = (
            df.groupby("Process").size()
            .reset_index(name="total")
            .sort_values("total", ascending=False)
        )
        por_processo = [
            {"processo": str(r.Process), "total": int(r.total)}
            for r in grp_proc.itertuples(index=False)
        ]

    return {
        "data_ref":       data_ref,
        "total":          total,
        "total_offload":  offloaded,
        "total_arrive":   arrived,
        "grd10d":         total_grd,
        "threshold_col":  threshold_name,
        "tendencia":      tendencia,
        "por_supervisor": por_supervisor,
        "por_ds":         por_ds,
        "por_processo":   por_processo,
    }


def _processar(conteudo: bytes) -> dict:
    xl = pd.ExcelFile(io.BytesIO(conteudo))
    return _processar_export(xl)


def _peek_data_ref_na(conteudo: bytes) -> str | None:
    """Extrai data_ref lendo apenas a coluna 日期 da aba Export."""
    try:
        import io as _io
        xl = pd.ExcelFile(_io.BytesIO(conteudo))
        if "Export" not in xl.sheet_names:
            return None
        df = pd.read_excel(_io.BytesIO(conteudo), sheet_name="Export", usecols=["日期"])
        datas = pd.to_datetime(df["日期"], errors="coerce").dropna()
        if not datas.empty:
            return datas.dt.date.max().isoformat()
    except Exception:
        pass
    return None


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_na(
    request: Request,
    file:        UploadFile = File(..., description="Arquivo 有发未到 (.xlsx)"),
    skip_if_exists: bool    = False,
    user:        dict       = Depends(get_current_user),
    db:          Session    = Depends(get_db),
):
    conteudo = await validar_arquivo(file)

    if skip_if_exists:
        data_ref_peek = _peek_data_ref_na(conteudo)
        if data_ref_peek:
            existing = db.execute(
                text("SELECT id FROM na_uploads WHERE data_ref = :dr"), {"dr": data_ref_peek}
            ).mappings().first()
            if existing:
                return {"skipped": True, "data_ref": data_ref_peek, "upload_id": existing["id"]}

    try:
        resultado = _processar(conteudo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar arquivo: {e}")

    try:
        data_ref = resultado["data_ref"]

        # Remove upload anterior da mesma data
        existing = db.execute(
            text("SELECT id FROM na_uploads WHERE data_ref = :dr"), {"dr": data_ref}
        ).mappings().first()
        if existing:
            old_id = existing["id"]
            for tbl in ("na_tendencia", "na_por_supervisor", "na_por_ds", "na_por_processo"):
                try:
                    db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
                except Exception:
                    pass
            db.execute(text("DELETE FROM na_uploads WHERE id = :id"), {"id": old_id})
            db.commit()

        row = db.execute(
            text("""
                INSERT INTO na_uploads (data_ref, criado_por, total, total_offload, total_arrive, grd10d, threshold_col)
                VALUES (:data_ref, :criado_por, :total, :total_offload, :total_arrive, :grd10d, :threshold_col)
                RETURNING id
            """),
            {
                "data_ref":      data_ref,
                "criado_por":    user["email"],
                "total":         resultado["total"],
                "total_offload": resultado["total_offload"],
                "total_arrive":  resultado["total_arrive"],
                "grd10d":        resultado["grd10d"],
                "threshold_col": resultado["threshold_col"],
            }
        ).mappings().first()
        uid = row["id"]
        db.commit()

        if resultado["por_supervisor"]:
            db.execute(
                text("INSERT INTO na_por_supervisor (upload_id, supervisor, total, grd10d) VALUES (:upload_id, :supervisor, :total, :grd10d)"),
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            )
            db.commit()

        por_ds = [{"upload_id": uid, **r} for r in resultado["por_ds"]]
        for i in range(0, len(por_ds), 500):
            db.execute(
                text("INSERT INTO na_por_ds (upload_id, supervisor, ds, total, grd10d) VALUES (:upload_id, :supervisor, :ds, :total, :grd10d)"),
                por_ds[i:i+1000]
            )
        db.commit()

        if resultado["por_processo"]:
            db.execute(
                text("INSERT INTO na_por_processo (upload_id, processo, total) VALUES (:upload_id, :processo, :total)"),
                [{"upload_id": uid, **r} for r in resultado["por_processo"]]
            )
            db.commit()

        tend = [{"upload_id": uid, **r} for r in resultado["tendencia"]]
        for i in range(0, len(tend), 500):
            db.execute(
                text("INSERT INTO na_tendencia (upload_id, supervisor, ds, data, total) VALUES (:upload_id, :supervisor, :ds, :data, :total)"),
                tend[i:i+1000]
            )
        db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"Erro ao salvar no banco: {e}")

    return {
        "upload_id":     uid,
        "data_ref":      data_ref,
        "total":         resultado["total"],
        "total_offload": resultado["total_offload"],
        "total_arrive":  resultado["total_arrive"],
        "grd10d":        resultado["grd10d"],
        "threshold_col": resultado["threshold_col"],
    }

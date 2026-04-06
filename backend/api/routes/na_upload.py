"""
api/routes/na_upload.py — Upload e processamento do relatório 有发未到 (Not Arrived SP)
Fonte de dados: aba Export (colunas Destination Station, Supervisor, 日期, Process, Situation)
"""
import io
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()


def _processar_export(xl: pd.ExcelFile) -> dict:
    """
    Lê aba Export e deriva todos os dados a partir dela.
    Colunas usadas:
      - Destination Station → DS
      - Supervisor          → supervisor
      - 日期                → data de referência / tendência
      - Process             → por_processo
      - Situation           → total_offload / total_arrive
    Threshold (大于10D / 大于15D): linhas onde 日期 não é uma data válida.
    """
    if "Export" not in xl.sheet_names:
        raise HTTPException(400, "Aba 'Export' não encontrada no arquivo.")

    df = xl.parse("Export")
    df.columns = df.columns.str.strip()

    # Normaliza colunas essenciais
    for col in ("Destination Station", "Supervisor", "日期"):
        if col not in df.columns:
            raise HTTPException(400, f"Coluna '{col}' não encontrada na aba Export.")

    df["_ds"]  = df["Destination Station"].astype(str).str.strip()
    df["_sup"] = df["Supervisor"].astype(str).str.strip().str.upper()

    # Parse de data — linhas com data inválida são pacotes "大于XD"
    df["_data_parsed"] = pd.to_datetime(df["日期"], errors="coerce")
    df["_data_str"]    = df["_data_parsed"].dt.date.apply(
        lambda d: d.isoformat() if pd.notna(d) else None
    )

    # Nome do threshold (pega primeiro valor não-parsável de 日期, ex: "大于10D")
    threshold_name = "大于10D"
    mask_thr = df["_data_parsed"].isna()
    thr_vals = df.loc[mask_thr, "日期"].dropna().astype(str).str.strip().unique()
    for v in thr_vals:
        if "大于" in v:
            threshold_name = v
            break

    # Linhas válidas (ignora supervisor/ds vazios ou "NAN")
    SKIP = {"NAN", "NONE", "", "NA", "N/A"}
    mask_valid = (
        ~df["_ds"].str.upper().isin(SKIP) &
        ~df["_sup"].str.upper().isin(SKIP) &
        df["_ds"].notna() &
        df["_sup"].notna()
    )
    df = df[mask_valid].copy()

    total = len(df)

    # Totais de situação
    offloaded = 0
    arrived   = 0
    if "Situation" in df.columns:
        offloaded = int((df["Situation"] == "Offloaded").sum())
        arrived   = int((df["Situation"] == "Arrive").sum())

    # Data de referência — maior data válida
    data_ref = date.today().isoformat()
    datas_validas = df["_data_parsed"].dropna()
    if not datas_validas.empty:
        data_ref = datas_validas.dt.date.max().isoformat()

    # Máscara de threshold por linha
    df["_is_thr"] = df["_data_parsed"].isna()

    # ── Tendência: Supervisor × DS × data (só linhas com data válida) ──
    tendencia: list[dict] = []
    df_dated = df[df["_data_str"].notna()].copy()
    if not df_dated.empty:
        grp_tend = (
            df_dated.groupby(["_sup", "_ds", "_data_str"])
            .size()
            .reset_index(name="total")
        )
        tendencia = [
            {
                "supervisor": r._sup,
                "ds":         r._ds,
                "data":       r._data_str,
                "total":      int(r.total),
            }
            for r in grp_tend.itertuples(index=False)
        ]

    # ── Por DS ──
    por_ds: list[dict] = []
    grp_ds = df.groupby(["_sup", "_ds"]).agg(
        total=("_sup", "size"),
        grd10d=("_is_thr", "sum"),
    ).reset_index()
    por_ds = [
        {
            "supervisor": r._sup,
            "ds":         r._ds,
            "total":      int(r.total),
            "grd10d":     int(r.grd10d),
        }
        for r in grp_ds.itertuples(index=False)
    ]

    # ── Por supervisor ──
    por_supervisor: list[dict] = []
    grp_sup = df.groupby("_sup").agg(
        total=("_sup", "size"),
        grd10d=("_is_thr", "sum"),
    ).reset_index()
    por_supervisor = [
        {
            "supervisor": r._sup,
            "total":      int(r.total),
            "grd10d":     int(r.grd10d),
        }
        for r in grp_sup.itertuples(index=False)
    ]

    # ── Total threshold geral ──
    total_grd = int(df["_is_thr"].sum())

    # ── Por processo ──
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


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_na(
    request: Request,
    file:    UploadFile = File(..., description="Arquivo 有发未到 (.xlsx)"),
    user:    dict       = Depends(get_current_user),
):
    conteudo = await validar_arquivo(file)

    try:
        resultado = _processar(conteudo)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar arquivo: {e}")

    sb = get_supabase()

    try:
        data_ref = resultado["data_ref"]

        # Remove upload anterior da mesma data
        existing = sb.table("na_uploads").select("id").eq("data_ref", data_ref).execute()
        if existing.data:
            old_id = existing.data[0]["id"]
            for tbl in ("na_tendencia", "na_por_supervisor", "na_por_ds", "na_por_processo"):
                try:
                    sb.table(tbl).delete().eq("upload_id", old_id).execute()
                except Exception:
                    pass
            sb.table("na_uploads").delete().eq("id", old_id).execute()

        # Criar upload
        up = sb.table("na_uploads").insert({
            "data_ref":      data_ref,
            "criado_por":    user["email"],
            "total":         resultado["total"],
            "total_offload": resultado["total_offload"],
            "total_arrive":  resultado["total_arrive"],
            "grd10d":        resultado["grd10d"],
            "threshold_col": resultado["threshold_col"],
        }).execute()
        uid = up.data[0]["id"]

        # Por supervisor
        if resultado["por_supervisor"]:
            sb.table("na_por_supervisor").insert(
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            ).execute()

        # Por DS (lotes de 500)
        por_ds = [{"upload_id": uid, **r} for r in resultado["por_ds"]]
        for i in range(0, len(por_ds), 500):
            sb.table("na_por_ds").insert(por_ds[i:i + 1000]).execute()

        # Por processo
        if resultado["por_processo"]:
            sb.table("na_por_processo").insert(
                [{"upload_id": uid, **r} for r in resultado["por_processo"]]
            ).execute()

        # Tendência (lotes de 500)
        tend = [{"upload_id": uid, **r} for r in resultado["tendencia"]]
        for i in range(0, len(tend), 500):
            sb.table("na_tendencia").insert(tend[i:i + 1000]).execute()

    except HTTPException:
        raise
    except Exception as e:
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

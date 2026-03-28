"""
api/routes/na_upload.py — Upload e processamento do relatório 有发未到 (Not Arrived SP)
Sheet1: pivot supervisor × DS × data  |  Export: dados brutos por waybill
"""
import io
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()


def _ler_sheet1(xl: pd.ExcelFile) -> tuple[int, str, list[dict], list[dict], list[dict]]:
    """
    Lê Sheet1 (pivot supervisor × DS × data).
    Retorna: (total_grd, threshold_name, tendencia, por_supervisor, por_ds)
    """
    if "Sheet1" not in xl.sheet_names:
        return 0, "大于10D", [], [], []

    df = xl.parse("Sheet1", header=None)

    # Encontra linha de cabeçalho (contém 'DS' ou '总计')
    header_row = None
    for i in range(min(10, len(df))):
        vals = df.iloc[i].astype(str).str.strip().tolist()
        if "总计" in vals or "DS" in vals:
            header_row = i
            break
    if header_row is None:
        return 0, "大于10D", [], [], []

    headers = df.iloc[header_row].tolist()
    df = df.iloc[header_row + 1:].copy()
    df.columns = range(len(headers))

    # Sheet1: col A (idx 0) = vazio, col B (idx 1) = Supervisor,
    #         col C (idx 2) = DS, col D (idx 3) = 大于10D, cols E+ = datas
    sup_col       = 1
    ds_col        = 2
    threshold_idx = 3
    threshold_name = "大于10D"
    if len(headers) > 3 and isinstance(headers[3], str) and "大于" in str(headers[3]):
        threshold_name = str(headers[3]).strip()

    # Coluna 总计
    total_col_idx = None
    for i, h in enumerate(headers):
        if str(h).strip() == "总计":
            total_col_idx = i
            break

    # Colunas de data (entre threshold e 总计)
    date_map: dict[int, str] = {}
    end = total_col_idx if total_col_idx else len(headers) - 1
    for i in range(threshold_idx + 1, end):
        val = headers[i]
        if pd.isna(val):
            continue
        try:
            ts = pd.Timestamp(val)
            date_map[i] = ts.date().isoformat()
        except Exception:
            pass

    # Forward-fill supervisor (células mescladas no Excel — col B)
    df[sup_col] = df[sup_col].replace("", None)
    df[sup_col] = df[sup_col].ffill()

    SKIP = {"总计", "合计", "NAN", "NAN%", "", "FONTE", "FONTE%"}

    tendencia:   list[dict] = []
    por_ds_map:  dict       = {}
    por_sup_map: dict       = {}

    for _, row in df.iterrows():
        sup_val = str(row[sup_col]).strip().upper() if pd.notna(row[sup_col]) else ""
        ds_val  = str(row[ds_col]).strip()          if pd.notna(row[ds_col])  else ""

        if not ds_val or ds_val.upper() in SKIP or not sup_val or sup_val.upper() in SKIP:
            continue

        # Threshold
        grd = 0
        thr = row[threshold_idx]
        if pd.notna(thr) and isinstance(thr, (int, float)):
            grd = int(thr)

        # Total DS
        ds_total = 0
        if total_col_idx is not None:
            tv = row[total_col_idx]
            if pd.notna(tv) and isinstance(tv, (int, float)):
                ds_total = int(tv)

        # Dados por data
        for col_idx, data_str in date_map.items():
            v = row[col_idx]
            if pd.notna(v) and isinstance(v, (int, float)) and v > 0:
                tendencia.append({
                    "supervisor": sup_val,
                    "ds":         ds_val,
                    "data":       data_str,
                    "total":      int(v),
                })

        # Acumula por DS
        key = (sup_val, ds_val)
        if key not in por_ds_map:
            por_ds_map[key] = {"supervisor": sup_val, "ds": ds_val, "total": 0, "grd10d": 0}
        por_ds_map[key]["total"]  += ds_total
        por_ds_map[key]["grd10d"] += grd

        # Acumula por supervisor
        if sup_val not in por_sup_map:
            por_sup_map[sup_val] = {"supervisor": sup_val, "total": 0, "grd10d": 0}
        por_sup_map[sup_val]["total"]  += ds_total
        por_sup_map[sup_val]["grd10d"] += grd

    total_grd = sum(v["grd10d"] for v in por_sup_map.values())
    return total_grd, threshold_name, tendencia, list(por_sup_map.values()), list(por_ds_map.values())


def _ler_export(xl: pd.ExcelFile) -> tuple[int, int, int, str, list[dict]]:
    """
    Lê aba Export.
    Retorna: (total, offloaded, arrived, data_ref, por_processo)
    """
    if "Export" not in xl.sheet_names:
        return 0, 0, 0, date.today().isoformat(), []

    df = xl.parse("Export")
    df.columns = df.columns.str.strip()

    total     = len(df)
    offloaded = int((df["Situation"] == "Offloaded").sum()) if "Situation" in df.columns else 0
    arrived   = int((df["Situation"] == "Arrive").sum())   if "Situation" in df.columns else 0

    # Data de referência — maior data válida em 日期
    data_ref = date.today().isoformat()
    if "日期" in df.columns:
        datas = pd.to_datetime(df["日期"], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.max().isoformat()

    # Por processo
    por_processo: list[dict] = []
    if "Process" in df.columns:
        grp = (
            df.groupby("Process").size()
            .reset_index(name="total")
            .sort_values("total", ascending=False)
        )
        por_processo = [
            {"processo": str(r.Process), "total": int(r.total)}
            for r in grp.itertuples(index=False)
        ]

    return total, offloaded, arrived, data_ref, por_processo


def _processar(conteudo: bytes) -> dict:
    xl = pd.ExcelFile(io.BytesIO(conteudo))

    total_grd, threshold_name, tendencia, por_supervisor, por_ds = _ler_sheet1(xl)
    total, offloaded, arrived, data_ref, por_processo = _ler_export(xl)

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
            sb.table("na_por_ds").insert(por_ds[i:i + 500]).execute()

        # Por processo
        if resultado["por_processo"]:
            sb.table("na_por_processo").insert(
                [{"upload_id": uid, **r} for r in resultado["por_processo"]]
            ).execute()

        # Tendência (lotes de 500)
        tend = [{"upload_id": uid, **r} for r in resultado["tendencia"]]
        for i in range(0, len(tend), 500):
            sb.table("na_tendencia").insert(tend[i:i + 500]).execute()

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

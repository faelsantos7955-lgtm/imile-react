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

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()

# Nomes de coluna de waybill que o Arrival pode ter (exact match, prioridade)
_ARRIVAL_WB_COLS = [
    "Waybill No.", "Waybill Number", "waybill_no", "WaybillNo",
    "Tracking No.", "Tracking Number", "WAYBILL NO.", "WAYBILL NUMBER",
    "运单号", "单号",
]


def _lc(s: pd.Series) -> pd.Series:
    return s.fillna("").astype(str).str.strip().str.upper()


def _ler_loading_scans(conteudos: list[bytes]) -> pd.DataFrame:
    frames = []
    for c in conteudos:
        try:
            df = pd.read_excel(io.BytesIO(c))
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
            df = pd.read_excel(io.BytesIO(c))
            df.columns = df.columns.str.strip()

            # Busca coluna de waybill por nome exato, depois case-insensitive
            col = next((x for x in _ARRIVAL_WB_COLS if x in df.columns), None)
            if col is None:
                lower_map = {x.lower(): x for x in df.columns}
                col = next(
                    (lower_map[x.lower()] for x in _ARRIVAL_WB_COLS if x.lower() in lower_map),
                    None,
                )
            if col is None:
                # Fallback: qualquer coluna cujo nome contenha "waybill" ou "tracking"
                col = next(
                    (c for c in df.columns if any(k in c.lower() for k in ("waybill", "tracking", "运单"))),
                    None,
                )
            if col is None:
                raise HTTPException(
                    400,
                    f"Coluna de waybill não encontrada no Arrival. "
                    f"Colunas disponíveis: {list(df.columns)}. "
                    f"Esperado um de: {_ARRIVAL_WB_COLS}"
                )
            waybills.update(_lc(df[col].dropna()))
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Erro ao ler arquivo Arrival: {e}")
    return waybills


def _processar(df: pd.DataFrame, sb, arrival_set: set[str] | None = None) -> dict:
    col_dest  = "Destination Statio"
    col_deliv = "Delivery Station"
    col_wb    = "Waybill No."
    col_city  = "Consignee City"
    col_time  = "Scan Time"

    for col in (col_dest, col_wb):
        if col not in df.columns:
            raise HTTPException(400, f"Coluna obrigatória ausente no LoadingScan: '{col}'")

    # Remove duplicatas por waybill
    df = df.drop_duplicates(subset=[col_wb], keep="first").copy()

    # Normalizar
    df["_dest"]  = _lc(df[col_dest])
    df["_deliv"] = _lc(df[col_deliv]) if col_deliv in df.columns else pd.Series("", index=df.index)
    df["_city"]  = _lc(df[col_city])  if col_city  in df.columns else pd.Series("", index=df.index)
    df["_wb"]    = _lc(df[col_wb])

    # Classificação vetorizada
    dest_empty  = df["_dest"]  == ""
    deliv_empty = df["_deliv"] == ""
    match       = df["_dest"]  == df["_deliv"]
    df["_status"] = np.select(
        [dest_empty | deliv_empty, match],
        ["fora",                   "ok"],
        default="nok",
    )

    # Data de referência
    data_ref: str = date.today().isoformat()
    if col_time in df.columns:
        datas = pd.to_datetime(df[col_time], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.mode().iloc[0].isoformat()

    # Totais globais
    total    = len(df)
    qtd_ok   = int((df["_status"] == "ok").sum())
    qtd_nok  = int((df["_status"] == "nok").sum())
    qtd_fora = int((df["_status"] == "fora").sum())
    taxa     = round(qtd_ok / total * 100, 2) if total else 0.0

    # Recebidos global (cruzamento com Arrival)
    tem_arrival = arrival_set is not None
    if tem_arrival:
        qtd_recebidos = int(df["_wb"].isin(arrival_set).sum())
    else:
        qtd_recebidos = 0

    # Por DS
    por_ds_rows = []
    for ds, grp in df.groupby("_dest"):
        if not ds:
            continue
        ok_c    = int((grp["_status"] == "ok").sum())
        nok_c   = int((grp["_status"] == "nok").sum())
        fora_c  = int((grp["_status"] == "fora").sum())
        total_c = ok_c + nok_c + fora_c
        taxa_c  = round(ok_c / total_c * 100, 2) if total_c else 0.0

        if tem_arrival:
            ds_wbs      = set(grp["_wb"])
            nok_wbs     = set(grp[grp["_status"] == "nok"]["_wb"])
            recebidos   = int(len(ds_wbs   & arrival_set))
            rec_nok     = int(len(nok_wbs  & arrival_set))
        else:
            recebidos = 0
            rec_nok   = 0

        por_ds_rows.append({
            "ds": ds, "total": total_c,
            "ok": ok_c, "nok": nok_c, "fora": fora_c, "taxa": taxa_c,
            "recebidos": recebidos, "recebidos_nok": rec_nok,
        })

    # Top 5 por nok
    top5 = sorted(por_ds_rows, key=lambda r: r["nok"], reverse=True)[:5]

    # Por supervisor/região
    res_sup = sb.table("config_supervisores").select("sigla,region").execute()
    sup_map = {r["sigla"].strip().upper(): r["region"] for r in (res_sup.data or []) if r.get("sigla")}

    df["_sup"] = df["_dest"].map(sup_map).fillna("Sem Região")
    por_sup_rows = []
    for sup, grp in df.groupby("_sup"):
        ok_c   = int((grp["_status"] == "ok").sum())
        nok_c  = int((grp["_status"] == "nok").sum())
        fora_c = int((grp["_status"] == "fora").sum())
        total_c = ok_c + nok_c + fora_c
        taxa_c  = round(ok_c / total_c * 100, 2) if total_c else 0.0
        por_sup_rows.append({
            "supervisor": sup, "total": total_c,
            "ok": ok_c, "nok": nok_c, "fora": fora_c, "taxa": taxa_c,
        })

    # Por cidade
    por_cidade_rows = []
    for (ds, city), grp in df.groupby(["_dest", "_city"]):
        if not ds:
            continue
        ok_c   = int((grp["_status"] == "ok").sum())
        nok_c  = int((grp["_status"] == "nok").sum())
        total_c = ok_c + nok_c
        taxa_c  = round(ok_c / total_c * 100, 2) if total_c else 0.0
        por_cidade_rows.append({
            "ds": ds, "cidade": city or "Sem Cidade",
            "ok": ok_c, "nok": nok_c, "total": total_c, "taxa": taxa_c,
        })

    return {
        "data_ref":     data_ref,
        "total":        total,
        "qtd_ok":       qtd_ok,
        "qtd_erro":     qtd_nok,
        "qtd_fora":     qtd_fora,
        "taxa":         taxa,
        "tem_arrival":  tem_arrival,
        "qtd_recebidos": qtd_recebidos,
        "por_ds":          por_ds_rows,
        "top5":            top5,
        "por_supervisor":  por_sup_rows,
        "por_cidade":      por_cidade_rows,
    }


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_triagem(
    request:       Request,
    files:         List[UploadFile] = File(..., description="Todos os arquivos (LoadingScan primeiro, depois Arrival)"),
    arrival_count: int              = Form(default=0, description="Quantos dos últimos arquivos são Arrival"),
    user: dict = Depends(get_current_user),
):
    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado.")

    # Separar LoadingScan e Arrival pelo contador
    if arrival_count > 0 and arrival_count < len(files):
        ls_uploads  = files[:-arrival_count]
        arr_uploads = files[-arrival_count:]
    elif arrival_count > 0 and arrival_count == len(files):
        raise HTTPException(400, "Nenhum arquivo LoadingScan enviado — todos os arquivos foram marcados como Arrival.")
    else:
        ls_uploads  = files
        arr_uploads = []

    conteudos = [await validar_arquivo(f) for f in ls_uploads]

    # Arrival (opcional)
    arrival_set: set[str] | None = None
    if arr_uploads:
        arr_bytes = [await validar_arquivo(f) for f in arr_uploads]
        arrival_set = _ler_arrival(arr_bytes)

    sb = get_supabase()
    df = _ler_loading_scans(conteudos)

    try:
        resultado = _processar(df, sb, arrival_set=arrival_set)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar: {e}")

    try:
        data_ref = resultado["data_ref"]

        # Remove upload anterior da mesma data
        existing = sb.table("triagem_uploads").select("id").eq("data_ref", data_ref).execute()
        if existing.data:
            old_id = existing.data[0]["id"]
            for tbl in ("triagem_top5", "triagem_por_supervisor", "triagem_por_ds", "triagem_por_cidade"):
                try:
                    sb.table(tbl).delete().eq("upload_id", old_id).execute()
                except Exception:
                    pass
            sb.table("triagem_uploads").delete().eq("id", old_id).execute()

        # Criar upload
        up = sb.table("triagem_uploads").insert({
            "data_ref":       data_ref,
            "criado_por":     user["email"],
            "total":          resultado["total"],
            "qtd_ok":         resultado["qtd_ok"],
            "qtd_erro":       resultado["qtd_erro"],
            "taxa":           resultado["taxa"],
            "tem_arrival":    resultado["tem_arrival"],
            "qtd_recebidos":  resultado["qtd_recebidos"],
        }).execute()
        uid = up.data[0]["id"]

        # Por DS (inclui recebidos e recebidos_nok)
        if resultado["por_ds"]:
            sb.table("triagem_por_ds").insert(
                [{"upload_id": uid, **r} for r in resultado["por_ds"]]
            ).execute()

        # Top 5
        if resultado["top5"]:
            sb.table("triagem_top5").insert(
                [{"upload_id": uid, "ds": r["ds"], "total_erros": r["nok"]} for r in resultado["top5"]]
            ).execute()

        # Por supervisor
        if resultado["por_supervisor"]:
            sb.table("triagem_por_supervisor").insert(
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            ).execute()

        # Por cidade (em lotes)
        cidades = [{"upload_id": uid, **r} for r in resultado["por_cidade"]]
        for i in range(0, len(cidades), 500):
            sb.table("triagem_por_cidade").insert(cidades[i:i + 500]).execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao salvar no banco: {e}")

    return {
        "upload_id":      uid,
        "data_ref":       data_ref,
        "total":          resultado["total"],
        "qtd_ok":         resultado["qtd_ok"],
        "qtd_erro":       resultado["qtd_erro"],
        "taxa":           resultado["taxa"],
        "tem_arrival":    resultado["tem_arrival"],
        "qtd_recebidos":  resultado["qtd_recebidos"],
    }

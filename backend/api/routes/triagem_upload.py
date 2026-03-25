"""
api/routes/triagem_upload.py — Upload de LoadingScan para Triagem DC×DS
Lógica: compara Destination Statio vs Delivery Station por waybill.
  OK  = Destination Statio == Delivery Station
  NOK = Destination Statio != Delivery Station (ambos preenchidos)
  Fora = Delivery Station vazio ou fora do mapa de DS
"""
import io
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()


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


def _processar(df: pd.DataFrame, sb) -> dict:
    # Colunas essenciais
    col_dest = "Destination Statio"
    col_deliv = "Delivery Station"
    col_wb = "Waybill No."
    col_city = "Consignee City"
    col_time = "Scan Time"

    for col in (col_dest, col_wb):
        if col not in df.columns:
            raise HTTPException(400, f"Coluna obrigatória ausente: '{col}'")

    # Remover duplicatas por waybill
    df = df.drop_duplicates(subset=[col_wb], keep="first").copy()

    # Normalizar
    df["_dest"] = _lc(df[col_dest])
    df["_deliv"] = _lc(df[col_deliv]) if col_deliv in df.columns else ""
    df["_city"] = _lc(df[col_city]) if col_city in df.columns else ""

    # Classificar
    def _classif(row):
        dest = row["_dest"]
        deliv = row["_deliv"]
        if not dest:
            return "fora"
        if not deliv:
            return "fora"
        if dest == deliv:
            return "ok"
        return "nok"

    df["_status"] = df.apply(_classif, axis=1)

    # Data de referência
    data_ref: str = date.today().isoformat()
    if col_time in df.columns:
        datas = pd.to_datetime(df[col_time], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.mode().iloc[0].isoformat()

    # Totais globais
    total = len(df)
    qtd_ok = int((df["_status"] == "ok").sum())
    qtd_nok = int((df["_status"] == "nok").sum())
    qtd_fora = int((df["_status"] == "fora").sum())
    taxa = round(qtd_ok / total * 100, 2) if total else 0.0

    # Por DS (destination_statio)
    por_ds_rows = []
    for ds, grp in df.groupby("_dest"):
        if not ds:
            continue
        ok_c = int((grp["_status"] == "ok").sum())
        nok_c = int((grp["_status"] == "nok").sum())
        fora_c = int((grp["_status"] == "fora").sum())
        total_c = ok_c + nok_c + fora_c
        taxa_c = round(ok_c / total_c * 100, 2) if total_c else 0.0
        por_ds_rows.append({
            "ds": ds, "total": total_c,
            "ok": ok_c, "nok": nok_c, "fora": fora_c, "taxa": taxa_c,
        })

    # Top 5 por nok
    top5 = sorted(por_ds_rows, key=lambda r: r["nok"], reverse=True)[:5]

    # Por supervisor (via config_supervisores)
    res_sup = sb.table("config_supervisores").select("sigla,supervisor").execute()
    sup_map = {r["sigla"].strip().upper(): r["supervisor"] for r in (res_sup.data or []) if r.get("sigla")}

    df["_sup"] = df["_dest"].map(sup_map).fillna("Sem Supervisor")
    por_sup_rows = []
    for sup, grp in df.groupby("_sup"):
        ok_c = int((grp["_status"] == "ok").sum())
        nok_c = int((grp["_status"] == "nok").sum())
        fora_c = int((grp["_status"] == "fora").sum())
        total_c = ok_c + nok_c + fora_c
        taxa_c = round(ok_c / total_c * 100, 2) if total_c else 0.0
        por_sup_rows.append({
            "supervisor": sup, "total": total_c,
            "ok": ok_c, "nok": nok_c, "fora": fora_c, "taxa": taxa_c,
        })

    # Por cidade (detalhamento dentro de cada DS)
    por_cidade_rows = []
    for (ds, city), grp in df.groupby(["_dest", "_city"]):
        if not ds:
            continue
        ok_c = int((grp["_status"] == "ok").sum())
        nok_c = int((grp["_status"] == "nok").sum())
        total_c = ok_c + nok_c
        taxa_c = round(ok_c / total_c * 100, 2) if total_c else 0.0
        por_cidade_rows.append({
            "ds": ds, "cidade": city or "Sem Cidade",
            "ok": ok_c, "nok": nok_c, "total": total_c, "taxa": taxa_c,
        })

    return {
        "data_ref": data_ref,
        "total": total,
        "qtd_ok": qtd_ok,
        "qtd_erro": qtd_nok,
        "qtd_fora": qtd_fora,
        "taxa": taxa,
        "por_ds": por_ds_rows,
        "top5": top5,
        "por_supervisor": por_sup_rows,
        "por_cidade": por_cidade_rows,
    }


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_triagem(
    request: Request,
    files: list[UploadFile] = File(..., description="Arquivos LoadingScan (.xlsx) do RDC"),
    user: dict = Depends(get_current_user),
):
    """
    Recebe um ou mais arquivos LoadingScan, processa a triagem DC×DS e salva no banco.
    """
    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado.")

    conteudos = []
    for f in files:
        conteudos.append(await validar_arquivo(f))

    sb = get_supabase()
    df = _ler_loading_scans(conteudos)

    try:
        resultado = _processar(df, sb)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar: {e}")

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
        "data_ref":   data_ref,
        "criado_por": user["email"],
        "total":      resultado["total"],
        "qtd_ok":     resultado["qtd_ok"],
        "qtd_erro":   resultado["qtd_erro"],
        "taxa":       resultado["taxa"],
    }).execute()
    uid = up.data[0]["id"]

    # Salvar por DS
    if resultado["por_ds"]:
        sb.table("triagem_por_ds").insert(
            [{"upload_id": uid, **r} for r in resultado["por_ds"]]
        ).execute()

    # Salvar top 5
    if resultado["top5"]:
        sb.table("triagem_top5").insert(
            [{"upload_id": uid, "ds": r["ds"], "total_erros": r["nok"]} for r in resultado["top5"]]
        ).execute()

    # Salvar por supervisor
    if resultado["por_supervisor"]:
        sb.table("triagem_por_supervisor").insert(
            [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
        ).execute()

    # Salvar por cidade (em lotes)
    cidades = [{"upload_id": uid, **r} for r in resultado["por_cidade"]]
    for i in range(0, len(cidades), 500):
        sb.table("triagem_por_cidade").insert(cidades[i:i + 500]).execute()

    return {
        "upload_id": uid,
        "data_ref":  data_ref,
        "total":     resultado["total"],
        "qtd_ok":    resultado["qtd_ok"],
        "qtd_erro":  resultado["qtd_erro"],
        "taxa":      resultado["taxa"],
    }

"""
api/routes/not_arrived_upload.py — Upload e processamento do relatório
"Not Arrived com movimentação" (有发未到问题件后又有其他操作)

Lê as abas 数据源 (DC) e Planilha1 (DS), combina, normaliza e agrega por:
  - estação (oc_name)
  - região (区域)
  - última operação (last_operate)
  - supervisor
"""
import io
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo

router = APIRouter()

# Mapeamento last_operate (chinês → português)
OPERACAO_MAP = {
    "到件扫描":    "Chegada",
    "发件扫描":    "Saída",
    "集包扫描":    "Consolidação",
    "装车扫描":    "Carregamento",
    "签收录入":    "Entregue",
    "派件扫描":    "Saída p/ Entrega",
    "分配派件员扫描": "Atribuição Entregador",
    "归班反馈扫描":  "Retorno ao Hub",
    "开始退件":    "Devolução",
    "异常关闭":    "Encerr. por Exceção",
    "揽收扫描":    "Coleta",
    "派单扫描":    "Ordem de Entrega",
    "留仓扫描":    "Armazenagem",
    "退件到件扫描":  "Chegada Devolução",
}

# Normalização de regiões
REGIAO_MAP = {
    "CDC":       "CDC",
    "Midwest":   "Centro-Oeste",
    "North":     "Norte",
    "Northeast": "Nordeste",
    "RETURN":    "Retorno",
    "South":     "Sul",
    "Southeast": "Sudeste",
    "southeast": "Sudeste",
    "São Paulo": "São Paulo",
    "Sao Paulo": "São Paulo",
}


def _norm_regiao(s) -> str:
    if not isinstance(s, str):
        return "Outros"
    return REGIAO_MAP.get(s.strip(), s.strip() or "Outros")


def _processar(conteudo: bytes) -> dict:
    xl = pd.ExcelFile(io.BytesIO(conteudo))

    if "数据源" not in xl.sheet_names:
        raise HTTPException(400, "Aba '数据源' (DC) não encontrada no arquivo.")
    if "Planilha1" not in xl.sheet_names:
        raise HTTPException(400, "Aba 'Planilha1' (DS) não encontrada no arquivo.")

    dc = xl.parse("数据源")
    ds_raw = xl.parse("Planilha1")

    # Mapa supervisor DS: oc_name → supervisor (via aba DS do próprio arquivo)
    sup_map: dict[str, str] = {}
    if "DS" in xl.sheet_names:
        ds_dir = xl.parse("DS")
        ds_dir.columns = ds_dir.columns.str.strip()
        if "SIGLA" in ds_dir.columns and "SUPERVISOR" in ds_dir.columns:
            for _, row in ds_dir.dropna(subset=["SIGLA"]).iterrows():
                sigla = str(row["SIGLA"]).strip().upper()
                sup   = str(row["SUPERVISOR"]).strip().upper() if pd.notna(row["SUPERVISOR"]) else ""
                if sigla and sup:
                    sup_map[sigla] = sup

    # Combinar DC + DS
    df = pd.concat([dc, ds_raw], ignore_index=True)
    df.columns = df.columns.str.strip()

    # Normalizar campos
    df["oc_name"] = df["oc_name"].fillna("").astype(str).str.strip()
    df["oc_code"] = df["oc_code"].fillna("").astype(str).str.strip() if "oc_code" in df.columns else ""
    df["tipo"]    = df["站点类型"].fillna("").astype(str).str.strip().str.upper()
    df["regiao"]  = df["区域"].fillna("Outros").astype(str).apply(_norm_regiao)
    df["op_orig"] = df["last_operate"].fillna("").astype(str).str.strip()
    df["operacao"] = df["op_orig"].map(OPERACAO_MAP).fillna(df["op_orig"])

    # Filtrar apenas São Paulo (CDC-SP + DS SP)
    df = df[df["regiao"].isin(["São Paulo", "CDC"])].copy()
    if df.empty:
        raise HTTPException(400, "Nenhum registro de São Paulo encontrado no arquivo.")

    # Supervisor: coluna DC onde disponível, depois mapa pelo oc_name
    df["supervisor"] = ""
    if "Supervisor" in df.columns:
        df["supervisor"] = df["Supervisor"].fillna("").astype(str).str.strip()
    mask = df["supervisor"] == ""
    df.loc[mask, "supervisor"] = df.loc[mask, "oc_name"].str.upper().map(sup_map).fillna("")
    df["supervisor"] = df["supervisor"].replace("", "Sem Supervisor")

    # Totais globais
    total            = len(df)
    total_dc         = int((df["tipo"] == "DC").sum())
    total_ds         = int((df["tipo"] == "DS").sum())
    total_entregues  = int((df["operacao"] == "Entregue").sum())
    pct_entregues    = round(total_entregues / total * 100, 2) if total else 0.0

    # Data de referência: maior data dos registros
    data_ref = date.today().isoformat()
    if "日期" in df.columns:
        datas = pd.to_datetime(df["日期"], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.max().isoformat()

    # ── Por estação ────────────────────────────────────────────
    grp_est = (
        df.groupby(["oc_name", "oc_code", "tipo", "regiao", "supervisor"])
        .agg(
            total      = ("waybill_no", "count"),
            entregues  = ("operacao", lambda x: (x == "Entregue").sum()),
        )
        .reset_index()
    )
    por_estacao = [
        {
            "oc_name":    r.oc_name,
            "oc_code":    r.oc_code,
            "tipo":       r.tipo,
            "regiao":     r.regiao,
            "supervisor": r.supervisor,
            "total":      int(r.total),
            "entregues":  int(r.entregues),
        }
        for r in grp_est.itertuples(index=False)
    ]

    # ── Por região ─────────────────────────────────────────────
    grp_reg = df.groupby(["regiao", "tipo"]).size().reset_index(name="total")
    por_regiao = [
        {"regiao": r.regiao, "tipo": r.tipo, "total": int(r.total)}
        for r in grp_reg.itertuples(index=False)
    ]

    # ── Por operação ───────────────────────────────────────────
    grp_op = (
        df.groupby("operacao").size()
        .reset_index(name="total")
        .sort_values("total", ascending=False)
    )
    por_operacao = [
        {"operacao": r.operacao, "total": int(r.total)}
        for r in grp_op.itertuples(index=False)
    ]

    # ── Por supervisor ─────────────────────────────────────────
    grp_sup = (
        df.groupby("supervisor")
        .agg(
            total      = ("waybill_no", "count"),
            total_dc   = ("tipo",    lambda x: (x == "DC").sum()),
            total_ds   = ("tipo",    lambda x: (x == "DS").sum()),
            entregues  = ("operacao", lambda x: (x == "Entregue").sum()),
        )
        .reset_index()
        .sort_values("total", ascending=False)
    )
    por_supervisor = [
        {
            "supervisor": r.supervisor,
            "total":      int(r.total),
            "total_dc":   int(r.total_dc),
            "total_ds":   int(r.total_ds),
            "entregues":  int(r.entregues),
        }
        for r in grp_sup.itertuples(index=False)
    ]

    return {
        "data_ref":       data_ref,
        "total":          total,
        "total_dc":       total_dc,
        "total_ds":       total_ds,
        "total_entregues": total_entregues,
        "pct_entregues":  pct_entregues,
        "por_estacao":    por_estacao,
        "por_regiao":     por_regiao,
        "por_operacao":   por_operacao,
        "por_supervisor": por_supervisor,
    }


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_not_arrived(
    request: Request,
    file: UploadFile = File(..., description="Arquivo Problem Registration (.xlsx)"),
    user: dict = Depends(get_current_user),
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
        existing = sb.table("not_arrived_uploads").select("id").eq("data_ref", data_ref).execute()
        if existing.data:
            old_id = existing.data[0]["id"]
            for tbl in ("not_arrived_por_estacao", "not_arrived_por_regiao",
                        "not_arrived_por_operacao", "not_arrived_por_supervisor"):
                try:
                    sb.table(tbl).delete().eq("upload_id", old_id).execute()
                except Exception:
                    pass
            sb.table("not_arrived_uploads").delete().eq("id", old_id).execute()

        # Criar upload
        up = sb.table("not_arrived_uploads").insert({
            "data_ref":        data_ref,
            "criado_por":      user["email"],
            "total":           resultado["total"],
            "total_dc":        resultado["total_dc"],
            "total_ds":        resultado["total_ds"],
            "total_entregues": resultado["total_entregues"],
            "pct_entregues":   resultado["pct_entregues"],
        }).execute()
        uid = up.data[0]["id"]

        # Por estação (lotes de 500 — pode ter centenas de estações)
        estacoes = [{"upload_id": uid, **r} for r in resultado["por_estacao"]]
        for i in range(0, len(estacoes), 500):
            sb.table("not_arrived_por_estacao").insert(estacoes[i:i + 500]).execute()

        if resultado["por_regiao"]:
            sb.table("not_arrived_por_regiao").insert(
                [{"upload_id": uid, **r} for r in resultado["por_regiao"]]
            ).execute()

        if resultado["por_operacao"]:
            sb.table("not_arrived_por_operacao").insert(
                [{"upload_id": uid, **r} for r in resultado["por_operacao"]]
            ).execute()

        if resultado["por_supervisor"]:
            sb.table("not_arrived_por_supervisor").insert(
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            ).execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao salvar no banco: {e}")

    return {
        "upload_id":       uid,
        "data_ref":        data_ref,
        "total":           resultado["total"],
        "total_dc":        resultado["total_dc"],
        "total_ds":        resultado["total_ds"],
        "total_entregues": resultado["total_entregues"],
        "pct_entregues":   resultado["pct_entregues"],
    }

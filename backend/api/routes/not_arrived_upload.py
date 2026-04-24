"""
api/routes/not_arrived_upload.py — Upload e processamento do relatório
"Not Arrived com movimentação" (有发未到问题件后又有其他操作)
"""
import gc
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


_KEEP = {"waybill_no", "oc_name", "oc_code", "站点类型", "区域",
         "last_operate", "日期", "Supervisor", "Process"}

_NA_MOV_COLS_KEY = {"waybill_no", "oc_name", "区域", "last_operate"}
_NA_MOV_SKIP = {"汇总", "DS"}  # abas de suporte, não de dados


def _encontrar_abas_not_arrived(xl: pd.ExcelFile) -> tuple[str, str]:
    """
    Retorna (dc_aba, ds_aba). Tenta nomes exatos primeiro;
    se não encontrar, detecta pelas colunas de dados.
    """
    dc = "数据源"   if "数据源"    in xl.sheet_names else None
    ds = "Planilha1" if "Planilha1" in xl.sheet_names else None

    if dc is None or ds is None:
        candidatas: list[tuple[str, int]] = []
        for nome in xl.sheet_names:
            if nome in _NA_MOV_SKIP:
                continue
            if nome in (dc, ds):   # já achado por nome exato
                continue
            try:
                header = xl.parse(nome, nrows=0)
                cols = {str(c).strip() for c in header.columns}
                score = len(_NA_MOV_COLS_KEY & cols)
                if score >= 2:
                    candidatas.append((nome, score))
            except Exception:
                continue
        candidatas.sort(key=lambda x: x[1], reverse=True)

        if dc is None:
            if not candidatas:
                raise HTTPException(
                    400,
                    f"Aba '数据源' (DC) não encontrada e nenhuma alternativa detectada. "
                    f"Abas presentes: {xl.sheet_names}"
                )
            dc = candidatas.pop(0)[0]

        if ds is None:
            if not candidatas:
                ds = dc  # arquivo com só uma aba de dados — tenta processar mesmo assim
            else:
                ds = candidatas[0][0]

    return dc, ds


def _ler_sumario(xl: pd.ExcelFile) -> list[dict]:
    if "汇总" not in xl.sheet_names:
        return []
    try:
        df = xl.parse("汇总", header=None, nrows=20)
    except Exception:
        return []

    if df.shape[0] < 3 or df.shape[1] < 3:
        return []

    date_map: dict[int, str] = {}
    for col in range(2, df.shape[1]):
        val = df.iloc[1, col]
        if pd.isna(val):
            continue
        try:
            ts = pd.Timestamp(val)
            date_map[col] = ts.date().isoformat()
        except Exception:
            pass

    if not date_map:
        return []

    SKIP = {"合计", "NAN", "", "NONE", "区域"}
    registros: list[dict] = []
    for row_idx in range(2, min(16, df.shape[0])):
        sup_val = df.iloc[row_idx, 0]
        if pd.isna(sup_val):
            continue
        sup = str(sup_val).strip().upper()
        if sup in SKIP:
            continue
        for col_idx, data_str in date_map.items():
            cell = df.iloc[row_idx, col_idx]
            if pd.notna(cell) and isinstance(cell, (int, float)):
                registros.append({
                    "supervisor": sup,
                    "data":       data_str,
                    "total":      int(cell),
                })

    return registros


def _processar(xl: pd.ExcelFile) -> tuple[dict, list[dict]]:
    tendencia = _ler_sumario(xl)

    dc_aba, ds_aba = _encontrar_abas_not_arrived(xl)

    dc     = xl.parse(dc_aba, usecols=lambda c: str(c).strip() in _KEEP)
    ds_raw = xl.parse(ds_aba, usecols=lambda c: str(c).strip() in _KEEP)

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

    df = pd.concat([dc, ds_raw], ignore_index=True)
    df.columns = df.columns.str.strip()

    df["oc_name"] = df["oc_name"].fillna("").astype(str).str.strip()
    df["oc_code"] = df["oc_code"].fillna("").astype(str).str.strip() if "oc_code" in df.columns else ""
    df["tipo"]    = df["站点类型"].fillna("").astype(str).str.strip().str.upper()
    df["regiao"]  = df["区域"].fillna("Outros").astype(str).apply(_norm_regiao)
    df["op_orig"] = df["last_operate"].fillna("").astype(str).str.strip()
    df["operacao"] = df["op_orig"].map(OPERACAO_MAP).fillna(df["op_orig"])

    df = df[df["regiao"].isin(["São Paulo", "CDC"])].copy()
    if df.empty:
        raise HTTPException(400, "Nenhum registro de São Paulo encontrado no arquivo.")

    df["supervisor"] = ""
    if "Supervisor" in df.columns:
        df["supervisor"] = df["Supervisor"].fillna("").astype(str).str.strip()
    mask = df["supervisor"] == ""
    df.loc[mask, "supervisor"] = df.loc[mask, "oc_name"].str.upper().map(sup_map).fillna("")
    df["supervisor"] = df["supervisor"].replace("", "Sem Supervisor")

    total            = len(df)
    total_dc         = int((df["tipo"] == "DC").sum())
    total_ds         = int((df["tipo"] == "DS").sum())
    total_entregues  = int((df["operacao"] == "Entregue").sum())
    pct_entregues    = round(total_entregues / total * 100, 2) if total else 0.0

    data_ref = date.today().isoformat()
    if "日期" in df.columns:
        datas = pd.to_datetime(df["日期"], errors="coerce").dropna()
        if not datas.empty:
            data_ref = datas.dt.date.max().isoformat()

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

    grp_reg = df.groupby(["regiao", "tipo"]).size().reset_index(name="total")
    por_regiao = [
        {"regiao": r.regiao, "tipo": r.tipo, "total": int(r.total)}
        for r in grp_reg.itertuples(index=False)
    ]

    grp_op = (
        df.groupby("operacao").size()
        .reset_index(name="total")
        .sort_values("total", ascending=False)
    )
    por_operacao = [
        {"operacao": r.operacao, "total": int(r.total)}
        for r in grp_op.itertuples(index=False)
    ]

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

    resultado = {
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
    return resultado, tendencia


def _peek_data_ref_from_xl(xl: pd.ExcelFile) -> str | None:
    """Extrai data_ref lendo apenas a coluna 日期 do ExcelFile já aberto."""
    try:
        frames = []
        for aba in ("数据源", "Planilha1"):
            if aba in xl.sheet_names:
                try:
                    frames.append(xl.parse(aba, usecols=["日期"]))
                except Exception:
                    pass
        if not frames:
            return None
        col = pd.concat(frames)["日期"]
        datas = pd.to_datetime(col, errors="coerce").dropna()
        if not datas.empty:
            return datas.dt.date.max().isoformat()
    except Exception:
        pass
    return None


@router.post("/processar")
@limiter.limit("5/minute")
async def processar_not_arrived(
    request: Request,
    file: UploadFile = File(..., description="Arquivo Problem Registration (.xlsx)"),
    skip_if_exists: bool = False,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conteudo = await validar_arquivo(file)
    xl = pd.ExcelFile(io.BytesIO(conteudo))
    del conteudo   # libera os bytes brutos antes do parse pesado
    gc.collect()

    if skip_if_exists:
        data_ref_peek = _peek_data_ref_from_xl(xl)
        if data_ref_peek:
            existing = db.execute(
                text("SELECT id FROM not_arrived_uploads WHERE data_ref = :dr"), {"dr": data_ref_peek}
            ).mappings().first()
            if existing:
                xl.close()
                return {"skipped": True, "data_ref": data_ref_peek, "upload_id": existing["id"]}

    try:
        resultado, tendencia = _processar(xl)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Erro ao processar arquivo: {e}")
    finally:
        xl.close()
        gc.collect()

    try:
        data_ref = resultado["data_ref"]

        existing = db.execute(
            text("SELECT id FROM not_arrived_uploads WHERE data_ref = :dr"), {"dr": data_ref}
        ).mappings().first()
        if existing:
            old_id = existing["id"]
            for tbl in ("not_arrived_por_estacao", "not_arrived_por_regiao",
                        "not_arrived_por_operacao", "not_arrived_por_supervisor",
                        "not_arrived_tendencia"):
                try:
                    db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
                except Exception:
                    pass
            db.execute(text("DELETE FROM not_arrived_uploads WHERE id = :id"), {"id": old_id})
            db.commit()

        row = db.execute(
            text("""
                INSERT INTO not_arrived_uploads (data_ref, criado_por, total, total_dc, total_ds, total_entregues, pct_entregues)
                VALUES (:data_ref, :criado_por, :total, :total_dc, :total_ds, :total_entregues, :pct_entregues)
                RETURNING id
            """),
            {
                "data_ref":        data_ref,
                "criado_por":      user["email"],
                "total":           resultado["total"],
                "total_dc":        resultado["total_dc"],
                "total_ds":        resultado["total_ds"],
                "total_entregues": resultado["total_entregues"],
                "pct_entregues":   resultado["pct_entregues"],
            }
        ).mappings().first()
        uid = row["id"]
        db.commit()

        estacoes = [{"upload_id": uid, **r} for r in resultado["por_estacao"]]
        for i in range(0, len(estacoes), 500):
            db.execute(
                text("INSERT INTO not_arrived_por_estacao (upload_id, oc_name, oc_code, tipo, regiao, supervisor, total, entregues) VALUES (:upload_id, :oc_name, :oc_code, :tipo, :regiao, :supervisor, :total, :entregues)"),
                estacoes[i:i+1000]
            )
        db.commit()

        if resultado["por_regiao"]:
            db.execute(
                text("INSERT INTO not_arrived_por_regiao (upload_id, regiao, tipo, total) VALUES (:upload_id, :regiao, :tipo, :total)"),
                [{"upload_id": uid, **r} for r in resultado["por_regiao"]]
            )
            db.commit()

        if resultado["por_operacao"]:
            db.execute(
                text("INSERT INTO not_arrived_por_operacao (upload_id, operacao, total) VALUES (:upload_id, :operacao, :total)"),
                [{"upload_id": uid, **r} for r in resultado["por_operacao"]]
            )
            db.commit()

        if resultado["por_supervisor"]:
            db.execute(
                text("INSERT INTO not_arrived_por_supervisor (upload_id, supervisor, total, total_dc, total_ds, entregues) VALUES (:upload_id, :supervisor, :total, :total_dc, :total_ds, :entregues)"),
                [{"upload_id": uid, **r} for r in resultado["por_supervisor"]]
            )
            db.commit()

        if tendencia:
            for i in range(0, len(tendencia), 500):
                db.execute(
                    text("INSERT INTO not_arrived_tendencia (upload_id, supervisor, data, total) VALUES (:upload_id, :supervisor, :data, :total)"),
                    [{"upload_id": uid, **r} for r in tendencia[i:i+1000]]
                )
            db.commit()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
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

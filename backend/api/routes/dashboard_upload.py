"""
api/routes/dashboard_upload.py — Upload de dados do Dashboard via painel web
Port do processar_dashboard() do processar.py local para FastAPI.
"""
import io
import re
from datetime import date

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from api.deps import get_current_user, get_supabase
from api.limiter import limiter
from api.upload_utils import validar_arquivo, validar_varios

router = APIRouter()

_ENGINE = "openpyxl"
try:
    import python_calamine  # noqa: F401
    _ENGINE = "calamine"
except ImportError:
    pass


def _lc(s: pd.Series) -> pd.Series:
    return s.astype(str).str.strip().str.upper().str.replace(r"\s+", " ", regex=True)


def _wb(s: pd.Series) -> pd.Series:
    try:
        return s.astype(float).astype("int64").astype(str).str.strip()
    except Exception:
        return s.astype(str).str.strip()


def _ler(files: list[bytes], cols: set) -> pd.DataFrame:
    frames = []
    for b in files:
        try:
            df = pd.read_excel(io.BytesIO(b), engine=_ENGINE, usecols=lambda c: c in cols)
        except Exception:
            df = pd.read_excel(io.BytesIO(b), engine=_ENGINE)
        frames.append(df)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


@router.post("/upload")
@limiter.limit("5/minute")
async def upload_dashboard(
    request: Request,
    data_ref: str = Form(..., description="Data de referência (YYYY-MM-DD)"),
    recebimento: list[UploadFile] = File(..., description="Arquivos de Recebimento (.xlsx)"),
    out_delivery: list[UploadFile] = File(..., description="Arquivos de Out of Delivery (.xlsx)"),
    entregas:    list[UploadFile] = File(None, description="Arquivos de Entregas (.xlsx) — opcional"),
    supervisores: UploadFile       = File(None, description="Planilha de Supervisores — opcional"),
    metas:        UploadFile       = File(None, description="Planilha de Metas — opcional"),
    user: dict = Depends(get_current_user),
):
    """
    Processa os arquivos Excel de operação diária e salva em expedicao_diaria + expedicao_cidades.
    Equivalente ao processar_dashboard() do processar.py local.
    """
    sb = get_supabase()

    # ── Valida data ────────────────────────────────────────────
    try:
        data_obj = date.fromisoformat(data_ref)
    except ValueError:
        raise HTTPException(400, "data_ref deve estar no formato YYYY-MM-DD")

    try:
        # ── Valida e lê bytes ─────────────────────────────────
        rec_bytes  = await validar_varios(recebimento)
        out_bytes  = await validar_varios(out_delivery)
        ent_bytes  = await validar_varios(entregas) if entregas else []
        sup_bytes  = await validar_arquivo(supervisores, obrigatorio=False)
        meta_bytes = await validar_arquivo(metas, obrigatorio=False)

        # ── Supervisores ──────────────────────────────────────
        mapa = {}
        if sup_bytes:
            ds = pd.read_excel(io.BytesIO(sup_bytes), engine=_ENGINE)
            ds.columns = [c.strip().upper() for c in ds.columns]
            ds["SIGLA"] = _lc(ds["SIGLA"])
            sb.table("config_supervisores").upsert(
                [{"sigla": str(r["SIGLA"]), "region": str(r["REGION"]).strip(), "atualizado_por": "dashboard_upload"}
                 for _, r in ds.iterrows() if str(r["SIGLA"]).strip()],
                on_conflict="sigla",
            ).execute()
            for _, r in ds.iterrows():
                sig, reg = str(r["SIGLA"]).strip(), str(r["REGION"]).strip()
                mapa[sig] = (sig, reg)
                cod = re.sub(r"^(RDC|DC|DS)[\s\-]+", "", sig).strip()
                if cod not in mapa:
                    mapa[cod] = (sig, reg)
        else:
            res = sb.table("config_supervisores").select("sigla,region").execute()
            for r in (res.data or []):
                sig, reg = r["sigla"].strip().upper(), r["region"].strip()
                mapa[sig] = (sig, reg)
                cod = re.sub(r"^(RDC|DC|DS)[\s\-]+", "", sig).strip()
                if cod not in mapa:
                    mapa[cod] = (sig, reg)

        # ── Metas ─────────────────────────────────────────────
        df_meta = None
        if meta_bytes:
            dm = pd.read_excel(io.BytesIO(meta_bytes), engine=_ENGINE)
            dm.columns = [c.strip().upper() for c in dm.columns]
            cd = next((c for c in dm.columns if "DS" in c or "BASE" in c), None)
            cm = next((c for c in dm.columns if "META" in c), None)
            if cd and cm:
                dm = dm.rename(columns={cd: "DS", cm: "Meta"})
                mn = pd.to_numeric(
                    dm["Meta"].astype(str).str.replace("%", "", regex=False).str.replace(",", ".", regex=False),
                    errors="coerce",
                )
                mn = mn.where(mn <= 1.0, mn / 100)
                dm["Meta"] = mn.fillna(0.5)
                df_meta = dm[["DS", "Meta"]].dropna(subset=["DS"])
                sb.table("config_metas").upsert(
                    [{"ds": r["DS"], "meta": float(r["Meta"]), "atualizado_por": "dashboard_upload"}
                     for _, r in df_meta.iterrows() if r["DS"]],
                    on_conflict="ds",
                ).execute()
        if df_meta is None:
            rm = sb.table("config_metas").select("ds,meta").execute()
            if rm.data:
                df_meta = pd.DataFrame(rm.data).rename(columns={"ds": "DS", "meta": "Meta"})

        def _pad(df, col="Scan Station"):
            df = df.copy()
            df[col] = _lc(df[col])
            ms = {k: v[0] for k, v in mapa.items()}
            m = df[col].map(ms)
            sem = m.isna()
            if sem.any():
                cod = df.loc[sem, col].str.replace(r"^(RDC|DC|DS)[\s\-]+", "", regex=True).str.strip()
                m[sem] = cod.map(ms)
            df[col] = m.fillna(df[col])
            return df

        # ── Recebimento ───────────────────────────────────────
        df_rec = _ler(rec_bytes, {"Scan Station", "Waybill Number", "Destination City"})
        dcol = next((c for c in df_rec.columns if any(k in c.lower() for k in ["scan time", "data", "date", "inbound"])), None)
        if dcol:
            df_rec[dcol] = pd.to_datetime(df_rec[dcol], errors="coerce")
            df_rec = df_rec[df_rec[dcol].dt.date == data_obj].copy()

        if "Scan Station" in df_rec.columns:
            df_rec["Scan Station"] = _lc(df_rec["Scan Station"])
            ms = {k: v[0] for k, v in mapa.items()}
            mr = {k: v[1] for k, v in mapa.items()}
            m = df_rec["Scan Station"].map(ms)
            sem = m.isna()
            if sem.any():
                cod = df_rec.loc[sem, "Scan Station"].str.replace(r"^(RDC|DC|DS)[\s\-]+", "", regex=True).str.strip()
                m[sem] = cod.map(ms)
            df_rec["Scan Station"] = m.fillna(df_rec["Scan Station"])
            df_rec["REGION"] = df_rec["Scan Station"].map(mr).fillna("Sem Classificacao")

        # ── Out of Delivery ───────────────────────────────────
        df_out = _ler(out_bytes, {"Waybill No.", "Scan time", "Scan Station"})
        if "Scan Station" not in df_out.columns and "Waybill No." in df_out.columns and "Waybill Number" in df_rec.columns:
            wss = (df_rec[["Waybill Number", "Scan Station"]].dropna()
                   .drop_duplicates("Waybill Number")
                   .rename(columns={"Waybill Number": "Waybill No."}))
            df_out = df_out.merge(wss, on="Waybill No.", how="left")
        elif "Scan Station" in df_out.columns:
            df_out = _pad(df_out)

        # ── Entregas ──────────────────────────────────────────
        df_ent = None
        if ent_bytes:
            df_ent = _ler(ent_bytes, {"Scan Station", "Waybill No."})
            if "Scan Station" in df_ent.columns:
                df_ent = _pad(df_ent)

        # ── Agrega por DS ─────────────────────────────────────
        ds_base = (df_rec[["Scan Station", "REGION"]].drop_duplicates("Scan Station").dropna(subset=["Scan Station"])
                   if "REGION" in df_rec.columns
                   else df_rec[["Scan Station"]].drop_duplicates().dropna())
        if "REGION" not in ds_base.columns:
            ds_base["REGION"] = "Sem Classificacao"

        dw = df_rec.dropna(subset=["Waybill Number"]).copy() if "Waybill Number" in df_rec.columns else df_rec.copy()
        wb_set: set = set()
        if "Waybill Number" in dw.columns:
            dw["Waybill Number"] = _wb(dw["Waybill Number"])
            dw = dw.drop_duplicates("Waybill Number")
            rec = dw.groupby("Scan Station").size().reset_index(name="Recebido")
            wb_set = set(dw["Waybill Number"])
        else:
            rec = df_rec["Scan Station"].value_counts().reset_index(name="Recebido")

        if "Waybill No." in df_out.columns and "Scan Station" in df_out.columns and wb_set:
            df_out["Waybill No."] = _wb(df_out["Waybill No."])
            do2 = df_out[df_out["Waybill No."].isin(wb_set)].drop_duplicates("Waybill No.")
            exp = do2.groupby("Scan Station").size().reset_index(name="Expedido")
        elif "Scan Station" in df_out.columns:
            exp = df_out["Scan Station"].value_counts().reset_index(name="Expedido")
        else:
            exp = pd.DataFrame(columns=["Scan Station", "Expedido"])

        p = ds_base.merge(rec, on="Scan Station", how="left").merge(exp, on="Scan Station", how="left")
        p["Recebido"] = p["Recebido"].fillna(0).astype(int)
        p["Expedido"] = p["Expedido"].fillna(0).astype(int)

        if df_ent is not None and "Waybill No." in df_ent.columns and wb_set:
            df_ent["Waybill No."] = _wb(df_ent["Waybill No."])
            de2 = df_ent[df_ent["Waybill No."].isin(wb_set)].drop_duplicates("Waybill No.")
            ent = de2.groupby("Scan Station").size().reset_index(name="Entregas")
            p["Entregas"] = p["Scan Station"].map(ent.set_index("Scan Station")["Entregas"]).fillna(0).astype(int)
        else:
            p["Entregas"] = 0

        p["taxa_exp"] = np.where(p["Recebido"] > 0, p["Expedido"] / p["Recebido"], 0.0)
        p["taxa_ent"] = np.where(p["Recebido"] > 0, (p["Entregas"] / p["Recebido"]).clip(upper=1.0), 0.0)

        if df_meta is not None:
            meta_map = df_meta.set_index("DS")["Meta"].to_dict()
            p["meta"] = p["Scan Station"].map(meta_map).fillna(0.5)
        else:
            p["meta"] = 0.5

        p["atingiu_meta"] = p["taxa_exp"] >= p["meta"]

        # ── Salva expedicao_diaria ────────────────────────────
        rows_d = [
            {
                "data_ref":       data_ref,
                "scan_station":   str(r["Scan Station"]),
                "region":         str(r.get("REGION", "")),
                "recebido":       int(r["Recebido"]),
                "expedido":       int(r["Expedido"]),
                "entregas":       int(r["Entregas"]),
                "taxa_exp":       float(r["taxa_exp"]),
                "taxa_ent":       float(r["taxa_ent"]),
                "meta":           float(r["meta"]),
                "atingiu_meta":   bool(r["atingiu_meta"]),
                "processado_por": f"dashboard_upload:{user.get('email','')}",
            }
            for _, r in p.iterrows()
        ]
        if rows_d:
            sb.table("expedicao_diaria").upsert(rows_d, on_conflict="data_ref,scan_station").execute()

        # ── Salva expedicao_cidades ───────────────────────────
        n_cidades = 0
        if "Waybill Number" in dw.columns and "Destination City" in dw.columns:
            idx_wb = dw.set_index("Waybill Number")[["Scan Station", "Destination City"]]
            rec_city = (dw.dropna(subset=["Destination City"])
                        .groupby(["Scan Station", "Destination City"], observed=True)
                        .size().reset_index(name="Recebido"))

            if "Waybill No." in df_out.columns and wb_set:
                do_c = df_out[["Waybill No."]].drop_duplicates()
                do_c = do_c[do_c["Waybill No."].isin(wb_set)].copy()
                do_c["Scan Station"]     = do_c["Waybill No."].map(idx_wb["Scan Station"])
                do_c["Destination City"] = do_c["Waybill No."].map(idx_wb["Destination City"])
                exp_city = (do_c.dropna(subset=["Scan Station"])
                            .groupby(["Scan Station", "Destination City"], observed=True)
                            .size().reset_index(name="Expedido"))
                rec_city = rec_city.merge(exp_city, on=["Scan Station", "Destination City"], how="left")
            else:
                rec_city["Expedido"] = 0

            if df_ent is not None and "Waybill No." in df_ent.columns and wb_set:
                de_c = df_ent[["Waybill No."]].drop_duplicates()
                de_c = de_c[de_c["Waybill No."].isin(wb_set)].copy()
                de_c["Scan Station"]     = de_c["Waybill No."].map(idx_wb["Scan Station"])
                de_c["Destination City"] = de_c["Waybill No."].map(idx_wb["Destination City"])
                ent_city = (de_c.dropna(subset=["Scan Station"])
                            .groupby(["Scan Station", "Destination City"], observed=True)
                            .size().reset_index(name="Entregas"))
                rec_city = rec_city.merge(ent_city, on=["Scan Station", "Destination City"], how="left")
            else:
                rec_city["Entregas"] = 0

            rec_city["Expedido"] = rec_city["Expedido"].fillna(0).astype(int)
            rec_city["Entregas"] = rec_city["Entregas"].fillna(0).astype(int)
            rec_city["taxa_exp"] = np.where(rec_city["Recebido"] > 0, rec_city["Expedido"] / rec_city["Recebido"], 0.0)
            rec_city["taxa_ent"] = np.where(rec_city["Recebido"] > 0, (rec_city["Entregas"] / rec_city["Recebido"]).clip(upper=1.0), 0.0)

            rows_c = [
                {
                    "data_ref":         data_ref,
                    "scan_station":     str(r["Scan Station"]),
                    "destination_city": str(r["Destination City"]),
                    "recebido":         int(r["Recebido"]),
                    "expedido":         int(r["Expedido"]),
                    "entregas":         int(r["Entregas"]),
                    "taxa_exp":         float(r["taxa_exp"]),
                    "taxa_ent":         float(r["taxa_ent"]),
                }
                for _, r in rec_city.iterrows()
            ]
            if rows_c:
                sb.table("expedicao_cidades").upsert(rows_c, on_conflict="data_ref,scan_station,destination_city").execute()
                n_cidades = len(rows_c)

        return {
            "data_ref":   data_ref,
            "n_stations": len(rows_d),
            "n_cidades":  n_cidades,
            "recebido":   int(p["Recebido"].sum()),
            "expedido":   int(p["Expedido"].sum()),
            "entregas":   int(p["Entregas"].sum()),
            "n_ok":       int(p["atingiu_meta"].sum()),
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, "Erro interno ao processar o arquivo") from exc

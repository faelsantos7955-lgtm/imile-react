"""
api/routes/reclamacoes_upload.py — Upload e processamento de Reclamações via painel web
Adicionar ao router principal: app.include_router(router, prefix="/api/reclamacoes")
"""
import io
from collections import defaultdict
from datetime import date

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from api.deps import get_current_user, get_supabase

# Importa os mesmos helpers usados pelo processar.py local
# Certifique-se de que `modulos/reclamacoes.py` está acessível no PYTHONPATH do servidor
from modulos.reclamacoes import (
    _construir_tabelas,
    adicionar_supervisor,
    agregar_por_station,
    agregar_por_supervisor,
    carregar_bilhete,
    carregar_delivered,
    criar_colunas_auxiliares,
    cruzar_carta_porte,
    gerar_excel,
    limpar_dados,
    separar_periodo,
    top5_motoristas,
)

router = APIRouter()


@router.post("/processar")
async def processar_reclamacoes(
    bilhete: UploadFile = File(..., description="Bilhete de Reclamação (.xlsx)"),
    carta: UploadFile = File(..., description="Consulta à Carta de Porte Central (.xlsx)"),
    gestao: UploadFile = File(None, description="Gestão de Bases / Supervisores (.xlsx) — opcional"),
    delivered: UploadFile = File(None, description="Delivered / Entregas (.xlsx) — opcional"),
    user: dict = Depends(get_current_user),
):
    """
    Recebe os arquivos de Reclamações, processa e salva no Supabase.
    Equivale ao `processar_reclamacoes()` do processar.py local.
    Retorna um resumo do que foi salvo.
    """
    sb = get_supabase()

    # ── Lê os bytes dos uploads ──────────────────────────────────
    bilhete_bytes = await bilhete.read()
    carta_bytes   = await carta.read()
    gestao_bytes  = await gestao.read() if gestao else None
    deliv_bytes   = await delivered.read() if delivered else None

    # ── Motoristas inativos ──────────────────────────────────────
    res_i = sb.table("motoristas_status").select("id_motorista").eq("ativo", False).execute()
    inativos = [r["id_motorista"] for r in (res_i.data or [])]

    try:
        # ── Bilhete ──────────────────────────────────────────────
        df = carregar_bilhete(io.BytesIO(bilhete_bytes))

        # ── Supervisores ─────────────────────────────────────────
        if gestao_bytes:
            df = adicionar_supervisor(df, io.BytesIO(gestao_bytes))
        else:
            rs = sb.table("config_supervisores").select("sigla,region").execute()
            if not rs.data:
                raise HTTPException(400, "Sem supervisores no banco. Envie o arquivo de Gestão de Bases.")
            buf = io.BytesIO()
            pd.DataFrame(rs.data).rename(
                columns={"sigla": "SIGLA", "region": "SUPERVISOR"}
            ).to_excel(buf, index=False)
            buf.seek(0)
            df = adicionar_supervisor(df, buf)

        df = criar_colunas_auxiliares(df)

        # ── Carta de Porte ───────────────────────────────────────
        df = cruzar_carta_porte(df, io.BytesIO(carta_bytes))
        df = limpar_dados(df)
        df_dia, df_mes, data_ref = separar_periodo(df)

        # Usa a data real do bilhete quando possível
        if "Create Time" in df.columns:
            data_create = pd.to_datetime(df["Create Time"], dayfirst=True, errors="coerce").dropna()
            if not data_create.empty:
                data_ref = data_create.dt.date.mode().iloc[0]

        # ── Agrega ───────────────────────────────────────────────
        agg_sup = agregar_por_supervisor(df_dia, df_mes)
        agg_sta = agregar_por_station(df_dia, df_mes)
        top5    = top5_motoristas(df_dia, inativos=inativos)

        est  = pd.DataFrame(columns=["Delivery Station", "Total Entregas"])
        esup = pd.DataFrame(columns=["Supervisor", "Total Entregas"])
        df_del_raw = None

        if deliv_bytes:
            g2 = io.BytesIO(gestao_bytes) if gestao_bytes else io.BytesIO()
            est, esup = carregar_delivered(io.BytesIO(deliv_bytes), g2)
            df_del_raw = pd.read_excel(io.BytesIO(deliv_bytes), dtype=str)

        tbl_ds, tbl_sup, tbl_mot = _construir_tabelas(df, est, esup, top5, data_ref)

        week_cols_ds  = [c for c in tbl_ds.columns  if c.startswith("Qt Week")]
        week_cols_sup = [c for c in tbl_sup.columns if c.startswith("Qt Week")]

        # ── Remove upload anterior da mesma data ─────────────────
        existing = (
            sb.table("reclamacoes_uploads")
            .select("id")
            .eq("data_ref", data_ref.isoformat())
            .execute()
        )
        if existing.data:
            old_id = existing.data[0]["id"]
            for tbl in ("reclamacoes_top5", "reclamacoes_por_station", "reclamacoes_por_supervisor"):
                sb.table(tbl).delete().eq("upload_id", old_id).execute()
            sb.table("reclamacoes_uploads").delete().eq("id", old_id).execute()

        # ── Descobre colunas week_X disponíveis ──────────────────
        semanas_sup_validas: set = set()
        semanas_sta_validas: set = set()
        try:
            r = sb.table("reclamacoes_por_supervisor").select("*").limit(1).execute()
            if r.data:
                semanas_sup_validas = {k.replace("week_", "") for k in r.data[0] if k.startswith("week_")}
        except Exception:
            pass
        try:
            r = sb.table("reclamacoes_por_station").select("*").limit(1).execute()
            if r.data:
                semanas_sta_validas = {k.replace("week_", "") for k in r.data[0] if k.startswith("week_")}
        except Exception:
            pass

        semana_ref_val = (
            int(df["Week"].dropna().mode().iloc[0])
            if "Week" in df.columns and not df["Week"].dropna().empty
            else 0
        )

        # ── Cria upload ──────────────────────────────────────────
        up = sb.table("reclamacoes_uploads").insert({
            "data_ref":    data_ref.isoformat(),
            "n_registros": len(df),
            "n_sup":       int(agg_sup["Supervisor"].nunique()),
            "n_sta":       int(agg_sta["Inventory Station"].nunique()),
            "n_mot":       int(df["Motorista"].notna().sum()),
            "semana_ref":  semana_ref_val,
        }).execute()
        uid = up.data[0]["id"]

        # ── Por Supervisor ───────────────────────────────────────
        if not tbl_sup.empty:
            rows_sup = []
            for _, r in tbl_sup.iterrows():
                if str(r.get("Supervisor", "")) == "TOTAL":
                    continue
                row = {
                    "upload_id":  uid,
                    "supervisor": str(r["Supervisor"]),
                    "dia_total":  int(r.get(list(tbl_sup.columns)[1], 0) or 0),
                    "mes_total":  int(r.get("Qt Mês", 0) or 0),
                }
                for wc in week_cols_sup:
                    num = wc.replace("Qt Week ", "").strip()
                    if num in semanas_sup_validas:
                        row[f"week_{num}"] = int(r.get(wc, 0) or 0)
                rows_sup.append(row)
            if rows_sup:
                sb.table("reclamacoes_por_supervisor").insert(rows_sup).execute()

        # ── Por Station ──────────────────────────────────────────
        if not tbl_ds.empty:
            rows_sta = []
            for _, r in tbl_ds.iterrows():
                if str(r.get("DS", "")) == "TOTAL":
                    continue
                row = {
                    "upload_id":  uid,
                    "station":    str(r["DS"]),
                    "supervisor": str(r.get("SUPERVISOR", "") or ""),
                    "dia_total":  int(r.get(list(tbl_ds.columns)[2], 0) or 0),
                    "mes_total":  int(r.get("Qt Mês", 0) or 0),
                }
                for wc in week_cols_ds:
                    num = wc.replace("Qt Week ", "").strip()
                    if num in semanas_sta_validas:
                        row[f"week_{num}"] = int(r.get(wc, 0) or 0)
                rows_sta.append(row)
            if rows_sta:
                sb.table("reclamacoes_por_station").insert(rows_sta).execute()

        # ── Top 5 Motoristas ─────────────────────────────────────
        if not top5.empty:
            sb.table("reclamacoes_top5").insert([
                {
                    "upload_id":    uid,
                    "motorista":    str(r["Motorista"]),
                    "id_motorista": str(r.get("ID Motorista", "") or ""),
                    "ds":           str(r.get("DS", "") or ""),
                    "supervisor":   str(r.get("Supervisor", "") or ""),
                    "total":        int(r["Qtd Reclamações"]),
                }
                for _, r in top5.iterrows()
            ]).execute()

        return {
            "upload_id":   uid,
            "data_ref":    data_ref.isoformat(),
            "n_registros": len(df),
            "n_sup":       int(agg_sup["Supervisor"].nunique()),
            "n_sta":       int(agg_sta["Inventory Station"].nunique()),
            "n_mot":       int(df["Motorista"].notna().sum()),
            "top5":        top5.to_dict(orient="records") if not top5.empty else [],
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Erro ao processar: {exc}") from exc

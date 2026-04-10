#!/usr/bin/env python3
"""
subir_historico.py — Carga histórica em lote para o iMile Dashboard
=====================================================================
Autentica na API, detecta quais datas já estão no banco e envia apenas
os arquivos novos, respeitando o rate limit (5/min por endpoint).

Uso:
    python subir_historico.py --api imile-react-production.up.railway.app \
        --email rafael.santos@imile.me --senha Batatinha@26 \
        --backlog     "C:/E2E/SLA BACKLOG" \
        --na          "C:/E2E/有发未到" \
        --not-arrived "C:/E2E/Problem Registration"

Argumentos opcionais por módulo (pode omitir módulos não usados):
    --backlog       pasta com arquivos Backlog SLA (.xlsx)
    --na            pasta com arquivos Not Arrived (.xlsx)
    --not-arrived   pasta com arquivos Problem Registration (.xlsx)
    --notracking    pasta com arquivos No Tracking (.xlsx)
    --reclamacoes   pasta com arquivos Reclamações (.xlsx)
    --extravios     pasta com arquivos Extravios (.xlsx)

Flags:
    --dry-run       lista o que seria enviado sem enviar nada
    --delay N       segundos entre uploads (padrão: 13 — 4~5 por min)
    --retries N     tentativas em caso de rate limit (padrão: 4)
"""

import argparse
import io
import os
import sys
import time
from datetime import datetime, date
from pathlib import Path

import pandas as pd
import requests


# ── Extração de data_ref por módulo ──────────────────────────────


def _data_ref_backlog(path: Path) -> str | None:
    """Lê lastScanTime do Backlog Details e retorna a data máxima."""
    try:
        xl = pd.ExcelFile(path)
        aba = next(
            (a for a in xl.sheet_names if a.lower().replace(" ", "_") == "backlog_details"),
            None,
        )
        if not aba:
            return None
        col = pd.read_excel(path, sheet_name=aba, usecols=["lastScanTime"])["lastScanTime"]
        if pd.api.types.is_float_dtype(col) or pd.api.types.is_integer_dtype(col):
            datas = pd.to_datetime(col, unit="D", origin="1899-12-30", errors="coerce").dropna()
        else:
            datas = pd.to_datetime(col, errors="coerce").dropna()
        if not datas.empty:
            return datas.dt.date.max().isoformat()
    except Exception as e:
        print(f"    [aviso] não foi possível ler data de {path.name}: {e}")
    return None


def _data_ref_na(path: Path) -> str | None:
    """Lê coluna 日期 da aba Export."""
    try:
        col = pd.read_excel(path, sheet_name="Export", usecols=["日期"])["日期"]
        datas = pd.to_datetime(col, errors="coerce").dropna()
        if not datas.empty:
            return datas.dt.date.max().isoformat()
    except Exception as e:
        print(f"    [aviso] não foi possível ler data de {path.name}: {e}")
    return None


def _data_ref_not_arrived(path: Path) -> str | None:
    """Lê coluna 日期 das abas 数据源 e Planilha1."""
    try:
        xl = pd.ExcelFile(path)
        frames = []
        for aba in ("数据源", "Planilha1"):
            if aba in xl.sheet_names:
                try:
                    frames.append(pd.read_excel(path, sheet_name=aba, usecols=["日期"]))
                except Exception:
                    pass
        if not frames:
            return None
        col = pd.concat(frames)["日期"]
        datas = pd.to_datetime(col, errors="coerce").dropna()
        if not datas.empty:
            return datas.dt.date.max().isoformat()
    except Exception as e:
        print(f"    [aviso] não foi possível ler data de {path.name}: {e}")
    return None


def _data_ref_monitoramento(path: Path) -> str | None:
    """Extrai data_ref do cabeçalho da aba Relatorio (ex: '20-02 DS' → 2026-02-20)."""
    import re as _re
    from datetime import date as _d
    try:
        df = pd.read_excel(path, sheet_name="Relatorio", header=0, nrows=0)
        first_col = str(df.columns[0]).strip() if len(df.columns) else ""
        if not first_col:
            return None
        try:
            ts = pd.Timestamp(first_col)
            if not pd.isna(ts):
                return ts.date().isoformat()
        except Exception:
            pass
        m = _re.search(r"(\d{4}-\d{2}-\d{2})", first_col)
        if m:
            return m.group(1)
        m = _re.search(r"(\d{1,2})-(\d{1,2})", first_col)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            try:
                return _d(_d.today().year, month, day).isoformat()
            except ValueError:
                pass
    except Exception as e:
        print(f"    [aviso] não foi possível ler data de {path.name}: {e}")
    return None


def _data_ref_generic_日期(path: Path) -> str | None:
    """Tenta ler coluna 日期 de qualquer aba."""
    try:
        xl = pd.ExcelFile(path)
        for aba in xl.sheet_names:
            try:
                df = pd.read_excel(path, sheet_name=aba, nrows=5)
                if "日期" in df.columns:
                    col = pd.read_excel(path, sheet_name=aba, usecols=["日期"])["日期"]
                    datas = pd.to_datetime(col, errors="coerce").dropna()
                    if not datas.empty:
                        return datas.dt.date.max().isoformat()
            except Exception:
                pass
    except Exception as e:
        print(f"    [aviso] não foi possível ler data de {path.name}: {e}")
    return None


# ── Configuração dos módulos ──────────────────────────────────────

MODULES = {
    "monitoramento": {
        "label":         "Monitoramento Diário",
        "endpoint":      "/api/monitoramento/processar",
        "uploads_url":   "/api/monitoramento/uploads",
        "date_fn":       _data_ref_monitoramento,
        "date_field":    "data_ref",
    },
    "backlog": {
        "label":         "Backlog SLA",
        "endpoint":      "/api/backlog/processar",
        "uploads_url":   "/api/backlog/uploads",
        "date_fn":       _data_ref_backlog,
        "date_field":    "data_ref",
    },
    "na": {
        "label":         "Not Arrived (有发未到)",
        "endpoint":      "/api/na/processar",
        "uploads_url":   "/api/na/uploads",
        "date_fn":       _data_ref_na,
        "date_field":    "data_ref",
    },
    "not-arrived": {
        "label":         "Not Arrived com Movimentação",
        "endpoint":      "/api/not-arrived/processar",
        "uploads_url":   "/api/not-arrived/uploads",
        "date_fn":       _data_ref_not_arrived,
        "date_field":    "data_ref",
    },
    "notracking": {
        "label":         "No Tracking (断更)",
        "endpoint":      "/api/notracking/processar",
        "uploads_url":   "/api/notracking/uploads",
        "date_fn":       _data_ref_generic_日期,
        "date_field":    "data_ref",
    },
    "reclamacoes": {
        "label":         "Reclamações",
        "endpoint":      "/api/reclamacoes/processar",
        "uploads_url":   "/api/reclamacoes/uploads",
        "date_fn":       _data_ref_generic_日期,
        "date_field":    "data_ref",
    },
    "extravios": {
        "label":         "Extravios",
        "endpoint":      "/api/extravios/processar",
        "uploads_url":   "/api/extravios/uploads",
        "date_fn":       _data_ref_generic_日期,
        "date_field":    "data_ref",
    },
}


# ── Sessão autenticada ────────────────────────────────────────────

def autenticar(api: str, email: str, senha: str) -> requests.Session:
    sess = requests.Session()
    sess.headers["Accept"] = "application/json"
    r = sess.post(f"{api}/api/auth/login", json={"email": email, "password": senha}, timeout=30)
    if r.status_code != 200:
        print(f"[ERRO] Login falhou ({r.status_code}): {r.text[:200]}")
        sys.exit(1)
    token = r.json().get("access_token")
    if not token:
        print(f"[ERRO] Token não encontrado na resposta: {r.text[:200]}")
        sys.exit(1)
    sess.headers["Authorization"] = f"Bearer {token}"
    print("[OK] Autenticado com sucesso.")
    return sess


def buscar_datas_existentes(sess: requests.Session, api: str, uploads_url: str) -> set[str]:
    """Retorna conjunto de data_ref já existentes no banco para este módulo."""
    try:
        r = sess.get(f"{api}{uploads_url}", timeout=30)
        if r.status_code == 200:
            dados = r.json()
            # A maioria retorna lista de dicts com campo data_ref
            if isinstance(dados, list):
                return {str(d.get("data_ref", "")) for d in dados if d.get("data_ref")}
    except Exception as e:
        print(f"    [aviso] não foi possível buscar uploads existentes: {e}")
    return set()


def upload_arquivo(
    sess: requests.Session,
    api: str,
    endpoint: str,
    path: Path,
    retries: int = 4,
    delay: int = 13,
) -> bool:
    """Envia o arquivo, com retry automático em rate limit (429)."""
    url = f"{api}{endpoint}?skip_if_exists=true"
    for attempt in range(retries):
        try:
            with open(path, "rb") as f:
                r = sess.post(url, files={"file": (path.name, f)}, timeout=600)
            if r.status_code == 200:
                data = r.json()
                if data.get("skipped"):
                    print(f"    [PULADO] {path.name} — já existe (data_ref={data.get('data_ref')})")
                else:
                    print(f"    [OK] {path.name} — upload_id={data.get('upload_id')} data_ref={data.get('data_ref')}")
                return True
            elif r.status_code == 429:
                wait = delay + 2
                print(f"    [429] Rate limit — aguardando {wait}s (tentativa {attempt+1}/{retries})…")
                time.sleep(wait)
                continue
            else:
                msg = r.json().get("detail", r.text[:200]) if r.headers.get("content-type", "").startswith("application/json") else r.text[:200]
                print(f"    [ERRO {r.status_code}] {path.name} — {msg}")
                return False
        except Exception as e:
            print(f"    [ERRO] {path.name} — {e}")
            return False
    print(f"    [ERRO] {path.name} — falhou após {retries} tentativas.")
    return False


# ── Loop principal ────────────────────────────────────────────────

def processar_modulo(
    mod_id: str,
    pasta: Path,
    sess: requests.Session,
    api: str,
    dry_run: bool,
    delay: int,
    retries: int,
):
    cfg = MODULES[mod_id]
    print(f"\n{'='*60}")
    print(f"Módulo: {cfg['label']}")
    print(f"Pasta:  {pasta}")
    print(f"{'='*60}")

    arquivos = sorted(pasta.glob("*.xlsx")) + sorted(pasta.glob("*.xlsm"))
    if not arquivos:
        print("  Nenhum arquivo .xlsx/.xlsm encontrado.")
        return

    # Mapeia arquivo → data_ref local
    mapeados: list[tuple[Path, str | None]] = []
    print(f"  Lendo datas de {len(arquivos)} arquivo(s)…")
    for arq in arquivos:
        dr = cfg["date_fn"](arq)
        mapeados.append((arq, dr))
        label = dr if dr else "(data não detectada)"
        print(f"    {arq.name:60s} → {label}")

    if dry_run:
        print("  [dry-run] Nenhum arquivo enviado.")
        return

    # Busca datas já no banco
    existentes = buscar_datas_existentes(sess, api, cfg["uploads_url"])
    if existentes:
        print(f"  Datas já no banco: {sorted(existentes)}")
    else:
        print("  Nenhuma data encontrada no banco (ou endpoint indisponível).")

    # Filtra e envia
    enviados = erros = pulados = 0
    for i, (arq, dr) in enumerate(mapeados):
        if dr and dr in existentes:
            print(f"  [SKIP] {arq.name} — data_ref={dr} já existe no banco.")
            pulados += 1
            continue

        print(f"  Enviando [{i+1}/{len(mapeados)}] {arq.name}…")
        ok = upload_arquivo(sess, api, cfg["endpoint"], arq, retries=retries, delay=delay)
        if ok:
            enviados += 1
            if dr:
                existentes.add(dr)
        else:
            erros += 1

        # Pausa entre uploads para não atingir rate limit
        if i < len(mapeados) - 1:
            time.sleep(delay)

    print(f"\n  Resumo: {enviados} enviados, {pulados} pulados, {erros} erros.")


def main():
    parser = argparse.ArgumentParser(description="Carga histórica iMile Dashboard")
    parser.add_argument("--api",          required=True,  help="URL base da API (ex: https://xxx.railway.app)")
    parser.add_argument("--email",        required=True,  help="E-mail de login")
    parser.add_argument("--senha",        required=True,  help="Senha de login")
    parser.add_argument("--monitoramento", help="Pasta com arquivos Monitoramento Diário")
    parser.add_argument("--backlog",      help="Pasta com arquivos Backlog SLA")
    parser.add_argument("--na",           help="Pasta com arquivos Not Arrived")
    parser.add_argument("--not-arrived",  help="Pasta com arquivos Problem Registration", dest="not_arrived")
    parser.add_argument("--notracking",   help="Pasta com arquivos No Tracking")
    parser.add_argument("--reclamacoes",  help="Pasta com arquivos Reclamações")
    parser.add_argument("--extravios",    help="Pasta com arquivos Extravios")
    parser.add_argument("--dry-run",      action="store_true", help="Apenas lista os arquivos, não envia nada")
    parser.add_argument("--delay",        type=int, default=13, help="Segundos entre uploads (padrão: 13)")
    parser.add_argument("--retries",      type=int, default=4,  help="Tentativas em rate limit (padrão: 4)")
    args = parser.parse_args()

    pastas = {
        "monitoramento": args.monitoramento,
        "backlog":      args.backlog,
        "na":           args.na,
        "not-arrived":  args.not_arrived,
        "notracking":   args.notracking,
        "reclamacoes":  args.reclamacoes,
        "extravios":    args.extravios,
    }

    # Valida pastas informadas
    validas = {}
    for mod_id, pasta_str in pastas.items():
        if not pasta_str:
            continue
        p = Path(pasta_str)
        if not p.is_dir():
            print(f"[ERRO] Pasta não encontrada: {pasta_str}")
            sys.exit(1)
        validas[mod_id] = p

    if not validas:
        print("[ERRO] Nenhuma pasta de módulo informada. Use --backlog, --na, --not-arrived, etc.")
        parser.print_help()
        sys.exit(1)

    api = args.api.rstrip("/")

    if args.dry_run:
        print("[dry-run] Modo simulação — nenhum arquivo será enviado.")
        sess = None
    else:
        sess = autenticar(api, args.email, args.senha)

    for mod_id, pasta in validas.items():
        processar_modulo(
            mod_id=mod_id,
            pasta=pasta,
            sess=sess,
            api=api,
            dry_run=args.dry_run,
            delay=args.delay,
            retries=args.retries,
        )

    print("\nConcluído.")


if __name__ == "__main__":
    main()

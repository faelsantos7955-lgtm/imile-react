"""
Testes unitários para a lógica de leitura do Excel de Backlog SLA.
Não requerem banco de dados nem Supabase.
"""
import io
import pytest
import pandas as pd
from api.routes.backlog import _ler_excel


def _make_excel(sheets: dict) -> bytes:
    """Cria um Excel em memória com as abas fornecidas."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for name, df in sheets.items():
            df.to_excel(writer, sheet_name=name, index=False)
    return buf.getvalue()


DETAILS_COLS = [
    "waybillNo", "range_backlog", "process", "actual_region",
    "lastScanSite", "clientName", "stageStatus", "lastScanStatus", "CARGOS.SUPERVISOR",
]

RESUME_COLS = [
    "CARGOS.SUPERVISOR", "lastScanSite", "clientName", "actual region", "orders", "process",
]


def _details_df(n=3):
    return pd.DataFrame({
        "waybillNo":        [f"BR00{i}" for i in range(n)],
        "range_backlog":    ["1-3"] * n,
        "process":          ["DS"] * n,
        "actual_region":    ["SP"] * n,
        "lastScanSite":     ["DS-001"] * n,
        "clientName":       ["ClienteX"] * n,
        "stageStatus":      ["In Transit"] * n,
        "lastScanStatus":   ["Pending"] * n,
        "CARGOS.SUPERVISOR": ["João"] * n,
    })


def _resume_df(n=1):
    return pd.DataFrame({
        "CARGOS.SUPERVISOR": ["João"] * n,
        "lastScanSite":      ["DS-001"] * n,
        "clientName":        ["ClienteX"] * n,
        "actual region":     ["SP"] * n,
        "orders":            [10] * n,
        "process":           ["DS"] * n,
    })


def test_ler_excel_valido():
    """Arquivo correto com as duas abas deve ser lido sem erros."""
    excel = _make_excel({"Backlog_Details": _details_df(), "Resume_": _resume_df()})
    df, df_res = _ler_excel(excel)
    assert len(df) == 3
    assert "supervisor" in df.columns
    assert "ds" in df.columns
    assert "orders" in df_res.columns


def test_ler_excel_sem_backlog_details():
    """Deve levantar ValueError com mensagem clara quando falta a aba Backlog_Details."""
    excel = _make_excel({"Resume_": _resume_df(), "Dados": pd.DataFrame()})
    with pytest.raises(ValueError, match="Backlog_Details"):
        _ler_excel(excel)


def test_ler_excel_sem_resume():
    """Deve levantar ValueError com mensagem clara quando falta a aba Resume_."""
    excel = _make_excel({"Backlog_Details": _details_df(), "Outras": pd.DataFrame()})
    with pytest.raises(ValueError, match="Resume_"):
        _ler_excel(excel)


def test_ler_excel_arquivo_invalido():
    """Bytes aleatórios devem levantar ValueError de arquivo inválido."""
    with pytest.raises(ValueError, match="inválido"):
        _ler_excel(b"isso nao e um excel")


def test_ler_excel_coluna_obrigatoria_faltando():
    """Falta de coluna obrigatória em Backlog_Details deve levantar ValueError."""
    df_sem_process = _details_df().drop(columns=["process"])
    excel = _make_excel({"Backlog_Details": df_sem_process, "Resume_": _resume_df()})
    with pytest.raises(ValueError, match="process"):
        _ler_excel(excel)


def test_ler_excel_normaliza_supervisor():
    """O campo supervisor deve ser normalizado para uppercase."""
    df = _details_df()
    df["CARGOS.SUPERVISOR"] = ["joão silva"] * 3
    excel = _make_excel({"Backlog_Details": df, "Resume_": _resume_df()})
    result, _ = _ler_excel(excel)
    assert all(result["supervisor"] == "JOÃO SILVA")

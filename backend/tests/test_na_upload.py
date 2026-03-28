"""
Testes unitários para a lógica de processamento do relatório Not Arrived.
Não requerem banco de dados nem Supabase.
"""
import io
import pytest
import pandas as pd
from fastapi import HTTPException
from api.routes.na_upload import _processar


def _make_excel(sheets: dict) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for name, df in sheets.items():
            df.to_excel(writer, sheet_name=name, index=False)
    return buf.getvalue()


def _export_df(n=5, include_threshold=True):
    """Cria um DataFrame simulando a aba Export."""
    rows = {
        "Destination Station": [f"DS-00{i}" for i in range(n)],
        "Supervisor":           ["SUP A", "SUP A", "SUP B", "SUP B", "SUP B"][:n],
        "日期":                 ["2026-03-25", "2026-03-26", "2026-03-25", "2026-03-26", "2026-03-27"][:n],
        "Process":              ["Line Haul"] * n,
        "Situation":            ["Offloaded", "Arrive", "Offloaded", "Arrive", "Arrive"][:n],
    }
    df = pd.DataFrame(rows)
    if include_threshold:
        # Adiciona uma linha com valor de threshold inválido como data
        extra = pd.DataFrame({
            "Destination Station": ["DS-001"],
            "Supervisor":           ["SUP A"],
            "日期":                 ["大于10D"],
            "Process":              ["Line Haul"],
            "Situation":            ["Offloaded"],
        })
        df = pd.concat([df, extra], ignore_index=True)
    return df


def test_processar_basico():
    """Arquivo válido deve retornar resultado com totais corretos."""
    excel = _make_excel({"Export": _export_df(5, include_threshold=False)})
    resultado = _processar(excel)

    assert resultado["total"] == 5
    assert resultado["total_offload"] == 2
    assert resultado["total_arrive"] == 3
    assert len(resultado["por_supervisor"]) == 2
    assert len(resultado["por_ds"]) == 5


def test_processar_detecta_threshold():
    """Linhas com data inválida devem ser contadas como grande (大于10D)."""
    excel = _make_excel({"Export": _export_df(5, include_threshold=True)})
    resultado = _processar(excel)

    assert resultado["grd10d"] == 1
    assert resultado["threshold_col"] == "大于10D"


def test_processar_sem_aba_export():
    """Arquivo sem aba Export deve retornar 400."""
    excel = _make_excel({"Sheet1": pd.DataFrame({"col": [1, 2, 3]})})
    with pytest.raises(HTTPException) as exc_info:
        _processar(excel)
    assert exc_info.value.status_code == 400
    assert "Export" in exc_info.value.detail


def test_processar_sem_coluna_obrigatoria():
    """Falta de coluna obrigatória deve retornar 400."""
    df = _export_df(3, include_threshold=False).drop(columns=["Supervisor"])
    excel = _make_excel({"Export": df})
    with pytest.raises(HTTPException) as exc_info:
        _processar(excel)
    assert exc_info.value.status_code == 400


def test_processar_arquivo_invalido():
    """Bytes aleatórios devem levantar erro."""
    with pytest.raises(Exception):
        _processar(b"nao e um excel")


def test_processar_data_ref_correta():
    """data_ref deve ser a maior data válida no arquivo."""
    excel = _make_excel({"Export": _export_df(5, include_threshold=False)})
    resultado = _processar(excel)
    assert resultado["data_ref"] == "2026-03-27"


def test_processar_normaliza_supervisor():
    """Supervisor deve ser normalizado para uppercase."""
    df = _export_df(3, include_threshold=False)
    df["Supervisor"] = ["sup minusculo"] * 3
    excel = _make_excel({"Export": df})
    resultado = _processar(excel)
    assert resultado["por_supervisor"][0]["supervisor"] == "SUP MINUSCULO"


def test_processar_ignora_linhas_invalidas():
    """Linhas com DS ou supervisor vazios devem ser ignoradas."""
    df = _export_df(3, include_threshold=False)
    df.loc[0, "Destination Station"] = ""
    df.loc[1, "Supervisor"] = "nan"
    excel = _make_excel({"Export": df})
    resultado = _processar(excel)
    # Apenas 1 linha válida deve sobrar
    assert resultado["total"] == 1


def test_processar_por_processo():
    """por_processo deve agrupar corretamente por tipo de processo."""
    df = _export_df(4, include_threshold=False)
    df["Process"] = ["Line Haul", "Line Haul", "Crossdocking", "Line Haul"]
    excel = _make_excel({"Export": df})
    resultado = _processar(excel)
    processos = {r["processo"]: r["total"] for r in resultado["por_processo"]}
    assert processos["Line Haul"] == 3
    assert processos["Crossdocking"] == 1

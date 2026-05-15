"""
api/upload_utils.py — Helpers de validação e persistência de uploads
"""
import logging
from typing import Iterable, Sequence

from fastapi import HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

EXTENSOES_PERMITIDAS = {".xlsx", ".xls", ".xlsm"}
TAMANHO_MAX_BYTES    = 150 * 1024 * 1024  # 150 MB


def detectar_aba(xl, colunas: set[str], threshold: float = 0.4) -> str | None:
    """
    Varre todas as abas do ExcelFile e retorna a que tem maior sobreposição
    com `colunas`. Retorna None se nenhuma atingir o threshold.
    Caso de empate: usa a primeira na ordem do arquivo.
    """
    import pandas as pd  # import local — módulo nem sempre está disponível

    melhor_aba: str | None = None
    melhor_score: float = threshold - 0.001

    for nome in xl.sheet_names:
        try:
            header = xl.parse(nome, nrows=0)
            cols = {str(c).strip() for c in header.columns}
            score = len(colunas & cols) / len(colunas) if colunas else 0
            if score > melhor_score:
                melhor_score = score
                melhor_aba = nome
        except Exception:
            continue

    return melhor_aba


async def validar_arquivo(arquivo: UploadFile, obrigatorio: bool = True) -> bytes | None:
    """
    Valida extensão e tamanho de um UploadFile.
    Lê e retorna os bytes do arquivo.
    Lança HTTPException 400 se inválido.
    Retorna None se o arquivo for None e não for obrigatório.
    """
    if arquivo is None:
        if obrigatorio:
            raise HTTPException(400, "Arquivo obrigatório não enviado.")
        return None

    ext = "." + arquivo.filename.rsplit(".", 1)[-1].lower() if "." in arquivo.filename else ""
    if ext not in EXTENSOES_PERMITIDAS:
        raise HTTPException(
            400,
            f'Arquivo "{arquivo.filename}" inválido. Permitido: {", ".join(sorted(EXTENSOES_PERMITIDAS))}',
        )

    conteudo = await arquivo.read()
    if len(conteudo) > TAMANHO_MAX_BYTES:
        raise HTTPException(
            400,
            f'Arquivo "{arquivo.filename}" muito grande '
            f'({len(conteudo)/1024/1024:.1f} MB). Máximo: 150 MB.',
        )
    if len(conteudo) == 0:
        raise HTTPException(400, f'Arquivo "{arquivo.filename}" está vazio.')

    return conteudo


async def validar_varios(arquivos: list[UploadFile]) -> list[bytes]:
    """Valida e lê uma lista de arquivos obrigatórios."""
    return [await validar_arquivo(f) for f in arquivos]


# ─────────────────────────────────────────────────────────────
# Helpers de persistência — usados pelos handlers de upload que
# seguem o padrão "tabela_mae (1) → tabelas_filhas (N) por upload_id"
# ─────────────────────────────────────────────────────────────

def remover_upload_anterior(
    db: Session,
    log: logging.Logger,
    tabela_mae: str,
    tabelas_filhas: Sequence[str],
    data_ref,
    *,
    job_id: str | None = None,
) -> None:
    """
    Remove o upload existente para esta data_ref (se houver) junto com as linhas
    das tabelas_filhas referenciando-o. Idempotente: se a tabela filha não tem
    linhas (ou nem existe), faz rollback do erro e segue para a próxima.

    `job_id` é opcional — se passado, aparece no prefix do log para correlação.
    """
    existing = db.execute(
        text(f"SELECT id FROM {tabela_mae} WHERE data_ref = :dr"),
        {"dr": data_ref},
    ).mappings().first()
    if not existing:
        return
    old_id = existing["id"]
    prefix = f"[job:{job_id}] " if job_id else ""
    for tbl in tabelas_filhas:
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
        except SQLAlchemyError as e:
            log.warning("%sfalha ao limpar %s para upload antigo %s: %s", prefix, tbl, old_id, e)
            db.rollback()
    db.execute(text(f"DELETE FROM {tabela_mae} WHERE id = :id"), {"id": old_id})
    db.commit()


def deletar_upload_handler(
    db: Session,
    log: logging.Logger,
    tabela_mae: str,
    tabelas_filhas: Sequence[str],
    upload_id: int,
) -> None:
    """
    Para uso em endpoints DELETE /upload/{upload_id}: apaga linhas filhas e
    depois a mãe, levantando HTTPException 500 (preservando o erro original
    via `from`) se algo falhar.
    """
    for tbl in tabelas_filhas:
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
        except SQLAlchemyError as e:
            log.exception("[delete:%d] falha ao deletar de %s", upload_id, tbl)
            db.rollback()
            raise HTTPException(500, f"Erro ao deletar {tbl}") from e
    db.execute(text(f"DELETE FROM {tabela_mae} WHERE id = :id"), {"id": upload_id})
    db.commit()


def bulk_insert(
    db: Session,
    tabela: str,
    rows: list[dict],
    colunas: Iterable[str],
    batch_size: int = 1000,
) -> None:
    """
    INSERT em batches numa tabela, usando o conjunto fixo `colunas` (na ordem
    fornecida) para montar VALUES com placeholders. Faz commit ao final.

    Cada linha em `rows` deve conter todas as chaves listadas em `colunas`.
    """
    if not rows:
        return
    cols = list(colunas)
    col_names = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    sql = text(f"INSERT INTO {tabela} ({col_names}) VALUES ({placeholders})")
    for i in range(0, len(rows), batch_size):
        db.execute(sql, rows[i : i + batch_size])
    db.commit()


def execute_batch(
    db: Session,
    sql,
    rows: list[dict],
    batch_size: int = 1000,
) -> None:
    """
    Executa uma statement SQL pré-montada (ex.: INSERT ... ON CONFLICT ... ou UPDATE ...)
    em batches sobre `rows`. Faz commit ao final.

    Use isto quando precisar de algo mais elaborado que um INSERT puro
    (UPSERT, RETURNING, etc.) — `sql` deve ser um `text(...)` ou TextClause.
    """
    if not rows:
        return
    for i in range(0, len(rows), batch_size):
        db.execute(sql, rows[i : i + batch_size])
    db.commit()

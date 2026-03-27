"""
api/upload_utils.py — Helpers de validação de arquivos de upload
"""
from fastapi import HTTPException, UploadFile

EXTENSOES_PERMITIDAS = {".xlsx", ".xls", ".xlsm"}
TAMANHO_MAX_BYTES    = 150 * 1024 * 1024  # 150 MB


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

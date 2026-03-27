const EXTENSOES_PERMITIDAS = ['.xlsx', '.xls', '.xlsm']
const TAMANHO_MAX_MB = 150
const TAMANHO_MAX_BYTES = TAMANHO_MAX_MB * 1024 * 1024

/**
 * Valida um ou mais arquivos antes do upload.
 * @param {File|File[]} arquivos
 * @returns {string} mensagem de erro, ou '' se válido
 */
export function validarArquivos(arquivos) {
  const lista = Array.isArray(arquivos) ? arquivos : [arquivos]
  for (const arquivo of lista) {
    if (!arquivo) continue
    const ext = '.' + arquivo.name.split('.').pop().toLowerCase()
    if (!EXTENSOES_PERMITIDAS.includes(ext)) {
      return `Arquivo "${arquivo.name}" inválido. Permitido: ${EXTENSOES_PERMITIDAS.join(', ')}`
    }
    if (arquivo.size > TAMANHO_MAX_BYTES) {
      return `Arquivo "${arquivo.name}" muito grande (${(arquivo.size / 1024 / 1024).toFixed(1)} MB). Máximo: ${TAMANHO_MAX_MB} MB.`
    }
  }
  return ''
}

/**
 * useUploadFlow — hook que centraliza o ciclo de vida de uma página de upload:
 *   - lista de uploads (GET /api/{dataset}/uploads)
 *   - seleção do upload corrente (auto-seleciona o primeiro quando carrega)
 *   - detalhe do selecionado (GET /api/{dataset}/upload/{id})
 *   - download Excel (GET /api/excel/{dataset}/{id})
 *   - exclusão (DELETE /api/{dataset}/upload/{id}) — requer admin no backend
 *
 * Cada página passa `dataset` (ex: 'extravios', 'notracking', 'na', 'not-arrived')
 * e o nome amigável usado no nome do arquivo Excel (ex: 'Extravios').
 */
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../components/ui'
import api from './api'

export function useUploadFlow({ dataset, excelLabel, deleteConfirm, excelDataset }) {
  // `excelDataset` é opcional — usado quando o endpoint de excel não bate com `dataset`
  // (ex: not-arrived usa /api/excel/not-arrived-mov/{id})
  const excelPath = excelDataset || dataset
  const qc = useQueryClient()
  const [uploadSel, setUploadSel] = useState(null)
  const [baixando, setBaixando]   = useState(false)
  const [deletando, setDeletando] = useState(false)

  const uploadsKey  = [`${dataset}-uploads`]
  const detalheKey  = [`${dataset}-detalhe`, uploadSel]

  const { data: uploads = [], isLoading: loadingUps } = useQuery({
    queryKey: uploadsKey,
    queryFn: () => api.get(`/api/${dataset}/uploads`).then(r => r.data),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads, uploadSel])

  const { data: detalhe, isLoading: loadingDet } = useQuery({
    queryKey: detalheKey,
    queryFn: () => api.get(`/api/${dataset}/upload/${uploadSel}`).then(r => r.data),
    enabled: !!uploadSel,
  })

  const handleExcel = async () => {
    if (!uploadSel) return
    setBaixando(true)
    try {
      const r = await api.get(`/api/excel/${excelPath}/${uploadSel}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${excelLabel}_${uploads.find(u => u.id === uploadSel)?.data_ref || 'relatorio'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.erro('Erro ao gerar Excel.')
    } finally {
      setBaixando(false)
    }
  }

  const deletar = async () => {
    if (!uploadSel) return
    if (!window.confirm(deleteConfirm || `Excluir este upload?`)) return
    setDeletando(true)
    try {
      await api.delete(`/api/${dataset}/upload/${uploadSel}`)
      qc.invalidateQueries({ queryKey: uploadsKey })
      setUploadSel(null)
    } catch {
      toast.erro('Erro ao excluir.')
    } finally {
      setDeletando(false)
    }
  }

  return {
    uploads,
    uploadSel,
    setUploadSel,
    detalhe,
    loading: loadingUps || (!!uploadSel && loadingDet),
    handleExcel,
    deletar,
    baixando,
    deletando,
    invalidateUploads: () => qc.invalidateQueries({ queryKey: uploadsKey }),
  }
}

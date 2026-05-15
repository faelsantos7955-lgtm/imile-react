/**
 * UploadCard — área de upload inline (drop-card) com polling de job.
 *
 * Recebe `dataset` (mesmo valor passado a useUploadFlow) e gerencia internamente:
 * upload do arquivo, polling de job e invalidação da lista.
 *
 * Para personalizar visualmente, passe `icon`, `colorClass`, `title` e `hint`.
 */
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Loader } from 'lucide-react'
import api, { pollJob } from '../lib/api'

export default function UploadCard({
  dataset,
  inputId,
  title,
  hint,
  icon: Icon = Upload,
  colorClass = 'bg-imile-600 hover:bg-imile-700',
  onSuccess,
}) {
  const [uploading, setUploading] = useState(false)
  const [fase, setFase]           = useState('')
  const [erro, setErro]           = useState('')
  const inputRef = useRef(null)
  const qc = useQueryClient()

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(''); setFase(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post(
        `/api/${dataset}/processar`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      const job = data.job_id
        ? await pollJob(`/api/${dataset}/job/${data.job_id}`, setFase)
        : data
      qc.invalidateQueries({ queryKey: [`${dataset}-uploads`] })
      onSuccess?.(job.upload_id)
    } catch (err) {
      setErro(err?.response?.data?.detail || err.message || 'Erro ao processar o arquivo.')
    } finally {
      setUploading(false)
      setFase('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="card border-dashed border-2 border-slate-200 bg-slate-50">
      <div className="flex flex-col items-center gap-3 py-4">
        <Icon size={28} className="text-slate-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">{title}</p>
          {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          onChange={handleFile}
          className="hidden"
          id={inputId}
        />
        <label
          htmlFor={inputId}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
            ${uploading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : `${colorClass} text-white`}`}
        >
          {uploading
            ? <><Loader size={14} className="animate-spin" /> {fase || 'Processando...'}</>
            : <><Upload size={14} /> Enviar arquivo</>}
        </label>
        {erro && <p className="text-xs text-red-600 text-center max-w-sm">{erro}</p>}
      </div>
    </div>
  )
}

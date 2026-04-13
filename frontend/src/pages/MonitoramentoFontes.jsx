/**
 * pages/MonitoramentoFontes.jsx
 * Upload por fontes brutas para compor o Monitoramento Diário de Entregas.
 * Cada seção corresponde a uma pasta/tipo de arquivo que alimenta o relatório.
 */
import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Alert, toast } from '../components/ui'
import {
  UploadCloud, X, Loader2, PlayCircle, CheckCircle2,
  ExternalLink, Calendar,
} from 'lucide-react'
import clsx from 'clsx'

// ── Definição das fontes ──────────────────────────────────────
const FONTES = [
  {
    id: 'rdc',
    field: 'rdc',
    label: 'LoadingScan (RDC → DS)',
    hint: 'Arquivos LoadingScan*.xlsx — saída do RDC para as bases de distribuição',
    multiple: true,
    color: 'blue',
    icon: '🚚',
  },
  {
    id: 'recebidos',
    field: 'recebidos',
    label: 'Pacotes Recebidos Hoje',
    hint: 'Arquivos Arrival*.xlsx — recebimento nas DS (Scan Station)',
    multiple: true,
    color: 'teal',
    icon: '📥',
  },
  {
    id: 'expedidos',
    field: 'expedidos',
    label: 'Pacotes Expedidos de Hoje',
    hint: 'Arquivos "Out Of Delivery Scan List*.xlsx" — saída para entrega',
    multiple: true,
    color: 'amber',
    icon: '📤',
  },
  {
    id: 'estoque',
    field: 'estoque',
    label: 'Estoque (在途 / não fechados)',
    hint: 'Arquivos 网点首次到件未闭环*.xlsx — aba "details" com lastScanSite',
    multiple: true,
    color: 'orange',
    icon: '📦',
  },
  {
    id: 'assinaturas',
    field: 'assinaturas',
    label: 'Assinaturas / Entregas de Hoje',
    hint: 'Arquivos Delivered*.xlsx — pacotes com confirmação de entrega',
    multiple: true,
    color: 'emerald',
    icon: '✅',
  },
  {
    id: 'supervisores',
    field: 'supervisores',
    label: 'Supervisores (opcional)',
    hint: 'Gestão Operacional Supervisores.xlsx — mapeia SIGLA → Supervisor → Região',
    multiple: false,
    color: 'purple',
    icon: '👥',
    optional: true,
  },
]

const COLOR = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-300',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700' },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-300',    text: 'text-teal-700',    badge: 'bg-teal-100 text-teal-700' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-700',  badge: 'bg-orange-100 text-orange-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-300',  text: 'text-purple-700',  badge: 'bg-purple-100 text-purple-700' },
}

// ── Card por fonte ────────────────────────────────────────────
function FonteCard({ fonte, files, onAdd, onRemove, disabled }) {
  const inputRef = useRef(null)
  const c = COLOR[fonte.color]

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(xlsx|xlsm)$/i))
    if (dropped.length) onAdd(fonte.multiple ? dropped : [dropped[0]])
  }, [fonte.multiple, onAdd])

  return (
    <div className={clsx(
      'rounded-xl border bg-white overflow-hidden transition-all',
      files.length > 0 ? `border-2 ${c.border}` : 'border border-slate-200'
    )}>
      {/* Header */}
      <div className={clsx('flex items-center justify-between px-4 py-3', files.length > 0 ? c.bg : 'bg-slate-50')}>
        <div className="flex items-center gap-2">
          <span className="text-base">{fonte.icon}</span>
          <span className={clsx('text-sm font-semibold', files.length > 0 ? c.text : 'text-slate-600')}>
            {fonte.label}
          </span>
          {files.length > 0 && (
            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', c.badge)}>
              {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
            </span>
          )}
          {fonte.optional && files.length === 0 && (
            <span className="text-[10px] text-slate-400 font-medium">opcional</span>
          )}
        </div>
        {!disabled && (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white/70 transition"
          >
            <UploadCloud size={13} /> Selecionar
          </button>
        )}
      </div>

      {/* Dropzone + lista */}
      <div className="p-3 space-y-2">
        {!disabled && (
          <div
            className={clsx(
              'border-2 border-dashed rounded-lg px-3 py-3 text-center cursor-pointer transition-colors',
              files.length > 0 ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300 bg-slate-50'
            )}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={16} className={clsx('mx-auto mb-1', files.length > 0 ? c.text : 'text-slate-300')} />
            <p className="text-[11px] text-slate-500">
              Arraste ou <span className="text-imile-600 font-medium">clique para selecionar</span>
              {fonte.multiple ? ' (múltiplos arquivos)' : ''}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fonte.hint}</p>
            <input
              ref={inputRef}
              type="file"
              multiple={fonte.multiple}
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={e => {
                const picked = Array.from(e.target.files || [])
                if (picked.length) onAdd(fonte.multiple ? picked : [picked[0]])
                e.target.value = ''
              }}
            />
          </div>
        )}

        {files.length > 0 && (
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {files.map((file, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 group">
                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                <span className="flex-1 text-xs text-slate-700 truncate" title={file.name}>
                  {file.name}
                </span>
                {!disabled && (
                  <button
                    onClick={() => onRemove(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 transition"
                  >
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────
export default function MonitoramentoFontes() {
  const navigate = useNavigate()
  const [files,      setFiles]      = useState(() => Object.fromEntries(FONTES.map(f => [f.id, []])))
  const [dataRef,    setDataRef]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [erro,       setErro]       = useState('')
  const [resultado,  setResultado]  = useState(null)   // { upload_id, total_ds, data_ref }

  const totalFiles = FONTES.reduce((s, f) => s + files[f.id].length, 0)

  const addFiles = (fonteId, newFiles) => {
    setFiles(prev => {
      const fonte = FONTES.find(f => f.id === fonteId)
      if (fonte?.multiple) return { ...prev, [fonteId]: [...prev[fonteId], ...newFiles] }
      return { ...prev, [fonteId]: [newFiles[0]] }   // single file → substitui
    })
    setResultado(null)
    setErro('')
  }

  const removeFile = (fonteId, idx) => {
    setFiles(prev => ({ ...prev, [fonteId]: prev[fonteId].filter((_, i) => i !== idx) }))
  }

  const resetAll = () => {
    setFiles(Object.fromEntries(FONTES.map(f => [f.id, []])))
    setDataRef('')
    setResultado(null)
    setErro('')
  }

  const handleProcessar = async () => {
    if (!totalFiles) return
    setLoading(true)
    setErro('')
    setResultado(null)

    const form = new FormData()
    FONTES.forEach(fonte => {
      files[fonte.id].forEach(file => form.append(fonte.field, file))
    })
    if (dataRef) form.append('data_ref_manual', dataRef)

    try {
      const res = await api.post('/api/monitoramento/processar-fontes', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
      })
      setResultado(res.data)
      toast.ok(`Processado: ${res.data.total_ds} bases — data ${res.data.data_ref}`)
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Erro ao processar'
      setErro(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        icon="📊"
        title="Processar Monitoramento por Fontes"
        subtitle="Faça o upload de cada arquivo-fonte para compor automaticamente o relatório diário"
      />

      {/* Barra de ação */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 gap-4">
        <div className="flex items-center gap-3">
          <Calendar size={15} className="text-slate-400" />
          <label className="text-xs font-medium text-slate-600 shrink-0">Data de referência</label>
          <input
            type="date"
            value={dataRef}
            onChange={e => setDataRef(e.target.value)}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
            disabled={loading}
          />
          <span className="text-[10px] text-slate-400">
            (deixe em branco para detectar automaticamente pelos arquivos)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {resultado && (
            <button
              onClick={resetAll}
              className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              Limpar
            </button>
          )}
          <button
            onClick={handleProcessar}
            disabled={!totalFiles || loading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition',
              totalFiles && !loading
                ? 'bg-imile-500 text-white hover:bg-imile-600 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Processando…</>
              : <><PlayCircle size={13} /> {totalFiles ? `Processar ${totalFiles} arquivo${totalFiles > 1 ? 's' : ''}` : 'Selecione os arquivos'}</>
            }
          </button>
        </div>
      </div>

      {erro && <Alert type="warning">{erro}</Alert>}

      {/* Resultado */}
      {resultado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Relatório processado com sucesso!
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {resultado.total_ds} bases · data de referência: <strong>{resultado.data_ref}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/monitoramento')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition"
          >
            <ExternalLink size={13} /> Ver Dashboard
          </button>
        </div>
      )}

      {/* Grade de fontes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FONTES.map(fonte => (
          <FonteCard
            key={fonte.id}
            fonte={fonte}
            files={files[fonte.id]}
            onAdd={newFiles => addFiles(fonte.id, newFiles)}
            onRemove={idx => removeFile(fonte.id, idx)}
            disabled={loading}
          />
        ))}
      </div>

      <p className="text-[10px] text-slate-400 text-center">
        Cada fonte pode ter múltiplos arquivos (ex: vários LoadingScan do mesmo dia).
        O sistema agrega automaticamente todos os dados e gera o dashboard.
      </p>
    </div>
  )
}

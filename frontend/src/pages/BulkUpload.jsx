/**
 * pages/BulkUpload.jsx — Carga em Lote de arquivos históricos
 * Envia arquivos para cada módulo com paralelismo controlado (2 por vez),
 * retry automático em rate limit e opção de pular datas já no banco.
 */
import { useState, useRef, useCallback } from 'react'
import api from '../lib/api'
import {
  CheckCircle2, XCircle, Loader2, UploadCloud, FolderOpen,
  PlayCircle, RotateCcw, X, ChevronDown, ChevronUp, Clock, SkipForward,
} from 'lucide-react'
import clsx from 'clsx'

// ── Configuração dos módulos ──────────────────────────────────
const MODULES = [
  {
    id: 'monitoramento',
    label: 'Monitoramento Diário',
    endpoint: '/api/monitoramento/processar',
    uploadsUrl: '/api/monitoramento/uploads',
    field: 'file',
    hint: 'Monitoramento Diário de Entregas Novo.xlsx — Aba Relatorio',
    color: 'teal',
  },
  {
    id: 'backlog',
    label: 'Backlog SLA',
    endpoint: '/api/backlog/processar',
    uploadsUrl: '/api/backlog/uploads',
    field: 'file',
    hint: 'Ex: 全部客户超SLABacklog_*.xlsx — Abas: Backlog Details + resume',
    color: 'blue',
  },
  {
    id: 'notracking',
    label: 'No Tracking (断更)',
    endpoint: '/api/notracking/processar',
    uploadsUrl: '/api/notracking/uploads',
    field: 'file',
    hint: 'Ex: No tracking *.xlsx — Aba BD: Número da Etiqueta, Último status, Station…',
    color: 'amber',
  },
  {
    id: 'na',
    label: 'Not Arrived',
    endpoint: '/api/na/processar',
    uploadsUrl: '/api/na/uploads',
    field: 'file',
    hint: 'Arquivo 有发未到 — Aba Export: Destination Station, Supervisor, 日期…',
    color: 'orange',
  },
  {
    id: 'not-arrived',
    label: 'Not Arrived com Movimentação',
    endpoint: '/api/not-arrived/processar',
    uploadsUrl: '/api/not-arrived/uploads',
    field: 'file',
    hint: 'Problem Registration — Abas 数据源 (DC) + Planilha1 (DS)',
    color: 'red',
  },
  {
    id: 'reclamacoes',
    label: 'Reclamações',
    endpoint: '/api/reclamacoes/processar',
    uploadsUrl: '/api/reclamacoes/uploads',
    field: 'file',
    hint: 'Bilhete de reclamações — colunas Create Time, Station, SUPERVISOR…',
    color: 'purple',
  },
  {
    id: 'extravios',
    label: 'Extravios',
    endpoint: '/api/extravios/processar',
    uploadsUrl: '/api/extravios/uploads',
    field: 'file',
    hint: 'Controle Extravios Consolidado — Aba BD',
    color: 'rose',
  },
]

const COLOR = {
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700' },
  rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-700' },
}

// status: idle | uploading | success | error | waiting | skipped
const STATUS_ICON = {
  idle:      <span className="w-4 h-4 rounded-full border-2 border-slate-300 inline-block" />,
  uploading: <Loader2 size={16} className="animate-spin text-imile-500" />,
  success:   <CheckCircle2 size={16} className="text-green-500" />,
  error:     <XCircle size={16} className="text-red-500" />,
  waiting:   <Clock size={16} className="text-amber-400" />,
  skipped:   <SkipForward size={16} className="text-slate-400" />,
}

const CONCURRENCY = 2   // uploads simultâneos máximos

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function uploadFile(endpoint, field, file, skipIfExists, onStatus) {
  const form = new FormData()
  form.append(field, file)
  const url = skipIfExists ? `${endpoint}?skip_if_exists=true` : endpoint

  let attempts = 0
  while (attempts < 4) {
    try {
      onStatus('uploading')
      const res = await api.post(url, form, { timeout: 600_000 })
      if (res.data?.skipped) {
        onStatus('skipped', res.data)
      } else {
        onStatus('success', res.data)
      }
      return true
    } catch (err) {
      const status = err.response?.status
      if (status === 429) {
        attempts++
        if (attempts >= 4) {
          onStatus('error', 'Rate limit atingido após 4 tentativas.')
          return false
        }
        onStatus('waiting')
        await sleep(15000)
      } else {
        const msg = err.response?.data?.detail || err.message || 'Erro desconhecido'
        onStatus('error', typeof msg === 'string' ? msg : JSON.stringify(msg))
        return false
      }
    }
  }
  return false
}

// Executa tarefas com limite de concorrência
async function runConcurrent(tasks, concurrency) {
  const queue = [...tasks]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const task = queue.shift()
      if (task) await task()
    }
  })
  await Promise.all(workers)
}

// ── Componente de card por módulo ─────────────────────────────
function ModuleCard({ mod, files, onAddFiles, onRemoveFile, results, running, collapsed, onToggle }) {
  const inputRef = useRef()
  const c = COLOR[mod.color]
  const count   = files.length
  const ok      = results.filter(r => r.status === 'success').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const err     = results.filter(r => r.status === 'error').length

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(xlsx|xlsm)$/i))
    if (dropped.length) onAddFiles(dropped)
  }, [onAddFiles])

  return (
    <div className={clsx('rounded-xl border bg-white overflow-hidden', count > 0 ? 'border-slate-200' : 'border-slate-100')}>
      {/* Header */}
      <div
        className={clsx('flex items-center justify-between px-4 py-3 cursor-pointer select-none', count > 0 ? c.bg : 'bg-slate-50')}
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <span className={clsx('text-sm font-semibold', count > 0 ? c.text : 'text-slate-500')}>{mod.label}</span>
          {count > 0 && (
            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', c.badge)}>
              {count} {count === 1 ? 'arquivo' : 'arquivos'}
            </span>
          )}
          {ok > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{ok} ✓</span>}
          {skipped > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{skipped} pulados</span>}
          {err > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{err} ✗</span>}
        </div>
        <div className="flex items-center gap-2">
          {!running && (
            <button
              onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-2.5 py-1 rounded-lg hover:bg-white/70 transition"
            >
              <FolderOpen size={13} /> Selecionar
            </button>
          )}
          {collapsed ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronUp size={15} className="text-slate-400" />}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-3">
          {/* Dropzone */}
          {!running && (
            <div
              className={clsx(
                'border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer',
                count > 0 ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300 bg-slate-50'
              )}
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud size={20} className={clsx('mx-auto mb-1.5', count > 0 ? c.text : 'text-slate-300')} />
              <p className="text-xs text-slate-500">
                Arraste os arquivos ou <span className="text-imile-600 font-medium">clique para selecionar</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1">{mod.hint}</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".xlsx,.xlsm"
                className="hidden"
                onChange={e => {
                  const picked = Array.from(e.target.files || [])
                  if (picked.length) onAddFiles(picked)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {/* Lista de arquivos */}
          {count > 0 && (
            <ul className="space-y-1 max-h-48 overflow-y-auto">
              {files.map((file, i) => {
                const r = results[i] || {}
                return (
                  <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 group">
                    <span className="shrink-0">{STATUS_ICON[r.status || 'idle']}</span>
                    <span className="flex-1 text-xs text-slate-700 truncate" title={file.name}>{file.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {r.status === 'error' && (
                      <span className="text-[10px] text-red-500 truncate max-w-[160px]" title={r.msg}>{r.msg}</span>
                    )}
                    {r.status === 'skipped' && (
                      <span className="text-[10px] text-slate-400">já existe</span>
                    )}
                    {r.status === 'success' && r.data?.upload_id && (
                      <span className="text-[10px] text-green-600">id:{r.data.upload_id}</span>
                    )}
                    {!running && (r.status === 'idle' || !r.status) && (
                      <button onClick={() => onRemoveFile(i)} className="opacity-0 group-hover:opacity-100 transition p-0.5 text-slate-400 hover:text-red-400">
                        <X size={12} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────
export default function BulkUpload() {
  const [files,     setFiles]     = useState(() => Object.fromEntries(MODULES.map(m => [m.id, []])))
  const [results,   setResults]   = useState(() => Object.fromEntries(MODULES.map(m => [m.id, []])))
  const [running,   setRunning]   = useState(false)
  const [collapsed, setCollapsed] = useState(() => Object.fromEntries(MODULES.map(m => [m.id, false])))
  const [progress,  setProgress]  = useState({ current: 0, total: 0 })
  const [done,      setDone]      = useState(false)
  const [skipExisting, setSkipExisting] = useState(false)
  const abortRef = useRef(false)

  const totalFiles = MODULES.reduce((s, m) => s + files[m.id].length, 0)

  const addFiles = (modId, newFiles) => {
    setFiles(prev => ({ ...prev, [modId]: [...prev[modId], ...newFiles] }))
    setResults(prev => ({ ...prev, [modId]: [...prev[modId], ...newFiles.map(() => ({ status: 'idle' }))] }))
    setDone(false)
  }

  const removeFile = (modId, idx) => {
    setFiles(prev => ({ ...prev, [modId]: prev[modId].filter((_, i) => i !== idx) }))
    setResults(prev => ({ ...prev, [modId]: prev[modId].filter((_, i) => i !== idx) }))
  }

  const resetAll = () => {
    setFiles(Object.fromEntries(MODULES.map(m => [m.id, []])))
    setResults(Object.fromEntries(MODULES.map(m => [m.id, []])))
    setProgress({ current: 0, total: 0 })
    setDone(false)
  }

  const setFileResult = (modId, idx, status, data) => {
    setResults(prev => {
      const arr = [...prev[modId]]
      arr[idx] = {
        status,
        msg:  typeof data === 'string' ? data : undefined,
        data: typeof data === 'object' ? data : undefined,
      }
      return { ...prev, [modId]: arr }
    })
  }

  const handleStart = async () => {
    if (!totalFiles) return
    abortRef.current = false
    setRunning(true)
    setDone(false)

    const total = totalFiles
    let current = 0
    setProgress({ current: 0, total })

    // Monta lista plana de tarefas
    const tasks = []
    for (const mod of MODULES) {
      const modFiles = files[mod.id]
      for (let i = 0; i < modFiles.length; i++) {
        const idx = i
        const m   = mod
        tasks.push(async () => {
          if (abortRef.current) return
          await uploadFile(
            m.endpoint,
            m.field,
            modFiles[idx],
            skipExisting,
            (status, data) => setFileResult(m.id, idx, status, data),
          )
          current++
          setProgress({ current, total })
        })
      }
    }

    await runConcurrent(tasks, CONCURRENCY)

    setRunning(false)
    setDone(true)
  }

  const handleStop = () => { abortRef.current = true }

  const allResults   = MODULES.flatMap(m => results[m.id])
  const successCount = allResults.filter(r => r.status === 'success').length
  const skippedCount = allResults.filter(r => r.status === 'skipped').length
  const errorCount   = allResults.filter(r => r.status === 'error').length
  const pct = progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* Header + ações */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Carga em Lote</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecione os arquivos históricos de cada módulo e processe todos de uma vez.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle skip_if_exists */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => !running && setSkipExisting(v => !v)}
              className={clsx(
                'relative w-9 h-5 rounded-full transition-colors',
                skipExisting ? 'bg-imile-500' : 'bg-slate-300',
                running && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  skipExisting && 'translate-x-4'
                )}
              />
            </div>
            <span className="text-xs text-slate-600 font-medium">Pular datas já no banco</span>
          </label>

          {done && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              <RotateCcw size={13} /> Nova carga
            </button>
          )}
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
            >
              <X size={13} /> Cancelar
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!totalFiles || done}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition',
                totalFiles && !done
                  ? 'bg-imile-500 text-white hover:bg-imile-600 shadow-sm'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            >
              <PlayCircle size={13} />
              {totalFiles ? `Processar ${totalFiles} arquivo${totalFiles > 1 ? 's' : ''}` : 'Selecione arquivos'}
            </button>
          )}
        </div>
      </div>

      {/* Barra de progresso */}
      {(running || done) && progress.total > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">
              {running
                ? `Processando ${progress.current} de ${progress.total}…`
                : `Concluído — ${progress.current} de ${progress.total}`}
            </span>
            <span className="text-xs font-bold text-slate-700">{pct}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', done ? 'bg-green-500' : 'bg-imile-500')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {done && (
            <div className="flex gap-3 mt-2.5">
              {successCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <CheckCircle2 size={13} /> {successCount} sucesso{successCount > 1 ? 's' : ''}
                </span>
              )}
              {skippedCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                  <SkipForward size={13} /> {skippedCount} pulado{skippedCount > 1 ? 's' : ''}
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                  <XCircle size={13} /> {errorCount} erro{errorCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cards por módulo */}
      <div className="space-y-3">
        {MODULES.map(mod => (
          <ModuleCard
            key={mod.id}
            mod={mod}
            files={files[mod.id]}
            results={results[mod.id]}
            running={running}
            collapsed={collapsed[mod.id]}
            onToggle={() => setCollapsed(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
            onAddFiles={newFiles => addFiles(mod.id, newFiles)}
            onRemoveFile={idx => removeFile(mod.id, idx)}
          />
        ))}
      </div>

      {/* Dica */}
      <p className="text-[10px] text-slate-400 text-center">
        {CONCURRENCY} uploads simultâneos. Em rate limit (429), aguarda 15s e tenta novamente.
        {skipExisting ? ' Arquivos com data já no banco são pulados.' : ' Datas já existentes serão substituídas.'}
      </p>
    </div>
  )
}

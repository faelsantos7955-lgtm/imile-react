/**
 * pages/Triagem.jsx — Triagem DC×DS
 * LoadingScan × Arrival: expedido vs recebido, NOK recebido
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, Alert, toast } from '../components/ui'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import {
  Download, Upload, Trash2, CheckCircle, XCircle,
  ChevronRight, ChevronDown, Loader, X, FileUp, PackageCheck,
  List, Search, ChevronLeft,
} from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'

const COLOR_OK  = '#10b981'
const COLOR_NOK = '#ef4444'
const COLOR_REC = '#095EF7'
const COLOR_TOP = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']

// ── Painel de upload com LoadingScan + Arrival ────────────────
function UploadPanel({ onClose, onSuccess }) {
  // Cada arquivo tem: { file: File, isArrival: boolean }
  const [files, setFiles]         = useState([])
  const [fase, setFase]           = useState('')   // '' | 'enviando' | 'processando'
  const [progresso, setProgresso] = useState(0)    // 0-100, fase enviando
  const [erro, setErro]           = useState('')
  const inputRef = useRef()

  const uploading = fase !== ''

  const addFiles = (incoming) => {
    const err = validarArquivos(Array.from(incoming))
    if (err) { setErro(err); return }
    setErro('')
    setFiles(prev => {
      const names = new Set(prev.map(e => e.file.name))
      const novos = Array.from(incoming)
        .filter(f => !names.has(f.name))
        .map(f => ({ file: f, isArrival: false }))
      return [...prev, ...novos]
    })
  }

  const toggleArrival = (idx) =>
    setFiles(prev => prev.map((e, i) => i === idx ? { ...e, isArrival: !e.isArrival } : e))

  const removeFile = (idx) =>
    setFiles(prev => prev.filter((_, i) => i !== idx))

  const lsFiles  = files.filter(e => !e.isArrival).map(e => e.file)
  const arrFiles = files.filter(e =>  e.isArrival).map(e => e.file)

  const totalMB = files.reduce((s, e) => s + e.file.size, 0) / 1024 / 1024

  const FASE_LABELS = {
    iniciando:      'Iniciando...',
    lendo_arrival:  'Lendo Arrival...',
    lendo_ls:       'Lendo Loading Scan...',
    calculando:     'Calculando triagem...',
    salvando:       'Salvando no banco...',
    concluido:      'Concluído!',
  }

  const handleSubmit = async () => {
    if (!lsFiles.length) { setErro('Nenhum arquivo LoadingScan selecionado. Desmarque "Arrival" em pelo menos um arquivo.'); return }
    setFase('enviando'); setProgresso(0); setErro('')
    try {
      const form = new FormData()
      lsFiles.forEach(f  => form.append('files', f))
      arrFiles.forEach(f => form.append('files', f))
      form.append('arrival_count', String(arrFiles.length))

      // 1) Envia os arquivos — rastreia progresso real
      const res = await api.post('/api/triagem/processar', form, {
        timeout: 600_000,
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round(e.loaded / e.total * 100)
            setProgresso(pct)
            if (pct === 100) setFase('processando')
          }
        },
      })

      const { job_id } = res.data
      if (!job_id) { onSuccess(res.data.upload_id); return }

      // 2) Polling do job em background — sem timeout de conexão
      setFase('processando')
      const job = await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const { data: job } = await api.get(`/api/triagem/job/${job_id}`)
            if (job.fase) setProgresso(job.fase)
            if (job.status === 'done') {
              clearInterval(poll)
              resolve(job)
            } else if (job.status === 'error') {
              clearInterval(poll)
              reject(new Error(job.erro || 'Erro no processamento.'))
            }
          } catch (err) {
            clearInterval(poll)
            reject(err)
          }
        }, 2500)
      })

      setFase(''); setProgresso(0)
      onSuccess(job.upload_id)

    } catch (e) {
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        setErro('Tempo limite excedido no envio. Tente novamente.')
      } else {
        setErro(e.response?.data?.detail || e.message || 'Erro ao processar.')
      }
      setFase(''); setProgresso(0)
    }
  }

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-xl p-5 animate-scale">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800">Novo Upload de Triagem</p>
        <button onClick={onClose} disabled={uploading} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><X size={16} /></button>
      </div>

      {/* Zona única de seleção */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (!uploading) addFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all mb-4 ${
          uploading
            ? 'border-slate-100 bg-slate-50 cursor-default'
            : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/10 cursor-pointer'
        }`}
      >
        <Upload size={22} className="mx-auto mb-1.5 text-slate-300" />
        <p className="text-xs font-semibold text-slate-600">Clique ou arraste os arquivos aqui</p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          Selecione todos de uma vez — LoadingScan e Arrival juntos
        </p>
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* Lista de arquivos com toggle Arrival */}
      {files.length > 0 && !uploading && (
        <div className="space-y-1.5 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Arquivos selecionados — marque os que são <span className="text-emerald-600">Arrival</span>
          </p>
          {files.map((entry, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
              <FileUp size={13} className={entry.isArrival ? 'text-emerald-500' : 'text-imile-400'} />
              <span className="flex-1 text-xs text-slate-700 truncate min-w-0">{entry.file.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{(entry.file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                onClick={() => toggleArrival(i)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                  entry.isArrival
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:border-emerald-200 hover:text-emerald-600'
                }`}
              >
                <PackageCheck size={10} />
                {entry.isArrival ? 'Arrival' : 'LoadingScan'}
              </button>
              <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-400 transition-colors ml-1">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Resumo tamanho */}
      {files.length > 0 && !uploading && (
        <div className="flex gap-3 text-[11px] mb-3">
          <span className="px-2 py-0.5 bg-imile-50 text-imile-700 rounded-full font-medium">
            {lsFiles.length} LoadingScan
          </span>
          {arrFiles.length > 0 && (
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-medium">
              {arrFiles.length} Arrival
            </span>
          )}
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
            {totalMB.toFixed(1)} MB total
          </span>
        </div>
      )}

      {/* Barra de progresso */}
      {uploading && (
        <div className="mb-4">
          {fase === 'enviando' ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-600">Enviando arquivos...</span>
                <span className="text-xs font-bold text-imile-600">{progresso}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-imile-500 transition-all duration-200"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{totalMB.toFixed(1)} MB — aguarde o envio terminar</p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-slate-600">
                  {FASE_LABELS[progresso] || 'Processando no servidor...'}
                </span>
                <Loader size={12} className="animate-spin text-imile-500" />
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 rounded-full bg-imile-400 animate-pulse w-full" />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Processamento em background — sem risco de timeout</p>
            </>
          )}
        </div>
      )}

      {erro && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button onClick={onClose} disabled={uploading} className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40">Cancelar</button>
        <button onClick={handleSubmit} disabled={uploading || !files.length}
          className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50 transition-colors">
          {uploading
            ? <><Loader size={14} className="animate-spin" /> {fase === 'enviando' ? `Enviando ${progresso}%` : 'Processando...'}</>
            : <><Upload size={14} /> Processar</>
          }
        </button>
      </div>
    </div>
  )
}

// ── Modal de Detalhes por DS ──────────────────────────────────
function DetalhesModal({ uploadId, ds, temArrival, onClose }) {
  const [filtroStatus, setFiltroStatus]   = useState('')       // '' | 'nok' | 'fora'
  const [filtroReceb, setFiltroReceb]     = useState(null)     // null | true | false
  const [busca, setBusca]                 = useState('')
  const [buscaInput, setBuscaInput]       = useState('')
  const [page, setPage]                   = useState(0)
  const LIMIT = 50

  const params = new URLSearchParams({ page, limit: LIMIT })
  if (ds)           params.set('ds', ds)
  if (filtroStatus) params.set('status', filtroStatus)
  if (filtroReceb !== null) params.set('foi_recebido', filtroReceb)
  if (busca)        params.set('busca', busca)

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ['triagem-detalhes', uploadId, ds, filtroStatus, filtroReceb, busca, page],
    queryFn: () => api.get(`/api/triagem/upload/${uploadId}/detalhes?${params}`).then(r => r.data),
    keepPreviousData: true,
  })

  const resetFiltros = () => { setFiltroStatus(''); setFiltroReceb(null); setBusca(''); setBuscaInput(''); setPage(0) }

  const StatusBadge = ({ s }) => s === 'nok'
    ? <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">NOK</span>
    : <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-100 text-orange-700">FORA</span>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800">Waybills com erro — <span className="text-imile-600">{ds}</span></p>
            <p className="text-xs text-slate-400 mt-0.5">Apenas pacotes NOK e Fora · OK não são armazenados</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
          {/* Status */}
          <div className="flex gap-1">
            {[['', 'Todos'], ['nok', 'NOK'], ['fora', 'Fora']].map(([v, l]) => (
              <button key={v} onClick={() => { setFiltroStatus(v); setPage(0) }}
                className={`px-3 py-1 text-xs rounded-lg font-medium border transition-all ${
                  filtroStatus === v ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}>{l}</button>
            ))}
          </div>
          {/* Recebido (só se tem Arrival) */}
          {temArrival && (
            <div className="flex gap-1">
              {[[null, 'Todos'], [true, 'Recebido'], [false, 'Não Recebido']].map(([v, l]) => (
                <button key={String(v)} onClick={() => { setFiltroReceb(v); setPage(0) }}
                  className={`px-3 py-1 text-xs rounded-lg font-medium border transition-all ${
                    filtroReceb === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300'
                  }`}>{l}</button>
              ))}
            </div>
          )}
          {/* Busca */}
          <div className="flex gap-1 flex-1 min-w-[180px]">
            <input value={buscaInput} onChange={e => setBuscaInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setBusca(buscaInput); setPage(0) } }}
              placeholder="Buscar waybill..." className="px-3 py-1 text-xs border border-slate-200 rounded-lg flex-1 bg-white" />
            <button onClick={() => { setBusca(buscaInput); setPage(0) }}
              className="px-2 py-1 bg-imile-500 text-white rounded-lg hover:bg-imile-600">
              <Search size={12} />
            </button>
            {busca && (
              <button onClick={() => { setBusca(''); setBuscaInput(''); setPage(0) }}
                className="px-2 py-1 text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
              <Loader size={16} className="animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-12">Nenhum registro encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-800 text-white text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left">Waybill</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-left">DS Destino</th>
                  <th className="px-4 py-2.5 text-left">DS Entrega (real)</th>
                  <th className="px-4 py-2.5 text-left">Cidade</th>
                  {temArrival && <th className="px-4 py-2.5 text-center">Recebido</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.waybill + i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.waybill}</td>
                    <td className="px-4 py-2.5 text-center"><StatusBadge s={r.status} /></td>
                    <td className="px-4 py-2.5 text-xs font-medium">{r.ds_destino || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-red-600 font-medium">{r.ds_entrega || '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{r.cidade || '—'}</td>
                    {temArrival && (
                      <td className="px-4 py-2.5 text-center">
                        {r.foi_recebido
                          ? <CheckCircle size={14} className="text-emerald-500 mx-auto" />
                          : <XCircle    size={14} className="text-slate-300 mx-auto" />}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer paginação */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
          <span className="text-xs text-slate-400">
            {isFetching ? 'Atualizando...' : `${rows.length} registros (pág. ${page + 1})`}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-white">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => setPage(p => p + 1)} disabled={rows.length < LIMIT}
              className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-white">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Componente principal ──────────────────────────────────────
export default function Triagem() {
  const { isAdmin }               = useAuth()
  const queryClient               = useQueryClient()
  const [sel, setSel]             = useState(null)
  const [expanded, setExpanded]   = useState({})
  const [showPanel, setShowPanel] = useState(false)
  const [erro, setErro]           = useState('')
  const [modalDs, setModalDs]     = useState(null)   // DS selecionada para modal de detalhes

  const { data: uploads = [] } = useQuery({
    queryKey: ['triagem-uploads'],
    queryFn:  () => api.get('/api/triagem/uploads').then(r => r.data).catch(() => []),
  })

  useEffect(() => {
    if (uploads.length && !sel) setSel(uploads[0].id)
  }, [uploads])

  const { data: detail, isLoading: loading } = useQuery({
    queryKey: ['triagem-detail', sel],
    queryFn:  () => api.get(`/api/triagem/upload/${sel}`).then(r => r.data).catch(() => null),
    enabled:  !!sel,
  })

  useEffect(() => { setExpanded({}) }, [sel])

  const toggleDs = useCallback(async (ds) => {
    setExpanded(prev => {
      const cur = prev[ds] || {}
      if (cur.open)  return { ...prev, [ds]: { ...cur, open: false } }
      if (cur.data)  return { ...prev, [ds]: { ...cur, open: true } }
      return { ...prev, [ds]: { open: true, data: null, loadingCity: true } }
    })
    setExpanded(prev => {
      const cur = prev[ds] || {}
      if (!cur.loadingCity) return prev
      api.get(`/api/triagem/upload/${sel}/cidades/${encodeURIComponent(ds)}`)
        .then(res  => setExpanded(p => ({ ...p, [ds]: { open: true, data: res.data, loadingCity: false } })))
        .catch(()  => setExpanded(p => ({ ...p, [ds]: { open: true, data: [],       loadingCity: false } })))
      return prev
    })
  }, [sel])

  const handleUploadSuccess = (uploadId) => {
    toast.ok('Triagem processada com sucesso!')
    setShowPanel(false)
    queryClient.invalidateQueries({ queryKey: ['triagem-uploads'] })
    if (uploadId) setSel(uploadId)
    setExpanded({})
  }

  const handleDelete = async () => {
    if (!sel || !window.confirm('Excluir este upload permanentemente?')) return
    try {
      await api.delete(`/api/triagem/upload/${sel}`)
      setSel(null); setExpanded({})
      queryClient.invalidateQueries({ queryKey: ['triagem-uploads'] })
    } catch (e) { setErro(e.response?.data?.detail || 'Erro ao excluir.') }
  }

  const handleExcel = async () => {
    try {
      const r = await api.get(`/api/excel/triagem/${sel}`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Triagem_${u?.data_ref || 'relatorio'}.xlsx`
      a.click()
    } catch { toast.erro('Erro ao gerar Excel.') }
  }

  const u = uploads.find(x => x.id === sel)
  const temArrival = !!u?.tem_arrival
  const F  = n => n?.toLocaleString('pt-BR') ?? '0'
  const Pct = n => n != null ? `${Number(n).toFixed(1)}%` : '—'

  const dsChartData = detail?.por_ds
    ?.slice()
    .sort((a, b) => a.taxa - b.taxa)
    .map(r => ({ ds: r.ds, ok: r.ok, nok: r.nok, taxa: parseFloat(r.taxa ?? 0) })) ?? []

  // Histórico por dia (todos os uploads carregados, ordenados por data)
  const erradaPorDia = uploads
    .slice()
    .sort((a, b) => a.data_ref.localeCompare(b.data_ref))
    .map(u => ({
      dia: u.data_ref,
      qtd: u.qtd_erro ?? 0,
      pct: u.total ? parseFloat(((u.qtd_erro ?? 0) / u.total * 100).toFixed(1)) : 0,
    }))

  // Total de pacotes NOK que foram confirmados recebidos na DS errada
  const totalChegouErrado = detail?.por_ds?.reduce((s, r) => s + (r.recebidos_nok ?? 0), 0) ?? 0
  const dsChegouErrado = detail?.por_ds
    ?.filter(r => (r.recebidos_nok ?? 0) > 0)
    .slice()
    .sort((a, b) => (b.recebidos_nok ?? 0) - (a.recebidos_nok ?? 0)) ?? []

  const TaxaBadge = ({ taxa }) => {
    const v   = parseFloat(taxa)
    const cls = v >= 95 ? 'text-emerald-600' : v >= 85 ? 'text-amber-600' : 'text-red-600'
    return <span className={`font-mono font-semibold text-xs ${cls}`}>{v.toFixed(1)}%</span>
  }

  const PctBadge = ({ value, total }) => {
    if (!total || value == null) return <span className="text-slate-300 text-xs font-mono">—</span>
    const pct = (value / total * 100)
    const cls = pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : 'text-red-600'
    return (
      <span className={`font-mono font-semibold text-xs ${cls}`}>
        {F(value)} <span className="font-normal text-slate-400">({pct.toFixed(0)}%)</span>
      </span>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <PageHeader title="Triagem DC×DS" subtitle="Análise de erros de expedição — LoadingScan × Arrival" />
        <div className="flex gap-2 shrink-0">
          {sel && (
            <button onClick={handleExcel}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors">
              <Download size={14} /> Excel
            </button>
          )}
          <button
            onClick={() => setShowPanel(p => !p)}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 transition-colors">
            <Upload size={14} /> Novo Upload
          </button>
        </div>
      </div>

      {erro && <Alert type="warning" className="mb-4">{erro}</Alert>}

      {/* Painel de upload */}
      {showPanel && (
        <UploadPanel
          onClose={() => setShowPanel(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {!uploads.length && !showPanel ? (
        <div className="text-center py-16 bg-white border border-slate-100 rounded-xl">
          <Upload size={36} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-600 font-semibold mb-1">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm">Clique em "Novo Upload" para enviar o LoadingScan e, opcionalmente, o Arrival.</p>
        </div>
      ) : uploads.length > 0 && (
        <>
          {/* Seletor */}
          <div className="flex items-center gap-2 mb-6">
            <select
              value={sel || ''}
              onChange={e => { setSel(Number(e.target.value)); setExpanded({}) }}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm max-w-sm flex-1"
            >
              {uploads.map(u => (
                <option key={u.id} value={u.id}>
                  {u.data_ref} — {u.qtd_ok}/{u.total} OK ({u.taxa}%)
                  {u.tem_arrival ? ` · ${u.qtd_recebidos} recebidos` : ''}
                </option>
              ))}
            </select>
            {isAdmin && sel && (
              <button onClick={handleDelete} className="p-2 text-red-400 hover:text-red-600" title="Excluir upload">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* KPIs */}
          {u && (
            <div className={`grid gap-4 mb-6 ${temArrival ? 'grid-cols-2 md:grid-cols-4 lg:grid-cols-8' : 'grid-cols-2 md:grid-cols-5'}`}>
              <KpiCard label="Total Expedido" value={F(u.total)}          color="blue"   />
              <KpiCard label="Triagem OK"     value={F(u.qtd_ok)}         color="green"  />
              <KpiCard label="Erros (NOK)"    value={F(u.qtd_erro)}       color="red"    />
              <KpiCard label="Fora do Mapa"   value={F(u.qtd_fora ?? 0)}  color="orange"
                sub={u.total ? `${((u.qtd_fora ?? 0) / u.total * 100).toFixed(1)}% do total` : ''} />
              <KpiCard label="Taxa OK"        value={`${u.taxa}%`}        color="violet" />
              {temArrival && <>
                <KpiCard label="Recebidos"      value={F(u.qtd_recebidos)} color="blue"
                  sub={u.total ? `${(u.qtd_recebidos / u.total * 100).toFixed(1)}% do expedido` : ''} />
                <KpiCard label="Não Recebidos"  value={F(u.total - u.qtd_recebidos)} color="orange"
                  sub={u.total ? `${((u.total - u.qtd_recebidos) / u.total * 100).toFixed(1)}% do expedido` : ''} />
                <KpiCard label="Chegaram Errado" value={F(totalChegouErrado)} color="red"
                  sub={u.qtd_erro ? `${(totalChegouErrado / u.qtd_erro * 100).toFixed(1)}% dos NOK recebidos` : 'NOK confirmados na DS errada'} />
              </>}
            </div>
          )}

          {/* Badge se não tem Arrival */}
          {u && !temArrival && (
            <div className="mb-6 flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
              <PackageCheck size={14} className="text-slate-300" />
              Este upload não tem Arrival. Para ver quantos expedidos foram recebidos, reprocesse incluindo o arquivo Arrival.
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          )}

          {/* Triagem Errada — Histórico por dia (independente do detail) */}
          {!loading && erradaPorDia.length > 0 && (
            <>
              <SectionHeader title="Triagem Errada — Histórico por Dia" />
              <Card className="mb-4">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={erradaPorDia} margin={{ top: 22, right: 50, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === '% Erro' ? [`${value}%`, name] : [value.toLocaleString('pt-BR'), name]
                      }
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="qtd" name="Qtd Erros (NOK)" fill={COLOR_NOK} radius={[4, 4, 0, 0]}
                      label={{ position: 'top', fontSize: 10, fill: '#ef4444', formatter: v => v > 0 ? v.toLocaleString('pt-BR') : '' }}
                    />
                    <Line yAxisId="right" type="monotone" dataKey="pct" name="% Erro"
                      stroke="#dc2626" strokeWidth={2} dot={{ r: 4, fill: '#dc2626' }}
                      label={{ position: 'top', fontSize: 10, fill: '#dc2626', formatter: v => `${v}%` }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              {/* Top 5 abaixo do gráfico */}
              {detail?.top5?.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    Top 5 DS com mais erros — upload selecionado
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {detail.top5.map((r, i) => (
                      <div key={i} className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-center">
                        <span className="block text-[10px] font-bold text-red-300 mb-1">#{i + 1}</span>
                        <span className="block text-xs font-semibold text-slate-700 mb-2 truncate" title={r.ds}>{r.ds}</span>
                        <span className="block text-2xl font-black text-red-600">{F(r.total_erros)}</span>
                        {u?.qtd_erro > 0 && (
                          <span className="block text-[10px] text-slate-400 mt-1">
                            {(r.total_erros / u.qtd_erro * 100).toFixed(0)}% dos erros
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && detail && (
            <>
              {u && parseFloat(u.taxa) < 90 && (
                <Alert type="warning" className="mb-6">
                  Taxa de triagem abaixo de 90% — atenção necessária nas bases com mais erros.
                </Alert>
              )}

              {/* Destaque: DSes que receberam pacotes errados */}
              {temArrival && dsChegouErrado.length > 0 && (
                <>
                  <SectionHeader title="DSes que receberam pacotes errados (NOK confirmado no Arrival)" />
                  <div className="mb-6 bg-red-50 border border-red-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-red-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PackageCheck size={15} className="text-red-500" />
                        <span className="text-sm font-semibold text-red-800">
                          {totalChegouErrado} pacotes confirmados na DS errada
                        </span>
                      </div>
                      <span className="text-xs text-red-500 font-medium">
                        {u?.qtd_erro ? `${(totalChegouErrado / u.qtd_erro * 100).toFixed(1)}% dos erros foram confirmados recebidos` : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-px bg-red-200">
                      {dsChegouErrado.map(r => (
                        <div key={r.ds} className="bg-white px-4 py-3">
                          <p className="text-xs font-bold text-slate-700 mb-1">{r.ds}</p>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xl font-black text-red-600">{F(r.recebidos_nok)}</span>
                            <span className="text-[10px] text-slate-400">chegaram errado</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            de {F(r.nok)} NOK expedidos
                            {r.nok > 0 && (
                              <span className="ml-1 font-semibold text-red-500">
                                ({(r.recebidos_nok / r.nok * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Gráfico OK vs NOK por DS */}
              {dsChartData.length > 0 && (
                <>
                  <SectionHeader title="OK vs NOK por DS" />
                  <Card className="mb-6">
                    <ResponsiveContainer width="100%" height={Math.max(300, dsChartData.length * 34 + 60)}>
                      <BarChart data={dsChartData} layout="vertical" margin={{ left: 90, right: 70 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="ds" tick={{ fontSize: 11 }} width={85} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="ok"  name="OK"  stackId="a" fill={COLOR_OK} />
                        <Bar dataKey="nok" name="NOK" stackId="a" fill={COLOR_NOK} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </>
              )}

              {/* Top 5 */}
              {detail.top5?.length > 0 && (
                <>
                  <SectionHeader title="Top 5 DS com mais erros" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    <Card>
                      {detail.top5.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                            <span className="text-sm font-medium text-slate-800">{r.ds}</span>
                          </div>
                          <span className="text-sm font-mono font-bold text-red-600">{F(r.total_erros)}</span>
                        </div>
                      ))}
                    </Card>
                    <Card>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={detail.top5.slice().reverse()} layout="vertical" margin={{ left: 100, right: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="ds" tick={{ fontSize: 11 }} width={95} />
                          <Tooltip />
                          <Bar dataKey="total_erros" name="Erros" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: '#dc2626' }}>
                            {detail.top5.slice().reverse().map((_, i) => (
                              <Cell key={i} fill={COLOR_TOP[COLOR_TOP.length - 1 - i]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </div>
                </>
              )}

              {/* Tabelas DS + Supervisor */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">

                {/* Tabela por DS — expansível */}
                {detail.por_ds?.length > 0 && (
                  <div>
                    <SectionHeader title="Detalhamento por DS" />
                    <Card padding={false} className="overflow-hidden">
                      <div className="max-h-[560px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-800 z-10">
                            <tr className="text-[10px] uppercase text-white/70">
                              <th className="px-3 py-2.5 w-8" />
                              <th className="px-3 py-2.5 text-left">DS</th>
                              <th className="px-3 py-2.5 text-right">Total</th>
                              <th className="px-3 py-2.5 text-center text-emerald-400">OK</th>
                              <th className="px-3 py-2.5 text-center text-red-400">NOK</th>
                              <th className="px-3 py-2.5 text-right">Taxa</th>
                              {temArrival && <>
                                <th className="px-3 py-2.5 text-center text-blue-300">Recebidos</th>
                                <th className="px-3 py-2.5 text-center text-red-400" title="Pacotes NOK que foram confirmados recebidos na DS errada">Chegou Errado</th>
                              </>}
                              <th className="px-3 py-2.5" />
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_ds
                              .slice()
                              .sort((a, b) => a.taxa - b.taxa)
                              .map((r, i) => {
                                const exp = expanded[r.ds] || {}
                                const colSpan = temArrival ? 8 : 6
                                return (
                                  <>
                                    <tr key={`ds-${i}`}
                                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                                      onClick={() => toggleDs(r.ds)}>
                                      <td className="px-3 py-2 text-slate-400">
                                        {exp.loadingCity
                                          ? <Loader size={13} className="animate-spin" />
                                          : exp.open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                      </td>
                                      <td className="px-3 py-2 font-medium text-slate-800">{r.ds}</td>
                                      <td className="px-3 py-2 text-right font-mono text-slate-700">{F(r.total)}</td>
                                      <td className="px-3 py-2 text-center font-mono text-emerald-600">{F(r.ok)}</td>
                                      <td className="px-3 py-2 text-center font-mono text-red-500">{F(r.nok)}</td>
                                      <td className="px-3 py-2 text-right"><TaxaBadge taxa={r.taxa} /></td>
                                      {temArrival && <>
                                        <td className="px-3 py-2 text-center">
                                          <PctBadge value={r.recebidos} total={r.total} />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <PctBadge value={r.recebidos_nok} total={r.nok} />
                                        </td>
                                      </>}
                                      <td className="px-3 py-2 text-center">
                                        {(r.nok > 0 || r.fora > 0) && (
                                          <button
                                            onClick={e => { e.stopPropagation(); setModalDs(r.ds) }}
                                            className="p-1 text-slate-400 hover:text-imile-600 hover:bg-imile-50 rounded transition-colors"
                                            title="Ver waybills com erro">
                                            <List size={13} />
                                          </button>
                                        )}
                                      </td>
                                    </tr>

                                    {exp.open && !exp.loadingCity && (
                                      exp.data?.length > 0
                                        ? exp.data.map((c, ci) => (
                                          <tr key={`city-${i}-${ci}`} className="bg-slate-50 border-t border-slate-100">
                                            <td className="px-3 py-1.5" />
                                            <td className="px-3 py-1.5 pl-7 text-slate-400 text-xs italic">
                                              📍 {c.cidade || '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-500">{F(c.total)}</td>
                                            <td className="px-3 py-1.5 text-center font-mono text-xs text-emerald-500">{F(c.ok)}</td>
                                            <td className="px-3 py-1.5 text-center font-mono text-xs text-red-400">{F(c.nok)}</td>
                                            <td className="px-3 py-1.5 text-right"><TaxaBadge taxa={c.taxa ?? 0} /></td>
                                            {temArrival && <><td /><td /></>}
                                          </tr>
                                        ))
                                        : (
                                          <tr key={`city-empty-${i}`} className="bg-slate-50 border-t border-slate-100">
                                            <td colSpan={colSpan} className="px-6 py-2 text-xs text-slate-400 italic">
                                              Sem detalhamento por cidade.
                                            </td>
                                          </tr>
                                        )
                                    )}
                                  </>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-400 px-3 py-2 border-t border-slate-100">
                        Clique em uma DS para expandir o detalhamento por cidade.
                        {temArrival && ' · Recebidos e NOK Rec. = cruzamento com Arrival.'}
                      </p>
                    </Card>
                  </div>
                )}

                {/* Tabela por Supervisor */}
                {detail.por_supervisor?.length > 0 && (
                  <div>
                    <SectionHeader title="Detalhamento por Supervisor" />
                    <Card padding={false} className="overflow-hidden">
                      <div className="max-h-[480px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-800">
                            <tr className="text-[10px] uppercase text-white/70">
                              <th className="px-3 py-2.5 text-left">Supervisor</th>
                              <th className="px-3 py-2.5 text-right">Total</th>
                              <th className="px-3 py-2.5 text-center text-emerald-400">OK</th>
                              <th className="px-3 py-2.5 text-center text-red-400">NOK</th>
                              <th className="px-3 py-2.5 text-right">Taxa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_supervisor
                              .slice()
                              .sort((a, b) => a.taxa - b.taxa)
                              .map((r, i) => (
                                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium text-slate-800">{r.supervisor}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-700">{F(r.total)}</td>
                                  <td className="px-3 py-2 text-center font-mono text-emerald-600">{F(r.ok)}</td>
                                  <td className="px-3 py-2 text-center font-mono text-red-500">{F(r.nok)}</td>
                                  <td className="px-3 py-2 text-right"><TaxaBadge taxa={r.taxa} /></td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Modal de detalhes por DS */}
      {modalDs && sel && (
        <DetalhesModal
          uploadId={sel}
          ds={modalDs}
          temArrival={temArrival}
          onClose={() => setModalDs(null)}
        />
      )}
    </div>
  )
}

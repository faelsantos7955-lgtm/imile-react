/**
 * pages/Backlog.jsx — Backlog SLA com resumo por cliente + drill-down
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Card, Alert, UploadGuide, toast, TableSkeleton, ConfirmDialog } from '../components/ui'
import { Upload, Download, Loader, RefreshCw, Trash2, Filter, X, ChevronDown, ChevronUp } from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'
import { useAuth } from '../lib/AuthContext'

// ── Hero Backlog ──────────────────────────────────────────────
function HeroBacklog() {
  const bars = [
    { w: '18%', color: '#475569', label: '1-3D' },
    { w: '14%', color: '#64748b', label: '3-5D' },
    { w: '12%', color: '#f59e0b', label: '5-7D' },
    { w: '20%', color: '#f97316', label: '7-10D' },
    { w: '16%', color: '#ef4444', label: '10-15D' },
    { w: '12%', color: '#dc2626', label: '15-20D' },
    { w: '8%',  color: '#991b1b', label: '>20D' },
  ]
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 400, height: 400, top: -160, left: -100, background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 300, height: 300, top: -60, right: -50, background: 'radial-gradient(circle,#dc2626 0%,transparent 70%)', opacity: 0.22 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Caminhão com carga */}
      <div className="truck-anim absolute pointer-events-none" style={{ bottom: 26, left: 0 }}>
        <svg width={260} height={50} viewBox="0 0 260 50" fill="none">
          <rect x={2} y={8} width={148} height={32} rx={3} fill="white" fillOpacity={0.88}/>
          <rect x={2} y={32} width={148} height={8} rx={2} fill="#0032A0"/>
          <text x={40} y={27} fontFamily="Arial,sans-serif" fontSize={7} fontWeight="bold" fill="#0032A0" fillOpacity={0.7} letterSpacing={3}>iMile</text>
          <rect x={148} y={26} width={6} height={6} rx={1} fill="#aab8cc"/>
          <path d="M154 8 L154 42 L252 42 L252 22 L246 8 Z" fill="#0032A0"/>
          <path d="M163 8 Q167 3 192 3 L246 3 L252 12 L246 8 L163 8 Z" fill="#0028a0"/>
          <path d="M220 5 L248 5 L252 16 L220 16 Z" fill="white" fillOpacity={0.12}/>
          <rect x={156} y={10} width={24} height={14} rx={2} fill="white" fillOpacity={0.15}/>
          <rect x={249} y={22} width={4} height={9} rx={1} fill="#001d6e"/>
          <rect x={245} y={35} width={7} height={7} rx={2} fill="white" fillOpacity={0.85} stroke="#0032A0" strokeWidth={0.5}/>
          <rect x={249} y={12} width={5} height={7} rx={1} fill="white" fillOpacity={0.9}/>
          {[22,37].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy={46} r={7} fill="#1a1a2e" stroke="white" strokeWidth={1} strokeOpacity={0.5}/>
              <circle cx={cx} cy={46} r={4} fill="#111122" stroke="#0032A0" strokeWidth={0.8}/>
              <circle cx={cx} cy={46} r={1.5} fill="white" fillOpacity={0.7}/>
            </g>
          ))}
          {[190,232].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy={46} r={8} fill="#1a1a2e" stroke="white" strokeWidth={1.2} strokeOpacity={0.5}/>
              <circle cx={cx} cy={46} r={5} fill="#111122" stroke="#0032A0" strokeWidth={1}/>
              <circle cx={cx} cy={46} r={2} fill="white" fillOpacity={0.7}/>
            </g>
          ))}
        </svg>
      </div>

      {/* Barras de faixa SLA (decorativas) */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-60 hidden md:flex">
        {bars.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/40 w-8 text-right">{b.label}</span>
            <div className="h-2.5 rounded-full transition-all" style={{ width: b.w, minWidth: 18, background: b.color, boxShadow: `0 0 6px ${b.color}55` }} />
          </div>
        ))}
      </div>

      {/* Alerta pulsando */}
      <div className="absolute right-72 top-5 hidden md:block">
        <div className="relative">
          <div className="w-8 h-8 rounded-full flex items-center justify-center signal-blink" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)' }}>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 13H2L8 2Z" fill="#ef4444" fillOpacity={0.9}/>
              <rect x={7.2} y={6} width={1.6} height={4} rx={0.5} fill="white"/>
              <rect x={7.2} y={11} width={1.6} height={1.6} rx={0.8} fill="white"/>
            </svg>
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 signal-blink" style={{ animationDelay: '0.5s' }} />
        </div>
      </div>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,.85)' }}>
          SLA BACKLOG
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Monitor de Prazo</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Pedidos acima do SLA por RDC, Supervisor e DS</p>
      </div>
    </div>
  )
}

const FAIXAS = ['1-3', '3-5', '5-7', '7-10', '10-15', '15-20', 'Backlog >20']
const FAIXAS_LABELS = ['1D<3D', '3D<5D', '5D<7D', '7D<10D', '10D<15D', '15D<20D', '≥20D']
const DB_FAIXAS = ['f_1_3', 'f_3_5', 'f_5_7', 'f_7_10', 'f_10_15', 'f_15_20', 'f_20_mais']

const CORES_CELL = {
  '1-3': null, '3-5': null, '5-7': null,
  '7-10':        { bg: '#FEE2E2', text: '#DC2626' },
  '10-15':       { bg: '#FECACA', text: '#B91C1C' },
  '15-20':       { bg: '#FCA5A5', text: '#991B1B' },
  'Backlog >20': { bg: '#EF4444', text: '#fff' },
}
const CORES_BADGE = {
  '1-3': { bg: '#F1F5F9', text: '#475569' }, '3-5': { bg: '#F1F5F9', text: '#475569' },
  '5-7': { bg: '#F1F5F9', text: '#475569' },
  '7-10': { bg: '#FEE2E2', text: '#DC2626' }, '10-15': { bg: '#FECACA', text: '#B91C1C' },
  '15-20': { bg: '#FCA5A5', text: '#991B1B' }, 'Backlog >20': { bg: '#EF4444', text: '#fff' },
}
const CORES_HEADER = {
  '1-3': { bg: '#E2E8F0', text: '#475569' }, '3-5': { bg: '#E2E8F0', text: '#475569' },
  '5-7': { bg: '#E2E8F0', text: '#475569' },
  '7-10': { bg: '#FEE2E2', text: '#DC2626' }, '10-15': { bg: '#FECACA', text: '#B91C1C' },
  '15-20': { bg: '#FCA5A5', text: '#991B1B' }, 'Backlog >20': { bg: '#EF4444', text: '#fff' },
}

function FaixaCell({ faixa, value }) {
  const cores = CORES_CELL[faixa]
  if (!value) return <td className="px-2 py-2 text-center text-xs border border-slate-200 text-slate-300">0</td>
  if (!cores) return (
    <td className="px-2 py-2 text-center text-xs border border-slate-200 text-slate-600 font-mono">
      {value.toLocaleString('pt-BR')}
    </td>
  )
  return (
    <td className="px-2 py-2 text-center text-xs border border-slate-200 font-bold font-mono"
      style={{ backgroundColor: cores.bg, color: cores.text }}>
      {value.toLocaleString('pt-BR')}
    </td>
  )
}

function FaixaCellFromDB({ row }) {
  return FAIXAS.map((f, i) => {
    const val = row[DB_FAIXAS[i]] || 0
    return <FaixaCell key={f} faixa={f} value={val} />
  })
}

function TabelaBacklog({ titulo, dados, cor = '#1F3864', showSupervisor = false, showRegiao = false }) {
  return (
    <div className="mb-6">
      <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm" style={{ backgroundColor: cor }}>
        {titulo}
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: cor }} className="text-white text-center">
              {showRegiao && <th className="px-3 py-2 border border-white/20 text-left">Região</th>}
              {showSupervisor && <th className="px-3 py-2 border border-white/20 text-left">Supervisor</th>}
              <th className="px-3 py-2 border border-white/20 text-left">Nome</th>
              <th className="px-3 py-2 border border-white/20">Orders</th>
              <th className="px-3 py-2 border border-white/20">Backlog</th>
              <th className="px-3 py-2 border border-white/20">% Backlog</th>
              {FAIXAS_LABELS.map((f, i) => {
                const hc = CORES_HEADER[FAIXAS[i]]
                return <th key={i} className="px-2 py-2 border border-white/20 font-bold" style={{ backgroundColor: hc?.bg, color: hc?.text }}>{f}</th>
              })}
              <th className="px-3 py-2 border border-white/20 bg-red-600 text-white">&gt;7D</th>
              {showSupervisor && <th className="px-3 py-2 border border-white/20">Prior.</th>}
            </tr>
          </thead>
          <tbody>
            {dados.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                {showRegiao && <td className="px-3 py-2 border border-slate-200 text-slate-500">{row.regiao || '—'}</td>}
                {showSupervisor && <td className="px-3 py-2 border border-slate-200 text-slate-600">{row.supervisor || '—'}</td>}
                <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">{row.nome}</td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono text-slate-600">{(row.orders || 0).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-slate-800">{(row.backlog || 0).toLocaleString('pt-BR')}</td>
                <td className={`px-3 py-2 text-center border border-slate-200 font-mono ${row.pct_backlog > 50 ? 'text-red-600 font-bold' : row.pct_backlog > 20 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {row.pct_backlog?.toFixed(1)}%
                </td>
                {FAIXAS.map((f, fi) => <FaixaCell key={fi} faixa={f} value={row.faixas?.[f] || 0} />)}
                <td className={`px-3 py-2 text-center border border-slate-200 font-mono font-bold ${row.total_7d > 500 ? 'text-red-600 bg-red-50' : row.total_7d > 100 ? 'text-red-500' : 'text-slate-500'}`}>
                  {(row.total_7d || 0).toLocaleString('pt-BR')}
                </td>
                {showSupervisor && (
                  <td className="px-2 py-2 text-center border border-slate-200">
                    <span className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: '#1F3864' }}>{row.prioridade}</span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Backlog() {
  const { isAdmin }               = useAuth()
  const queryClient               = useQueryClient()
  const [uploadSel, setUploadSel]     = useState(null)
  const [clienteSel, setClienteSel]   = useState('')
  const [uploading, setUploading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [erro, setErro]               = useState('')
  const [showDetalhe, setShowDetalhe] = useState(true)
  const [clienteOffset, setClienteOffset] = useState(0)
  const [confirmDlg, setConfirmDlg] = useState(null)
  const inputRef = useRef(null)

  const { data: uploads = [] } = useQuery({
    queryKey: ['backlog-uploads'],
    queryFn: () => api.get('/api/backlog/uploads').then(r => r.data || []).catch(() => []),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads])

  const { data: clientesRes } = useQuery({
    queryKey: ['backlog-clientes', uploadSel, clienteOffset],
    queryFn: () => api.get(`/api/backlog/clientes/${uploadSel}`, {
      params: { limit: 50, offset: clienteOffset }
    }).then(r => r.data).catch(() => ({ total: 0, items: [], limit: 50, offset: 0 })),
    enabled: !!uploadSel,
  })
  const clientes      = clientesRes?.items || []
  const clientesTotal = clientesRes?.total || 0

  const { data: dados, isLoading: loading } = useQuery({
    queryKey: ['backlog-dados', uploadSel, clienteSel],
    queryFn: () => api.get(`/api/backlog/upload/${uploadSel}`, { params: clienteSel ? { cliente: clienteSel } : {} })
      .then(r => r.data),
    enabled: !!uploadSel,
  })

  const handleClienteClick = (nome) => {
    setClienteSel(prev => prev === nome ? '' : nome)
  }

  const limparFiltro = () => setClienteSel('')

  const handleUploadChange = (id) => {
    setUploadSel(id)
    setClienteSel('')
    setClienteOffset(0)
  }

  const handleDelete = () => {
    if (!uploadSel) return
    setConfirmDlg({
      message: 'Excluir este upload permanentemente?',
      onConfirm: async () => {
        try {
          await api.delete(`/api/backlog/upload/${uploadSel}`)
          setUploadSel(null)
          setClienteSel('')
          queryClient.invalidateQueries({ queryKey: ['backlog-uploads'] })
        } catch (e) { setErro(e.response?.data?.detail || 'Erro ao excluir.') }
      },
    })
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const erroVal = validarArquivos(file)
    if (erroVal) { setErro(erroVal); return }
    setUploading(true); setErro('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/backlog/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      queryClient.invalidateQueries({ queryKey: ['backlog-uploads'] })
      setUploadSel(res.data.upload_id)
    } catch (e) { setErro(e.response?.data?.detail || 'Erro ao processar.') }
    finally { setUploading(false); e.target.value = '' }
  }

  const baixarExcel = async () => {
    if (!uploadSel) return
    setDownloading(true)
    try {
      const res = await api.post(`/api/backlog/excel/${uploadSel}`, {}, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([res.data]))
      a.download = `Backlog_SLA.xlsx`; a.click()
    } catch { toast.erro('Erro ao gerar Excel.') }
    finally { setDownloading(false) }
  }

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
  const F = n => n?.toLocaleString('pt-BR') ?? '0'

  return (
    <div>
      <HeroBacklog />
      <div className="flex items-start justify-between mb-4">
        <div />
        <div className="flex gap-2">
          {dados && (
            <button onClick={baixarExcel} disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 disabled:opacity-50">
              {downloading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              Excel
            </button>
          )}
          <UploadGuide
            title="Arquivo de Backlog SLA"
            items={[
              'Excel exportado do sistema de SLA (.xlsx ou .xlsm)',
              'Obrigatório: aba "Backlog_Details" com colunas waybillNo, range_backlog, process, actual_region, lastScanSite, clientName, stageStatus, lastScanStatus, CARGOS.SUPERVISOR',
              'Obrigatório: aba "Resume_" com colunas CARGOS.SUPERVISOR, lastScanSite, clientName, actual region, orders',
              'Não renomeie as abas nem altere o cabeçalho das colunas',
            ]}
            accent="orange"
          />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {erro && <Alert type="warning" className="mb-4">{erro}</Alert>}

      {/* Seletor de upload + filtro de cliente */}
      {uploads.length > 0 && (
        <div className="flex items-center gap-3 mb-6 bg-white border border-slate-200 rounded-xl p-3 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase">Upload</span>
          <select value={uploadSel || ''} onChange={e => handleUploadChange(Number(e.target.value))}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white flex-1 max-w-xs">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>{fmtDate(u.data_ref)} — {(u.total || 0).toLocaleString('pt-BR')} pedidos</option>
            ))}
          </select>

          {clientes.length > 0 && <>
            <div className="h-6 w-px bg-slate-200" />
            <Filter size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase">Cliente</span>
            <select value={clienteSel} onChange={e => handleClienteClick(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white flex-1 max-w-xs">
              <option value="">Todos os clientes</option>
              {clientes.map(c => (
                <option key={c.nome} value={c.nome}>{c.nome} ({(c.backlog || 0).toLocaleString('pt-BR')})</option>
              ))}
            </select>
            {clienteSel && (
              <button onClick={limparFiltro}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
                <X size={12} /> Limpar
              </button>
            )}
          </>}

          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['backlog-uploads'] })}
            className="p-1.5 text-slate-400 hover:text-slate-600"><RefreshCw size={14} /></button>
          {isAdmin && uploadSel && (
            <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600" title="Excluir upload">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {uploads.length === 0 && !loading && (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o arquivo Excel de Backlog SLA</p>
        </Card>
      )}

      {loading && (
        <div className="mt-6">
          <TableSkeleton rows={8} cols={7} />
        </div>
      )}

      {!loading && dados && <>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { l: 'Total Backlog', v: F(dados.kpis.total), c: '#334155' },
            { l: 'Na DS', v: F(dados.kpis.na_ds), c: '#334155' },
            { l: 'Em Trânsito', v: F(dados.kpis.em_transito), c: '#334155' },
            { l: 'Críticos >7d', v: F(dados.kpis.total_7d), c: '#DC2626' },
            { l: '% Crítico', v: `${dados.kpis.pct_7d}%`, c: dados.kpis.pct_7d > 10 ? '#DC2626' : '#334155' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm" style={{ borderLeftWidth: 4, borderLeftColor: c }}>
              <p className="text-[10px] font-bold uppercase text-slate-400">{l}</p>
              <p className="text-2xl font-bold font-mono mt-1" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Faixas resumo */}
        <div className="flex gap-2 flex-wrap mb-6">
          {FAIXAS.map((f, i) => {
            const qtd = dados.kpis.por_faixa?.[f] || 0
            const { bg, text } = CORES_BADGE[f]
            return (
              <div key={f} className="rounded-lg px-3 py-2 text-center min-w-[80px] border border-slate-200" style={{ backgroundColor: bg, color: text }}>
                <p className="text-[10px] font-bold">{FAIXAS_LABELS[i]}</p>
                <p className="text-lg font-bold font-mono">{qtd.toLocaleString('pt-BR')}</p>
              </div>
            )
          })}
        </div>

        {/* Dash — BACKLOG 超时未完结: tabelas RDC / Supervisor / DS */}
        <div className="mb-4">
          <button onClick={() => setShowDetalhe(!showDetalhe)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800">
            {showDetalhe ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showDetalhe ? 'Ocultar Dash' : 'Ver Dash — RDC / Supervisor / DS / Motivo'}
          </button>
        </div>

        {showDetalhe && <>
          <TabelaBacklog titulo="LH — Por RDC" dados={dados.por_rdc} cor="#2E75B6" showRegiao />
          <TabelaBacklog titulo="DS — Por Supervisor" dados={dados.por_supervisor} cor="#375623" />
          <TabelaBacklog titulo="DS — Detalhado por Base" dados={dados.por_ds} cor="#1F3864" showSupervisor />

          {dados.por_motivo?.length > 0 && (
            <div className="mb-6">
              <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm" style={{ backgroundColor: '#7030A0' }}>
                DS — Por Motivo (Último Status)
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ backgroundColor: '#7030A0' }} className="text-white text-center">
                      <th className="px-3 py-2 border border-white/20 text-left">Motivo</th>
                      <th className="px-3 py-2 border border-white/20">Backlog</th>
                      <th className="px-3 py-2 border border-white/20">% Backlog</th>
                      {FAIXAS_LABELS.map((f, i) => {
                        const hc = CORES_HEADER[FAIXAS[i]]
                        return <th key={i} className="px-2 py-2 border border-white/20 font-bold" style={{ backgroundColor: hc?.bg, color: hc?.text }}>{f}</th>
                      })}
                      <th className="px-3 py-2 border border-white/20 bg-red-600 text-white">&gt;7D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.por_motivo.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">{row.nome}</td>
                        <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-slate-800">{(row.backlog || 0).toLocaleString('pt-BR')}</td>
                        <td className={`px-3 py-2 text-center border border-slate-200 font-mono ${row.pct_backlog > 50 ? 'text-red-600 font-bold' : row.pct_backlog > 20 ? 'text-amber-600' : 'text-slate-500'}`}>
                          {row.pct_backlog?.toFixed(1)}%
                        </td>
                        {FAIXAS.map((f, fi) => <FaixaCell key={fi} faixa={f} value={row.faixas?.[f] || 0} />)}
                        <td className={`px-3 py-2 text-center border border-slate-200 font-mono font-bold ${row.total_7d > 500 ? 'text-red-600 bg-red-50' : row.total_7d > 100 ? 'text-red-500' : 'text-slate-500'}`}>
                          {(row.total_7d || 0).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>}

        {/* Tabela de Clientes */}
        {clientes.length > 0 && (
          <div className="mb-6">
            <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm flex items-center justify-between" style={{ backgroundColor: '#0F172A' }}>
              <span>Backlog por Cliente</span>
              <span className="text-xs font-normal text-slate-400">
                {clienteOffset + 1}–{Math.min(clienteOffset + clientes.length, clientesTotal)} de {clientesTotal} · Clique para filtrar
              </span>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white text-center">
                    <th className="px-3 py-2 border border-slate-700 text-left">Cliente</th>
                    <th className="px-3 py-2 border border-slate-700">Backlog</th>
                    <th className="px-3 py-2 border border-slate-700">% Total</th>
                    {FAIXAS_LABELS.map((f, i) => {
                      const hc = CORES_HEADER[FAIXAS[i]]
                      return <th key={i} className="px-2 py-2 border border-slate-700 font-bold" style={{ backgroundColor: hc?.bg, color: hc?.text }}>{f}</th>
                    })}
                    <th className="px-3 py-2 border border-slate-700 bg-red-600 text-white">&gt;7D</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => {
                    const isSelected = clienteSel === c.nome
                    const pct = c.pct_total || 0
                    return (
                      <tr key={i}
                        onClick={() => handleClienteClick(c.nome)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 ring-1 ring-blue-400' : i % 2 === 0 ? 'bg-slate-50/50 hover:bg-blue-50' : 'bg-white hover:bg-blue-50'}`}>
                        <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">
                          <div className="flex items-center gap-2">
                            {isSelected && <Filter size={12} className="text-blue-500" />}
                            {c.nome}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-slate-800">
                          {(c.backlog || 0).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 text-center border border-slate-200 font-mono text-slate-500">{pct}%</td>
                        <FaixaCellFromDB row={c} />
                        <td className={`px-3 py-2 text-center border border-slate-200 font-mono font-bold ${c.total_7d > 500 ? 'text-red-600 bg-red-50' : c.total_7d > 100 ? 'text-red-500' : 'text-slate-500'}`}>
                          {(c.total_7d || 0).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Paginação */}
            {clientesTotal > 50 && (
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border border-t-0 border-slate-200 rounded-b-xl">
                <span className="text-xs text-slate-500">
                  Mostrando {clienteOffset + 1}–{Math.min(clienteOffset + clientes.length, clientesTotal)} de {clientesTotal} clientes
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={clienteOffset === 0}
                    onClick={() => setClienteOffset(Math.max(0, clienteOffset - 50))}
                    className="px-3 py-1 text-xs rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50">
                    ← Anterior
                  </button>
                  <button
                    disabled={clienteOffset + 50 >= clientesTotal}
                    onClick={() => setClienteOffset(clienteOffset + 50)}
                    className="px-3 py-1 text-xs rounded-lg border border-slate-200 bg-white disabled:opacity-40 hover:bg-slate-50">
                    Próximo →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Badge de filtro ativo */}
        {clienteSel && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
            <Filter size={14} />
            Filtrando por: <strong>{clienteSel}</strong>
            <button onClick={limparFiltro} className="ml-auto text-blue-500 hover:text-blue-700"><X size={14} /></button>
          </div>
        )}

      </>}
      {confirmDlg && (
        <ConfirmDialog
          message={confirmDlg.message}
          onConfirm={confirmDlg.onConfirm}
          onCancel={() => setConfirmDlg(null)}
        />
      )}
    </div>
  )
}

/**
 * pages/Monitoramento.jsx — Monitoramento Diário de Entregas
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, Card, Alert, UploadGuide } from '../components/ui'
import {
  Upload, Loader, RefreshCw, Trash2, TrendingUp, Package,
  Truck, AlertTriangle, GitCompare,
} from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'
import clsx from 'clsx'

const F   = n  => n?.toLocaleString('pt-BR') ?? '0'
const pct = n  => `${((n || 0) * 100).toFixed(1)}%`
const dec = n  => (n || 0).toFixed(1)

// ── Hero Monitoramento ────────────────────────────────────────
function HeroMonitoramento() {
  const pings = [
    { cx: 200, cy: 80,  delay: '0s'   },
    { cx: 260, cy: 120, delay: '0.8s' },
    { cx: 150, cy: 130, delay: '1.6s' },
    { cx: 230, cy: 55,  delay: '2.4s' },
    { cx: 170, cy: 100, delay: '3.2s' },
  ]
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 360, height: 360, top: -140, left: -80,  background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 280, height: 280, top: -60,  right: -40, background: 'radial-gradient(circle,#10b981 0%,transparent 70%)', opacity: 0.2 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Radar SVG */}
      <svg className="absolute pointer-events-none" style={{ right: 20, top: '50%', transform: 'translateY(-50%)', opacity: 0.85 }}
        width={200} height={160} viewBox="0 0 200 160">
        {/* Círculos concêntricos */}
        {[70, 50, 30, 12].map((r, i) => (
          <circle key={i} cx={100} cy={80} r={r} fill="none"
            stroke="rgba(0,180,120,0.2)" strokeWidth={i === 0 ? 1.5 : 0.8}/>
        ))}
        {/* Cruz */}
        <line x1={100} y1={12} x2={100} y2={148} stroke="rgba(0,180,120,0.15)" strokeWidth={0.8}/>
        <line x1={32}  y1={80} x2={168} y2={80}  stroke="rgba(0,180,120,0.15)" strokeWidth={0.8}/>
        {/* Varredura (rotaciona com radar-rotate) */}
        <g className="radar-rotate" style={{ transformOrigin: '100px 80px' }}>
          <path d="M100,80 L100,12 A68,68 0 0,1 148,37 Z"
            fill="url(#radar-sweep)" opacity={0.7}/>
        </g>
        {/* Pings de entregas */}
        {pings.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r={3} fill="rgba(16,185,129,0.9)"/>
            <circle cx={p.cx} cy={p.cy} r={8} fill="none"
              stroke="rgba(16,185,129,0.5)" strokeWidth={0.8}
              className="hub-ring" style={{ animationDelay: p.delay }}/>
          </g>
        ))}
        <defs>
          <radialGradient id="radar-sweep" cx="100" cy="80" r="68" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(0,200,120,0)" />
            <stop offset="60%" stopColor="rgba(0,200,120,0.15)" />
            <stop offset="100%" stopColor="rgba(0,200,120,0.5)" />
          </radialGradient>
        </defs>
      </svg>

      {/* Indicador LIVE */}
      <div className="absolute right-6 bottom-7 flex items-center gap-1.5 hidden sm:flex">
        <div className="w-2 h-2 rounded-full bg-emerald-400 signal-blink"/>
        <span className="text-[10px] font-bold text-emerald-400/80 tracking-widest">LIVE</span>
      </div>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,.85)' }}>
          MONITORAMENTO
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Painel Diário de Entregas</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Controle operacional em tempo real — estoque, expedição e entrega</p>
      </div>
    </div>
  )
}

// ── KPI simples ────────────────────────────────────────────────
function KPI({ label, value, icon: Icon, color = '#334155', suffix = '' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color }}>{value}{suffix}</p>
        </div>
        {Icon && <Icon size={20} className="text-slate-300" />}
      </div>
    </div>
  )
}

// ── KPI comparativo A vs B ─────────────────────────────────────
function KPICompare({ label, a, b, fmt, invertDelta = false }) {
  const delta  = (b ?? 0) - (a ?? 0)
  const isGood = invertDelta ? delta < 0 : delta > 0
  const isBad  = invertDelta ? delta > 0 : delta < 0

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">{label}</p>
      <div className="flex items-end gap-2">
        <div className="flex-1 text-center">
          <p className="text-[10px] text-slate-400 mb-0.5">Data A</p>
          <p className="text-base font-bold font-mono text-slate-700">{fmt(a)}</p>
        </div>
        <div className="text-slate-300 pb-1 text-lg font-light">→</div>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-slate-400 mb-0.5">Data B</p>
          <p className="text-base font-bold font-mono text-slate-700">{fmt(b)}</p>
        </div>
      </div>
      <div className={clsx(
        'mt-2 text-center text-xs font-bold rounded-lg py-1',
        delta === 0 ? 'bg-slate-100 text-slate-500' :
        isGood     ? 'bg-emerald-50 text-emerald-700' :
                     'bg-red-50 text-red-700'
      )}>
        {delta === 0 ? '=' : delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
      </div>
    </div>
  )
}

// ── Célula de taxa colorida ────────────────────────────────────
function TaxaCell({ value }) {
  const p   = (value * 100)
  const cor = p >= 90 ? 'text-emerald-600' : p >= 70 ? 'text-amber-600' : p > 0 ? 'text-red-600' : 'text-slate-400'
  return (
    <td className={`px-2 py-2 text-center border border-slate-200 font-mono font-bold text-xs ${cor}`}>
      {p > 0 ? `${p.toFixed(1)}%` : '-'}
    </td>
  )
}

// ── Delta inline (seta + valor) ───────────────────────────────
function Delta({ a, b, fmt = F, invert = false, isPct = false }) {
  const va = a ?? 0
  const vb = b ?? 0
  const d  = vb - va
  if (d === 0) return <span className="text-slate-300 text-[10px]">—</span>
  const isGood = invert ? d < 0 : d > 0
  const sign   = d > 0 ? '+' : ''
  const label  = isPct
    ? `${sign}${((d) * 100).toFixed(1)}pp`
    : `${sign}${fmt(Math.round(d))}`
  return (
    <span className={clsx('text-[10px] font-bold', isGood ? 'text-emerald-600' : 'text-red-600')}>
      {label}
    </span>
  )
}

// ── Tabela comparativa ────────────────────────────────────────
function TabelaComparativo({ dadosA, dadosB }) {
  const [sort, setSort] = useState('ds')
  const [asc,  setAsc]  = useState(true)

  const mapA = Object.fromEntries((dadosA?.dados || []).map(r => [r.ds, r]))
  const mapB = Object.fromEntries((dadosB?.dados || []).map(r => [r.ds, r]))
  const dsList = [...new Set([
    ...(dadosA?.dados || []).map(r => r.ds),
    ...(dadosB?.dados || []).map(r => r.ds),
  ])]

  const rows = dsList.map(ds => ({
    ds,
    supervisor: mapA[ds]?.supervisor || mapB[ds]?.supervisor || '—',
    a: mapA[ds] || {},
    b: mapB[ds] || {},
  })).sort((x, y) => {
    let va, vb
    if (sort === 'ds')         { va = x.ds; vb = y.ds }
    else if (sort === 'taxa')  { va = x.a.taxa_expedicao ?? 0; vb = y.a.taxa_expedicao ?? 0 }
    else if (sort === 'delta') { va = (x.b.taxa_expedicao ?? 0) - (x.a.taxa_expedicao ?? 0); vb = (y.b.taxa_expedicao ?? 0) - (y.a.taxa_expedicao ?? 0) }
    else                       { va = 0; vb = 0 }
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })

  const Th = ({ col, children, center }) => (
    <th onClick={() => { setSort(col); setAsc(s => sort === col ? !s : true) }}
      className={clsx(
        'px-2 py-2.5 border border-slate-700 cursor-pointer hover:bg-slate-700 whitespace-nowrap text-xs font-bold',
        center ? 'text-center' : 'text-left',
        sort === col && 'text-imile-300'
      )}>
      {children}{sort === col ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-800 text-white">
              <Th col="ds">DS</Th>
              <th className="px-2 py-2.5 border border-slate-700 text-left text-xs font-bold">Supervisor</th>
              {/* Taxa Expedição */}
              <th colSpan={3} className="px-2 py-2 border border-slate-700 text-center text-xs font-bold text-imile-300">
                Taxa Expedição
              </th>
              {/* Entregue */}
              <th colSpan={3} className="px-2 py-2 border border-slate-700 text-center text-xs font-bold text-violet-300">
                Entregue
              </th>
              {/* Volume Saída */}
              <th colSpan={3} className="px-2 py-2 border border-slate-700 text-center text-xs font-bold text-sky-300">
                Saída
              </th>
              {/* Estoque >7d */}
              <th colSpan={3} className="px-2 py-2 border border-slate-700 text-center text-xs font-bold text-amber-300">
                Est. &gt;7d
              </th>
            </tr>
            <tr className="bg-slate-700 text-white/70 text-[10px]">
              <th className="px-2 py-1.5 border border-slate-600" />
              <th className="px-2 py-1.5 border border-slate-600" />
              {['Data A','Data B','Δ','Data A','Data B','Δ','Data A','Data B','Δ','Data A','Data B','Δ'].map((h, i) => (
                <th key={i} className="px-2 py-1.5 border border-slate-600 text-center font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const dTaxa  = (row.b.taxa_expedicao ?? 0) - (row.a.taxa_expedicao ?? 0)
              const rowBg  = i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'
              return (
                <tr key={row.ds} className={`${rowBg} hover:bg-imile-50/40`}>
                  <td className="px-2 py-2 border border-slate-200 font-semibold text-slate-800 whitespace-nowrap">{row.ds}</td>
                  <td className="px-2 py-2 border border-slate-200 text-slate-500 whitespace-nowrap">{row.supervisor}</td>
                  {/* Taxa Exp */}
                  <TaxaCell value={row.a.taxa_expedicao || 0} />
                  <TaxaCell value={row.b.taxa_expedicao || 0} />
                  <td className="px-2 py-2 border border-slate-200 text-center">
                    <Delta a={row.a.taxa_expedicao} b={row.b.taxa_expedicao} isPct />
                  </td>
                  {/* Entregue */}
                  <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">{F(row.a.entregue)}</td>
                  <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">{F(row.b.entregue)}</td>
                  <td className="px-2 py-2 border border-slate-200 text-center">
                    <Delta a={row.a.entregue} b={row.b.entregue} />
                  </td>
                  {/* Saída */}
                  <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">{F(row.a.volume_saida)}</td>
                  <td className="px-2 py-2 border border-slate-200 text-center font-mono text-slate-700">{F(row.b.volume_saida)}</td>
                  <td className="px-2 py-2 border border-slate-200 text-center">
                    <Delta a={row.a.volume_saida} b={row.b.volume_saida} />
                  </td>
                  {/* Estoque >7d */}
                  <td className={clsx('px-2 py-2 border border-slate-200 text-center font-mono font-bold', row.a.estoque_7d > 0 ? 'text-red-600 bg-red-50' : 'text-slate-400')}>
                    {F(row.a.estoque_7d)}
                  </td>
                  <td className={clsx('px-2 py-2 border border-slate-200 text-center font-mono font-bold', row.b.estoque_7d > 0 ? 'text-red-600 bg-red-50' : 'text-slate-400')}>
                    {F(row.b.estoque_7d)}
                  </td>
                  <td className="px-2 py-2 border border-slate-200 text-center">
                    <Delta a={row.a.estoque_7d} b={row.b.estoque_7d} invert />
                  </td>
                </tr>
              )
            })}

            {/* Linha de totais */}
            <tr className="bg-slate-800 text-white font-bold text-xs">
              <td className="px-2 py-2 border border-slate-700" colSpan={2}>TOTAL</td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{pct(dadosA?.totais?.taxa_expedicao)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{pct(dadosB?.totais?.taxa_expedicao)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center">
                <Delta a={dadosA?.totais?.taxa_expedicao} b={dadosB?.totais?.taxa_expedicao} isPct />
              </td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosA?.totais?.entregue)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosB?.totais?.entregue)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center">
                <Delta a={dadosA?.totais?.entregue} b={dadosB?.totais?.entregue} />
              </td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosA?.totais?.volume_saida)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosB?.totais?.volume_saida)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center">
                <Delta a={dadosA?.totais?.volume_saida} b={dadosB?.totais?.volume_saida} />
              </td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosA?.totais?.estoque_7d)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center font-mono">{F(dadosB?.totais?.estoque_7d)}</td>
              <td className="px-2 py-2 border border-slate-700 text-center">
                <Delta a={dadosA?.totais?.estoque_7d} b={dadosB?.totais?.estoque_7d} invert />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function Monitoramento() {
  const { isAdmin }                   = useAuth()
  const queryClient                   = useQueryClient()
  const [uploadSel,  setUploadSel]    = useState(null)
  const [compareId,  setCompareId]    = useState(null)
  const [comparing,  setComparing]    = useState(false)
  const [uploading,  setUploading]    = useState(false)
  const [erro,       setErro]         = useState('')
  const [sortCol,    setSortCol]      = useState(null)
  const [sortAsc,    setSortAsc]      = useState(true)
  const inputRef = useRef()

  const { data: uploads = [] } = useQuery({
    queryKey: ['monitoramento-uploads'],
    queryFn: () => api.get('/api/monitoramento/uploads').then(r => r.data || []).catch(() => []),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads])

  // Quando ativa o modo comparativo, pré-seleciona o segundo upload
  useEffect(() => {
    if (comparing && !compareId && uploads.length > 1) {
      setCompareId(uploads[1].id)
    }
  }, [comparing, uploads])

  const { data: dados, isLoading: loading } = useQuery({
    queryKey: ['monitoramento-dados', uploadSel],
    queryFn: () => api.get(`/api/monitoramento/upload/${uploadSel}`).then(r => r.data),
    enabled: !!uploadSel,
  })

  const { data: dadosCompare, isLoading: loadingCompare } = useQuery({
    queryKey: ['monitoramento-dados', compareId],
    queryFn: () => api.get(`/api/monitoramento/upload/${compareId}`).then(r => r.data),
    enabled: !!compareId && comparing,
  })

  const carregarUploads = () => queryClient.invalidateQueries({ queryKey: ['monitoramento-uploads'] })

  const handleDelete = async () => {
    if (!uploadSel || !window.confirm('Excluir este upload permanentemente?')) return
    try {
      await api.delete(`/api/monitoramento/upload/${uploadSel}`)
      setUploadSel(null)
      carregarUploads()
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao excluir.')
    }
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
      const res = await api.post('/api/monitoramento/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      await carregarUploads()
      setUploadSel(res.data.upload_id)
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivo.')
    } finally { setUploading(false) }
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  const fmtDate = d => d || '—'

  const sortedDados = dados?.dados ? [...dados.dados].sort((a, b) => {
    if (!sortCol) return 0
    const va = a[sortCol] ?? 0
    const vb = b[sortCol] ?? 0
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? va - vb : vb - va
  }) : []

  const COLS = [
    { key: 'ds',                    label: 'DS',          align: 'left', bold: true },
    { key: 'supervisor',            label: 'Supervisor',  align: 'left' },
    { key: 'regiao',                label: 'Região',      align: 'left' },
    { key: 'rdc_ds',                label: 'RDC→DS',      align: 'center', num: true },
    { key: 'estoque_ds',            label: 'Est. DS',     align: 'center', num: true },
    { key: 'estoque_motorista',     label: 'Est. Mot.',   align: 'center', num: true },
    { key: 'estoque_total',         label: 'Est. Total',  align: 'center', num: true },
    { key: 'estoque_7d',            label: '>7d',         align: 'center', num: true, danger: true },
    { key: 'recebimento',           label: 'Recebido',    align: 'center', num: true },
    { key: 'volume_total',          label: 'Vol. Total',  align: 'center', num: true },
    { key: 'pendencia_scan',        label: 'Pendência',   align: 'center', num: true },
    { key: 'volume_saida',          label: 'Saída',       align: 'center', num: true },
    { key: 'taxa_expedicao',        label: 'Taxa Exp.',   align: 'center', pct: true },
    { key: 'qtd_motoristas',        label: 'DV',          align: 'center', num: true },
    { key: 'eficiencia_pessoal',    label: 'Ef. Pessoal', align: 'center', dec: true },
    { key: 'entregue',              label: 'Entregue',    align: 'center', num: true },
    { key: 'eficiencia_assinatura', label: 'Ef. Assin.',  align: 'center', dec: true },
  ]

  const uploadA = uploads.find(u => u.id === uploadSel)
  const uploadB = uploads.find(u => u.id === compareId)

  return (
    <div>
      {uploading && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
          <span className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-semibold text-sm">Processando arquivo…</p>
          <p className="text-white/60 text-xs">Isso pode levar alguns segundos</p>
        </div>
      )}

      <HeroMonitoramento />
      <div className="flex items-start justify-between mb-4">
        <div />
        <div className="flex gap-2">
          <UploadGuide
            title="Arquivo de Monitoramento Diário"
            items={[
              'Arquivo .xlsm do relatório diário de entregas',
              'Deve conter a aba "Relatorio" com as colunas na ordem: DS, Supervisor, Região, RDC_DS, Estoque DS, Estoque Motorista, Estoque Total, Estoque >7d, Recebimento, Volume Total, Pendência Scan, Volume Saída, Taxa Expedição, Qtd Motoristas, Eficiência Pessoal, Entregue, Eficiência Assinatura',
              'A primeira coluna (DS) deve começar com "DS"',
              'Não altere a ordem das colunas nem o nome da aba',
            ]}
          />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {erro && <Alert type="warning" className="mb-4">{erro}</Alert>}

      {/* Seletor de upload */}
      {uploads.length > 0 && (
        <div className="flex items-center gap-3 mb-6 bg-white border border-slate-200 rounded-xl p-3">
          {/* Data A */}
          <span className="text-xs font-semibold text-slate-500 uppercase shrink-0">
            {comparing ? 'Data A' : 'Upload'}
          </span>
          <select value={uploadSel || ''} onChange={e => setUploadSel(Number(e.target.value))}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white flex-1 max-w-xs">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {fmtDate(u.data_ref)} — {u.total_ds} bases
              </option>
            ))}
          </select>

          {/* Data B (modo comparativo) */}
          {comparing && (
            <>
              <span className="text-slate-400 font-bold text-sm shrink-0">vs</span>
              <span className="text-xs font-semibold text-slate-500 uppercase shrink-0">Data B</span>
              <select value={compareId || ''} onChange={e => setCompareId(Number(e.target.value))}
                className="px-3 py-1.5 border border-imile-300 rounded-lg text-sm bg-imile-50 flex-1 max-w-xs text-imile-700 font-medium">
                {uploads.filter(u => u.id !== uploadSel).map(u => (
                  <option key={u.id} value={u.id}>
                    {fmtDate(u.data_ref)} — {u.total_ds} bases
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Botão comparar */}
          {uploads.length > 1 && (
            <button
              onClick={() => { setComparing(v => !v); if (comparing) setCompareId(null) }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0',
                comparing
                  ? 'bg-imile-500 text-white hover:bg-imile-600'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}>
              <GitCompare size={13} />
              {comparing ? 'Comparando' : 'Comparar'}
            </button>
          )}

          <button onClick={() => carregarUploads()} className="p-1.5 text-slate-400 hover:text-slate-600 shrink-0">
            <RefreshCw size={14} />
          </button>
          {isAdmin && uploadSel && !comparing && (
            <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600 shrink-0" title="Excluir upload">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {uploads.length === 0 && !loading && (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o arquivo de Monitoramento Diário (.xlsm)</p>
        </Card>
      )}

      {(loading || (comparing && loadingCompare)) && (
        <div className="flex items-center gap-2 text-slate-500 mt-8 justify-center">
          <Loader size={18} className="animate-spin" /> Carregando...
        </div>
      )}

      {/* ── MODO COMPARATIVO ─────────────────────────────────── */}
      {comparing && dados && dadosCompare && !loading && !loadingCompare && (
        <>
          {/* Cabeçalho comparativo */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-2 text-center text-sm font-semibold">
              📅 Data A — {uploadA?.data_ref || '—'}
            </div>
            <div className="text-slate-400 font-bold text-lg">vs</div>
            <div className="flex-1 bg-imile-600 text-white rounded-xl px-4 py-2 text-center text-sm font-semibold">
              📅 Data B — {uploadB?.data_ref || '—'}
            </div>
          </div>

          {/* KPIs comparativos */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KPICompare label="Taxa Expedição"
              a={dados.totais.taxa_expedicao} b={dadosCompare.totais.taxa_expedicao}
              fmt={v => `${((v || 0) * 100).toFixed(1)}%`} />
            <KPICompare label="Entregue"
              a={dados.totais.entregue} b={dadosCompare.totais.entregue}
              fmt={F} />
            <KPICompare label="Volume Saída"
              a={dados.totais.volume_saida} b={dadosCompare.totais.volume_saida}
              fmt={F} />
            <KPICompare label="Estoque >7d"
              a={dados.totais.estoque_7d} b={dadosCompare.totais.estoque_7d}
              fmt={F} invertDelta />
          </div>

          {/* Tabela comparativa por DS */}
          <TabelaComparativo dadosA={dados} dadosB={dadosCompare} />
        </>
      )}

      {/* ── MODO NORMAL ──────────────────────────────────────── */}
      {!comparing && !loading && dados && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <KPI label="Volume Total"   value={F(dados.totais.volume_total)}   icon={Package}       color="#095EF7" />
            <KPI label="Recebimento"    value={F(dados.totais.recebimento)}     icon={TrendingUp}    color="#16A34A" />
            <KPI label="Saída"          value={F(dados.totais.volume_saida)}    icon={Truck}         color="#7C3AED" />
            <KPI label="Taxa Expedição" value={`${(dados.totais.taxa_expedicao * 100).toFixed(1)}`} suffix="%" icon={TrendingUp}
              color={dados.totais.taxa_expedicao >= 0.9 ? '#16A34A' : dados.totais.taxa_expedicao >= 0.7 ? '#EA580C' : '#DC2626'} />
            <KPI label="Entregue"       value={F(dados.totais.entregue)}        icon={Package}       color="#0891B2" />
            <KPI label="Estoque >7d"    value={F(dados.totais.estoque_7d)}      icon={AlertTriangle}
              color={dados.totais.estoque_7d > 100 ? '#DC2626' : '#334155'} />
          </div>

          {/* Tabela principal */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    {COLS.map(col => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        className={`px-2 py-2.5 border border-slate-700 cursor-pointer hover:bg-slate-700 whitespace-nowrap
                          ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                        {col.label}{sortCol === col.key && (sortAsc ? ' ↑' : ' ↓')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDados.map((row, i) => (
                    <tr key={i} className={`${i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-imile-50/60`}>
                      {COLS.map(col => {
                        const val = row[col.key]
                        if (col.pct) return <TaxaCell key={col.key} value={val || 0} />
                        if (col.danger && val > 0) return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono font-bold text-xs text-red-600 bg-red-50">
                            {(val || 0).toLocaleString('pt-BR')}
                          </td>
                        )
                        if (col.dec) return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono text-xs text-slate-600">
                            {val ? val.toFixed(1) : '0'}
                          </td>
                        )
                        if (col.num) return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono text-xs text-slate-700">
                            {(val || 0).toLocaleString('pt-BR')}
                          </td>
                        )
                        return (
                          <td key={col.key} className={`px-2 py-2 border border-slate-200 text-xs
                            ${col.bold ? 'font-semibold text-slate-800' : 'text-slate-600'}
                            ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                            {val || '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}

                  {/* Linha de total */}
                  <tr className="bg-slate-800 text-white font-bold">
                    <td className="px-2 py-2 border border-slate-700 text-xs">TOTAL</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center">—</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center">—</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.rdc_ds)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_ds)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_motorista)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_total)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_7d)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.recebimento)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.volume_total)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">—</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.volume_saida)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{(dados.totais.taxa_expedicao * 100).toFixed(1)}%</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.qtd_motoristas)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{dados.totais.eficiencia_pessoal?.toFixed(1)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.entregue)}</td>
                    <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{dados.totais.eficiencia_assinatura?.toFixed(1)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

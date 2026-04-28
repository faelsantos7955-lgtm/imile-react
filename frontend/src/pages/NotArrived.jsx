/**
 * pages/NotArrived.jsx — Not Arrived com movimentação
 * Relatório 有发未到问题件后又有其他操作
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, X, FileSpreadsheet, AlertCircle, ChevronUp, ChevronDown,
  Package, Truck, CheckCircle, ArrowRightLeft, Download, Loader,
} from 'lucide-react'
import api, { pollJob } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  KpiCard, Card, SectionHeader, EmptyState, LogisticsEmptyState, Alert, Badge, Button, toast,
} from '../components/ui'
import clsx from 'clsx'

// ── helpers ───────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (n) => `${(n ?? 0).toFixed(1)}%`

// ── Hero Not Arrived Movimentação ─────────────────────────────
function HeroNotArrived() {
  const checkpoints = [
    { cx: 580, cy: 80,  label: 'Saída',      color: 'rgba(16,185,129,0.85)',  delay: '0s'   },
    { cx: 650, cy: 55,  label: 'Chegada',    color: 'rgba(14,165,233,0.85)',  delay: '0.6s' },
    { cx: 720, cy: 95,  label: 'Entregador', color: 'rgba(245,158,11,0.85)',  delay: '1.2s' },
    { cx: 790, cy: 65,  label: 'Entregue?',  color: 'rgba(239,68,68,0.85)',   delay: '1.8s' },
  ]
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 380, height: 380, top: -150, left: -90, background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 280, height: 280, top: -60, right: -40, background: 'radial-gradient(circle,#16a34a 0%,transparent 70%)', opacity: 0.2 }} />
      <div className="blob blob-c" style={{ width: 200, height: 200, bottom: -60, left: '40%', background: 'radial-gradient(circle,#dc2626 0%,transparent 70%)', opacity: 0.15 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Caminhão em trânsito */}
      <div className="truck-anim absolute pointer-events-none" style={{ bottom: 26, left: 0 }}>
        <svg width={220} height={50} viewBox="0 0 220 50" fill="none">
          <rect x={2} y={8} width={120} height={30} rx={3} fill="white" fillOpacity={0.88}/>
          <rect x={2} y={30} width={120} height={8} rx={2} fill="#0032A0"/>
          <text x={28} y={24} fontFamily="Arial,sans-serif" fontSize={7} fontWeight="bold" fill="#0032A0" fillOpacity={0.7} letterSpacing={3}>iMile</text>
          <path d="M122 8 L122 38 L218 38 L218 22 L212 8 Z" fill="#0032A0"/>
          <path d="M130 8 Q135 3 162 3 L212 3 L218 10 L212 8 L130 8 Z" fill="#0028a0"/>
          <path d="M186 4 L213 4 L218 12 L186 12 Z" fill="white" fillOpacity={0.12}/>
          <rect x={248} y={27} width={4} height={8} rx={1} fill="white" fillOpacity={0.9}/>
          {[19,32].map(cx => (
            <g key={cx}><circle cx={cx} cy={44} r={6} fill="#1a1a2e" stroke="white" strokeWidth={1} strokeOpacity={0.5}/><circle cx={cx} cy={44} r={3.5} fill="#111122" stroke="#0032A0" strokeWidth={0.8}/><circle cx={cx} cy={44} r={1.5} fill="white" fillOpacity={0.7}/></g>
          ))}
          {[153,195].map(cx => (
            <g key={cx}><circle cx={cx} cy={44} r={7} fill="#1a1a2e" stroke="white" strokeWidth={1.2} strokeOpacity={0.5}/><circle cx={cx} cy={44} r={4} fill="#111122" stroke="#0032A0" strokeWidth={1}/><circle cx={cx} cy={44} r={1.8} fill="white" fillOpacity={0.7}/></g>
          ))}
        </svg>
      </div>

      {/* Checkpoints de operação */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 900 168" preserveAspectRatio="xMidYMid slice">
        {/* Rota principal */}
        <path d="M-50,130 L570,130 Q575,130 580,80" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" strokeDasharray="8 8" className="route-flow"/>
        {/* Conexões entre checkpoints */}
        {checkpoints.slice(0,-1).map((p, i) => {
          const next = checkpoints[i+1]
          return <path key={i} d={`M${p.cx},${p.cy} L${next.cx},${next.cy}`} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="5 5" className="route-flow" style={{ animationDelay: `${i*0.4}s` }}/>
        })}
        {/* Nós */}
        {checkpoints.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r={6}  fill={p.color} className="signal-blink" style={{ animationDelay: p.delay }}/>
            <circle cx={p.cx} cy={p.cy} r={12} fill="none" stroke={p.color} strokeWidth={0.8} className="hub-ring" style={{ animationDelay: p.delay, animationDuration: '2.5s' }}/>
            <text x={p.cx} y={p.cy + 20} fill="rgba(255,255,255,0.35)" fontSize={7} textAnchor="middle" fontFamily="monospace">{p.label}</text>
          </g>
        ))}
      </svg>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'rgba(130,240,200,.9)' }}>
          NOT ARRIVED · MOVIMENTAÇÃO
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Rastreamento de Exceções</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Pacotes com problemas que ainda tiveram movimentação registrada</p>
      </div>
    </div>
  )
}

function colorRegiao(regiao) {
  const map = {
    'CDC': 'blue', 'São Paulo': 'blue',
    'Sudeste': 'violet', 'Sul': 'green',
    'Nordeste': 'orange', 'Centro-Oeste': 'orange',
    'Norte': 'slate', 'Retorno': 'red',
  }
  return map[regiao] || 'slate'
}

// ── FileChip ──────────────────────────────────────────────────
function FileChip({ name, onRemove }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-700 font-medium">
      <FileSpreadsheet size={12} className="text-imile-500 shrink-0" />
      <span className="truncate max-w-[180px]">{name}</span>
      <button type="button" onClick={onRemove}
        className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors">
        <X size={11} />
      </button>
    </div>
  )
}

// ── UploadPanel ───────────────────────────────────────────────
function UploadPanel({ onClose, onSuccess }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const [fase, setFase] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/api/not-arrived/processar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      if (data.job_id) {
        return await pollJob(`/api/not-arrived/job/${data.job_id}`, setFase)
      }
      return data
    },
    onSuccess: (data) => {
      onSuccess(data)
      onClose()
    },
    onError: (err) => {
      setError(err.response?.data?.detail || err.message || 'Erro ao processar arquivo.')
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Upload — Not Arrived</h2>
            <p className="text-xs text-slate-400 mt-0.5">Arquivo Problem Registration (.xlsx)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Dropzone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) { setFile(f); setError('') }
            }}
            className={clsx(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
              file
                ? 'border-imile-300 bg-imile-50/40'
                : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/20'
            )}
          >
            <input
              ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden"
              onChange={(e) => { setFile(e.target.files[0] || null); setError('') }}
            />
            <Upload size={24} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">
              {file ? 'Clique para trocar o arquivo' : 'Clique ou arraste o arquivo aqui'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Arquivo Problem Registration — máx. 150 MB
            </p>
          </div>

          {/* Arquivo selecionado */}
          {file && (
            <FileChip name={file.name} onRemove={() => setFile(null)} />
          )}

          {/* Guia */}
          <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-600 text-xs mb-1">Formato esperado</p>
            <p>· Aba <strong>数据源</strong> — dados DC</p>
            <p>· Aba <strong>Planilha1</strong> — dados DS</p>
            <p>· Aba <strong>DS</strong> — diretório de estações (opcional, para supervisores)</p>
          </div>

          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-6">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={() => { setError(''); mutation.mutate() }}
            disabled={!file || mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {fase || 'Processando…'}
              </>
            ) : 'Processar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Tabela tendência (heatmap supervisor × data) ──────────────
function TabelaTendencia({ rows }) {
  if (!rows || rows.length === 0) return <EmptyState icon={Package} title="Sem dados de tendência" />

  // Agrupa: supervisores e datas únicas (ordenadas)
  const supSet  = new Set()
  const dateSet = new Set()
  rows.forEach(r => { supSet.add(r.supervisor); dateSet.add(r.data) })

  const datas = [...dateSet].sort()
  // Mostra últimas 20 datas para não estourar a largura
  const datasVisiveis = datas.slice(-20)

  // Mapa supervisor → data → total
  const pivot = {}
  rows.forEach(r => {
    if (!pivot[r.supervisor]) pivot[r.supervisor] = {}
    pivot[r.supervisor][r.data] = (pivot[r.supervisor][r.data] || 0) + r.total
  })

  // Total por supervisor (considerando todas as datas)
  const sups = [...supSet].sort((a, b) => {
    const ta = Object.values(pivot[a] || {}).reduce((s, v) => s + v, 0)
    const tb = Object.values(pivot[b] || {}).reduce((s, v) => s + v, 0)
    return tb - ta
  })

  // Máximo para escala de cor
  const allVals = rows.map(r => r.total).filter(Boolean)
  const maxVal  = allVals.length ? Math.max(...allVals) : 1

  // Cor da célula: escala branco→vermelho (mais alto = mais crítico)
  function cellColor(val) {
    if (!val) return 'bg-slate-50 text-slate-300'
    const ratio = Math.min(val / maxVal, 1)
    if (ratio >= 0.75) return 'bg-red-500 text-white font-semibold'
    if (ratio >= 0.50) return 'bg-red-300 text-red-900 font-medium'
    if (ratio >= 0.25) return 'bg-amber-200 text-amber-900'
    return 'bg-amber-50 text-amber-700'
  }

  // Formata data DD/MM
  function fmtData(iso) {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] w-full border-collapse">
        <thead>
          <tr className="bg-slate-800">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white/60 sticky left-0 bg-slate-800 z-10 min-w-[130px]">
              Supervisor
            </th>
            {datasVisiveis.map(d => (
              <th key={d} className="px-2 py-2 text-center text-[10px] font-bold text-white/60 min-w-[42px] whitespace-nowrap">
                {fmtData(d)}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white sticky right-0 bg-slate-800 z-10">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sups.map(sup => {
            const supData = pivot[sup] || {}
            const totalSup = Object.values(supData).reduce((s, v) => s + v, 0)
            return (
              <tr key={sup} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-3 py-1.5 font-semibold text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100">
                  {sup}
                </td>
                {datasVisiveis.map(d => {
                  const val = supData[d] || 0
                  return (
                    <td key={d} className={clsx('px-1 py-1.5 text-center font-mono transition-colors rounded-sm mx-0.5', cellColor(val))}>
                      {val || '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 sticky right-0 bg-white z-10 border-l border-slate-100">
                  {fmt(totalSup)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
          <tr>
            <td className="px-3 py-2 font-bold text-xs text-slate-700 sticky left-0 bg-slate-50 z-10">Total</td>
            {datasVisiveis.map(d => {
              const tot = sups.reduce((s, sup) => s + (pivot[sup]?.[d] || 0), 0)
              return (
                <td key={d} className="px-1 py-2 text-center font-mono font-semibold text-slate-700 text-[10px]">
                  {tot || '—'}
                </td>
              )
            })}
            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 text-xs sticky right-0 bg-slate-50 z-10">
              {fmt(rows.reduce((s, r) => s + r.total, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Tabela estações ───────────────────────────────────────────
function TabelaEstacoes({ rows }) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('total')
  const [sortAsc, setSortAsc] = useState(false)
  const [page, setPage] = useState(0)
  const PER_PAGE = 15

  const toggle = (col) => {
    if (sortCol === col) setSortAsc(v => !v)
    else { setSortCol(col); setSortAsc(false) }
    setPage(0)
  }

  const filtered = rows
    .filter(r => r.oc_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const v = (sortAsc ? 1 : -1)
      if (typeof a[sortCol] === 'string') return v * a[sortCol].localeCompare(b[sortCol])
      return v * ((a[sortCol] ?? 0) - (b[sortCol] ?? 0))
    })

  const pageRows = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const Th = ({ col, children, className = '' }) => (
    <th
      onClick={() => toggle(col)}
      className={clsx(
        'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
        sortCol === col ? 'text-white' : 'text-white/60 hover:text-white/90',
        className
      )}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortCol === col && (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  )

  return (
    <div className="space-y-3">
      <input
        type="text" placeholder="Filtrar estação…" value={search}
        onChange={e => { setSearch(e.target.value); setPage(0) }}
        className="w-full max-w-xs px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400"
      />
      <div className="rounded-xl overflow-hidden border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-800">
            <tr>
              <Th col="oc_name">Estação</Th>
              <Th col="tipo">Tipo</Th>
              <Th col="regiao">Região</Th>
              <Th col="supervisor">Supervisor</Th>
              <Th col="total" className="text-right">Total</Th>
              <Th col="entregues" className="text-right">Entregues</Th>
              <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">
                % Entregue
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageRows.map((r, i) => {
              const pctEnt = r.total > 0 ? (r.entregues / r.total * 100) : 0
              return (
                <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{r.oc_name}</td>
                  <td className="px-3 py-2.5">
                    <Badge color={r.tipo === 'DC' ? 'blue' : 'green'}>{r.tipo}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{r.regiao}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.supervisor}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">
                    {fmt(r.total)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-700">
                    {fmt(r.entregues)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={clsx(
                      'font-mono text-[11px] font-semibold',
                      pctEnt >= 50 ? 'text-emerald-600' : pctEnt >= 20 ? 'text-amber-600' : 'text-red-500'
                    )}>
                      {pct(pctEnt)}
                    </span>
                  </td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                  Nenhuma estação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} estações · página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 transition-colors">
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabela supervisores ───────────────────────────────────────
function TabelaSupervisores({ rows }) {
  const total_geral = rows.reduce((s, r) => s + r.total, 0)
  return (
    <div className="rounded-xl overflow-hidden border border-slate-100">
      <table className="w-full text-xs">
        <thead className="bg-slate-800">
          <tr>
            <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-white/60">Supervisor</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">Total</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">DC</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">DS</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">Entregues</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">% Entregue</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">% do Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => {
            const pctEnt  = r.total > 0 ? (r.entregues / r.total * 100) : 0
            const pctTot  = total_geral > 0 ? (r.total / total_geral * 100) : 0
            return (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-slate-800">{r.supervisor}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(r.total)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(r.total_dc)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-500">{fmt(r.total_ds)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-emerald-700">{fmt(r.entregues)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={clsx(
                    'font-mono text-[11px] font-semibold',
                    pctEnt >= 50 ? 'text-emerald-600' : pctEnt >= 20 ? 'text-amber-600' : 'text-red-500'
                  )}>
                    {pct(pctEnt)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-imile-400 rounded-full" style={{ width: `${pctTot}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 w-8 text-right">{pct(pctTot)}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tabela operações ──────────────────────────────────────────
function TabelaOperacoes({ rows }) {
  const total = rows.reduce((s, r) => s + r.total, 0)
  const COLOR_MAP = {
    'Entregue':             'bg-emerald-400',
    'Chegada':              'bg-imile-400',
    'Saída':                'bg-blue-400',
    'Saída p/ Entrega':     'bg-violet-400',
    'Carregamento':         'bg-sky-400',
    'Consolidação':         'bg-cyan-400',
    'Atribuição Entregador':'bg-indigo-400',
    'Retorno ao Hub':       'bg-amber-400',
    'Devolução':            'bg-orange-400',
    'Encerr. por Exceção':  'bg-red-400',
    'Coleta':               'bg-teal-400',
    'Ordem de Entrega':     'bg-purple-400',
    'Armazenagem':          'bg-slate-400',
    'Chegada Devolução':    'bg-rose-400',
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => {
        const w = total > 0 ? (r.total / total * 100) : 0
        const bar = COLOR_MAP[r.operacao] || 'bg-slate-300'
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-40 text-xs text-slate-600 truncate shrink-0">{r.operacao}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full transition-all', bar)} style={{ width: `${w}%` }} />
            </div>
            <span className="text-xs font-mono font-semibold text-slate-700 w-14 text-right">{fmt(r.total)}</span>
            <span className="text-[11px] font-mono text-slate-400 w-10 text-right">{pct(w)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Tabela regiões ────────────────────────────────────────────
function TabelaRegioes({ rows }) {
  // Pivotar: regiao × tipo
  const regioes = [...new Set(rows.map(r => r.regiao))].sort()
  const tipos   = [...new Set(rows.map(r => r.tipo))].sort()
  const pivot   = {}
  rows.forEach(r => {
    if (!pivot[r.regiao]) pivot[r.regiao] = {}
    pivot[r.regiao][r.tipo] = (pivot[r.regiao][r.tipo] || 0) + r.total
  })
  const totais = regioes.map(reg => Object.values(pivot[reg] || {}).reduce((s, v) => s + v, 0))
  const grandTotal = totais.reduce((s, v) => s + v, 0)

  return (
    <div className="rounded-xl overflow-hidden border border-slate-100">
      <table className="w-full text-xs">
        <thead className="bg-slate-800">
          <tr>
            <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-white/60">Região</th>
            {tipos.map(t => (
              <th key={t} className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">{t}</th>
            ))}
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white">Total</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {regioes.map((reg, i) => {
            const tot = totais[i]
            const w   = grandTotal > 0 ? (tot / grandTotal * 100) : 0
            return (
              <tr key={reg} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-3 py-2.5">
                  <Badge color={colorRegiao(reg)}>{reg}</Badge>
                </td>
                {tipos.map(t => (
                  <td key={t} className="px-3 py-2.5 text-right font-mono text-slate-600">
                    {fmt(pivot[reg]?.[t] || 0)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(tot)}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400 text-[11px]">{pct(w)}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-slate-50 border-t border-slate-200">
          <tr>
            <td className="px-3 py-2 font-bold text-xs text-slate-700">Total</td>
            {tipos.map(t => (
              <td key={t} className="px-3 py-2 text-right font-mono font-semibold text-slate-700 text-xs">
                {fmt(rows.filter(r => r.tipo === t).reduce((s, r) => s + r.total, 0))}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 text-xs">{fmt(grandTotal)}</td>
            <td className="px-3 py-2 text-right font-mono text-slate-400 text-xs">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Selector de upload ────────────────────────────────────────
function UploadSelector({ uploads, selected, onChange }) {
  return (
    <select
      value={selected || ''}
      onChange={e => onChange(Number(e.target.value))}
      className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 text-slate-700"
    >
      {uploads.map(u => (
        <option key={u.id} value={u.id}>
          {u.data_ref} — {fmt(u.total)} pacotes
        </option>
      ))}
    </select>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function NotArrived() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [showPanel, setShowPanel] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [flashResult, setFlashResult] = useState(null)
  const [baixando, setBaixando] = useState(false)

  // Lista de uploads
  const { data: uploads = [], isLoading: loadingUploads } = useQuery({
    queryKey: ['not-arrived-uploads'],
    queryFn: () => api.get('/api/not-arrived/uploads').then(r => r.data),
  })

  // Seleciona o upload mais recente automaticamente
  useEffect(() => {
    if (uploads.length > 0 && !selectedId) {
      setSelectedId(uploads[0].id)
    }
  }, [uploads, selectedId])

  // Detalhe do upload selecionado
  const { data: detalhe, isLoading: loadingDetalhe } = useQuery({
    queryKey: ['not-arrived-detalhe', selectedId],
    queryFn: () => api.get(`/api/not-arrived/upload/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  })

  // Tendência (heatmap supervisor × data)
  const { data: tendencia = [] } = useQuery({
    queryKey: ['not-arrived-tendencia', selectedId],
    queryFn: () => api.get(`/api/not-arrived/upload/${selectedId}/tendencia`).then(r => r.data),
    enabled: !!selectedId,
  })

  const upload = uploads.find(u => u.id === selectedId)

  const handleExcel = async () => {
    setBaixando(true)
    try {
      const r = await api.get(`/api/excel/not-arrived-mov/${selectedId}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `NotArrivedMov_${upload?.data_ref || 'relatorio'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.erro('Erro ao gerar Excel.') }
    finally { setBaixando(false) }
  }

  const handleUploadSuccess = (data) => {
    setFlashResult(data)
    qc.invalidateQueries({ queryKey: ['not-arrived-uploads'] })
    setSelectedId(data.upload_id)
  }

  if (loadingUploads) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <HeroNotArrived />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-imile-500 mb-0.5">
            Relatório de Exceção
          </p>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">
            Not Arrived com Movimentação
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pacotes expedidos mas não recebidos que tiveram operações subsequentes
          </p>
        </div>
        <Button onClick={() => setShowPanel(true)} size="md">
          <Upload size={14} /> Novo Upload
        </Button>
      </div>

      {/* Flash resultado */}
      {flashResult && (
        <Alert type="success" onClose={() => setFlashResult(null)}>
          Processado com sucesso — {fmt(flashResult.total)} pacotes · {fmt(flashResult.total_dc)} DC · {fmt(flashResult.total_ds)} DS
        </Alert>
      )}

      {/* Sem uploads */}
      {uploads.length === 0 ? (
        <LogisticsEmptyState
          title="Nenhum upload encontrado"
          description="Faça o upload do arquivo Problem Registration (.xlsx) para visualizar os dados."
          action={<Button onClick={() => setShowPanel(true)}>Fazer upload</Button>}
        />
      ) : (
        <>
          {/* Seletor de data */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Data de referência:</span>
            <UploadSelector uploads={uploads} selected={selectedId} onChange={setSelectedId} />
            {selectedId && (
              <button onClick={handleExcel} disabled={baixando}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors">
                {baixando ? <Loader size={12} className="animate-spin" /> : <Download size={12} />} Excel
              </button>
            )}
          </div>

          {/* KPIs */}
          {upload && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiCard
                label="Total Pacotes"
                value={fmt(upload.total)}
                color="blue"
                icon={Package}
              />
              <KpiCard
                label="DC"
                value={fmt(upload.total_dc)}
                sub={upload.total > 0 ? `${(upload.total_dc / upload.total * 100).toFixed(1)}% do total` : ''}
                color="violet"
                icon={ArrowRightLeft}
              />
              <KpiCard
                label="DS"
                value={fmt(upload.total_ds)}
                sub={upload.total > 0 ? `${(upload.total_ds / upload.total * 100).toFixed(1)}% do total` : ''}
                color="slate"
                icon={Package}
              />
              <KpiCard
                label="Entregues"
                value={fmt(upload.total_entregues)}
                sub={`dos pacotes com problema`}
                color="green"
                icon={CheckCircle}
              />
              <KpiCard
                label="% Entregue"
                value={`${upload.pct_entregues?.toFixed(1)}%`}
                sub="com movimentação de entrega"
                color={upload.pct_entregues >= 50 ? 'green' : upload.pct_entregues >= 20 ? 'orange' : 'red'}
                icon={Truck}
              />
            </div>
          )}

          {/* Conteúdo */}
          {loadingDetalhe ? (
            <div className="flex items-center justify-center h-40">
              <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
            </div>
          ) : detalhe && (
            <>
              {/* Dash — 汇总 — Tendência por Supervisor */}
              <SectionHeader title="Dash — Tendência por Supervisor (汇总)" />
              <Card padding={false}>
                <TabelaTendencia rows={tendencia} />
              </Card>

              {/* Região + Operações lado a lado */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card title="Por Região" subtitle="Distribuição por tipo de estação">
                  {detalhe.por_regiao.length > 0
                    ? <TabelaRegioes rows={detalhe.por_regiao} />
                    : <EmptyState icon={Package} title="Sem dados de região" />}
                </Card>

                <Card title="Última Operação" subtitle="Ação mais recente nos pacotes com problema">
                  {detalhe.por_operacao.length > 0
                    ? <TabelaOperacoes rows={detalhe.por_operacao} />
                    : <EmptyState icon={Package} title="Sem dados de operação" />}
                </Card>
              </div>

              {/* Supervisores */}
              <SectionHeader title="Por Supervisor" />
              <Card padding={false}>
                {detalhe.por_supervisor.length > 0
                  ? <TabelaSupervisores rows={detalhe.por_supervisor} />
                  : <EmptyState icon={Package} title="Sem dados de supervisor" />}
              </Card>

              {/* Estações */}
              <SectionHeader title="Por Estação" />
              <Card>
                {detalhe.por_estacao.length > 0
                  ? <TabelaEstacoes rows={detalhe.por_estacao} />
                  : <EmptyState icon={Package} title="Sem dados de estação" />}
              </Card>
            </>
          )}
        </>
      )}

      {/* Upload Panel */}
      {showPanel && (
        <UploadPanel
          onClose={() => setShowPanel(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  )
}

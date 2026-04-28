/**
 * pages/Correlacao.jsx — Correlação Backlog × Reclamações por DS
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, ZAxis,
} from 'recharts'
import { Loader, AlertCircle, TrendingUp } from 'lucide-react'
import { Card, SectionHeader } from '../components/ui'
import api from '../lib/api'

// ── Hero Correlação ───────────────────────────────────────────
function HeroCorrelacao() {
  const pontos = [
    { cx: 620, cy: 60,  r: 8,  delay: '0s'   },
    { cx: 680, cy: 90,  r: 11, delay: '0.5s' },
    { cx: 720, cy: 50,  r: 7,  delay: '1s'   },
    { cx: 660, cy: 120, r: 14, delay: '1.5s' },
    { cx: 740, cy: 100, r: 9,  delay: '2s'   },
    { cx: 700, cy: 70,  r: 6,  delay: '2.5s' },
  ]
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 380, height: 380, top: -150, left: -90, background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 280, height: 280, top: -60, right: -40, background: 'radial-gradient(circle,#8b5cf6 0%,transparent 70%)', opacity: 0.22 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Scatter plot decorativo */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 900 168" preserveAspectRatio="xMidYMid slice">
        {/* Eixos */}
        <line x1={560} y1={148} x2={790} y2={148} stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
        <line x1={560} y1={148} x2={560} y2={28}  stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
        {/* Linha de tendência */}
        <path d="M575,138 L780,42" stroke="rgba(139,92,246,0.4)" strokeWidth={1.5} strokeDasharray="6 5" className="route-flow"/>
        {/* Pontos do scatter */}
        {pontos.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r={p.r} fill="rgba(139,92,246,0.25)" stroke="rgba(139,92,246,0.6)" strokeWidth={0.8}/>
            <circle cx={p.cx} cy={p.cy} r={p.r + 5} fill="none" stroke="rgba(139,92,246,0.3)" strokeWidth={0.6}
              className="hub-ring" style={{ animationDelay: p.delay, animationDuration: '3s' }}/>
          </g>
        ))}
        {/* Risco extremo — ponto vermelho */}
        <circle cx={755} cy={45}  r={13} fill="rgba(239,68,68,0.3)"  stroke="rgba(239,68,68,0.7)"  strokeWidth={1}/>
        <circle cx={755} cy={45}  r={18} fill="none" stroke="rgba(239,68,68,0.4)" strokeWidth={0.8}
          className="hub-ring" style={{ animationDelay: '1s', animationDuration: '2s' }}/>
        {/* Label eixos */}
        <text x={790} y={152} fill="rgba(255,255,255,0.25)" fontSize={8} textAnchor="end" fontFamily="monospace">Backlog</text>
        <text x={555} y={26}  fill="rgba(255,255,255,0.25)" fontSize={8} textAnchor="end" fontFamily="monospace" writingMode="tb">Recl.</text>
        {/* Rota de conexão entre páginas */}
        <path d="M0,90 Q200,60 400,80 Q500,88 560,88" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeDasharray="8 8" className="route-flow" style={{ animationDelay: '1s' }}/>
      </svg>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: 'rgba(200,180,255,.9)' }}>
          ANÁLISE DE RISCO
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Correlação Backlog × Reclamações</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>DS com alto backlog vencido e muitas reclamações — maior risco operacional</p>
      </div>
    </div>
  )
}

const RISCO_COR = (risco) => {
  if (risco >= 70) return '#ef4444'   // vermelho
  if (risco >= 40) return '#f97316'   // laranja
  if (risco >= 20) return '#eab308'   // amarelo
  return '#22c55e'                    // verde
}

const RISCO_LABEL = (risco) => {
  if (risco >= 70) return { label: 'Crítico',  cls: 'bg-red-100 text-red-700' }
  if (risco >= 40) return { label: 'Alto',     cls: 'bg-orange-100 text-orange-700' }
  if (risco >= 20) return { label: 'Médio',    cls: 'bg-yellow-100 text-yellow-700' }
  return              { label: 'Baixo',    cls: 'bg-green-100 text-green-700' }
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const { label, cls } = RISCO_LABEL(d.risco)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm min-w-[180px]">
      <p className="font-bold text-slate-800 mb-1">{d.ds}</p>
      {d.supervisor && <p className="text-xs text-slate-500 mb-2">{d.supervisor}</p>}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Backlog &gt;7d</span>
          <span className="font-semibold">{d.pct_7d}% ({d.total_7d})</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Reclamações</span>
          <span className="font-semibold">{d.reclamacoes}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Orders</span>
          <span className="font-semibold">{d.orders?.toLocaleString('pt-BR')}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-slate-100">
          <span className="text-slate-500">Risco</span>
          <span className={`px-1.5 py-0.5 rounded font-semibold ${cls}`}>{label} ({d.risco})</span>
        </div>
      </div>
    </div>
  )
}

export default function Correlacao() {
  const [sortField, setSortField] = useState('risco')
  const [filtroSup, setFiltroSup] = useState('')

  const { data: resp, isLoading, isError } = useQuery({
    queryKey: ['correlacao'],
    queryFn: () => api.get('/api/correlacao/dados').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  const dados     = resp?.dados ?? []
  const backlogDR = resp?.backlog_data_ref
  const recDR     = resp?.rec_data_ref

  const supervisores = useMemo(() => [...new Set(dados.map(d => d.supervisor).filter(Boolean))].sort(), [dados])

  const filtrado = useMemo(() => {
    let d = filtroSup ? dados.filter(r => r.supervisor === filtroSup) : dados
    return [...d].sort((a, b) => {
      if (sortField === 'risco')       return b.risco - a.risco
      if (sortField === 'pct_7d')      return b.pct_7d - a.pct_7d
      if (sortField === 'reclamacoes') return b.reclamacoes - a.reclamacoes
      if (sortField === 'backlog')     return b.backlog - a.backlog
      return a.ds.localeCompare(b.ds)
    })
  }, [dados, filtroSup, sortField])

  // Médias para linhas de referência
  const mediaX = useMemo(() => filtrado.length ? filtrado.reduce((s, d) => s + d.pct_7d, 0) / filtrado.length : 0, [filtrado])
  const mediaY = useMemo(() => filtrado.length ? filtrado.reduce((s, d) => s + d.reclamacoes, 0) / filtrado.length : 0, [filtrado])

  if (isLoading) return (
    <div className="flex items-center gap-2 text-slate-500 mt-12 justify-center">
      <Loader size={18} className="animate-spin" /> Carregando correlação...
    </div>
  )

  if (isError || !dados.length) return (
    <div className="mt-8">
      <PageHeader icon="📊" title="Correlação Backlog × Reclamações" subtitle="Identifique DS com alto backlog vencido e alto volume de reclamações" />
      <div className="flex items-center gap-2 text-slate-500 mt-6 bg-white border border-slate-200 rounded-xl p-6">
        <AlertCircle size={16} /> Sem dados disponíveis. Faça o upload de backlog e reclamações primeiro.
      </div>
    </div>
  )

  const thBtn = (field, label) => (
    <th
      onClick={() => setSortField(field)}
      className={`px-4 py-3 text-center cursor-pointer select-none transition-colors ${sortField === field ? 'bg-imile-600 text-white' : 'hover:bg-slate-700'}`}
    >
      {label} {sortField === field ? '↓' : ''}
    </th>
  )

  return (
    <div>
      <HeroCorrelacao />

      {/* Data refs */}
      <div className="flex flex-wrap gap-3 mb-4 text-xs text-slate-500">
        {backlogDR && <span className="bg-slate-100 px-2 py-1 rounded-lg">Backlog: {backlogDR}</span>}
        {recDR     && <span className="bg-slate-100 px-2 py-1 rounded-lg">Reclamações: {recDR}</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'DS analisadas',   val: dados.length },
          { label: 'DS críticas',     val: dados.filter(d => d.risco >= 70).length,  cls: 'text-red-600' },
          { label: 'DS risco alto',   val: dados.filter(d => d.risco >= 40 && d.risco < 70).length, cls: 'text-orange-600' },
          { label: 'Média backlog>7d', val: `${mediaX.toFixed(1)}%` },
        ].map(({ label, val, cls = 'text-slate-800' }) => (
          <Card key={label} className="text-center py-4">
            <p className={`text-2xl font-bold ${cls}`}>{val}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </Card>
        ))}
      </div>

      {/* Filtro supervisor */}
      {supervisores.length > 0 && (
        <div className="mb-4">
          <select value={filtroSup} onChange={e => setFiltroSup(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="">Todos os supervisores</option>
            {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* Scatter Chart */}
      <SectionHeader title="Mapa de Risco: Backlog >7d (%) × Reclamações" />
      <Card>
        <div className="flex gap-4 text-xs text-slate-500 mb-3 flex-wrap">
          {[
            { cor: '#ef4444', label: 'Crítico (≥70)' },
            { cor: '#f97316', label: 'Alto (40-69)' },
            { cor: '#eab308', label: 'Médio (20-39)' },
            { cor: '#22c55e', label: 'Baixo (<20)' },
          ].map(({ cor, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: cor }} />
              {label}
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="pct_7d"
              type="number"
              name="Backlog >7d (%)"
              label={{ value: 'Backlog >7d (%)', position: 'insideBottom', offset: -15, style: { fontSize: 12, fill: '#64748b' } }}
              tickFormatter={v => `${v}%`}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <YAxis
              dataKey="reclamacoes"
              type="number"
              name="Reclamações"
              label={{ value: 'Reclamações', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 12, fill: '#64748b' } }}
              tick={{ fontSize: 11, fill: '#64748b' }}
            />
            <ZAxis dataKey="orders" range={[40, 400]} name="Orders" />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x={mediaX} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Média', fontSize: 10, fill: '#94a3b8' }} />
            <ReferenceLine y={mediaY} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'Média', fontSize: 10, fill: '#94a3b8' }} />
            <Scatter data={filtrado} name="DS">
              {filtrado.map((d, i) => (
                <Cell key={i} fill={RISCO_COR(d.risco)} fillOpacity={0.85} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-400 mt-2 text-center">
          Tamanho do ponto proporcional ao volume de orders · Quadrante superior direito = maior risco
        </p>
      </Card>

      {/* Tabela de risco */}
      <SectionHeader title="Ranking de Risco por DS" />
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs">
                <th className="px-4 py-3 text-left">DS</th>
                <th className="px-4 py-3 text-left">Supervisor</th>
                {thBtn('backlog',     'Backlog')}
                {thBtn('pct_7d',      '>7d (%)')}
                {thBtn('reclamacoes', 'Reclamações')}
                {thBtn('risco',       'Risco')}
              </tr>
            </thead>
            <tbody>
              {filtrado.map((d, i) => {
                const { label, cls } = RISCO_LABEL(d.risco)
                return (
                  <tr key={d.ds} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <span className="text-slate-400 mr-2">#{i + 1}</span>{d.ds}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{d.supervisor || '—'}</td>
                    <td className="px-4 py-3 text-center">{d.backlog?.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${d.pct_7d >= 15 ? 'text-red-600' : d.pct_7d >= 8 ? 'text-orange-600' : 'text-slate-700'}`}>
                        {d.pct_7d}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${d.reclamacoes >= 5 ? 'text-red-600' : d.reclamacoes >= 2 ? 'text-orange-600' : 'text-slate-700'}`}>
                        {d.reclamacoes}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
                        {label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

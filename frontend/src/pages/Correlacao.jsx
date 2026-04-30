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
import { Card } from '../components/ui'
import api from '../lib/api'


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
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Correlação Backlog × Reclamações</h1>
          <div className="page-sub">Identifique DS com alto backlog vencido e alto volume de reclamações</div>
        </div>
      </div>
      <div className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--slate-500)' }}>
        <AlertCircle size={16} /> Sem dados disponíveis. Faça o upload de backlog e reclamações primeiro.
      </div>
    </>
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
      <div className="page-head">
        <div>
          <h1 className="page-title">Correlação Backlog × Reclamações</h1>
          <div className="page-sub">DS com alto backlog vencido e muitas reclamações — maior risco operacional
            {backlogDR && <> · Backlog: <strong>{backlogDR}</strong></>}
            {recDR     && <> · Reclamações: <strong>{recDR}</strong></>}
          </div>
        </div>
        <div className="page-actions">
          {supervisores.length > 0 && (
            <select value={filtroSup} onChange={e => setFiltroSup(e.target.value)} className="filter-select">
              <option value="">Todos os supervisores</option>
              {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi"><div className="kpi-head"><div className="kpi-label">DS analisadas</div></div><div className="kpi-value">{dados.length}</div></div>
        <div className="kpi"><div className="kpi-head"><div className="kpi-label">DS críticas</div><div className="kpi-icon danger"><TrendingUp size={14}/></div></div><div className="kpi-value" style={{color:'var(--danger-600)'}}>{dados.filter(d=>d.risco>=70).length}</div></div>
        <div className="kpi"><div className="kpi-head"><div className="kpi-label">DS risco alto</div></div><div className="kpi-value" style={{color:'var(--warn-600)'}}>{dados.filter(d=>d.risco>=40&&d.risco<70).length}</div></div>
        <div className="kpi"><div className="kpi-head"><div className="kpi-label">Média backlog &gt;7d</div></div><div className="kpi-value">{mediaX.toFixed(1)}<span className="unit">%</span></div></div>
      </div>

      {/* Scatter Chart */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head"><h3 className="card-title">Mapa de Risco — Backlog &gt;7d × Reclamações</h3></div>
        <div className="card-body">
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
        <p className="card-sub" style={{ marginTop: 8 }}>
          Tamanho do ponto proporcional ao volume de orders · Quadrante superior direito = maior risco
        </p>
        </div>
      </div>

      {/* Tabela de risco */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-head"><h3 className="card-title">Ranking de Risco por DS</h3></div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>DS</th><th>Supervisor</th>
                {thBtn('backlog','Backlog')}{thBtn('pct_7d','>7d (%)')}
                {thBtn('reclamacoes','Reclamações')}{thBtn('risco','Risco')}
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
      </div>
    </div>
  )
}

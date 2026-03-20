/**
 * pages/Comparativos.jsx — Comparativos Diário / Semanal / Mensal
 * Reutiliza os endpoints do Histórico com períodos pré-definidos
 */
import { useState, useEffect, useMemo } from 'react'
import api from '../lib/api'
import { PageHeader, KpiCard, SectionHeader, Card, Alert } from '../components/ui'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'

const COLORS = ['#2563eb','#f97316','#10b981','#06b6d4','#ef4444','#f59e0b','#06b6d4','#f59e0b','#84cc16','#0ea5e9']

// Calcula períodos para cada tab
function getPeriodos() {
  const hoje = new Date()
  const fmt = (d) => d.toISOString().slice(0, 10)

  // Diário — últimos 7 dias
  const d7 = new Date(hoje); d7.setDate(d7.getDate() - 6)

  // Semanal — últimas 4 semanas (28 dias)
  const d28 = new Date(hoje); d28.setDate(d28.getDate() - 27)

  // Mensal — últimos 3 meses
  const d90 = new Date(hoje); d90.setDate(d90.getDate() - 89)

  return {
    diario:  { ini: fmt(d7),  fim: fmt(hoje), label: 'Últimos 7 dias' },
    semanal: { ini: fmt(d28), fim: fmt(hoje), label: 'Últimas 4 semanas' },
    mensal:  { ini: fmt(d90), fim: fmt(hoje), label: 'Últimos 3 meses' },
  }
}

function agruparPorSemana(porDia) {
  const semanas = {}
  porDia.forEach(d => {
    const dt = new Date(d.data_ref + 'T12:00:00')
    // Semana ISO: segunda-feira
    const day = dt.getDay() || 7
    const monday = new Date(dt)
    monday.setDate(dt.getDate() - day + 1)
    const key = monday.toISOString().slice(0, 10)
    if (!semanas[key]) semanas[key] = { semana: key, recebido: 0, expedido: 0, entregas: 0 }
    semanas[key].recebido  += d.recebido
    semanas[key].expedido  += d.expedido
    semanas[key].entregas  += d.entregas
  })
  return Object.values(semanas)
    .sort((a, b) => a.semana.localeCompare(b.semana))
    .map(s => ({ ...s, taxa_exp: s.recebido ? +(s.expedido / s.recebido).toFixed(4) : 0 }))
}

function agruparPorMes(porDia) {
  const meses = {}
  porDia.forEach(d => {
    const key = d.data_ref.slice(0, 7) // YYYY-MM
    if (!meses[key]) meses[key] = { mes: key, recebido: 0, expedido: 0, entregas: 0 }
    meses[key].recebido  += d.recebido
    meses[key].expedido  += d.expedido
    meses[key].entregas  += d.entregas
  })
  return Object.values(meses)
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ ...m, taxa_exp: m.recebido ? +(m.expedido / m.recebido).toFixed(4) : 0 }))
}

export default function Comparativos() {
  const [tab, setTab]       = useState('diario')
  const [data, setData]     = useState(null)
  const [evo, setEvo]       = useState(null)
  const [dsSel, setDsSel]   = useState('')
  const [loading, setLoading] = useState(false)

  const periodos = getPeriodos()
  const periodo  = periodos[tab]

  useEffect(() => {
    setLoading(true)
    setData(null); setEvo(null)
    Promise.all([
      api.get('/api/historico/periodo', { params: { data_ini: periodo.ini, data_fim: periodo.fim } }),
      api.get('/api/historico/evolucao-ds', { params: { data_ini: periodo.ini, data_fim: periodo.fim } }),
    ]).then(([r1, r2]) => {
      setData(r1.data)
      setEvo(r2.data)
    }).finally(() => setLoading(false))
  }, [tab])

  useEffect(() => {
    if (!periodo) return
    api.get('/api/historico/evolucao-ds', {
      params: { data_ini: periodo.ini, data_fim: periodo.fim, ...(dsSel ? { ds: dsSel } : {}) }
    }).then(r => setEvo(r.data))
  }, [dsSel, tab])

  const F = n => n?.toLocaleString('pt-BR') || '0'
  const P = n => `${(n * 100).toFixed(1)}%`
  const fD = d => { const [y, m, day] = d.split('-'); return `${day}/${m}` }
  const fS = d => `Sem. ${fD(d)}`
  const fM = d => { const [y, m] = d.split('-'); return `${m}/${y}` }

  // Agrupa dados conforme a tab
  const chartData = useMemo(() => {
    if (!data?.por_dia?.length) return []
    if (tab === 'diario')  return data.por_dia
    if (tab === 'semanal') return agruparPorSemana(data.por_dia)
    if (tab === 'mensal')  return agruparPorMes(data.por_dia)
    return []
  }, [data, tab])

  const xFmt = tab === 'diario' ? fD : tab === 'semanal' ? fS : fM
  const xKey = tab === 'mensal' ? 'mes' : tab === 'semanal' ? 'semana' : 'data_ref'

  // Evolução DS para gráfico multi-linha
  const evoChartData = useMemo(() => {
    if (!evo?.series?.length) return []
    const dates = new Set()
    evo.series.forEach(s => s.data.forEach(d => dates.add(d.data_ref)))
    const sorted = [...dates].sort()
    return sorted.map(date => {
      const point = { data_ref: date }
      evo.series.forEach(s => {
        const match = s.data.find(d => d.data_ref === date)
        point[s.ds] = match ? match.taxa_exp : null
      })
      return point
    })
  }, [evo])

  // Radar — top DS por taxa
  const radarData = useMemo(() => {
    if (!data?.por_ds?.length) return []
    return data.por_ds
      .filter(d => d.recebido > 0)
      .sort((a, b) => b.taxa_exp - a.taxa_exp)
      .slice(0, 8)
      .map(d => ({ ds: d.scan_station, taxa: +(d.taxa_exp * 100).toFixed(1) }))
  }, [data])

  const TABS = [
    { key: 'diario',  label: '📅 Diário',  desc: 'Últimos 7 dias' },
    { key: 'semanal', label: '📆 Semanal', desc: 'Últimas 4 semanas' },
    { key: 'mensal',  label: '🗓️ Mensal',  desc: 'Últimos 3 meses' },
  ]

  return (
    <div>
      <PageHeader icon="📈" title="Comparativos" subtitle="Evolução por dia, semana e mês" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setDsSel('') }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && data && (
        <>
          {/* KPIs */}
          {!data.resumo?.recebido
            ? <Alert type="info">Nenhum dado no período selecionado.</Alert>
            : <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Total Recebido"  value={F(data.resumo.recebido)} color="blue"   />
                <KpiCard label="Total Expedido"  value={F(data.resumo.expedido)} color="orange" />
                <KpiCard label="Taxa Média"       value={P(data.resumo.taxa_exp)} color="green"  />
                <KpiCard label={tab === 'diario' ? 'Dias' : tab === 'semanal' ? 'Semanas' : 'Meses'}
                  value={chartData.length} color="slate" />
              </div>

              {/* Gráfico principal — Volume + Taxa */}
              <SectionHeader title={`Evolução ${tab === 'diario' ? 'Diária' : tab === 'semanal' ? 'Semanal' : 'Mensal'}`} />
              <Card>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={chartData} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-30} textAnchor="end" tickFormatter={xFmt} />
                    <YAxis yAxisId="vol" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                    <YAxis yAxisId="taxa" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0, 1.1]} />
                    <Tooltip formatter={(v, n) => n === 'Taxa Exp.' ? P(v) : F(v)} />
                    <Legend />
                    <Bar yAxisId="vol" dataKey="recebido" fill="#60a5fa" opacity={0.6} name="Recebido"  radius={[3,3,0,0]} />
                    <Bar yAxisId="vol" dataKey="expedido" fill="#f97316" opacity={0.6} name="Expedido"  radius={[3,3,0,0]} />
                    <Line yAxisId="taxa" dataKey="taxa_exp" stroke="#10b981" strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }} name="Taxa Exp."
                      label={{ position: 'top', formatter: v => `${(v*100).toFixed(0)}%`, fontSize: 10, fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              {/* Evolução por DS + Radar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {/* Multi-linha DS */}
                <Card className="lg:col-span-2">
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-sm font-semibold text-slate-700">Evolução por DS</h3>
                    <select value={dsSel} onChange={e => setDsSel(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
                      <option value="">Top 10 automático</option>
                      {evo?.ds_list?.map(ds => <option key={ds} value={ds}>{ds}</option>)}
                    </select>
                  </div>
                  {evoChartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={evoChartData} margin={{ bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="data_ref" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" tickFormatter={fD} />
                        <YAxis tickFormatter={v => `${(v*100).toFixed(0)}%`} domain={[0, 1.1]} />
                        <Tooltip formatter={v => v !== null ? P(v) : '—'} />
                        <Legend />
                        {evo?.series?.map((s, i) => (
                          <Line key={s.ds} type="monotone" dataKey={s.ds}
                            stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                            dot={{ r: 3 }} connectNulls={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                {/* Radar top DS */}
                {radarData.length >= 3 && (
                  <Card>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Top DS — Taxa de Expedição</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="ds" tick={{ fontSize: 9 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Taxa %" dataKey="taxa" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
                )}
              </div>

              {/* Tabela comparativa por DS */}
              {data.por_ds?.length > 0 && (
                <>
                  <SectionHeader title="Ranking por DS no Período" />
                  <Card>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr className="text-xs uppercase text-slate-600">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">DS</th>
                            <th className="px-3 py-2 text-left">Região</th>
                            <th className="px-3 py-2 text-right">Recebido</th>
                            <th className="px-3 py-2 text-right">Expedido</th>
                            <th className="px-3 py-2 text-right">Taxa Exp.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.por_ds.map((r, i) => (
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-400 text-xs">{i+1}</td>
                              <td className="px-3 py-2 font-medium">{r.scan_station}</td>
                              <td className="px-3 py-2 text-slate-500 text-xs capitalize">{r.region || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.recebido)}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.expedido)}</td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${r.taxa_exp >= 0.9 ? 'text-emerald-600' : r.taxa_exp >= 0.7 ? 'text-amber-600' : 'text-red-500'}`}>
                                {P(r.taxa_exp)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}
            </>
          }
        </>
      )}
    </div>
  )
}

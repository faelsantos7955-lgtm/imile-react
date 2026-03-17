/**
 * pages/Dashboard.jsx — Página principal com KPIs, gráficos e ranking
 */
import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, RankingRow, Alert, Skeleton } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Label,
} from 'recharts'
import { RefreshCw } from 'lucide-react'

const COLORS_BAR = { recebido: '#2563eb', expedido: '#f97316', entregas: '#10b981' }
const COLORS_PIE = ['#2563eb', '#e2e8f0']

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [datas, setDatas] = useState([])
  const [dataSel, setDataSel] = useState(null)
  const [data, setData] = useState(null)
  const [charts, setCharts] = useState(null)
  const [loading, setLoading] = useState(true)

  // Carrega datas disponíveis
  useEffect(() => {
    api.get('/api/dashboard/datas').then(res => {
      setDatas(res.data)
      if (res.data.length > 0) setDataSel(res.data[0])
    }).catch(() => {})
  }, [])

  // Carrega dados do dia selecionado
  useEffect(() => {
    if (!dataSel) return
    setLoading(true)
    Promise.all([
      api.get(`/api/dashboard/dia/${dataSel}`),
      api.get(`/api/dashboard/charts/${dataSel}`),
    ]).then(([dia, ch]) => {
      setData(dia.data)
      setCharts(ch.data)
    }).catch(() => {})
      .finally(() => setLoading(false))
  }, [dataSel])

  const fmtDate = (d) => {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  const fmtNum = (n) => n?.toLocaleString('pt-BR') || '0'
  const fmtPct = (n) => `${(n * 100).toFixed(1)}%`

  if (!datas.length) {
    return (
      <div>
        <PageHeader icon="📊" title="Dashboard" subtitle="Visão consolidada por dia" />
        <Alert type="info">Nenhum dado no histórico ainda. Processe os arquivos via processar.py.</Alert>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <PageHeader icon="📊" title="Dashboard" subtitle="Visão consolidada por dia · atualização automática" />
        <button onClick={() => setDataSel(ds => ds)}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-100 rounded-xl p-4 mb-6 border border-slate-200">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3">Filtros</p>
        <div className="flex gap-4">
          <select
            value={dataSel || ''}
            onChange={(e) => setDataSel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
          >
            {datas.map(d => (
              <option key={d} value={d}>{fmtDate(d)}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : data && (
        <>
          {/* Alertas */}
          {data.alertas?.length > 0 && (
            <Alert type="warning">
              ⚠️ <strong>{data.alertas.length} DS abaixo da meta:</strong> {data.alertas.join(', ')}
              {data.alertas.length > 5 && ' e outros...'}
            </Alert>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <KpiCard label="Recebido"   value={fmtNum(data.kpis.recebido)}  sub="waybills no dia"         color="blue" />
            <KpiCard label="Em Rota"    value={fmtNum(data.kpis.expedido)}  sub={`taxa ${fmtPct(data.kpis.taxa_exp)}`} color="orange" />
            <KpiCard label="Entregas"   value={fmtNum(data.kpis.entregas)}  sub={`taxa ${fmtPct(data.kpis.taxa_ent)}`} color="violet" />
            <KpiCard label="DS na Meta" value={data.kpis.n_ok}              sub={`de ${data.kpis.n_ds} bases`}          color="green" />
            <KpiCard label="DS Abaixo"  value={data.kpis.n_abaixo}          sub="precisam atenção"                      color="red" />
          </div>

          {/* Charts */}
          {charts && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">

              {/* Volume por DS */}
              <Card className="lg:col-span-2">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Volume por DS</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={charts.volume_ds.slice(0, 15)} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="ds" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmtNum(v)} />
                    <Legend />
                    <Bar dataKey="recebido" fill={COLORS_BAR.recebido} name="Recebido" radius={[3,3,0,0]} />
                    <Bar dataKey="expedido" fill={COLORS_BAR.expedido} name="Expedido" radius={[3,3,0,0]} />
                    <Bar dataKey="entregas" fill={COLORS_BAR.entregas} name="Entregas" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {/* Donut */}
              <Card>
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Proporção de Expedição</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Expedido', value: charts.donut.expedido },
                        { name: 'Backlog',  value: charts.donut.backlog },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={80} outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {COLORS_PIE.map((c, i) => <Cell key={i} fill={c} />)}
                      <Label
                        value={fmtPct(charts.donut.taxa)}
                        position="center"
                        className="text-2xl font-bold"
                        fill="#0f172a"
                      />
                    </Pie>
                    <Tooltip formatter={(v) => fmtNum(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* Ranking */}
          <SectionHeader title="Ranking por Taxa de Expedição" />
          <Card>
            <div className="max-h-[500px] overflow-y-auto">
              {data.stations?.map((s, i) => (
                <RankingRow
                  key={s.scan_station}
                  pos={i + 1}
                  ds={s.scan_station}
                  taxa={s.taxa_exp}
                  meta={s.meta}
                  atingiu={s.atingiu_meta}
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

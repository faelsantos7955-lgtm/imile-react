/**
 * pages/Dashboard.jsx — Dashboard completo
 * KPIs, filtro DS, D-1, volume, donut, taxa, funil, heatmap, ranking, Excel
 */
import { useState, useEffect, useMemo } from 'react'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, RankingRow, Alert, Skeleton } from '../components/ui'
import Heatmap from '../components/Heatmap'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Label, FunnelChart, Funnel, LabelList,
} from 'recharts'
import { RefreshCw, Download, Filter } from 'lucide-react'

const CB = { recebido: '#2563eb', expedido: '#f97316', entregas: '#10b981' }

export default function Dashboard() {
  const { isAdmin } = useAuth()
  const [datas, setDatas] = useState([])
  const [dataSel, setDataSel] = useState(null)
  const [dsSel, setDsSel] = useState([])
  const [data, setData] = useState(null)
  const [charts, setCharts] = useState(null)
  const [heatmap, setHeatmap] = useState(null)
  const [ontem, setOntem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/dashboard/datas').then(r => { setDatas(r.data); if (r.data.length) setDataSel(r.data[0]) })
  }, [])

  useEffect(() => {
    if (!dataSel) return
    setLoading(true)
    const d = new Date(dataSel + 'T12:00:00'); d.setDate(d.getDate() - 1)
    Promise.all([
      api.get(`/api/dashboard/dia/${dataSel}`),
      api.get(`/api/dashboard/charts/${dataSel}`),
      api.get(`/api/dashboard/heatmap/${dataSel}`).catch(() => ({ data: {} })),
      api.get(`/api/dashboard/dia/${d.toISOString().slice(0, 10)}`).catch(() => ({ data: { kpis: {} } })),
    ]).then(([dia, ch, hm, ont]) => {
      setData(dia.data); setCharts(ch.data); setHeatmap(hm.data); setOntem(ont.data?.kpis || {})
    }).finally(() => setLoading(false))
  }, [dataSel])

  // Filtro por DS (client-side)
  const d = useMemo(() => {
    if (!data || !dsSel.length) return data
    const st = data.stations.filter(s => dsSel.includes(s.scan_station))
    const r = st.reduce((a, s) => a + s.recebido, 0), e = st.reduce((a, s) => a + s.expedido, 0), en = st.reduce((a, s) => a + s.entregas, 0)
    const nOk = st.filter(s => s.atingiu_meta).length
    return { ...data, kpis: { recebido: r, expedido: e, entregas: en, taxa_exp: r ? +(e/r).toFixed(4) : 0, taxa_ent: r ? +(en/r).toFixed(4) : 0, n_ds: st.length, n_ok: nOk, n_abaixo: st.length - nOk }, stations: st }
  }, [data, dsSel])

  const ch = useMemo(() => {
    if (!charts || !dsSel.length) return charts
    return { ...charts, volume_ds: charts.volume_ds.filter(x => dsSel.includes(x.ds)), taxa_ds: charts.taxa_ds.filter(x => dsSel.includes(x.ds)) }
  }, [charts, dsSel])

  const F = (n) => n?.toLocaleString('pt-BR') || '0'
  const P = (n) => `${(n * 100).toFixed(1)}%`
  const fmtDate = (d) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}` }

  const handleExcel = async () => {
    try {
      const r = await api.get(`/api/excel/dashboard/${dataSel}`, { responseType: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Dashboard_${dataSel}.xlsx`; a.click()
    } catch { alert('Erro ao gerar Excel') }
  }

  if (!datas.length) return (<div><PageHeader icon="📊" title="Dashboard" subtitle="Visão consolidada" /><Alert type="info">Nenhum dado ainda.</Alert></div>)

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📊" title="Dashboard" subtitle="Visão consolidada por dia · atualização automática" />
        <div className="flex gap-2">
          <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"><Download size={14}/> Excel</button>
          <button onClick={() => setDataSel(s => s)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><RefreshCw size={14}/> Atualizar</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-slate-100 rounded-xl p-4 mb-6 border border-slate-200">
        <div className="flex items-center gap-2 mb-3"><Filter size={14} className="text-slate-500"/><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Filtros</span></div>
        <div className="flex flex-wrap gap-4 items-center">
          <select value={dataSel||''} onChange={e=>{setDataSel(e.target.value);setDsSel([])}} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
            {datas.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
          <select multiple value={dsSel} onChange={e=>setDsSel(Array.from(e.target.selectedOptions,o=>o.value))} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm min-w-[200px] max-h-[100px]">
            {data?.ds_disponiveis?.map(ds => <option key={ds} value={ds}>{ds}</option>)}
          </select>
          {dsSel.length > 0 && <button onClick={()=>setDsSel([])} className="text-xs text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg">Limpar ({dsSel.length})</button>}
        </div>
      </div>

      {loading ? <div className="grid grid-cols-5 gap-4">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-24 rounded-xl"/>)}</div> : d && <>

        {d.alertas?.length > 0 && <Alert type="warning">⚠️ <strong>{d.alertas.length} DS abaixo da meta:</strong> {d.alertas.slice(0,5).join(', ')}{d.alertas.length > 5 && ' ...'}</Alert>}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
          <KpiCard label="Recebido" value={F(d.kpis.recebido)} sub="waybills no dia" color="blue"/>
          <KpiCard label="Em Rota" value={F(d.kpis.expedido)} sub={`taxa ${P(d.kpis.taxa_exp)}`} color="orange"/>
          <KpiCard label="Entregas" value={F(d.kpis.entregas)} sub={d.kpis.entregas ? `taxa ${P(d.kpis.taxa_ent)}` : 'sem dados'} color="violet"/>
          <KpiCard label="DS na Meta" value={d.kpis.n_ok} sub={`de ${d.kpis.n_ds} bases`} color="green"/>
          <KpiCard label="DS Abaixo" value={d.kpis.n_abaixo} sub="precisam atenção" color="red"/>
        </div>

        {/* D-1 */}
        {ontem?.recebido > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[{l:'Recebido',v:d.kpis.recebido-ontem.recebido},{l:'Expedido',v:d.kpis.expedido-ontem.expedido},{l:'Taxa',v:d.kpis.taxa_exp-(ontem.taxa_exp||0),pct:true}].map(({l,v,pct})=>(
              <div key={l} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <p className="text-xs text-slate-500">{l} vs ontem</p>
                <p className={`text-lg font-bold font-mono ${v>=0?'text-emerald-600':'text-red-600'}`}>{v>=0?'+':''}{pct?P(v):F(v)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Charts row 1: Volume + Donut */}
        {ch && <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          <Card className="lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Volume por DS</h3>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={ch.volume_ds.slice(0,20)} margin={{bottom:60}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="ds" tick={{fontSize:10}} angle={-40} textAnchor="end"/>
                <YAxis tick={{fontSize:11}} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/><Tooltip formatter={v=>F(v)}/><Legend/>
                <Bar dataKey="recebido" fill={CB.recebido} name="Recebido" radius={[3,3,0,0]}/>
                <Bar dataKey="expedido" fill={CB.expedido} name="Expedido" radius={[3,3,0,0]}/>
                <Bar dataKey="entregas" fill={CB.entregas} name="Entregas" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Proporção de Expedição</h3>
            <ResponsiveContainer width="100%" height={340}>
              <PieChart><Pie data={[{name:'Expedido',value:ch.donut.expedido},{name:'Backlog',value:ch.donut.backlog}]} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={2} dataKey="value">
                <Cell fill="#2563eb"/><Cell fill="#e2e8f0"/>
                <Label value={P(ch.donut.taxa)} position="center" className="text-2xl font-bold" fill="#0f172a"/>
              </Pie><Tooltip formatter={v=>F(v)}/><Legend/></PieChart>
            </ResponsiveContainer>
          </Card>
        </div>}

        {/* Charts row 2: Funil operacional */}
        {ch?.funil && (
          <>
            <SectionHeader title="Funil Operacional"/>
            <Card>
              <div className="grid grid-cols-3 gap-8 text-center py-6">
                <div>
                  <div className="w-full h-24 bg-blue-500 rounded-xl flex items-center justify-center text-white">
                    <div><p className="text-2xl font-bold font-mono">{F(ch.funil.recebido)}</p><p className="text-xs opacity-80">Recebido</p></div>
                  </div>
                </div>
                <div>
                  <div className="w-full h-20 bg-orange-500 rounded-xl flex items-center justify-center text-white mx-auto" style={{width:'85%'}}>
                    <div><p className="text-2xl font-bold font-mono">{F(ch.funil.expedido)}</p><p className="text-xs opacity-80">Expedido ({P(ch.funil.taxa_exp)})</p></div>
                  </div>
                  <p className="text-xs text-red-500 mt-1">-{F(ch.funil.perda_exp)} perdidos</p>
                </div>
                <div>
                  <div className="w-full h-16 bg-emerald-500 rounded-xl flex items-center justify-center text-white mx-auto" style={{width:'70%'}}>
                    <div><p className="text-2xl font-bold font-mono">{F(ch.funil.entregas)}</p><p className="text-xs opacity-80">Entregue ({P(ch.funil.taxa_ent)})</p></div>
                  </div>
                  <p className="text-xs text-red-500 mt-1">-{F(ch.funil.perda_ent)} perdidos</p>
                </div>
              </div>
            </Card>
          </>
        )}

        {/* Charts row 3: Taxa horizontal */}
        <SectionHeader title="Taxa de Expedição por DS"/>
        <Card>
          <ResponsiveContainer width="100%" height={Math.max(300, (d.stations?.length||0) * 28 + 60)}>
            <BarChart data={d.stations?.slice().sort((a,b)=>a.taxa_exp-b.taxa_exp)} layout="vertical" margin={{left:80,right:60}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis type="number" tickFormatter={v=>`${(v*100).toFixed(0)}%`} domain={[0,1.1]}/>
              <YAxis type="category" dataKey="scan_station" tick={{fontSize:11}} width={75}/>
              <Tooltip formatter={v=>P(v)}/>
              <Bar dataKey="taxa_exp" name="Taxa" radius={[0,4,4,0]} fill="#10b981" label={{position:'right',formatter:v=>`${(v*100).toFixed(1)}%`,fontSize:10}}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Charts row 4: Heatmaps */}
        {heatmap?.heatmap_exp?.length > 0 && (
          <>
            <SectionHeader title="Heatmap DS × Cidade"/>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card><Heatmap data={heatmap.heatmap_exp} dsList={heatmap.ds_list} cityList={heatmap.city_list} type="exp" title="Taxa de Expedição"/></Card>
              <Card><Heatmap data={heatmap.heatmap_ent} dsList={heatmap.ds_list} cityList={heatmap.city_list} type="ent" title="Taxa de Entrega"/></Card>
            </div>
          </>
        )}

        {/* Ranking */}
        <SectionHeader title="Ranking por Taxa de Expedição"/>
        <Card>
          <div className="max-h-[500px] overflow-y-auto">
            {d.stations?.map((s,i) => <RankingRow key={s.scan_station} pos={i+1} ds={s.scan_station} taxa={s.taxa_exp} meta={s.meta} atingiu={s.atingiu_meta}/>)}
          </div>
        </Card>
      </>}
    </div>
  )
}

/**
 * pages/Historico.jsx — Histórico + Evolução por DS + Excel
 */
import { useState, useEffect } from 'react'
import api from '../lib/api'
import { PageHeader, KpiCard, SectionHeader, Card, Alert } from '../components/ui'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart } from 'recharts'
import { Download } from 'lucide-react'

const COLORS = ['#2563eb','#f97316','#10b981','#8b5cf6','#ef4444','#f59e0b','#06b6d4','#ec4899','#84cc16','#6366f1']

export default function Historico() {
  const today = new Date().toISOString().slice(0,10)
  const d30 = new Date(Date.now() - 30*86400000).toISOString().slice(0,10)

  const [ini, setIni] = useState(d30)
  const [fim, setFim] = useState(today)
  const [data, setData] = useState(null)
  const [evoData, setEvoData] = useState(null)
  const [dsSel, setDsSel] = useState('')
  const [dsList, setDsList] = useState([])

  useEffect(() => {
    if (!ini || !fim) return
    api.get('/api/historico/periodo', { params: { data_ini: ini, data_fim: fim } })
      .then(r => { setData(r.data); setDsList(r.data.por_ds?.map(d => d.scan_station) || []) })
  }, [ini, fim])

  // Evolução DS
  useEffect(() => {
    if (!ini || !fim) return
    api.get('/api/historico/evolucao-ds', { params: { data_ini: ini, data_fim: fim, ...(dsSel ? { ds: dsSel } : {}) } })
      .then(r => setEvoData(r.data))
  }, [ini, fim, dsSel])

  const F = n => n?.toLocaleString('pt-BR') || '0'
  const P = n => `${(n*100).toFixed(1)}%`
  const fD = d => { const [y,m,day] = d.split('-'); return `${day}/${m}` }

  const handleExcel = async () => {
    try {
      const r = await api.get('/api/excel/historico', { params: { data_ini: ini, data_fim: fim }, responseType: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Historico_${ini}_a_${fim}.xlsx`; a.click()
    } catch { alert('Erro ao gerar Excel') }
  }

  // Merge DS evolution data into single array for multi-line chart
  const evoChartData = (() => {
    if (!evoData?.series?.length) return []
    const dates = new Set()
    evoData.series.forEach(s => s.data.forEach(d => dates.add(d.data_ref)))
    const sorted = [...dates].sort()
    return sorted.map(date => {
      const point = { data_ref: date }
      evoData.series.forEach(s => {
        const match = s.data.find(d => d.data_ref === date)
        point[s.ds] = match ? match.taxa_exp : null
      })
      return point
    })
  })()

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📅" title="Histórico" subtitle="Todos os dias processados"/>
        <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800"><Download size={14}/> Excel do Período</button>
      </div>

      <div className="flex gap-4 mb-6">
        <div><label className="text-[11px] font-semibold uppercase text-slate-500">De</label>
          <input type="date" value={ini} onChange={e=>setIni(e.target.value)} className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"/></div>
        <div><label className="text-[11px] font-semibold uppercase text-slate-500">Até</label>
          <input type="date" value={fim} onChange={e=>setFim(e.target.value)} className="block mt-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"/></div>
      </div>

      {!data?.resumo?.recebido ? <Alert type="info">Nenhum dado no período.</Alert> : <>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total Recebido" value={F(data.resumo.recebido)} color="blue"/>
          <KpiCard label="Total Expedido" value={F(data.resumo.expedido)} color="orange"/>
          <KpiCard label="Taxa Média" value={P(data.resumo.taxa_exp)} color="green"/>
          <KpiCard label="Dias" value={data.resumo.dias} color="slate"/>
        </div>

        {/* Evolução diária */}
        <SectionHeader title="Evolução Diária"/>
        <Card>
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={data.por_dia} margin={{bottom:40}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
              <XAxis dataKey="data_ref" tick={{fontSize:11}} angle={-30} textAnchor="end" tickFormatter={fD}/>
              <YAxis yAxisId="vol" tick={{fontSize:11}} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
              <YAxis yAxisId="taxa" orientation="right" tick={{fontSize:11}} tickFormatter={v=>`${(v*100).toFixed(0)}%`} domain={[0,1.1]}/>
              <Tooltip formatter={(v,n)=>n==='Taxa Exp.'?P(v):F(v)}/><Legend/>
              <Bar yAxisId="vol" dataKey="recebido" fill="#60a5fa" opacity={0.6} name="Recebido" radius={[3,3,0,0]}/>
              <Bar yAxisId="vol" dataKey="expedido" fill="#f97316" opacity={0.6} name="Expedido" radius={[3,3,0,0]}/>
              <Line yAxisId="taxa" dataKey="taxa_exp" stroke="#10b981" strokeWidth={3} dot={{r:4,fill:'#10b981'}} name="Taxa Exp."
                label={{position:'top',formatter:v=>`${(v*100).toFixed(0)}%`,fontSize:10,fill:'#10b981'}}/>
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* Evolução por DS individual */}
        <SectionHeader title="Evolução por DS Individual"/>
        <Card>
          <div className="flex items-center gap-4 mb-4">
            <select value={dsSel} onChange={e=>setDsSel(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm min-w-[200px]">
              <option value="">Top 10 DS (automático)</option>
              {dsList.map(ds=><option key={ds} value={ds}>{ds}</option>)}
            </select>
          </div>
          {evoChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={evoChartData} margin={{bottom:40}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                <XAxis dataKey="data_ref" tick={{fontSize:10}} angle={-30} textAnchor="end" tickFormatter={fD}/>
                <YAxis tickFormatter={v=>`${(v*100).toFixed(0)}%`} domain={[0,1.1]}/>
                <Tooltip formatter={v=>v !== null ? P(v) : '—'}/>
                <Legend/>
                {evoData?.series?.map((s, i) => (
                  <Line key={s.ds} type="monotone" dataKey={s.ds} stroke={COLORS[i%COLORS.length]}
                    strokeWidth={2} dot={{r:3}} connectNulls={false}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Tabela por dia */}
        <SectionHeader title="Resumo por dia"/>
        <Card>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100"><tr className="text-xs uppercase text-slate-600">
                <th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2 text-right">Recebido</th>
                <th className="px-3 py-2 text-right">Expedido</th><th className="px-3 py-2 text-right">Entregas</th>
                <th className="px-3 py-2 text-right">Taxa Exp.</th>
              </tr></thead>
              <tbody>{data.por_dia?.map((r,i)=>(
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{fD(r.data_ref)}</td>
                  <td className="px-3 py-2 text-right font-mono">{F(r.recebido)}</td>
                  <td className="px-3 py-2 text-right font-mono">{F(r.expedido)}</td>
                  <td className="px-3 py-2 text-right font-mono">{F(r.entregas)}</td>
                  <td className="px-3 py-2 text-right font-mono">{P(r.taxa_exp)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </>}
    </div>
  )
}

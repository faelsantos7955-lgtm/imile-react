/**
 * pages/Reclamacoes.jsx — Reclamações + motoristas por semana + Excel
 */
import { useState, useEffect } from 'react'
import api from '../lib/api'
import { PageHeader, KpiCard, SectionHeader, Card, Alert } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'
import { Download, ShieldAlert } from 'lucide-react'

const COLORS_TOP = ['#dc2626','#ef4444','#f87171','#fca5a5','#fecaca']
const COLORS_WEEK = ['#2563eb','#f97316','#10b981','#8b5cf6']

export default function Reclamacoes() {
  const [uploads, setUploads] = useState([])
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)
  const [semanas, setSemanas] = useState([])

  useEffect(() => {
    api.get('/api/reclamacoes/uploads').then(r => {
      setUploads(r.data); if (r.data.length) setSel(r.data[0].id)
    })
    api.get('/api/reclamacoes/motoristas-semana').then(r => setSemanas(r.data.semanas || []))
  }, [])

  useEffect(() => {
    if (!sel) return
    api.get(`/api/reclamacoes/upload/${sel}`).then(r => setDetail(r.data))
  }, [sel])

  const u = uploads.find(x => x.id === sel)
  const F = n => n?.toLocaleString('pt-BR') || '0'

  const handleExcel = async () => {
    try {
      const r = await api.get(`/api/excel/reclamacoes/${sel}`, { responseType: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Reclamacoes_${u?.data_ref || 'relatorio'}.xlsx`; a.click()
    } catch { alert('Erro ao gerar Excel') }
  }

  // Dados para gráfico semanal
  const weeklyChartData = (() => {
    if (!semanas.length) return []
    // Coleta todos motoristas únicos
    const allMot = new Set()
    semanas.forEach(s => s.motoristas.forEach(m => allMot.add(m.motorista)))
    const mots = [...allMot].slice(0, 8)

    return semanas.reverse().map(s => {
      const point = { semana: s.data_ref }
      mots.forEach(m => {
        const match = s.motoristas.find(x => x.motorista === m)
        point[m] = match ? match.total : 0
      })
      return point
    })
  })()

  const weeklyMotoristas = [...new Set(semanas.flatMap(s => s.motoristas.map(m => m.motorista)))].slice(0, 8)

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📋" title="Reclamações" subtitle="Análise de Tickets de Fake Delivery"/>
        {sel && <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800"><Download size={14}/> Excel</button>}
      </div>

      {!uploads.length ? <Alert type="info">Nenhum dado disponível.</Alert> : <>

        <select value={sel||''} onChange={e=>setSel(Number(e.target.value))} className="mb-6 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm max-w-md">
          {uploads.map(u => <option key={u.id} value={u.id}>{u.data_ref} — {F(u.n_registros)} registros</option>)}
        </select>

        {u && <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total Registros" value={F(u.n_registros)} color="blue"/>
          <KpiCard label="Supervisores" value={u.n_sup} color="orange"/>
          <KpiCard label="Stations" value={u.n_sta} color="green"/>
          <KpiCard label="Motoristas ID'd" value={u.n_mot} color="violet"/>
        </div>}

        {detail && <>
          {/* Info de motoristas filtrados */}
          {detail.n_inativos_filtrados > 0 && (
            <Alert type="info">
              <ShieldAlert size={14} className="inline mr-1"/> {detail.n_inativos_filtrados} motorista(s) inativo(s) filtrado(s) do ranking automaticamente.
            </Alert>
          )}

          {/* Top 5 Ofensores */}
          {detail.top5?.length > 0 && <>
            <SectionHeader title="Top 5 Ofensores (mais reclamações = pior)"/>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                {detail.top5.map((r,i) => (
                  <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{i+1}</span>
                      <span className="text-sm font-medium text-slate-800">{r.motorista}</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-red-600">{r.total}</span>
                  </div>
                ))}
              </Card>
              <Card>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={detail.top5.slice().reverse()} layout="vertical" margin={{left:100,right:40}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis type="number"/><YAxis type="category" dataKey="motorista" tick={{fontSize:11}} width={95}/><Tooltip/>
                    <Bar dataKey="total" name="Reclamações" radius={[0,4,4,0]} label={{position:'right',fontSize:11,fontWeight:700}}>
                      {detail.top5.slice().reverse().map((_,i)=><Cell key={i} fill={COLORS_TOP[i]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </>}

          {/* Gráfico de motoristas por semana */}
          {weeklyChartData.length > 1 && <>
            <SectionHeader title="Motoristas Ofensores por Semana"/>
            <Card>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={weeklyChartData} margin={{bottom:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                  <XAxis dataKey="semana" tick={{fontSize:11}}/>
                  <YAxis tick={{fontSize:11}}/><Tooltip/><Legend/>
                  {weeklyMotoristas.map((m,i) => (
                    <Bar key={m} dataKey={m} stackId="a" fill={COLORS_WEEK[i % COLORS_WEEK.length]} name={m.length > 15 ? m.slice(0,15)+'…' : m}/>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>}

          {/* Tabelas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {detail.por_supervisor?.length > 0 && <div>
              <SectionHeader title="Por Supervisor"/>
              <Card><div className="max-h-[400px] overflow-y-auto"><table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100"><tr className="text-xs uppercase text-slate-600">
                  <th className="px-3 py-2 text-left">Supervisor</th><th className="px-3 py-2 text-right">Qtd Dia</th><th className="px-3 py-2 text-right">Qtd Mês</th>
                </tr></thead>
                <tbody>{detail.por_supervisor.sort((a,b)=>b.dia_total-a.dia_total).map((r,i)=>(
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.supervisor}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.dia_total}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.mes_total}</td>
                  </tr>
                ))}</tbody>
              </table></div></Card>
            </div>}
            {detail.por_station?.length > 0 && <div>
              <SectionHeader title="Por Station"/>
              <Card><div className="max-h-[400px] overflow-y-auto"><table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100"><tr className="text-xs uppercase text-slate-600">
                  <th className="px-3 py-2 text-left">Station</th><th className="px-3 py-2 text-right">Qtd Dia</th><th className="px-3 py-2 text-right">Qtd Mês</th>
                </tr></thead>
                <tbody>{detail.por_station.sort((a,b)=>b.dia_total-a.dia_total).map((r,i)=>(
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.station}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.dia_total}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.mes_total}</td>
                  </tr>
                ))}</tbody>
              </table></div></Card>
            </div>}
          </div>
        </>}
      </>}
    </div>
  )
}

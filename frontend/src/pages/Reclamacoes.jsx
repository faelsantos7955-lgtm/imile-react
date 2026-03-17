/**
 * pages/Reclamacoes.jsx
 */
import { useState, useEffect } from 'react'
import api from '../lib/api'
import { PageHeader, KpiCard, Card, SectionHeader, Alert } from '../components/ui'

export default function Reclamacoes() {
  const [uploads, setUploads] = useState([])
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    api.get('/api/reclamacoes/uploads').then(r => {
      setUploads(r.data)
      if (r.data.length) setSel(r.data[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sel) return
    api.get(`/api/reclamacoes/upload/${sel}`).then(r => setDetail(r.data)).catch(() => {})
  }, [sel])

  const u = uploads.find(x => x.id === sel)

  return (
    <div>
      <PageHeader icon="📋" title="Reclamações" subtitle="Análise de Tickets de Fake Delivery" />

      {!uploads.length ? <Alert type="info">Nenhum dado disponível.</Alert> : (
        <>
          <select value={sel || ''} onChange={(e) => setSel(Number(e.target.value))}
            className="mb-6 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>{u.data_ref} — {u.n_registros} registros</option>
            ))}
          </select>

          {u && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total Registros"  value={u.n_registros} color="blue" />
              <KpiCard label="Supervisores"     value={u.n_sup}       color="orange" />
              <KpiCard label="Stations"         value={u.n_sta}       color="green" />
              <KpiCard label="Motoristas ID'd"  value={u.n_mot}       color="violet" />
            </div>
          )}

          {detail && (
            <>
              {/* Top 5 Ofensores */}
              {detail.top5?.length > 0 && (
                <>
                  <SectionHeader title="Top 5 Ofensores (mais reclamações = pior)" />
                  <Card>
                    {detail.top5.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="text-sm font-medium">{r.motorista}</span>
                        </div>
                        <span className="text-sm font-mono font-bold text-red-600">{r.total} reclamações</span>
                      </div>
                    ))}
                  </Card>
                </>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {/* Por Supervisor */}
                <Card>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Supervisor</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-100 text-slate-600 text-xs uppercase">
                      <th className="px-3 py-2 text-left">Supervisor</th>
                      <th className="px-3 py-2">Qtd Dia</th>
                      <th className="px-3 py-2">Qtd Mês</th>
                    </tr></thead>
                    <tbody>
                      {detail.por_supervisor?.slice(0, 15).map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium">{r.supervisor}</td>
                          <td className="px-3 py-2 text-center font-mono">{r.dia_total}</td>
                          <td className="px-3 py-2 text-center font-mono">{r.mes_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>

                {/* Por Station */}
                <Card>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Station</h3>
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-100 text-slate-600 text-xs uppercase">
                      <th className="px-3 py-2 text-left">Station</th>
                      <th className="px-3 py-2">Qtd Dia</th>
                      <th className="px-3 py-2">Qtd Mês</th>
                    </tr></thead>
                    <tbody>
                      {detail.por_station?.slice(0, 15).map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium">{r.station}</td>
                          <td className="px-3 py-2 text-center font-mono">{r.dia_total}</td>
                          <td className="px-3 py-2 text-center font-mono">{r.mes_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

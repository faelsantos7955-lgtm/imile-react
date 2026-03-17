/**
 * pages/Triagem.jsx
 */
import { useState, useEffect } from 'react'
import api from '../lib/api'
import { PageHeader, KpiCard, Card, Alert } from '../components/ui'

export default function Triagem() {
  const [uploads, setUploads] = useState([])
  const [sel, setSel] = useState(null)
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    api.get('/api/triagem/uploads').then(r => {
      setUploads(r.data)
      if (r.data.length) setSel(r.data[0].id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sel) return
    api.get(`/api/triagem/upload/${sel}`).then(r => setDetail(r.data)).catch(() => {})
  }, [sel])

  const u = uploads.find(x => x.id === sel)

  return (
    <div>
      <PageHeader icon="🔀" title="Triagem DC×DS" subtitle="Análise de erros de expedição" />

      {!uploads.length ? <Alert type="info">Nenhum dado disponível.</Alert> : (
        <>
          <select value={sel || ''} onChange={(e) => setSel(Number(e.target.value))}
            className="mb-6 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>{u.data_ref} — {u.qtd_ok}/{u.total} OK ({u.taxa}%)</option>
            ))}
          </select>

          {u && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total Expedido" value={u.total?.toLocaleString()} color="blue" />
              <KpiCard label="Triagem OK"     value={u.qtd_ok?.toLocaleString()} color="green" />
              <KpiCard label="Erros"          value={u.qtd_erro?.toLocaleString()} color="red" />
              <KpiCard label="Taxa OK"        value={`${u.taxa}%`} color="violet" />
            </div>
          )}

          {detail && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Por DS</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-100 text-slate-600 text-xs uppercase">
                      <th className="px-3 py-2 text-left">DS</th><th className="px-3 py-2">OK</th><th className="px-3 py-2">NOK</th><th className="px-3 py-2">Taxa</th>
                    </tr></thead>
                    <tbody>
                      {detail.por_ds?.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium">{r.ds}</td>
                          <td className="px-3 py-2 text-center">{r.ok}</td>
                          <td className="px-3 py-2 text-center text-red-600">{r.nok}</td>
                          <td className="px-3 py-2 text-center">{r.taxa?.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 5 DS com mais erros</h3>
                {detail.top5?.map((r, i) => (
                  <div key={i} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                    <span className="text-sm font-medium">{r.ds}</span>
                    <span className="text-sm font-mono text-red-600 font-semibold">{r.total_erros}</span>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}

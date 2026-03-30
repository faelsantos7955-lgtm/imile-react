/**
 * pages/NoTracking.jsx — No Tracking (断更) — Pacotes sem scan atualizado
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Upload, Loader, Trash2, AlertCircle, Clock } from 'lucide-react'
import { PageHeader, Card, SectionHeader } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import api from '../lib/api'

const BRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// Cores por faixa de aging — do verde ao vermelho
const COR_FAIXA = {
  '<1':           '#22c55e',
  '1 ≤ X < 3':   '#84cc16',
  '3 ≤ X < 5':   '#eab308',
  '5 ≤ X < 7':   '#f97316',
  '7 ≤ X < 10':  '#ef4444',
  '10 ≤ X < 16': '#dc2626',
  '16 ≤ X < 20': '#b91c1c',
  'X ≥ 20':      '#7f1d1d',
}
const CORES_STATUS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#f97316', '#ef4444', '#84cc16', '#ec4899', '#14b8a6']

function KPI({ label, value, sub, cls = '' }) {
  return (
    <Card className="text-center py-4">
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
      {sub && <p className="text-sm font-medium text-slate-500 mt-0.5">{sub}</p>}
      <p className="text-xs text-slate-400 mt-1">{label}</p>
    </Card>
  )
}

function UploadZone({ onSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]           = useState('')
  const inputRef = useRef()
  const qc = useQueryClient()

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api.post('/api/notracking/processar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['notracking-uploads'] })
      onSuccess?.(r.data.upload_id)
    } catch (err) {
      setErro(err?.response?.data?.detail || 'Erro ao processar o arquivo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card className="border-dashed border-2 border-slate-200 bg-slate-50">
      <div className="flex flex-col items-center gap-3 py-4">
        <Clock size={28} className="text-slate-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Upload — No Tracking (断更)</p>
          <p className="text-xs text-slate-400 mt-1">Excel com aba <code className="bg-slate-200 px-1 rounded">BD</code> (Número da Etiqueta, Station, AGING, DIAS EM ABERTO...)</p>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" id="nt-upload" />
        <label htmlFor="nt-upload"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
            ${uploading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
          {uploading ? <><Loader size={14} className="animate-spin" /> Processando...</> : <><Upload size={14} /> Enviar arquivo</>}
        </label>
        {erro && <p className="text-xs text-red-600 text-center max-w-sm">{erro}</p>}
      </div>
    </Card>
  )
}

export default function NoTracking() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [uploadSel, setUploadSel] = useState(null)
  const [deletando, setDeletando] = useState(false)
  const [viewSup, setViewSup]     = useState('total')   // 'total' | '7d'

  const { data: uploads = [], isLoading: loadingUps } = useQuery({
    queryKey: ['notracking-uploads'],
    queryFn: () => api.get('/api/notracking/uploads').then(r => r.data),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads])

  const { data: detalhe, isLoading: loadingDet } = useQuery({
    queryKey: ['notracking-detalhe', uploadSel],
    queryFn: () => api.get(`/api/notracking/upload/${uploadSel}`).then(r => r.data),
    enabled: !!uploadSel,
  })

  const deletar = async () => {
    if (!window.confirm('Excluir este upload de No Tracking?')) return
    setDeletando(true)
    try {
      await api.delete(`/api/notracking/upload/${uploadSel}`)
      qc.invalidateQueries({ queryKey: ['notracking-uploads'] })
      setUploadSel(null)
    } catch { alert('Erro ao excluir') }
    finally { setDeletando(false) }
  }

  const up       = detalhe?.upload
  const porDs    = detalhe?.por_ds     ?? []
  const porSup   = detalhe?.por_sup    ?? []
  const porSta   = detalhe?.por_status ?? []
  const porFaixa = detalhe?.por_faixa  ?? []
  const loading  = loadingUps || (!!uploadSel && loadingDet)

  // Dados do gráfico de supervisor
  const supChart = porSup.slice(0, 12).map(s => ({
    name: s.supervisor,
    Total: s.total,
    '≥7 dias': s.total_7d_mais,
  }))

  const pct7d = up ? ((up.total_7d_mais / up.total) * 100).toFixed(1) : '—'

  return (
    <div>
      <PageHeader icon="🕐" title="No Tracking (断更)" subtitle="Pacotes sem atualização de scan — monitoramento de aging por DS e supervisor" />

      {/* Seletor + upload */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        {uploads.length > 0 && (
          <select value={uploadSel ?? ''} onChange={e => setUploadSel(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[200px]">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {u.data_ref || 'Sem data'} — {u.total?.toLocaleString('pt-BR')} pacotes
              </option>
            ))}
          </select>
        )}
        {isAdmin && uploadSel && (
          <button onClick={deletar} disabled={deletando}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">
            {deletando ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />} Excluir
          </button>
        )}
      </div>

      <UploadZone onSuccess={(id) => setUploadSel(id)} />

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 mt-8 justify-center">
          <Loader size={16} className="animate-spin" /> Carregando...
        </div>
      )}

      {!loading && up && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <KPI label="Total pacotes" value={up.total?.toLocaleString('pt-BR')} cls="text-slate-800" />
            <KPI label="Valor em risco" value={BRL(up.valor_total)} cls="text-amber-600" />
            <KPI label="Pacotes ≥7 dias" value={up.total_7d_mais?.toLocaleString('pt-BR')} cls="text-red-600" />
            <KPI label="% com ≥7 dias" value={`${pct7d}%`} cls={parseFloat(pct7d) >= 5 ? 'text-red-600' : 'text-slate-700'} />
          </div>

          {/* Gráfico por Supervisor */}
          {supChart.length > 0 && (
            <>
              <div className="flex items-center justify-between mt-6 mb-2">
                <h3 className="text-sm font-semibold text-slate-700">Por Supervisor</h3>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {[['total', 'Total'], ['7d', '≥7 dias']].map(([k, l]) => (
                    <button key={k} onClick={() => setViewSup(k)}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${viewSup === k ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Card>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={supChart} margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => v.toLocaleString('pt-BR')} />
                    {viewSup === 'total'
                      ? <Bar dataKey="Total"    fill="#3b82f6" radius={[4,4,0,0]} />
                      : <Bar dataKey="≥7 dias"  fill="#ef4444" radius={[4,4,0,0]} />
                    }
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Distribuição por Faixa de Aging */}
            {porFaixa.length > 0 && (
              <div>
                <SectionHeader title="Distribuição por Aging" />
                <Card>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={porFaixa} margin={{ right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="faixa" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={40} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v, n) => [v.toLocaleString('pt-BR'), n === 'total' ? 'Pacotes' : n]} />
                      <Bar dataKey="total" name="total" radius={[4,4,0,0]}>
                        {porFaixa.map((f, i) => (
                          <Cell key={i} fill={COR_FAIXA[f.faixa] || '#94a3b8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {/* Por Status */}
            {porSta.length > 0 && (
              <div>
                <SectionHeader title="Por Último Status" />
                <Card>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={porSta} dataKey="total" nameKey="status" cx="50%" cy="50%"
                        outerRadius={95} label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {porSta.map((_, i) => <Cell key={i} fill={CORES_STATUS[i % CORES_STATUS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => v.toLocaleString('pt-BR')} />
                      <Legend formatter={v => v.length > 30 ? v.slice(0, 30) + '…' : v} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}
          </div>

          {/* Tabela por DS */}
          {porDs.length > 0 && (
            <>
              <SectionHeader title={`Detalhe por DS (${porDs.length})`} />
              <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-white text-xs">
                        <th className="px-4 py-3 text-left">#</th>
                        <th className="px-4 py-3 text-left">DS</th>
                        <th className="px-4 py-3 text-left">Supervisor</th>
                        <th className="px-4 py-3 text-left">Regional</th>
                        <th className="px-4 py-3 text-center">Total</th>
                        <th className="px-4 py-3 text-center">≥7 dias</th>
                        <th className="px-4 py-3 text-center">% ≥7d</th>
                        <th className="px-4 py-3 text-right">Valor em Risco</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porDs.map((d, i) => {
                        const pct = d.total ? ((d.total_7d_mais / d.total) * 100).toFixed(1) : '0.0'
                        const cor = parseFloat(pct) >= 10 ? 'text-red-600' : parseFloat(pct) >= 5 ? 'text-orange-600' : 'text-slate-700'
                        return (
                          <tr key={d.station + i} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                            <td className="px-4 py-3 font-mono text-xs font-semibold">{d.station}</td>
                            <td className="px-4 py-3 text-xs text-slate-600">{d.supervisor || '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{d.regional || '—'}</td>
                            <td className="px-4 py-3 text-center">{d.total.toLocaleString('pt-BR')}</td>
                            <td className="px-4 py-3 text-center text-red-600 font-semibold">{d.total_7d_mais.toLocaleString('pt-BR')}</td>
                            <td className={`px-4 py-3 text-center font-semibold ${cor}`}>{pct}%</td>
                            <td className="px-4 py-3 text-right text-slate-600">{BRL(d.valor_total)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {!loading && !uploadSel && uploads.length === 0 && (
        <div className="flex items-center gap-2 text-slate-500 mt-6 bg-white border border-slate-200 rounded-xl p-6">
          <AlertCircle size={16} /> Nenhum dado carregado. Envie o arquivo de No Tracking acima.
        </div>
      )}
    </div>
  )
}

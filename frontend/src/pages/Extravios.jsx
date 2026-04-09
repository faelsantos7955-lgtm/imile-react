/**
 * pages/Extravios.jsx — Controle de Extravios (perdas e avarias)
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts'
import { Upload, Loader, Trash2, AlertCircle, TrendingDown, Download } from 'lucide-react'
import { PageHeader, Card, SectionHeader, toast, TableSkeleton } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import api from '../lib/api'

const CORES_MOTIVO = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#a855f7',
]
const BRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
  const inputRef = useRef(null)
  const qc = useQueryClient()

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await api.post('/api/extravios/processar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['extravios-uploads'] })
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
        <Upload size={28} className="text-slate-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Upload — Controle de Extravios</p>
          <p className="text-xs text-slate-400 mt-1">Excel com aba <code className="bg-slate-200 px-1 rounded">BD</code> (Waybill, Reason, Resp, Motivo PT...)</p>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" id="ext-upload" />
        <label htmlFor="ext-upload"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
            ${uploading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}>
          {uploading ? <><Loader size={14} className="animate-spin" /> Processando...</> : <><Upload size={14} /> Enviar arquivo</>}
        </label>
        {erro && <p className="text-xs text-red-600 text-center max-w-sm">{erro}</p>}
      </div>
    </Card>
  )
}

export default function Extravios() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [uploadSel, setUploadSel] = useState(null)
  const [deletando, setDeletando] = useState(false)
  const [baixando, setBaixando]   = useState(false)

  const { data: uploads = [], isLoading: loadingUps } = useQuery({
    queryKey: ['extravios-uploads'],
    queryFn: () => api.get('/api/extravios/uploads').then(r => r.data),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads])

  const { data: detalhe, isLoading: loadingDet } = useQuery({
    queryKey: ['extravios-detalhe', uploadSel],
    queryFn: () => api.get(`/api/extravios/upload/${uploadSel}`).then(r => r.data),
    enabled: !!uploadSel,
  })

  const handleExcel = async () => {
    setBaixando(true)
    try {
      const r = await api.get(`/api/excel/extravios/${uploadSel}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Extravios_${uploads.find(u => u.id === uploadSel)?.data_ref || 'relatorio'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.erro('Erro ao gerar Excel.') }
    finally { setBaixando(false) }
  }

  const deletar = async () => {
    if (!window.confirm('Excluir este upload de extravios?')) return
    setDeletando(true)
    try {
      await api.delete(`/api/extravios/upload/${uploadSel}`)
      qc.invalidateQueries({ queryKey: ['extravios-uploads'] })
      setUploadSel(null)
    } catch { toast.erro('Erro ao excluir.') }
    finally { setDeletando(false) }
  }

  const up      = detalhe?.upload
  const porDs   = detalhe?.por_ds     ?? []
  const porMot  = detalhe?.por_motivo ?? []
  const porSem  = detalhe?.por_semana ?? []
  const top15   = porDs.slice(0, 15)

  const loading = loadingUps || (!!uploadSel && loadingDet)

  return (
    <div>
      <PageHeader icon="⚠️" title="Controle de Extravios" subtitle="Análise de perdas e avarias por DS, motivo e período" />

      {/* Upload + seletor */}
      <div className="flex flex-wrap gap-3 items-center mb-6">
        {uploads.length > 0 && (
          <select
            value={uploadSel ?? ''}
            onChange={e => setUploadSel(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[200px]"
          >
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {u.data_ref || 'Sem data'} — {u.total?.toLocaleString('pt-BR')} registros
              </option>
            ))}
          </select>
        )}
        {uploadSel && (
          <button onClick={handleExcel} disabled={baixando}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors">
            {baixando ? <Loader size={13} className="animate-spin" /> : <Download size={13} />} Excel
          </button>
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
        <div className="mt-6">
          <TableSkeleton rows={8} cols={7} />
        </div>
      )}

      {!loading && up && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <KPI label="Total ocorrências" value={up.total?.toLocaleString('pt-BR')} cls="text-red-600" />
            <KPI label="Valor declarado total" value={BRL(up.valor_total)} cls="text-orange-600" />
            <KPI label="Goods Lost" value={porDs.reduce((s, d) => s + (d.total_lost || 0), 0).toLocaleString('pt-BR')} cls="text-red-700" />
            <KPI label="Avarias" value={porDs.reduce((s, d) => s + (d.total_damaged || 0), 0).toLocaleString('pt-BR')} cls="text-amber-600" />
          </div>

          {/* Top DS */}
          {top15.length > 0 && (
            <>
              <SectionHeader title="Top 15 DS por Ocorrências" />
              <Card>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={top15} layout="vertical" margin={{ left: 70, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="ds" tick={{ fontSize: 11 }} width={70} />
                    <Tooltip
                      formatter={(v, n) => [v.toLocaleString('pt-BR'), n === 'total_lost' ? 'Perdidos' : 'Avarias']}
                    />
                    <Legend formatter={n => n === 'total_lost' ? 'Goods Lost' : 'Avaria'} />
                    <Bar dataKey="total_lost"    stackId="a" fill="#ef4444" name="total_lost" radius={[0,0,0,0]} />
                    <Bar dataKey="total_damaged" stackId="a" fill="#f97316" name="total_damaged" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Motivos */}
            {porMot.length > 0 && (
              <div>
                <SectionHeader title="Por Motivo" />
                <Card>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={porMot} dataKey="total" nameKey="motivo" cx="50%" cy="50%" outerRadius={100}
                        label={({ motivo, percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}>
                        {porMot.map((_, i) => <Cell key={i} fill={CORES_MOTIVO[i % CORES_MOTIVO.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v.toLocaleString('pt-BR'), n]} />
                      <Legend formatter={(v) => v.length > 35 ? v.slice(0, 35) + '…' : v} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            )}

            {/* Evolução por semana */}
            {porSem.length > 0 && (
              <div>
                <SectionHeader title="Evolução Semanal" />
                <Card>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={porSem} margin={{ right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left"  tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                        tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v, n) => n === 'valor_total' ? [BRL(v), 'Valor'] : [v.toLocaleString('pt-BR'), 'Ocorrências']}
                      />
                      <Legend />
                      <Line yAxisId="left"  type="monotone" dataKey="total"       stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Ocorrências" />
                      <Line yAxisId="right" type="monotone" dataKey="valor_total" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} name="valor_total" strokeDasharray="5 5" />
                    </LineChart>
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
                        <th className="px-4 py-3 text-left">DS / Responsável</th>
                        <th className="px-4 py-3 text-left">Supervisor</th>
                        <th className="px-4 py-3 text-center">Total</th>
                        <th className="px-4 py-3 text-center">Goods Lost</th>
                        <th className="px-4 py-3 text-center">Avaria</th>
                        <th className="px-4 py-3 text-right">Valor Declarado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porDs.map((d, i) => (
                        <tr key={d.ds} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">{d.ds}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{d.supervisor || '—'}</td>
                          <td className="px-4 py-3 text-center font-semibold">{d.total.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-center text-red-600">{d.total_lost.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-center text-orange-600">{d.total_damaged.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{BRL(d.valor_total)}</td>
                        </tr>
                      ))}
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
          <AlertCircle size={16} /> Nenhum dado carregado. Envie o arquivo de Controle de Extravios acima.
        </div>
      )}
    </div>
  )
}

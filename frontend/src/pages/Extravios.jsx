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
import { PageHeader, Card, SectionHeader, toast, TableSkeleton, chartTheme, LogisticsEmptyState } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import api, { pollJob } from '../lib/api'


const CORES_MOTIVO = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#a855f7',
]
const BRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`


function UploadZone({ onSuccess }) {
  const [uploading, setUploading] = useState(false)
  const [fase, setFase]           = useState('')
  const [erro, setErro]           = useState('')
  const inputRef = useRef(null)
  const qc = useQueryClient()

  const handleFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErro(''); setFase(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const { data } = await api.post('/api/extravios/processar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const job = data.job_id
        ? await pollJob(`/api/extravios/job/${data.job_id}`, setFase)
        : data
      qc.invalidateQueries({ queryKey: ['extravios-uploads'] })
      onSuccess?.(job.upload_id)
    } catch (err) {
      setErro(err?.response?.data?.detail || err.message || 'Erro ao processar o arquivo.')
    } finally {
      setUploading(false)
      setFase('')
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
          {uploading ? <><Loader size={14} className="animate-spin" /> {fase || 'Processando...'}</> : <><Upload size={14} /> Enviar arquivo</>}
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
      <div className="page-head">
        <div>
          <h1 className="page-title">Extravios</h1>
          <div className="page-sub">Perdas e avarias · {up?.total?.toLocaleString('pt-BR') || 0} ocorrências · {uploads.find(u=>u.id===uploadSel)?.data_ref || '—'}</div>
        </div>
        <div className="page-actions">
          {uploads.length > 0 && (
            <select value={uploadSel ?? ''} onChange={e => setUploadSel(Number(e.target.value))} className="filter-select">
              {uploads.map(u => <option key={u.id} value={u.id}>{u.data_ref || 'Sem data'} — {u.total?.toLocaleString('pt-BR')} reg.</option>)}
            </select>
          )}
          {uploadSel && <button onClick={handleExcel} disabled={baixando} className="btn"><Download size={14}/>{baixando?'Gerando…':'Excel'}</button>}
          {isAdmin && uploadSel && <button onClick={deletar} disabled={deletando} className="btn" style={{color:'var(--danger-600)'}}><Trash2 size={14}/>Excluir</button>}
        </div>
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
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 16 }}>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Total ocorrências</div><div className="kpi-icon danger"><AlertCircle size={14}/></div></div><div className="kpi-value" style={{color:'var(--danger-600)'}}>{up.total?.toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Valor declarado</div></div><div className="kpi-value" style={{fontSize:20}}>{BRL(up.valor_total)}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Goods Lost</div></div><div className="kpi-value" style={{color:'var(--danger-700)'}}>{porDs.reduce((s,d)=>s+(d.total_lost||0),0).toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Avarias</div></div><div className="kpi-value" style={{color:'var(--warn-600)'}}>{porDs.reduce((s,d)=>s+(d.total_damaged||0),0).toLocaleString('pt-BR')}</div></div>
          </div>

          {/* Top DS */}
          {top15.length > 0 && (
            <>
              <div className="card" style={{ marginTop: 20 }}>
                <div className="card-head"><h3 className="card-title">Top 15 DS por Ocorrências</h3></div>
                <div className="card-body">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={top15} layout="vertical" margin={{ left: 70, right: 30 }}>
                    <defs>
                      <linearGradient id="gradLostH" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={0.95}/>
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gradDmgH" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fb923c" stopOpacity={0.95}/>
                        <stop offset="100%" stopColor="#ea580c" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...chartTheme.grid} horizontal={false} />
                    <XAxis type="number" tick={chartTheme.axisStyle} />
                    <YAxis type="category" dataKey="ds" tick={chartTheme.axisStyle} width={70} />
                    <Tooltip {...chartTheme.tooltip}
                      formatter={(v, n) => [v.toLocaleString('pt-BR'), n === 'total_lost' ? 'Perdidos' : 'Avarias']}
                    />
                    <Legend formatter={n => n === 'total_lost' ? 'Goods Lost' : 'Avaria'} />
                    <Bar dataKey="total_lost"    stackId="a" fill="url(#gradLostH)" name="total_lost" radius={[0,0,0,0]} />
                    <Bar dataKey="total_damaged" stackId="a" fill="url(#gradDmgH)"  name="total_damaged" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          <div className="grid-2" style={{ marginTop: 20 }}>
            {/* Motivos */}
            {porMot.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Por Motivo</h3></div>
                <div className="card-body">
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
                </div>
              </div>
            )}

            {/* Evolução por semana */}
            {porSem.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Evolução Semanal</h3></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={porSem} margin={{ right: 20 }}>
                      <CartesianGrid {...chartTheme.grid} />
                      <XAxis dataKey="semana" tick={chartTheme.axisStyle} />
                      <YAxis yAxisId="left"  tick={chartTheme.axisStyle} />
                      <YAxis yAxisId="right" orientation="right" tick={chartTheme.axisStyle}
                        tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                      <Tooltip {...chartTheme.tooltip}
                        formatter={(v, n) => n === 'valor_total' ? [BRL(v), 'Valor'] : [v.toLocaleString('pt-BR'), 'Ocorrências']}
                      />
                      <Legend />
                      <Line yAxisId="left"  type="monotone" dataKey="total"       stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} name="Ocorrências" />
                      <Line yAxisId="right" type="monotone" dataKey="valor_total" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} name="valor_total" strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Tabela por DS */}
          {porDs.length > 0 && (
            <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
              <div className="card-head"><h3 className="card-title">Detalhe por DS ({porDs.length})</h3></div>
              <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>#</th><th>DS</th><th>Supervisor</th>
                        <th className="num">Total</th><th className="num">Goods Lost</th>
                        <th className="num">Avaria</th><th className="num">Valor Declarado</th>
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
              </div>
          )}
        </>
      )}

      {!loading && !uploadSel && uploads.length === 0 && (
        <LogisticsEmptyState
          title="Nenhum dado carregado"
          description="Envie o arquivo de Controle de Extravios acima para visualizar os dados."
        />
      )}
    </div>
  )
}

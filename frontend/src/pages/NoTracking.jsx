/**
 * pages/NoTracking.jsx — No Tracking (断更) — Pacotes sem scan atualizado
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart, Donut } from '../components/charts.jsx'
import { Upload, Loader, Trash2, AlertCircle, Clock, Download } from 'lucide-react'
import { PageHeader, Card, SectionHeader, toast, TableSkeleton, chartTheme, LogisticsEmptyState } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import api, { pollJob } from '../lib/api'


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
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 24 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--slate-500)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

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
      const { data } = await api.post('/api/notracking/processar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      const job = data.job_id
        ? await pollJob(`/api/notracking/job/${data.job_id}`, setFase)
        : data
      qc.invalidateQueries({ queryKey: ['notracking-uploads'] })
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
        <Clock size={28} className="text-slate-400" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">Upload — No Tracking (断更)</p>
          <p className="text-xs text-slate-400 mt-1">Excel com aba <code className="bg-slate-200 px-1 rounded">BD</code> (Número da Etiqueta, Station, AGING, DIAS EM ABERTO...)</p>
        </div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" id="nt-upload" />
        <label htmlFor="nt-upload"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all
            ${uploading ? 'bg-slate-200 text-slate-500 cursor-not-allowed' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
          {uploading ? <><Loader size={14} className="animate-spin" /> {fase || 'Processando...'}</> : <><Upload size={14} /> Enviar arquivo</>}
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
  const [baixando, setBaixando]   = useState(false)
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

  const handleExcel = async () => {
    setBaixando(true)
    try {
      const r = await api.get(`/api/excel/notracking/${uploadSel}`, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `NoTracking_${uploads.find(u => u.id === uploadSel)?.data_ref || 'relatorio'}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { toast.erro('Erro ao gerar Excel.') }
    finally { setBaixando(false) }
  }

  const deletar = async () => {
    if (!window.confirm('Excluir este upload de No Tracking?')) return
    setDeletando(true)
    try {
      await api.delete(`/api/notracking/upload/${uploadSel}`)
      qc.invalidateQueries({ queryKey: ['notracking-uploads'] })
      setUploadSel(null)
    } catch { toast.erro('Erro ao excluir.') }
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
  const fmtDate = d => { if (!d) return 'Sem data'; const [y, m, day] = String(d).split('-'); return `${day}/${m}/${y}` }
  const uploadsSorted = [...uploads].sort((a, b) => String(b.data_ref || '').localeCompare(String(a.data_ref || '')))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">No Tracking</h1>
          <div className="page-sub">Pacotes sem atualização de scan · aging por DS e supervisor</div>
        </div>
        <div className="page-actions">
          {uploadSel && (
            <button onClick={handleExcel} disabled={baixando} className="btn">
              {baixando ? <Loader size={13} className="animate-spin" /> : <Download size={13} />} Excel
            </button>
          )}
          {isAdmin && uploadSel && (
            <button onClick={deletar} disabled={deletando} className="btn" style={{ color: 'var(--danger-600)' }}>
              {deletando ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />} Excluir
            </button>
          )}
        </div>
      </div>

      {/* Seletor */}
      {uploadsSorted.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <select value={uploadSel ?? ''} onChange={e => setUploadSel(Number(e.target.value))} className="filter-select">
            {uploadsSorted.map(u => (
              <option key={u.id} value={u.id}>{fmtDate(u.data_ref)} — {u.total?.toLocaleString('pt-BR')} pacotes</option>
            ))}
          </select>
        </div>
      )}

      <UploadZone onSuccess={(id) => setUploadSel(id)} />

      {loading && (
        <div className="mt-6">
          <TableSkeleton rows={8} cols={8} />
        </div>
      )}

      {!loading && up && (
        <>
          {/* KPIs */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 16 }}>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Total pacotes</div></div><div className="kpi-value">{up.total?.toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Valor em risco</div><div className="kpi-icon warn"><Clock size={14}/></div></div><div className="kpi-value" style={{fontSize:20}}>{BRL(up.valor_total)}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Pacotes ≥7 dias</div><div className="kpi-icon danger"><AlertCircle size={14}/></div></div><div className="kpi-value" style={{color:'var(--danger-600)'}}>{up.total_7d_mais?.toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">% com ≥7 dias</div></div><div className="kpi-value" style={{color:parseFloat(pct7d)>=5?'var(--danger-600)':'var(--slate-900)'}}>{pct7d}<span className="unit">%</span></div></div>
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
              <div className="card">
                <div className="card-body">
                  <BarChart
                    data={supChart.map(d => ({
                      label: d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name,
                      value: viewSup === 'total' ? d['Total'] : d['≥7 dias'],
                      color: viewSup === 'total' ? 'var(--imile-500)' : 'var(--danger-500)',
                    }))}
                    height={280}
                    formatY={v => v.toLocaleString('pt-BR')}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {/* Distribuição por Faixa de Aging */}
            {porFaixa.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Distribuição por Aging</h3></div>
                <div className="card-body">
                  <BarChart
                    data={porFaixa.map(f => ({ label: f.faixa, value: f.total, color: COR_FAIXA[f.faixa] || 'var(--slate-400)' }))}
                    height={240}
                    formatY={v => v.toLocaleString('pt-BR')}
                  />
                </div>
              </div>
            )}

            {porSta.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Por Último Status</h3></div>
                <div className="card-body">
                  <Donut
                    items={porSta.map((s, i) => ({
                      label: s.status.length > 22 ? s.status.slice(0, 22) + '…' : s.status,
                      value: s.total,
                      color: CORES_STATUS[i % CORES_STATUS.length],
                    }))}
                    size={160}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tabela por DS */}
          {porDs.length > 0 && (
            <>
              <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
                <div className="card-head"><h3 className="card-title">Detalhe por DS ({porDs.length})</h3></div>
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>#</th><th>DS</th><th>Supervisor</th><th>Regional</th>
                        <th className="num">Total</th><th className="num">≥7 dias</th>
                        <th className="num">% ≥7d</th><th className="num">Valor em Risco</th>
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
              </div>
            </>
          )}
        </>
      )}

      {!loading && !uploadSel && uploads.length === 0 && (
        <LogisticsEmptyState
          title="Nenhum dado carregado"
          description="Envie o arquivo de No Tracking acima para visualizar os dados."
        />
      )}
    </div>
  )
}

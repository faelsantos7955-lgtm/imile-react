/**
 * pages/NoTracking.jsx — No Tracking (断更) — Pacotes sem scan atualizado
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Upload, Loader, Trash2, AlertCircle, Clock, Download } from 'lucide-react'
import { PageHeader, Card, SectionHeader, toast, TableSkeleton, chartTheme, LogisticsEmptyState } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import api, { pollJob } from '../lib/api'

// ── Hero No Tracking ─────────────────────────────────────────
function HeroNoTracking() {
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 360, height: 360, top: -140, left: -80, background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 280, height: 280, top: -60, right: -40, background: 'radial-gradient(circle,#f59e0b 0%,transparent 70%)', opacity: 0.25 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Radar "sem sinal" — rotaciona mas pings fracos */}
      <svg className="absolute pointer-events-none" style={{ right: 24, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }}
        width={180} height={160} viewBox="0 0 180 160">
        {[65, 45, 28, 12].map((r, i) => (
          <circle key={i} cx={90} cy={80} r={r} fill="none"
            stroke={i === 0 ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.12)'}
            strokeWidth={i === 0 ? 1.5 : 0.8} strokeDasharray={i === 0 ? '4 4' : undefined}/>
        ))}
        <line x1={90} y1={16} x2={90} y2={144} stroke="rgba(245,158,11,0.1)" strokeWidth={0.8}/>
        <line x1={26} y1={80} x2={154} y2={80}  stroke="rgba(245,158,11,0.1)" strokeWidth={0.8}/>
        {/* Varredura — radar-rotate */}
        <g className="radar-rotate" style={{ transformOrigin: '90px 80px' }}>
          <path d="M90,80 L90,16 A64,64 0 0,1 133,58 Z" fill="url(#nt-sweep)" opacity={0.5}/>
        </g>
        {/* Sem sinal — cruzes nos pontos */}
        {[[65,55],[110,90],[75,110]].map(([cx,cy],i) => (
          <g key={i} opacity={0.5} className="signal-blink" style={{ animationDelay: `${i*0.8}s`, animationDuration: '2.5s' }}>
            <line x1={cx-4} y1={cy-4} x2={cx+4} y2={cy+4} stroke="rgba(245,158,11,0.6)" strokeWidth={1.2} strokeLinecap="round"/>
            <line x1={cx+4} y1={cy-4} x2={cx-4} y2={cy+4} stroke="rgba(245,158,11,0.6)" strokeWidth={1.2} strokeLinecap="round"/>
          </g>
        ))}
        <defs>
          <radialGradient id="nt-sweep" cx="90" cy="80" r="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(245,158,11,0)"/>
            <stop offset="60%" stopColor="rgba(245,158,11,0.12)"/>
            <stop offset="100%" stopColor="rgba(245,158,11,0.4)"/>
          </radialGradient>
        </defs>
      </svg>

      {/* Relógio / aging */}
      <div className="absolute right-52 top-1/2 -translate-y-1/2 hidden md:block">
        <svg width={52} height={52} viewBox="0 0 52 52" fill="none" opacity={0.6}>
          <circle cx={26} cy={26} r={22} stroke="rgba(245,158,11,0.4)" strokeWidth={1.5}/>
          <circle cx={26} cy={26} r={3}  fill="rgba(245,158,11,0.8)"/>
          {/* Ponteiros */}
          <line x1={26} y1={26} x2={26} y2={10} stroke="rgba(245,158,11,0.8)" strokeWidth={2} strokeLinecap="round"/>
          <line x1={26} y1={26} x2={38} y2={30} stroke="rgba(245,158,11,0.6)" strokeWidth={1.5} strokeLinecap="round"/>
          {/* Marcas */}
          {[0,30,60,90,120,150,180,210,240,270,300,330].map((a,i) => {
            const r1 = 18, r2 = i%3===0?14:17
            const rad = a * Math.PI / 180
            return <line key={i} x1={26+r1*Math.sin(rad)} y1={26-r1*Math.cos(rad)} x2={26+r2*Math.sin(rad)} y2={26-r2*Math.cos(rad)} stroke="rgba(245,158,11,0.3)" strokeWidth={i%3===0?1.5:0.8}/>
          })}
        </svg>
      </div>

      {/* Indicador sem sinal */}
      <div className="absolute right-6 bottom-7 flex items-center gap-1.5 hidden sm:flex">
        <div className="flex items-end gap-0.5">
          {[4,7,10,13].map((h,i) => (
            <div key={i} className="w-1.5 rounded-sm" style={{ height: h, background: i < 2 ? 'rgba(245,158,11,0.7)' : 'rgba(255,255,255,0.15)' }}/>
          ))}
        </div>
        <span className="text-[10px] font-bold text-amber-400/70 tracking-widest">SEM SCAN</span>
      </div>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: 'rgba(255,220,100,.9)' }}>
          NO TRACKING 断更
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Pacotes Sem Atualização</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Monitoramento de aging por DS e supervisor</p>
      </div>
    </div>
  )
}

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

  return (
    <div>
      <HeroNoTracking />

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
          <TableSkeleton rows={8} cols={8} />
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
                    <defs>
                      <linearGradient id="gradBlueV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1048c8" stopOpacity={0.95}/>
                        <stop offset="100%" stopColor="#0032A0" stopOpacity={0.85}/>
                      </linearGradient>
                      <linearGradient id="gradRedV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f87171" stopOpacity={0.95}/>
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...chartTheme.grid} />
                    <XAxis dataKey="name" tick={chartTheme.axisStyle} />
                    <YAxis tick={chartTheme.axisStyle} />
                    <Tooltip {...chartTheme.tooltip} formatter={v => v.toLocaleString('pt-BR')} />
                    {viewSup === 'total'
                      ? <Bar dataKey="Total"   fill="url(#gradBlueV)" radius={[4,4,0,0]} />
                      : <Bar dataKey="≥7 dias" fill="url(#gradRedV)"  radius={[4,4,0,0]} />
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
                      <CartesianGrid {...chartTheme.grid} />
                      <XAxis dataKey="faixa" tick={chartTheme.axisStyle} angle={-15} textAnchor="end" height={40} />
                      <YAxis tick={chartTheme.axisStyle} />
                      <Tooltip {...chartTheme.tooltip} formatter={(v, n) => [v.toLocaleString('pt-BR'), n === 'total' ? 'Pacotes' : n]} />
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
                      <tr className="text-[10px] uppercase text-white/70"
                        style={{ background: 'linear-gradient(135deg,#0a1628,#1e3a5f)' }}>
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
        <LogisticsEmptyState
          title="Nenhum dado carregado"
          description="Envie o arquivo de No Tracking acima para visualizar os dados."
        />
      )}
    </div>
  )
}

/**
 * pages/Reclamacoes.jsx — Reclamações + bloqueio de motorista + upload
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, Alert, toast, ConfirmDialog, chartTheme } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { Download, Upload, Trash2, ShieldAlert, ShieldOff, ShieldCheck, Loader, X, FileSpreadsheet } from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'
import { processReclamacoes } from '../lib/processarLocal'

// ── Hero Reclamações ─────────────────────────────────────────
function HeroReclamacoes() {
  return (
    <div className="relative overflow-hidden -mx-4 -mt-4 lg:-mx-8 lg:-mt-8 mb-6"
      style={{ background: '#0a0d2e', minHeight: 168 }}>
      <div className="blob blob-a" style={{ width: 380, height: 380, top: -150, left: -100, background: 'radial-gradient(circle,#0032A0 0%,transparent 70%)', opacity: 0.5 }} />
      <div className="blob blob-b" style={{ width: 300, height: 300, top: -80, right: -60, background: 'radial-gradient(circle,#f59e0b 0%,transparent 70%)', opacity: 0.22 }} />
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 70 }} />

      {/* Scanline */}
      <div className="absolute left-0 right-0 h-px pointer-events-none scanline"
        style={{ background: 'linear-gradient(to right, transparent 5%, rgba(255,255,255,0.15) 50%, transparent 95%)' }} />

      {/* Caminhão principal */}
      <div className="truck-anim absolute pointer-events-none" style={{ bottom: 26, left: 0 }}>
        <svg width={260} height={72} viewBox="0 0 260 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="12" width="148" height="44" rx="3" fill="white" fillOpacity="0.92"/>
          <rect x="2" y="44" width="148" height="12" rx="3" fill="#0032A0"/>
          <rect x="2" y="42" width="148" height="3" fill="white" fillOpacity="0.55"/>
          <text x="46" y="40" fontFamily="Arial,sans-serif" fontSize="9" fontWeight="bold" fill="#0032A0" fillOpacity="0.7" letterSpacing="3">iMile</text>
          <path d="M156 16 L156 56 L255 56 L255 32 L248 16 Z" fill="#0032A0"/>
          <path d="M165 9 Q172 4 202 4 L248 4 L255 13 L248 9 L165 9 Z" fill="#0028a0"/>
          <path d="M222 11 L250 11 L255 30 L222 30 Z" fill="white" fillOpacity="0.15"/>
          <rect x="160" y="18" width="28" height="16" rx="2" fill="white" fillOpacity="0.18"/>
          <rect x="249" y="33" width="6" height="12" rx="1" fill="#001d6e"/>
          <rect x="247" y="47" width="8" height="9" rx="2" fill="white" fillOpacity="0.85"/>
          <rect x="251" y="19" width="6" height="9" rx="2" fill="white" fillOpacity="0.95"/>
          {[30,45].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy={64} r="10" fill="#1a1a2e" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
              <circle cx={cx} cy={64} r="6"  fill="#111122" stroke="#0032A0" strokeWidth="1"/>
              <circle cx={cx} cy={64} r="2.5" fill="white" fillOpacity="0.7"/>
            </g>
          ))}
          {[190,235].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy={64} r="11" fill="#1a1a2e" stroke="white" strokeWidth="1.5" strokeOpacity="0.6"/>
              <circle cx={cx} cy={64} r="7"  fill="#111122" stroke="#0032A0" strokeWidth="1.2"/>
              <circle cx={cx} cy={64} r="3"  fill="white" fillOpacity="0.75"/>
            </g>
          ))}
        </svg>
      </div>

      {/* Tickets voando */}
      {[
        { right: '28%', bottom: '55%', delay: '0s',   rot: '-8deg' },
        { right: '24%', bottom: '65%', delay: '1.4s', rot: '4deg'  },
        { right: '32%', bottom: '60%', delay: '2.8s', rot: '-3deg' },
      ].map((t, i) => (
        <div key={i} className="absolute pointer-events-none box-float"
          style={{ right: t.right, bottom: t.bottom, animationDelay: t.delay, animationDuration: `${3 + i * 0.6}s` }}>
          <svg width={32} height={22} viewBox="0 0 32 22" fill="none" style={{ transform: `rotate(${t.rot})` }}>
            <rect x={1} y={1} width={30} height={20} rx={3} fill="white" fillOpacity={0.09} stroke="rgba(255,255,255,0.2)" strokeWidth={0.8}/>
            <rect x={5} y={5} width={14} height={1.5} rx={0.75} fill="rgba(255,255,255,0.3)"/>
            <rect x={5} y={9} width={10} height={1.5} rx={0.75} fill="rgba(255,255,255,0.2)"/>
            <rect x={5} y={13} width={12} height={1.5} rx={0.75} fill="rgba(255,255,255,0.2)"/>
            <rect x={21} y={4} width={6} height={6} rx={1} fill="rgba(239,68,68,0.6)"/>
            <text x={22} y={9.5} fontSize={5} fill="white" fontWeight="bold">!</text>
          </svg>
        </div>
      ))}

      {/* Alerta pulsando */}
      <div className="absolute right-8 top-6 hidden sm:block">
        <div className="relative">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', animation: 'signal-blink 2s ease-in-out infinite' }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none">
              <path d="M10 2L18 16H2L10 2Z" fill="#f59e0b" fillOpacity={0.9}/>
              <rect x={9} y={7} width={2} height={5} rx={0.5} fill="white"/>
              <rect x={9} y={13} width={2} height={2} rx={1} fill="white"/>
            </svg>
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 signal-blink"/>
        </div>
      </div>

      <div className="relative z-10 px-6 py-5">
        <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,.85)' }}>
          RECLAMAÇÕES
        </div>
        <h2 className="text-white font-bold text-[20px] leading-tight">Central de Ocorrências</h2>
        <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>Análise de tickets de Fake Delivery por motorista e DS</p>
      </div>
    </div>
  )
}

const FASE_LABELS = {
  supervisores: 'Buscando mapa de supervisores...',
  lendo:        'Lendo arquivo Excel...',
  salvando:     'Salvando no banco...',
}

function UploadPanel({ onClose, onSuccess }) {
  const [files, setFiles] = useState([])
  const [fase, setFase]   = useState('')
  const [progresso, setProgresso] = useState('')
  const [erro, setErro]   = useState('')
  const inputRef = useRef()

  const uploading = fase !== ''

  const addFiles = (incoming) => {
    const err = validarArquivos(Array.from(incoming))
    if (err) { setErro(err); return }
    setErro('')
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      const novos = Array.from(incoming).filter(f => !names.has(f.name))
      return [...prev, ...novos]
    })
  }

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const totalMB = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024

  const handleSubmit = async () => {
    if (!files.length) return
    setFase('processando'); setProgresso('supervisores'); setErro('')
    try {
      const { data: supMap } = await api.get('/api/triagem/supervisores', { timeout: 120_000 })
      setProgresso('lendo')
      const resultado = await processReclamacoes(files, supMap)
      setProgresso('salvando')
      const res = await api.post('/api/reclamacoes/salvar', resultado, { timeout: 120_000 })
      setFase(''); setProgresso('')
      onSuccess(res.data.upload_id)
    } catch (e) {
      setErro(e.response?.data?.detail || e.message || 'Erro ao processar arquivo.')
      setFase(''); setProgresso('')
    }
  }

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-xl p-5 animate-scale">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800">Novo Upload de Reclamações</p>
        <button onClick={onClose} disabled={uploading} className="text-slate-400 hover:text-slate-600 disabled:opacity-30"><X size={16} /></button>
      </div>

      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); if (!uploading) addFiles(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all mb-4 ${
          uploading
            ? 'border-slate-100 bg-slate-50 cursor-default'
            : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/10 cursor-pointer'
        }`}
      >
        <Upload size={22} className="mx-auto mb-1.5 text-slate-300" />
        <p className="text-xs font-semibold text-slate-600">Clique ou arraste os arquivos aqui</p>
        <p className="text-[10px] text-slate-400 mt-0.5">Bilhete de Reclamações (.xlsx) — múltiplos arquivos permitidos</p>
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {files.length > 0 && !uploading && (
        <div className="space-y-1.5 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Arquivos selecionados
          </p>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
              <FileSpreadsheet size={13} className="text-imile-400 shrink-0" />
              <span className="flex-1 text-xs text-slate-700 truncate min-w-0">{f.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
              <button onClick={() => removeFile(i)} className="text-slate-300 hover:text-red-400 transition-colors ml-1">
                <X size={13} />
              </button>
            </div>
          ))}
          <div className="flex gap-3 text-[11px] pt-1">
            <span className="px-2 py-0.5 bg-imile-50 text-imile-700 rounded-full font-medium">
              {files.length} arquivo{files.length > 1 ? 's' : ''}
            </span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
              {totalMB.toFixed(1)} MB total
            </span>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-600">
              {FASE_LABELS[progresso] || 'Processando...'}
            </span>
            <Loader size={12} className="animate-spin text-imile-500" />
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full bg-imile-400 animate-pulse w-full" />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Processamento local — sem upload de arquivo</p>
        </div>
      )}

      {erro && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
        <button onClick={onClose} disabled={uploading} className="text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40">Cancelar</button>
        <button onClick={handleSubmit} disabled={uploading || !files.length}
          className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50 transition-colors">
          {uploading
            ? <><Loader size={14} className="animate-spin" /> Processando...</>
            : <><Upload size={14} /> Processar</>
          }
        </button>
      </div>
    </div>
  )
}

const COLORS_TOP  = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']
const COLORS_WEEK = ['#095EF7', '#f97316', '#10b981', '#06b6d4']

export default function Reclamacoes() {
  const { isAdmin }               = useAuth()
  const queryClient               = useQueryClient()
  const [sel, setSel]             = useState(null)
  const [blocking, setBlocking]   = useState({})
  const [showPanel, setShowPanel] = useState(false)
  const [erroUpload, setErroUpload] = useState('')
  const [confirmDlg, setConfirmDlg] = useState(null)

  const { data: uploads = [] } = useQuery({
    queryKey: ['reclamacoes-uploads'],
    queryFn: () => api.get('/api/reclamacoes/uploads').then(r => r.data),
  })

  useEffect(() => {
    if (uploads.length && !sel) setSel(uploads[0].id)
  }, [uploads])

  const { data: detail } = useQuery({
    queryKey: ['reclamacoes-detail', sel],
    queryFn: () => api.get(`/api/reclamacoes/upload/${sel}`).then(r => r.data),
    enabled: !!sel,
  })

  const { data: semanasData } = useQuery({
    queryKey: ['reclamacoes-semanas'],
    queryFn: () => api.get('/api/reclamacoes/motoristas-semana').then(r => r.data),
  })
  const semanas = semanasData?.semanas || []

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['reclamacoes-uploads'] })
    queryClient.invalidateQueries({ queryKey: ['reclamacoes-detail', sel] })
    queryClient.invalidateQueries({ queryKey: ['reclamacoes-semanas'] })
  }

  const handleDelete = () => {
    if (!sel) return
    setConfirmDlg({
      message: 'Excluir este upload permanentemente?',
      onConfirm: async () => {
        try {
          await api.delete(`/api/reclamacoes/upload/${sel}`)
          setSel(null)
          queryClient.invalidateQueries({ queryKey: ['reclamacoes-uploads'] })
          queryClient.invalidateQueries({ queryKey: ['reclamacoes-semanas'] })
        } catch (e) { setErroUpload(e.response?.data?.detail || 'Erro ao excluir.') }
      },
    })
  }

  const handleBloquear = (motorista) => {
    setConfirmDlg({
      message: `Bloquear "${motorista}" do ranking? Ele será substituído pelo próximo da fila.`,
      onConfirm: async () => {
        setBlocking(p => ({ ...p, [motorista]: true }))
        try {
          await api.post('/api/admin/motoristas', {
            id_motorista:   motorista,
            nome_motorista: motorista,
            ativo:          false,
            motivo:         'Bloqueado via painel de reclamações',
          })
          invalidateAll()
        } catch { toast.erro('Erro ao bloquear motorista.') }
        finally { setBlocking(p => { const n = { ...p }; delete n[motorista]; return n }) }
      },
    })
  }

  const u = uploads.find(x => x.id === sel)
  const F = n => n?.toLocaleString('pt-BR') || '0'

  const handleExcel = async () => {
    try {
      const r = await api.get(`/api/excel/reclamacoes/${sel}`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Reclamacoes_${u?.data_ref || 'relatorio'}.xlsx`
      a.click()
    } catch { toast.erro('Erro ao gerar Excel.') }
  }

  const weeklyChartData = (() => {
    if (!semanas.length) return []
    const allMot = new Set()
    semanas.forEach(s => s.motoristas.forEach(m => allMot.add(m.motorista)))
    const mots = [...allMot].slice(0, 8)
    return [...semanas].reverse().map(s => {
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
      <HeroReclamacoes />
      <div className="flex items-start justify-between mb-4">
        <div />
        <div className="flex gap-2">
          {sel && (
            <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800">
              <Download size={14} /> Excel
            </button>
          )}
          <button onClick={() => setShowPanel(p => !p)}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 transition-colors">
            {showPanel ? <X size={14} /> : <Upload size={14} />}
            {showPanel ? 'Fechar' : 'Novo Upload'}
          </button>
        </div>
      </div>

      {erroUpload && <Alert type="warning" className="mb-4">{erroUpload}</Alert>}

      {showPanel && (
        <UploadPanel
          onClose={() => setShowPanel(false)}
          onSuccess={(id) => {
            setShowPanel(false)
            invalidateAll()
            setSel(id)
            toast.ok('Arquivo processado com sucesso!')
          }}
        />
      )}

      {!uploads.length && !showPanel ? (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o bilhete de reclamações</p>
        </Card>
      ) : uploads.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-6">
            <select
              value={sel || ''}
              onChange={e => setSel(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm max-w-md flex-1"
            >
              {uploads.map(u => (
                <option key={u.id} value={u.id}>{u.data_ref} — {F(u.n_registros)} registros</option>
              ))}
            </select>
            {isAdmin && sel && (
              <button onClick={handleDelete} className="p-2 text-red-400 hover:text-red-600" title="Excluir upload">
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {u && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total Registros"  value={F(u.n_registros)} color="blue"   />
              <KpiCard label="Supervisores"     value={u.n_sup}          color="orange" />
              <KpiCard label="Stations"         value={u.n_sta}          color="green"  />
              <KpiCard label="Motoristas ID'd"  value={u.n_mot}          color="blue" />
            </div>
          )}

          {detail && (
            <>
              {detail.n_inativos_filtrados > 0 && (
                <Alert type="info">
                  <ShieldAlert size={14} className="inline mr-1" />
                  {detail.n_inativos_filtrados} motorista(s) bloqueado(s) removido(s) do ranking automaticamente.
                </Alert>
              )}

              {detail.top5?.length > 0 && (
                <>
                  <SectionHeader title="Top 5 Ofensores (mais reclamações = pior)" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      {detail.top5.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                            <p className="text-sm font-medium text-slate-800">{r.motorista}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-bold text-red-600">{r.total}</span>
                            {isAdmin && (
                              <button onClick={() => handleBloquear(r.motorista)} disabled={!!blocking[r.motorista]}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 disabled:opacity-50">
                                {blocking[r.motorista] ? <Loader size={12} className="animate-spin" /> : <ShieldOff size={12} />}
                                Bloquear
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {isAdmin && (
                        <p className="text-[10px] text-slate-400 px-2 pt-2 pb-1 border-t border-slate-100">
                          <ShieldCheck size={10} className="inline mr-1" />
                          Ao bloquear, o motorista sai do ranking e é substituído pelo próximo.
                        </p>
                      )}
                    </Card>
                    <Card>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={detail.top5.slice().reverse()} layout="vertical" margin={{ left: 100, right: 40 }}>
                          <defs>
                            <linearGradient id="gradRecH" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#dc2626" stopOpacity={0.95}/>
                              <stop offset="100%" stopColor="#1048c8" stopOpacity={0.8}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid {...chartTheme.grid} />
                          <XAxis type="number" tick={chartTheme.axisStyle} />
                          <YAxis type="category" dataKey="motorista" tick={chartTheme.axisStyle} width={95} />
                          <Tooltip {...chartTheme.tooltip} />
                          <Bar dataKey="total" name="Reclamações" fill="url(#gradRecH)" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: '#dc2626' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </div>
                </>
              )}

              {weeklyChartData.length > 1 && (
                <>
                  <SectionHeader title="Motoristas Ofensores por Semana" />
                  <Card>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={weeklyChartData} margin={{ bottom: 30 }}>
                        <defs>
                          {COLORS_WEEK.map((c, i) => (
                            <linearGradient key={i} id={`gradWeek${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={c} stopOpacity={0.95}/>
                              <stop offset="100%" stopColor={c} stopOpacity={0.7}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid {...chartTheme.grid} />
                        <XAxis dataKey="semana" tick={chartTheme.axisStyle} />
                        <YAxis tick={chartTheme.axisStyle} />
                        <Tooltip {...chartTheme.tooltip} /><Legend />
                        {weeklyMotoristas.map((m, i) => (
                          <Bar key={m} dataKey={m} stackId="a" fill={`url(#gradWeek${i % COLORS_WEEK.length})`}
                            name={m.length > 15 ? m.slice(0, 15) + '…' : m} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {detail.por_supervisor?.length > 0 && (
                  <div>
                    <SectionHeader title="Por Supervisor" />
                    <Card>
                      <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0" style={{ background: 'linear-gradient(135deg,#0a1628,#1e3a5f)' }}>
                            <tr className="text-[10px] uppercase text-white/70">
                              <th className="px-3 py-2 text-left">Supervisor</th>
                              <th className="px-3 py-2 text-right">Qtd Dia</th>
                              <th className="px-3 py-2 text-right">Qtd Mês</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_supervisor.sort((a, b) => b.dia_total - a.dia_total).map((r, i) => (
                              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">{r.supervisor}</td>
                                <td className="px-3 py-2 text-right font-mono">{r.dia_total}</td>
                                <td className="px-3 py-2 text-right font-mono">{r.mes_total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                )}

                {detail.por_station?.length > 0 && (
                  <div>
                    <SectionHeader title="Por Station" />
                    <Card>
                      <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0" style={{ background: 'linear-gradient(135deg,#0a1628,#1e3a5f)' }}>
                            <tr className="text-[10px] uppercase text-white/70">
                              <th className="px-3 py-2 text-left">Station</th>
                              <th className="px-3 py-2 text-right">Qtd Dia</th>
                              <th className="px-3 py-2 text-right">Qtd Mês</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_station.sort((a, b) => b.dia_total - a.dia_total).map((r, i) => (
                              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">{r.station}</td>
                                <td className="px-3 py-2 text-right font-mono">{r.dia_total}</td>
                                <td className="px-3 py-2 text-right font-mono">{r.mes_total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      {confirmDlg && (
        <ConfirmDialog
          message={confirmDlg.message}
          onConfirm={confirmDlg.onConfirm}
          onCancel={() => setConfirmDlg(null)}
        />
      )}
    </div>
  )
}

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
      <div className="page-head">
        <div>
          <h1 className="page-title">Reclamações</h1>
          <div className="page-sub">Análise de Fake Delivery por motorista e DS · {u ? `${u.data_ref} · ${F(u.n_registros)} registros` : 'Nenhum upload'}</div>
        </div>
        <div className="page-actions">
          {sel && <button onClick={handleExcel} className="btn"><Download size={14}/> Excel</button>}
          <button onClick={() => setShowPanel(p => !p)} className="btn btn-primary">
            {showPanel ? <><X size={14}/> Fechar</> : <><Upload size={14}/> Novo Upload</>}
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
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
              <div className="kpi"><div className="kpi-label">Total Registros</div><div className="kpi-value">{F(u.n_registros)}</div></div>
              <div className="kpi"><div className="kpi-label">Supervisores</div><div className="kpi-value">{u.n_sup}</div></div>
              <div className="kpi"><div className="kpi-label">Stations</div><div className="kpi-value">{u.n_sta}</div></div>
              <div className="kpi"><div className="kpi-label">Motoristas</div><div className="kpi-value">{u.n_mot}</div></div>
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

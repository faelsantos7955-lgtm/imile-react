/**
 * pages/Reclamacoes.jsx — Reclamações + bloqueio de motorista + upload via painel
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, Alert } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import {
  Download, ShieldAlert, ShieldOff, ShieldCheck,
  Loader, Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle,
} from 'lucide-react'

const COLORS_TOP  = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']
const COLORS_WEEK = ['#2563eb', '#f97316', '#10b981', '#06b6d4']

// ─── Mini componente: área de drop de arquivo ──────────────────────────────
function FileDropZone({ label, required, file, onChange }) {
  const ref = useRef()
  const [over, setOver] = useState(false)

  const pick = (e) => {
    const f = e.dataTransfer?.files[0] || e.target.files[0]
    if (f) onChange(f)
  }

  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e) }}
      className={`
        relative flex flex-col items-center justify-center gap-1.5 px-4 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-all text-center
        ${over ? 'border-blue-400 bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'}
      `}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={pick} />
      {file ? (
        <>
          <CheckCircle2 size={20} className="text-emerald-500" />
          <p className="text-xs font-medium text-emerald-700 truncate max-w-[160px]">{file.name}</p>
          <button
            onClick={(e) => { e.stopPropagation(); onChange(null) }}
            className="absolute top-1.5 right-1.5 text-emerald-400 hover:text-red-400"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <>
          <FileSpreadsheet size={20} className={required ? 'text-slate-400' : 'text-slate-300'} />
          <p className="text-xs font-medium text-slate-600">{label}</p>
          {required && <span className="text-[10px] text-red-400 font-medium">obrigatório</span>}
          {!required && <span className="text-[10px] text-slate-400">opcional</span>}
        </>
      )}
    </div>
  )
}

// ─── Modal de Upload ───────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }) {
  const [bilhete, setBilhete]     = useState(null)
  const [carta, setCarta]         = useState(null)
  const [gestao, setGestao]       = useState(null)
  const [delivered, setDelivered] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)   // { success, msg }

  const canSubmit = bilhete && carta && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append('bilhete',   bilhete)
      form.append('carta',     carta)
      if (gestao)    form.append('gestao',    gestao)
      if (delivered) form.append('delivered', delivered)

      const r = await api.post('/api/reclamacoes/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult({ success: true, msg: `Processado com sucesso! Data: ${r.data.data_ref} · ${r.data.n_registros?.toLocaleString('pt-BR')} registros` })
      onSuccess()
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || 'Erro desconhecido'
      setResult({ success: false, msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-navy-900" />
            <h2 className="font-semibold text-slate-800">Processar Reclamações</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500">
            Selecione os arquivos abaixo. Os dados serão processados e salvos no banco automaticamente,
            substituindo qualquer upload anterior da mesma data.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <FileDropZone label="Bilhete de Reclamação"         required file={bilhete}   onChange={setBilhete}   />
            <FileDropZone label="Carta de Porte Central"        required file={carta}     onChange={setCarta}     />
            <FileDropZone label="Gestão de Bases (Supervisores)"         file={gestao}    onChange={setGestao}    />
            <FileDropZone label="Delivered / Entregas"                   file={delivered} onChange={setDelivered} />
          </div>

          {result && (
            <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs font-medium ${result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {result.success
                ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                : <AlertCircle  size={14} className="mt-0.5 shrink-0" />}
              {result.msg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            {result?.success ? 'Fechar' : 'Cancelar'}
          </button>
          {!result?.success && (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading
                ? <><Loader size={14} className="animate-spin" /> Processando…</>
                : <><Upload size={14} /> Processar e Salvar</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────
export default function Reclamacoes() {
  const { isAdmin }               = useAuth()
  const [uploads, setUploads]     = useState([])
  const [sel, setSel]             = useState(null)
  const [detail, setDetail]       = useState(null)
  const [semanas, setSemanas]     = useState([])
  const [blocking, setBlocking]   = useState({})
  const [showUpload, setShowUpload] = useState(false)

  const fetchUploads = useCallback(() => {
    return api.get('/api/reclamacoes/uploads').then(r => {
      setUploads(r.data)
      if (r.data.length) setSel(prev => prev ?? r.data[0].id)
    })
  }, [])

  const fetchDetail = useCallback((id) => {
    if (!id) return
    api.get(`/api/reclamacoes/upload/${id}`).then(r => setDetail(r.data))
  }, [])

  const fetchSemanas = useCallback(() => {
    api.get('/api/reclamacoes/motoristas-semana').then(r => setSemanas(r.data.semanas || []))
  }, [])

  useEffect(() => {
    fetchUploads()
    fetchSemanas()
  }, [])

  useEffect(() => {
    fetchDetail(sel)
  }, [sel])

  // Chamado após upload bem-sucedido: recarrega listas e seleciona o novo upload
  const handleUploadSuccess = async () => {
    await fetchUploads()
    await fetchSemanas()
    // Seleciona o upload mais recente (primeiro da lista)
    api.get('/api/reclamacoes/uploads').then(r => {
      if (r.data.length) setSel(r.data[0].id)
    })
  }

  const handleBloquear = async (motorista) => {
    if (!window.confirm(`Bloquear "${motorista}" do ranking?\nEle será substituído pelo próximo da fila.`)) return
    setBlocking(p => ({ ...p, [motorista]: true }))
    try {
      await api.post('/api/admin/motoristas', {
        id_motorista:   motorista,
        nome_motorista: motorista,
        ativo:          false,
        motivo:         'Bloqueado via painel de reclamações',
      })
      await Promise.all([fetchDetail(sel), fetchSemanas()])
    } catch {
      alert('Erro ao bloquear motorista.')
    } finally {
      setBlocking(p => { const n = { ...p }; delete n[motorista]; return n })
    }
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
    } catch {
      alert('Erro ao gerar Excel')
    }
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
      {/* Modal de upload */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      <div className="flex items-start justify-between">
        <PageHeader icon="📋" title="Reclamações" subtitle="Análise de Tickets de Fake Delivery" />

        <div className="flex items-center gap-2">
          {/* Botão Upload — visível apenas para admins */}
          {isAdmin && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Upload size={14} /> Upload
            </button>
          )}

          {sel && (
            <button
              onClick={handleExcel}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors"
            >
              <Download size={14} /> Excel
            </button>
          )}
        </div>
      </div>

      {!uploads.length ? (
        <Alert type="info">Nenhum dado disponível.</Alert>
      ) : (
        <>
          <select
            value={sel || ''}
            onChange={e => setSel(Number(e.target.value))}
            className="mb-6 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm max-w-md"
          >
            {uploads.map(u => (
              <option key={u.id} value={u.id}>{u.data_ref} — {F(u.n_registros)} registros</option>
            ))}
          </select>

          {u && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total Registros"  value={F(u.n_registros)} color="blue"   />
              <KpiCard label="Supervisores"     value={u.n_sup}          color="orange" />
              <KpiCard label="Stations"         value={u.n_sta}          color="green"  />
              <KpiCard label="Motoristas ID'd"  value={u.n_mot}          color="blue"   />
            </div>
          )}

          {detail && (
            <>
              {detail.n_inativos_filtrados > 0 && (
                <Alert type="info">
                  <ShieldAlert size={14} className="inline mr-1" />
                  {detail.n_inativos_filtrados} motorista(s) bloqueado(s) removido(s) do ranking automaticamente. O próximo da fila foi incluído.
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
                            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">
                              {i + 1}
                            </span>
                            <p className="text-sm font-medium text-slate-800">{r.motorista}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-mono font-bold text-red-600">{r.total}</span>
                            {isAdmin && (
                              <button
                                onClick={() => handleBloquear(r.motorista)}
                                disabled={!!blocking[r.motorista]}
                                title="Bloquear este motorista do ranking"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-50"
                              >
                                {blocking[r.motorista]
                                  ? <Loader size={12} className="animate-spin" />
                                  : <ShieldOff size={12} />}
                                Bloquear
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {isAdmin && (
                        <p className="text-[10px] text-slate-400 px-2 pt-2 pb-1 border-t border-slate-100">
                          <ShieldCheck size={10} className="inline mr-1" />
                          Ao bloquear, o motorista sai do ranking em tempo real e é substituído pelo próximo da fila.
                        </p>
                      )}
                    </Card>

                    <Card>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={detail.top5.slice().reverse()} layout="vertical" margin={{ left: 100, right: 40 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="motorista" tick={{ fontSize: 11 }} width={95} />
                          <Tooltip />
                          <Bar dataKey="total" name="Reclamações" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', fontSize: 11, fontWeight: 700 }}>
                            {detail.top5.slice().reverse().map((_, i) => (
                              <Cell key={i} fill={COLORS_TOP[i]} />
                            ))}
                          </Bar>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip /><Legend />
                        {weeklyMotoristas.map((m, i) => (
                          <Bar key={m} dataKey={m} stackId="a"
                            fill={COLORS_WEEK[i % COLORS_WEEK.length]}
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
                          <thead className="sticky top-0 bg-slate-100">
                            <tr className="text-xs uppercase text-slate-600">
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
                          <thead className="sticky top-0 bg-slate-100">
                            <tr className="text-xs uppercase text-slate-600">
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
    </div>
  )
}

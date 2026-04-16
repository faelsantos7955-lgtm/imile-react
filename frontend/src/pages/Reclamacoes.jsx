/**
 * pages/Reclamacoes.jsx — Reclamações + bloqueio de motorista + upload
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, Alert, UploadGuide, toast } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { Download, Upload, Trash2, ShieldAlert, ShieldOff, ShieldCheck, Loader } from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'
import { processReclamacoes } from '../lib/processarLocal'

const COLORS_TOP  = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']
const COLORS_WEEK = ['#095EF7', '#f97316', '#10b981', '#06b6d4']

export default function Reclamacoes() {
  const { isAdmin }               = useAuth()
  const queryClient               = useQueryClient()
  const [sel, setSel]             = useState(null)
  const [blocking, setBlocking]   = useState({})
  const [uploading, setUploading] = useState(false)
  const [erroUpload, setErroUpload] = useState('')
  const inputRef = useRef()

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

  const handleUpload = async (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    const erroVal = validarArquivos(selected)
    if (erroVal) { setErroUpload(erroVal); return }
    setUploading(true); setErroUpload('')
    try {
      // Busca mapa de supervisores e processa localmente
      const { data: supMap } = await api.get('/api/triagem/supervisores')
      const resultado = await processReclamacoes(selected, supMap)
      const res = await api.post('/api/reclamacoes/salvar', resultado)
      invalidateAll()
      setSel(res.data.upload_id)
      toast.ok(`${selected.length > 1 ? 'Arquivos processados' : 'Arquivo processado'} com sucesso!`)
    } catch (e) {
      setErroUpload(e.response?.data?.detail || e.message || 'Erro ao processar arquivo.')
    } finally { setUploading(false) }
  }

  const handleDelete = async () => {
    if (!sel || !window.confirm('Excluir este upload permanentemente?')) return
    try {
      await api.delete(`/api/reclamacoes/upload/${sel}`)
      setSel(null)
      queryClient.invalidateQueries({ queryKey: ['reclamacoes-uploads'] })
      queryClient.invalidateQueries({ queryKey: ['reclamacoes-semanas'] })
    } catch (e) { setErroUpload(e.response?.data?.detail || 'Erro ao excluir.') }
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
      invalidateAll()
    } catch { toast.erro('Erro ao bloquear motorista.') }
    finally { setBlocking(p => { const n = { ...p }; delete n[motorista]; return n }) }
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
      <div className="flex items-start justify-between">
        <PageHeader icon="📋" title="Reclamações" subtitle="Análise de Tickets de Fake Delivery" />
        <div className="flex gap-2">
          {sel && (
            <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800">
              <Download size={14} /> Excel
            </button>
          )}
          <UploadGuide
            title="Arquivo de Reclamações"
            items={[
              'Relatório de Fake Delivery / Reclamações — arquivo único (.xlsx)',
              'Coluna de motorista: nome completo do entregador',
              'Coluna de reclamações: quantidade de tickets no período',
              'Colunas adicionais: Supervisor e Station (base DS)',
              'Não misture semanas diferentes no mesmo arquivo',
            ]}
          />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {erroUpload && <Alert type="warning" className="mb-4">{erroUpload}</Alert>}

      {!uploads.length && !uploading ? (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o bilhete de reclamações</p>
        </Card>
      ) : (
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="motorista" tick={{ fontSize: 11 }} width={95} />
                          <Tooltip />
                          <Bar dataKey="total" name="Reclamações" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', fontSize: 11, fontWeight: 700 }}>
                            {detail.top5.slice().reverse().map((_, i) => <Cell key={i} fill={COLORS_TOP[i]} />)}
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
                          <Bar key={m} dataKey={m} stackId="a" fill={COLORS_WEEK[i % COLORS_WEEK.length]}
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

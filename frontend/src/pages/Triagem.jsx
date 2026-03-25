/**
 * pages/Triagem.jsx — Triagem DC×DS completo
 * KPIs, gráfico por DS, top 5, tabelas DS (expansível por cidade) + Supervisor, Excel
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, KpiCard, SectionHeader, Card, Alert } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Download, Upload, CheckCircle, XCircle, AlertTriangle, ChevronRight, ChevronDown, Loader } from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'

const COLOR_OK  = '#10b981'
const COLOR_NOK = '#ef4444'
const COLOR_TOP = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']

export default function Triagem() {
  const queryClient             = useQueryClient()
  const [sel, setSel]           = useState(null)
  const [expanded, setExpanded] = useState({})
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]         = useState('')
  const inputRef = useRef()

  const { data: uploads = [] } = useQuery({
    queryKey: ['triagem-uploads'],
    queryFn: () => api.get('/api/triagem/uploads').then(r => r.data).catch(() => []),
  })

  useEffect(() => {
    if (uploads.length && !sel) setSel(uploads[0].id)
  }, [uploads])

  const { data: detail, isLoading: loading } = useQuery({
    queryKey: ['triagem-detail', sel],
    queryFn: () => api.get(`/api/triagem/upload/${sel}`).then(r => r.data).catch(() => null),
    enabled: !!sel,
    onSuccess: () => setExpanded({}),
  })

  const toggleDs = useCallback(async (ds) => {
    setExpanded(prev => {
      const cur = prev[ds] || {}
      // Se já está aberto, só fecha
      if (cur.open) return { ...prev, [ds]: { ...cur, open: false } }
      // Se já tem dados, reabre sem refetch
      if (cur.data) return { ...prev, [ds]: { ...cur, open: true } }
      // Precisa buscar
      return { ...prev, [ds]: { open: true, data: null, loadingCity: true } }
    })

    // Busca dados se ainda não tiver
    setExpanded(prev => {
      const cur = prev[ds] || {}
      if (!cur.loadingCity) return prev
      // dispara fetch async
      api.get(`/api/triagem/upload/${sel}/cidades/${encodeURIComponent(ds)}`)
        .then(res => {
          setExpanded(p => ({ ...p, [ds]: { open: true, data: res.data, loadingCity: false } }))
        })
        .catch(() => {
          setExpanded(p => ({ ...p, [ds]: { open: true, data: [], loadingCity: false } }))
        })
      return prev
    })
  }, [sel])

  const handleFile = async (e) => {
    const fileList = [...(e.target.files || [])]
    if (!fileList.length) return
    const erroVal = validarArquivos(fileList)
    if (erroVal) { setErro(erroVal); return }
    setUploading(true); setErro('')
    try {
      const form = new FormData()
      fileList.forEach(f => form.append('files', f))
      const res = await api.post('/api/triagem/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      queryClient.invalidateQueries({ queryKey: ['triagem-uploads'] })
      setSel(res.data.upload_id)
      setExpanded({})
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivo.')
    } finally { setUploading(false); e.target.value = '' }
  }

  const u = uploads.find(x => x.id === sel)
  const F = n => n?.toLocaleString('pt-BR') ?? '0'

  const handleExcel = async () => {
    try {
      const r = await api.get(`/api/excel/triagem/${sel}`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `Triagem_${u?.data_ref || 'relatorio'}.xlsx`
      a.click()
    } catch {
      alert('Erro ao gerar Excel')
    }
  }

  const dsChartData = detail?.por_ds
    ?.slice()
    .sort((a, b) => a.taxa - b.taxa)
    .map(r => ({
      ds:   r.ds,
      ok:   r.ok,
      nok:  r.nok,
      taxa: parseFloat(r.taxa ?? 0),
    })) ?? []

  const TaxaBadge = ({ taxa }) => {
    const v = parseFloat(taxa)
    const cls = v >= 95 ? 'text-emerald-600' : v >= 85 ? 'text-amber-600' : 'text-red-600'
    return <span className={`font-mono font-semibold ${cls}`}>{v.toFixed(1)}%</span>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <PageHeader icon="🔀" title="Triagem DC×DS" subtitle="Análise de erros de expedição por base" />
        <div className="flex gap-2">
          {sel && (
            <button onClick={handleExcel}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors">
              <Download size={14} /> Excel
            </button>
          )}
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={handleFile} />
        </div>
      </div>

      {erro && <Alert type="warning" className="mb-4">{erro}</Alert>}

      {!uploads.length && !uploading ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" e selecione os arquivos LoadingScan (.xlsx) do RDC</p>
        </div>
      ) : uploads.length > 0 ? (
        <>
          <select
            value={sel || ''}
            onChange={e => setSel(Number(e.target.value))}
            className="mb-6 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm max-w-sm"
          >
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {u.data_ref} — {u.qtd_ok}/{u.total} OK ({u.taxa}%)
              </option>
            ))}
          </select>

          {u && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <KpiCard label="Total Expedido" value={F(u.total)}     color="blue"   />
              <KpiCard label="Triagem OK"     value={F(u.qtd_ok)}   color="green"  />
              <KpiCard label="Erros (NOK)"    value={F(u.qtd_erro)} color="red"    />
              <KpiCard label="Taxa OK"        value={`${u.taxa}%`}  color="violet" />
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!loading && detail && (
            <>
              {u && parseFloat(u.taxa) < 90 && (
                <Alert type="warning">
                  <AlertTriangle size={14} className="inline mr-1" />
                  Taxa de triagem abaixo de 90% — atenção necessária nas bases com mais erros.
                </Alert>
              )}

              {/* Gráfico OK vs NOK por DS */}
              {dsChartData.length > 0 && (
                <>
                  <SectionHeader title="OK vs NOK por DS" />
                  <Card>
                    <ResponsiveContainer width="100%" height={Math.max(320, dsChartData.length * 36 + 60)}>
                      <BarChart data={dsChartData} layout="vertical" margin={{ left: 90, right: 70 }} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="ds" tick={{ fontSize: 11 }} width={85} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="ok"  name="OK"  stackId="a" fill={COLOR_OK}  />
                        <Bar dataKey="nok" name="NOK" stackId="a" fill={COLOR_NOK} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </>
              )}

              {/* Top 5 */}
              {detail.top5?.length > 0 && (
                <>
                  <SectionHeader title="Top 5 DS com mais erros" />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      {detail.top5.map((r, i) => (
                        <div key={i} className="flex items-center justify-between py-3 px-2 border-b border-slate-100 last:border-0">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                            <span className="text-sm font-medium text-slate-800">{r.ds}</span>
                          </div>
                          <span className="text-sm font-mono font-bold text-red-600">{F(r.total_erros)}</span>
                        </div>
                      ))}
                    </Card>
                    <Card>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={detail.top5.slice().reverse()} layout="vertical" margin={{ left: 100, right: 50 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="ds" tick={{ fontSize: 11 }} width={95} />
                          <Tooltip />
                          <Bar dataKey="total_erros" name="Erros" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: '#dc2626' }}>
                            {detail.top5.slice().reverse().map((_, i) => (
                              <Cell key={i} fill={COLOR_TOP[COLOR_TOP.length - 1 - i]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </div>
                </>
              )}

              {/* Tabelas DS + Supervisor */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

                {/* Tabela por DS — expansível */}
                {detail.por_ds?.length > 0 && (
                  <div>
                    <SectionHeader title="Detalhamento por DS" />
                    <Card className="p-0 overflow-hidden">
                      <div className="max-h-[520px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-100 z-10">
                            <tr className="text-xs uppercase text-slate-600">
                              <th className="px-3 py-2 text-left w-8"></th>
                              <th className="px-3 py-2 text-left">DS</th>
                              <th className="px-3 py-2 text-right">Total</th>
                              <th className="px-3 py-2 text-center text-emerald-600">
                                <CheckCircle size={12} className="inline mr-0.5" />OK
                              </th>
                              <th className="px-3 py-2 text-center text-red-500">
                                <XCircle size={12} className="inline mr-0.5" />NOK
                              </th>
                              <th className="px-3 py-2 text-right">Taxa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_ds
                              .slice()
                              .sort((a, b) => a.taxa - b.taxa)
                              .map((r, i) => {
                                const exp = expanded[r.ds] || {}
                                return (
                                  <>
                                    {/* Linha principal da DS */}
                                    <tr
                                      key={`ds-${i}`}
                                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                                      onClick={() => toggleDs(r.ds)}
                                    >
                                      <td className="px-3 py-2 text-slate-400">
                                        {exp.loadingCity
                                          ? <Loader size={13} className="animate-spin" />
                                          : exp.open
                                            ? <ChevronDown size={13} />
                                            : <ChevronRight size={13} />
                                        }
                                      </td>
                                      <td className="px-3 py-2 font-medium">{r.ds}</td>
                                      <td className="px-3 py-2 text-right font-mono">{F(r.total)}</td>
                                      <td className="px-3 py-2 text-center font-mono text-emerald-600">{F(r.ok)}</td>
                                      <td className="px-3 py-2 text-center font-mono text-red-500">{F(r.nok)}</td>
                                      <td className="px-3 py-2 text-right"><TaxaBadge taxa={r.taxa} /></td>
                                    </tr>

                                    {/* Linhas de cidade (sub-rows) */}
                                    {exp.open && !exp.loadingCity && (
                                      exp.data?.length > 0
                                        ? exp.data.map((c, ci) => (
                                          <tr key={`city-${i}-${ci}`} className="bg-slate-50 border-t border-slate-100">
                                            <td className="px-3 py-1.5"></td>
                                            <td className="px-3 py-1.5 pl-6 text-slate-500 italic text-xs">
                                              📍 {c.cidade || c.destination_city || c.city || '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-500">{F(c.total)}</td>
                                            <td className="px-3 py-1.5 text-center font-mono text-xs text-emerald-500">{F(c.ok)}</td>
                                            <td className="px-3 py-1.5 text-center font-mono text-xs text-red-400">{F(c.nok)}</td>
                                            <td className="px-3 py-1.5 text-right"><TaxaBadge taxa={c.taxa ?? 0} /></td>
                                          </tr>
                                        ))
                                        : (
                                          <tr key={`city-empty-${i}`} className="bg-slate-50 border-t border-slate-100">
                                            <td colSpan={6} className="px-6 py-2 text-xs text-slate-400 italic">
                                              Sem detalhamento por cidade disponível para esta DS.
                                            </td>
                                          </tr>
                                        )
                                    )}
                                  </>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-400 px-3 py-2 border-t border-slate-100">
                        Clique em uma DS para expandir o detalhamento por cidade.
                      </p>
                    </Card>
                  </div>
                )}

                {/* Tabela por Supervisor */}
                {detail.por_supervisor?.length > 0 && (
                  <div>
                    <SectionHeader title="Detalhamento por Supervisor" />
                    <Card>
                      <div className="max-h-[420px] overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-slate-100">
                            <tr className="text-xs uppercase text-slate-600">
                              <th className="px-3 py-2 text-left">Supervisor</th>
                              <th className="px-3 py-2 text-right">Total</th>
                              <th className="px-3 py-2 text-center text-emerald-600">
                                <CheckCircle size={12} className="inline mr-0.5" />OK
                              </th>
                              <th className="px-3 py-2 text-center text-red-500">
                                <XCircle size={12} className="inline mr-0.5" />NOK
                              </th>
                              <th className="px-3 py-2 text-right">Taxa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.por_supervisor
                              .slice()
                              .sort((a, b) => a.taxa - b.taxa)
                              .map((r, i) => (
                                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium">{r.supervisor}</td>
                                  <td className="px-3 py-2 text-right font-mono">{F(r.total)}</td>
                                  <td className="px-3 py-2 text-center font-mono text-emerald-600">{F(r.ok)}</td>
                                  <td className="px-3 py-2 text-center font-mono text-red-500">{F(r.nok)}</td>
                                  <td className="px-3 py-2 text-right"><TaxaBadge taxa={r.taxa} /></td>
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
      ) : null}
    </div>
  )
}

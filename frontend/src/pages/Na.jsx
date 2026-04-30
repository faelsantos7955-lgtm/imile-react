/**
 * pages/Na.jsx — Not Arrived (有发未到)
 * Pacotes expedidos ainda não chegaram ao destino
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, X, FileSpreadsheet, PackageX, ChevronUp, ChevronDown,
  Truck, PackageCheck, AlertTriangle, Download, History,
} from 'lucide-react'
import { LineChart } from '../components/charts.jsx'
import api, { pollJob } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  KpiCard, Card, SectionHeader, EmptyState, LogisticsEmptyState, Alert, Button,
  toast, chartTheme } from '../components/ui'
import clsx from 'clsx'

const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (n) => `${(n ?? 0).toFixed(1)}%`


// ── Upload Panel ───────────────────────────────────────────────
function UploadPanel({ onClose, onSuccess }) {
  const [file, setFile]   = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const [fase, setFase] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/api/na/processar', fd, { timeout: 60_000 })
      if (data.job_id) {
        return await pollJob(`/api/na/job/${data.job_id}`, setFase)
      }
      return data
    },
    onSuccess: (data) => { onSuccess(data); onClose() },
    onError:   (err)  => setError(err.response?.data?.detail || err.message || 'Erro ao processar.'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Upload — Not Arrived</h2>
            <p className="text-xs text-slate-400 mt-0.5">Arquivo 有发未到 (.xlsx)</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setError('') } }}
            className={clsx(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
              file ? 'border-imile-300 bg-imile-50/40' : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/20'
            )}
          >
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm" className="hidden"
              onChange={e => { setFile(e.target.files[0] || null); setError('') }} />
            <Upload size={24} className="mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">
              {file ? 'Clique para trocar o arquivo' : 'Clique ou arraste o arquivo aqui'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">Máx. 150 MB</p>
          </div>

          {file && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-xs text-slate-700 font-medium">
              <FileSpreadsheet size={12} className="text-imile-500 shrink-0" />
              <span className="truncate flex-1">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500"><X size={11} /></button>
            </div>
          )}

          <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-600 text-xs mb-1">Formato esperado</p>
            <p>· Aba <strong>Export</strong> — dados brutos por waybill</p>
            <p>· Colunas: <strong>Destination Station</strong>, Supervisor, 日期, Process, Situation</p>
          </div>

          {error && <Alert type="error" onClose={() => setError('')}>{error}</Alert>}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button className="flex-1" onClick={() => { setError(''); mutation.mutate() }} disabled={!file || mutation.isPending}>
            {mutation.isPending
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{fase || 'Processando…'}</>
              : 'Processar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Tabela Sheet1 — pivot Supervisor → DS × Datas ─────────────
function TabelaSheet1({ tendencia, porSupervisor, porDs, thresholdLabel }) {
  if (!tendencia?.length) return <EmptyState icon={PackageX} title="Sem dados de tendência" />

  // Pivot: supervisor → ds → date → count
  const pivot = {}
  const dateSet = new Set()
  tendencia.forEach(r => {
    if (!pivot[r.supervisor]) pivot[r.supervisor] = {}
    if (!pivot[r.supervisor][r.ds]) pivot[r.supervisor][r.ds] = {}
    pivot[r.supervisor][r.ds][r.data] = (pivot[r.supervisor][r.ds][r.data] || 0) + r.total
    dateSet.add(r.data)
  })

  const datas = [...dateSet].sort()
  const datasVisiveis = datas.slice(-20) // últimas 20 datas

  // Lookups
  const supLookup = {}
  porSupervisor?.forEach(r => { supLookup[r.supervisor] = r })
  const dsLookup = {}
  porDs?.forEach(r => { dsLookup[`${r.supervisor}|${r.ds}`] = r })

  // Ordem supervisores por total desc
  const sups = Object.keys(pivot).sort((a, b) =>
    (supLookup[b]?.total || 0) - (supLookup[a]?.total || 0)
  )

  // Escala de cor
  const allVals = tendencia.map(r => r.total)
  const maxVal  = Math.max(...allVals, 1)

  function cellColor(val) {
    if (!val) return ''
    const r = val / maxVal
    if (r >= 0.75) return 'bg-red-500 text-white font-semibold'
    if (r >= 0.50) return 'bg-red-300 text-red-900 font-medium'
    if (r >= 0.25) return 'bg-amber-200 text-amber-800'
    return 'bg-amber-50 text-amber-700'
  }

  const fmtData = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

  // Totais por data (rodapé)
  const dateGrandTotals = {}
  datasVisiveis.forEach(d => {
    dateGrandTotals[d] = sups.reduce((s, sup) =>
      s + Object.values(pivot[sup] || {}).reduce((a, dsMap) => a + (dsMap[d] || 0), 0), 0)
  })

  return (
    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
      <table className="text-[11px] w-full border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-800">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white/60 sticky left-0 bg-slate-800 z-30 min-w-[120px] border-r border-white/10">
              Supervisor
            </th>
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white/60 sticky left-[120px] bg-slate-800 z-30 min-w-[100px] border-r border-white/10">
              DS
            </th>
            <th className="px-2 py-2 text-center text-[10px] font-bold text-red-300 min-w-[52px] whitespace-nowrap">
              {thresholdLabel}
            </th>
            {datasVisiveis.map(d => (
              <th key={d} className="px-1 py-2 text-center text-[10px] font-bold text-white/60 min-w-[40px] whitespace-nowrap">
                {fmtData(d)}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[10px] font-bold text-white sticky right-0 bg-slate-800 z-30 border-l border-white/10">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {sups.map(sup => {
            const supInf   = supLookup[sup] || { total: 0, grd10d: 0 }
            const supDsMap = pivot[sup] || {}
            const dsList   = Object.keys(supDsMap).sort((a, b) =>
              Object.values(supDsMap[b]).reduce((s,v)=>s+v,0) -
              Object.values(supDsMap[a]).reduce((s,v)=>s+v,0)
            )

            // Totais do supervisor por data visível
            const supDateTotals = {}
            datasVisiveis.forEach(d => {
              supDateTotals[d] = dsList.reduce((s, ds) => s + (supDsMap[ds]?.[d] || 0), 0)
            })

            return (
              <>
                {/* Linha supervisor */}
                <tr key={`sup-${sup}`} className="bg-slate-700 border-t-2 border-slate-600">
                  <td className="px-3 py-2 font-bold text-white sticky left-0 bg-slate-700 z-10 border-r border-slate-600">
                    {sup}
                  </td>
                  <td className="px-3 py-2 sticky left-[120px] bg-slate-700 z-10 border-r border-slate-600" />
                  <td className="px-2 py-2 text-center font-mono font-bold text-red-300">
                    {supInf.grd10d || '—'}
                  </td>
                  {datasVisiveis.map(d => (
                    <td key={d} className="px-1 py-2 text-center font-mono text-white/70">
                      {supDateTotals[d] || '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-bold text-white sticky right-0 bg-slate-700 z-10 border-l border-slate-600">
                    {fmt(supInf.total)}
                  </td>
                </tr>

                {/* Linhas DS */}
                {dsList.map(ds => {
                  const dsDateMap = supDsMap[ds] || {}
                  const dsInf     = dsLookup[`${sup}|${ds}`] || { total: 0, grd10d: 0 }
                  const dsTotal   = Object.values(dsDateMap).reduce((s,v)=>s+v,0)
                  return (
                    <tr key={`ds-${sup}-${ds}`} className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors">
                      <td className="sticky left-0 bg-white z-10 border-r border-slate-100" />
                      <td className="px-3 py-1.5 text-slate-700 font-medium sticky left-[120px] bg-white z-10 border-r border-slate-100">
                        {ds}
                      </td>
                      <td className="px-2 py-1.5 text-center font-mono text-red-600">
                        {dsInf.grd10d || '—'}
                      </td>
                      {datasVisiveis.map(d => {
                        const val = dsDateMap[d] || 0
                        return (
                          <td key={d} className={clsx('px-1 py-1.5 text-center font-mono transition-colors', val ? cellColor(val) : 'text-slate-200')}>
                            {val || '—'}
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-slate-700 sticky right-0 bg-white z-10 border-l border-slate-100">
                        {fmt(dsTotal)}
                      </td>
                    </tr>
                  )
                })}
              </>
            )
          })}
        </tbody>

        <tfoot className="sticky bottom-0 z-20">
          <tr className="bg-slate-100 border-t-2 border-slate-300">
            <td className="px-3 py-2 font-bold text-slate-800 text-xs sticky left-0 bg-slate-100 z-30 border-r border-slate-200">
              Total
            </td>
            <td className="sticky left-[120px] bg-slate-100 z-30 border-r border-slate-200" />
            <td className="px-2 py-2 text-center font-mono font-bold text-red-700 text-xs">
              {fmt(porSupervisor?.reduce((s, r) => s + r.grd10d, 0) || 0)}
            </td>
            {datasVisiveis.map(d => (
              <td key={d} className="px-1 py-2 text-center font-mono font-semibold text-slate-700 text-[10px]">
                {dateGrandTotals[d] || '—'}
              </td>
            ))}
            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 text-xs sticky right-0 bg-slate-100 z-30 border-l border-slate-200">
              {fmt(porSupervisor?.reduce((s, r) => s + r.total, 0) || 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Tabela DS paginada ─────────────────────────────────────────
function TabelaDs({ rows, thresholdLabel }) {
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState('total')
  const [sortAsc, setSortAsc] = useState(false)
  const [page,    setPage]    = useState(0)
  const PER_PAGE = 15

  const toggle = col => {
    if (sortCol === col) setSortAsc(v => !v); else { setSortCol(col); setSortAsc(false) }
    setPage(0)
  }

  const filtered = rows
    .filter(r => (r.ds + r.supervisor).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const v = sortAsc ? 1 : -1
      if (typeof a[sortCol] === 'string') return v * a[sortCol].localeCompare(b[sortCol])
      return v * ((a[sortCol] ?? 0) - (b[sortCol] ?? 0))
    })

  const pageRows   = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(filtered.length / PER_PAGE)

  const Th = ({ col, children, right }) => (
    <th onClick={() => toggle(col)}
      className={clsx(
        'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none',
        right ? 'text-right' : 'text-left',
        sortCol === col ? 'text-white' : 'text-white/60 hover:text-white/90'
      )}>
      <span className={clsx('flex items-center gap-1', right && 'justify-end')}>
        {children}
        {sortCol === col && (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  )

  return (
    <div className="space-y-3">
      <input type="text" placeholder="Filtrar DS ou supervisor…" value={search}
        onChange={e => { setSearch(e.target.value); setPage(0) }}
        className="w-full max-w-xs px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400" />
      <div className="rounded-xl overflow-hidden border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-800">
            <tr>
              <Th col="supervisor">Supervisor</Th>
              <Th col="ds">DS</Th>
              <Th col="grd10d" right>{thresholdLabel}</Th>
              <Th col="total" right>Total</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageRows.map((r, i) => {
              const pctGrd = r.total > 0 ? (r.grd10d / r.total * 100) : 0
              return (
                <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2.5 text-slate-500">{r.supervisor}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{r.ds}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className={clsx('font-semibold', pctGrd > 20 ? 'text-red-600' : pctGrd > 5 ? 'text-amber-600' : 'text-slate-600')}>
                      {fmt(r.grd10d)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(r.total)}</td>
                </tr>
              )
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">Nenhum resultado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} DS · página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">‹</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
              className="px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">›</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabela processo ────────────────────────────────────────────
function TabelaProcesso({ rows }) {
  const total = rows.reduce((s, r) => s + r.total, 0)
  const COLORS = ['bg-imile-400','bg-blue-400','bg-violet-400','bg-sky-400','bg-slate-400','bg-cyan-400']
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => {
        const w = total > 0 ? (r.total / total * 100) : 0
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-36 text-xs text-slate-600 truncate shrink-0">{r.processo}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className={clsx('h-full rounded-full', COLORS[i % COLORS.length])} style={{ width: `${w}%` }} />
            </div>
            <span className="text-xs font-mono font-semibold text-slate-700 w-14 text-right">{fmt(r.total)}</span>
            <span className="text-[11px] font-mono text-slate-400 w-10 text-right">{pct(w)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Histórico ──────────────────────────────────────────────────
const SUP_COLORS = ['#095EF7','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d','#64748b','#92400e','#065f46']
const fmtDate = iso => { const [,m,d] = (iso||'').split('-'); return `${d}/${m}` }

function HistoricoNA({ uploads }) {
  const uploadsSorted = [...uploads].sort((a, b) => a.data_ref?.localeCompare(b.data_ref))

  const { data: supData = [], isLoading } = useQuery({
    queryKey: ['na-historico-supervisores'],
    queryFn:  () => api.get('/api/na/historico/supervisores').then(r => r.data),
    enabled:  uploads.length > 1,
  })

  // Dados para gráfico global
  const globalData = uploadsSorted.map(u => ({
    data:    fmtDate(u.data_ref),
    Total:   u.total,
    [u.threshold_col || '>10D']: u.grd10d,
  }))

  // Pivot supervisor por data
  const supervisores = [...new Set(supData.map(r => r.supervisor))].sort()
  const supByDate = {}
  supData.forEach(r => {
    const d = fmtDate(r.data_ref)
    if (!supByDate[d]) supByDate[d] = { data: d }
    supByDate[d][r.supervisor] = r.total
  })
  const supChartData = Object.values(supByDate).sort((a, b) => a.data.localeCompare(b.data))

  if (uploads.length < 2) {
    return (
      <EmptyState icon={History} title="Dados insuficientes"
        description="São necessários pelo menos 2 uploads para exibir o histórico de tendência." />
    )
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-head"><h3 className="card-title">Evolução Global</h3><div className="card-sub">Total de waybills e pacotes em atraso por semana</div></div>
        <div className="card-body">
          {isLoading ? (
            <div className="skel" style={{ height: 200, borderRadius: 'var(--r-md)' }} />
          ) : (
            <LineChart
              series={[
                { name: 'Total', color: 'var(--imile-500)', data: globalData.map(d => ({ x: d.data, y: d.Total || 0 })) },
                ...(globalData[0] ? Object.keys(globalData[0]).filter(k => k !== 'data' && k !== 'Total').map(key => ({
                  name: key, color: 'var(--danger-500)', area: false,
                  data: globalData.map(d => ({ x: d.data, y: d[key] || 0 })),
                })) : []),
              ]}
              height={240}
              formatY={v => v.toLocaleString('pt-BR')}
            />
          )}
        </div>
      </div>

      {supervisores.length > 0 && (
        <div className="card">
          <div className="card-head"><h3 className="card-title">Total por Supervisor</h3><div className="card-sub">Evolução semanal de waybills em atraso por supervisor</div></div>
          <div className="card-body">
            <LineChart
              series={supervisores.map((sup, i) => ({
                name: sup, color: SUP_COLORS[i % SUP_COLORS.length], area: false,
                data: supChartData.map(d => ({ x: d.data, y: d[sup] || 0 })),
              }))}
              height={280}
              formatY={v => v.toLocaleString('pt-BR')}
            />
          </div>
        </div>
      )}

      {/* Tabela resumo */}
      <Card title="Resumo por Upload">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-2.5 text-left font-bold">Data Ref.</th>
                <th className="px-3 py-2.5 text-right font-bold">Total</th>
                <th className="px-3 py-2.5 text-right font-bold">Em Atraso</th>
                <th className="px-3 py-2.5 text-right font-bold">% Atraso</th>
                <th className="px-3 py-2.5 text-right font-bold">Offloaded</th>
                <th className="px-3 py-2.5 text-right font-bold">Confirmados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {uploadsSorted.map((u, i) => {
                const pctGrd = u.total > 0 ? (u.grd10d / u.total * 100) : 0
                return (
                  <tr key={u.id} className={i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                    <td className="px-3 py-2 font-semibold text-slate-800">{u.data_ref}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">{fmt(u.total)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{fmt(u.grd10d)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      <span className={clsx('font-bold', pctGrd > 20 ? 'text-red-600' : pctGrd > 10 ? 'text-amber-600' : 'text-emerald-600')}>
                        {pctGrd.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(u.total_offload)}</td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-700">{fmt(u.total_arrive)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function Na() {
  const { isAdmin }  = useAuth()
  const qc           = useQueryClient()
  const [view,       setView]       = useState('dados')
  const [showPanel,  setShowPanel]  = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [flashResult,setFlashResult]= useState(null)
  const [downloading,setDownloading]= useState(false)

  const { data: uploads = [], isLoading: loadingUploads } = useQuery({
    queryKey: ['na-uploads'],
    queryFn:  () => api.get('/api/na/uploads').then(r => r.data),
  })

  useEffect(() => {
    if (uploads.length > 0 && !selectedId) setSelectedId(uploads[0].id)
  }, [uploads, selectedId])

  const { data: detalhe, isLoading: loadingDetalhe } = useQuery({
    queryKey: ['na-detalhe', selectedId],
    queryFn:  () => api.get(`/api/na/upload/${selectedId}`).then(r => r.data),
    enabled:  !!selectedId,
  })

  const { data: tendencia = [] } = useQuery({
    queryKey: ['na-tendencia', selectedId],
    queryFn:  () => api.get(`/api/na/upload/${selectedId}/tendencia`).then(r => r.data),
    enabled:  !!selectedId,
  })

  const upload        = uploads.find(u => u.id === selectedId)
  const thresholdLabel = upload?.threshold_col || '>10D'

  const handleUploadSuccess = (data) => {
    setFlashResult(data)
    qc.invalidateQueries({ queryKey: ['na-uploads'] })
    setSelectedId(data.upload_id)
  }

  const handleExcel = async () => {
    if (!selectedId) return
    setDownloading(true)
    try {
      const r = await api.get(`/api/excel/na/${selectedId}`, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([r.data]))
      a.download = `NotArrived_${upload?.data_ref || 'relatorio'}.xlsx`
      a.click()
    } catch (err) {
      // Tenta ler mensagem de erro do blob de resposta
      let msg = 'Erro ao gerar Excel.'
      try {
        const text = await err.response?.data?.text?.()
        const json = JSON.parse(text || '{}')
        msg = json.detail || msg
      } catch {}
      toast.erro(msg)
    }
    finally { setDownloading(false) }
  }

  if (loadingUploads) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1600px]">
      <div className="page-head">
        <div>
          <h1 className="page-title">Not Arrived <span style={{fontSize:18,opacity:.5}}>有发未到</span></h1>
          <div className="page-sub">Pacotes expedidos que ainda não chegaram ao destino</div>
        </div>
        <div className="page-actions">
          <div className="tabs" style={{ border: 'none', marginBottom: 0 }}>
            <button className={`tab${view==='dados'?' active':''}`} onClick={() => setView('dados')}>Dados</button>
            {uploads.length > 1 && (
              <button className={`tab${view==='historico'?' active':''}`} onClick={() => setView('historico')}>
                <History size={12} /> Histórico
              </button>
            )}
          </div>
          {selectedId && view === 'dados' && (
            <button onClick={handleExcel} disabled={downloading} className="btn">
              <Download size={14}/>{downloading ? 'Gerando…' : 'Excel'}
            </button>
          )}
          <button onClick={() => setShowPanel(true)} className="btn btn-primary">
            <Upload size={14}/> Novo Upload
          </button>
        </div>
      </div>

      {/* Flash */}
      {flashResult && (
        <Alert type="success" onClose={() => setFlashResult(null)}>
          Processado — {fmt(flashResult.total)} waybills · {fmt(flashResult.grd10d)} {flashResult.threshold_col}
        </Alert>
      )}

      {view === 'historico' && <HistoricoNA uploads={uploads} />}

      {view === 'dados' && (uploads.length === 0 ? (
        <LogisticsEmptyState
          title="Nenhum upload encontrado"
          description="Faça o upload do arquivo 有发未到 (.xlsx) para visualizar os dados."
          action={<Button onClick={() => setShowPanel(true)}>Fazer upload</Button>}
        />
      ) : (
        <>
          {/* Seletor */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">Data de referência:</span>
            <select value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 text-slate-700">
              {uploads.map(u => (
                <option key={u.id} value={u.id}>
                  {u.data_ref} — {fmt(u.total)} waybills · {fmt(u.grd10d)} {u.threshold_col || '>10D'}
                </option>
              ))}
            </select>
          </div>

          {/* KPIs */}
          {upload && (
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div className="kpi">
                <div className="kpi-head"><div className="kpi-label">Total Waybills</div><div className="kpi-icon"><PackageX size={14}/></div></div>
                <div className="kpi-value">{fmt(upload.total)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-head"><div className="kpi-label">{thresholdLabel}</div><div className="kpi-icon danger"><AlertTriangle size={14}/></div></div>
                <div className="kpi-value" style={{color:'var(--danger-600)'}}>{fmt(upload.grd10d)}</div>
                <div className="kpi-foot"><span className="muted">{upload.total > 0 ? `${(upload.grd10d / upload.total * 100).toFixed(1)}% do total` : ''}</span></div>
              </div>
              <div className="kpi">
                <div className="kpi-head"><div className="kpi-label">Offloaded</div><div className="kpi-icon warn"><Truck size={14}/></div></div>
                <div className="kpi-value">{fmt(upload.total_offload)}</div>
                <div className="kpi-foot"><span className="muted">{upload.total > 0 ? `${(upload.total_offload / upload.total * 100).toFixed(1)}% do total` : ''}</span></div>
              </div>
              <div className="kpi">
                <div className="kpi-head"><div className="kpi-label">Confirmados</div><div className="kpi-icon success"><PackageCheck size={14}/></div></div>
                <div className="kpi-value" style={{color:'var(--success-600)'}}>{fmt(upload.total_arrive)}</div>
                <div className="kpi-foot"><span className="muted">{upload.total > 0 ? `${(upload.total_arrive / upload.total * 100).toFixed(1)}% do total` : ''}</span></div>
              </div>
            </div>
          )}

          {/* Conteúdo */}
          {loadingDetalhe ? (
            <div className="flex items-center justify-center h-40">
              <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
            </div>
          ) : detalhe && (
            <>
              {/* Dash — Sheet1 heatmap — supervisor × DS × datas */}
              <SectionHeader title="Dash — Supervisor × DS × Data (Sheet1)" />
              <Card padding={false}>
                <TabelaSheet1
                  tendencia={tendencia}
                  porSupervisor={detalhe.por_supervisor}
                  porDs={detalhe.por_ds}
                  thresholdLabel={thresholdLabel}
                />
              </Card>

              {/* Supervisor + Processo */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card title="Por Processo" subtitle="Tipo de transferência">
                  {detalhe.por_processo.length > 0
                    ? <TabelaProcesso rows={detalhe.por_processo} />
                    : <EmptyState icon={PackageX} title="Sem dados" />}
                </Card>
                <Card title={`Backlog ${thresholdLabel} por Supervisor`}>
                  {detalhe.por_supervisor.length > 0
                    ? (
                      <div className="space-y-2">
                        {detalhe.por_supervisor.map((r, i) => {
                          const pctGrd = r.total > 0 ? (r.grd10d / r.total * 100) : 0
                          return (
                            <div key={i} className="flex items-center gap-3">
                              <span className="w-24 text-xs text-slate-600 truncate shrink-0 font-medium">{r.supervisor}</span>
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className={clsx('h-full rounded-full', pctGrd > 20 ? 'bg-red-400' : pctGrd > 5 ? 'bg-amber-400' : 'bg-imile-400')}
                                  style={{ width: `${Math.min(pctGrd, 100)}%` }} />
                              </div>
                              <span className="text-xs font-mono font-semibold text-slate-700 w-10 text-right">{fmt(r.grd10d)}</span>
                              <span className="text-[11px] font-mono text-slate-400 w-12 text-right">{pct(pctGrd)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                    : <EmptyState icon={PackageX} title="Sem dados" />}
                </Card>
              </div>

              {/* DS detail */}
              <SectionHeader title="Por DS" />
              <Card>
                {detalhe.por_ds.length > 0
                  ? <TabelaDs rows={detalhe.por_ds} thresholdLabel={thresholdLabel} />
                  : <EmptyState icon={PackageX} title="Sem dados de DS" />}
              </Card>
            </>
          )}
        </>
      ))}

      {showPanel && (
        <UploadPanel onClose={() => setShowPanel(false)} onSuccess={handleUploadSuccess} />
      )}
    </div>
  )
}

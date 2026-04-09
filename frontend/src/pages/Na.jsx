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
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  KpiCard, Card, SectionHeader, EmptyState, Alert, Button,
, toast } from '../components/ui'
import clsx from 'clsx'

const fmt = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct = (n) => `${(n ?? 0).toFixed(1)}%`

// ── Upload Panel ───────────────────────────────────────────────
function UploadPanel({ onClose, onSuccess }) {
  const [file, setFile]   = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/api/na/processar', fd, { timeout: 300_000 })
      return r.data
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
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processando…</>
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
      {/* Gráfico global */}
      <Card title="Evolução Global" subtitle="Total de waybills e pacotes em atraso por semana">
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={globalData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={50} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v, name) => [v?.toLocaleString('pt-BR'), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Total" stroke="#095EF7" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              {globalData[0] && Object.keys(globalData[0]).filter(k => k !== 'data' && k !== 'Total').map(key => (
                <Line key={key} type="monotone" dataKey={key} stroke="#dc2626" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Gráfico por supervisor */}
      {supervisores.length > 0 && (
        <Card title="Total por Supervisor" subtitle="Evolução semanal de waybills em atraso por supervisor">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={supChartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={50} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v, name) => [v?.toLocaleString('pt-BR'), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {supervisores.map((sup, i) => (
                <Line key={sup} type="monotone" dataKey={sup}
                  stroke={SUP_COLORS[i % SUP_COLORS.length]}
                  strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
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

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-imile-500 mb-0.5">
            Relatório de Exceção
          </p>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Not Arrived</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pacotes expedidos que ainda não chegaram ao destino (有发未到)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-semibold">
            <button onClick={() => setView('dados')}
              className={clsx('px-3 py-1.5 rounded-md transition-colors', view === 'dados' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
              Dados
            </button>
            {uploads.length > 1 && (
              <button onClick={() => setView('historico')}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors', view === 'historico' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                <History size={12} /> Histórico
              </button>
            )}
          </div>
          {selectedId && view === 'dados' && (
            <button onClick={handleExcel} disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <Download size={14} />
              {downloading ? 'Gerando…' : 'Excel'}
            </button>
          )}
          <Button onClick={() => setShowPanel(true)} size="md">
            <Upload size={14} /> Novo Upload
          </Button>
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
        <EmptyState
          icon={PackageX}
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Total Waybills"   value={fmt(upload.total)}          color="blue"   icon={PackageX} />
              <KpiCard
                label={thresholdLabel}
                value={fmt(upload.grd10d)}
                sub={upload.total > 0 ? `${(upload.grd10d / upload.total * 100).toFixed(1)}% do total` : ''}
                color="red"
                icon={AlertTriangle}
              />
              <KpiCard
                label="Offloaded"
                value={fmt(upload.total_offload)}
                sub={upload.total > 0 ? `${(upload.total_offload / upload.total * 100).toFixed(1)}% do total` : ''}
                color="orange"
                icon={Truck}
              />
              <KpiCard
                label="Confirmados"
                value={fmt(upload.total_arrive)}
                sub={upload.total > 0 ? `${(upload.total_arrive / upload.total * 100).toFixed(1)}% do total` : ''}
                color="green"
                icon={PackageCheck}
              />
            </div>
          )}

          {/* Conteúdo */}
          {loadingDetalhe ? (
            <div className="flex items-center justify-center h-40">
              <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
            </div>
          ) : detalhe && (
            <>
              {/* Sheet1 heatmap — supervisor × DS × datas */}
              <SectionHeader title="Supervisor × DS × Data" />
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

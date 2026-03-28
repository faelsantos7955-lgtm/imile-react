/**
 * pages/Na.jsx — Not Arrived (有发未到)
 * Pacotes expedidos ainda não chegaram ao destino
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Upload, X, FileSpreadsheet, PackageX, ChevronUp, ChevronDown,
  TruckIcon, PackageCheck, AlertTriangle, BarChart2,
} from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  KpiCard, Card, SectionHeader, EmptyState, Alert, Badge, Button,
} from '../components/ui'
import clsx from 'clsx'

const fmt  = (n) => (n ?? 0).toLocaleString('pt-BR')
const pct  = (n) => `${(n ?? 0).toFixed(1)}%`

// ── Upload Panel ───────────────────────────────────────────────
function UploadPanel({ onClose, onSuccess }) {
  const [file, setFile]   = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()

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
            <p>· Aba <strong>Sheet1</strong> — pivot supervisor × DS × data</p>
            <p>· Aba <strong>Export</strong> — dados brutos por waybill</p>
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

// ── Heatmap supervisor × data ──────────────────────────────────
function TabelaTendencia({ rows, thresholdLabel }) {
  if (!rows || rows.length === 0) return <EmptyState icon={BarChart2} title="Sem dados de tendência" />

  // Agrupar por (supervisor, data) somando DS
  const supDateMap: Record<string, Record<string, number>> = {}
  const dateSet = new Set<string>()
  rows.forEach(r => {
    if (!supDateMap[r.supervisor]) supDateMap[r.supervisor] = {}
    supDateMap[r.supervisor][r.data] = (supDateMap[r.supervisor][r.data] || 0) + r.total
    dateSet.add(r.data)
  })

  const datas        = [...dateSet].sort()
  const datasVisiveis = datas.slice(-20)
  const sups = Object.keys(supDateMap).sort((a, b) => {
    const ta = Object.values(supDateMap[a]).reduce((s, v) => s + v, 0)
    const tb = Object.values(supDateMap[b]).reduce((s, v) => s + v, 0)
    return tb - ta
  })

  const allVals = Object.values(supDateMap).flatMap(m => Object.values(m))
  const maxVal  = allVals.length ? Math.max(...allVals) : 1

  function cellColor(val) {
    if (!val) return 'bg-slate-50 text-slate-300'
    const r = Math.min(val / maxVal, 1)
    if (r >= 0.75) return 'bg-red-500 text-white font-semibold'
    if (r >= 0.50) return 'bg-red-300 text-red-900 font-medium'
    if (r >= 0.25) return 'bg-amber-200 text-amber-900'
    return 'bg-amber-50 text-amber-700'
  }

  const fmtData = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] w-full border-collapse">
        <thead>
          <tr className="bg-slate-800">
            <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-white/60 sticky left-0 bg-slate-800 z-10 min-w-[130px]">
              Supervisor
            </th>
            {datasVisiveis.map(d => (
              <th key={d} className="px-1 py-2 text-center text-[10px] font-bold text-white/60 min-w-[42px] whitespace-nowrap">
                {fmtData(d)}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-white sticky right-0 bg-slate-800 z-10">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sups.map(sup => {
            const supData  = supDateMap[sup] || {}
            const totalSup = Object.values(supData).reduce((s, v) => s + v, 0)
            return (
              <tr key={sup} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-3 py-1.5 font-semibold text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100">
                  {sup}
                </td>
                {datasVisiveis.map(d => {
                  const val = supData[d] || 0
                  return (
                    <td key={d} className={clsx('px-1 py-1.5 text-center font-mono transition-colors', cellColor(val))}>
                      {val || '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 sticky right-0 bg-white z-10 border-l border-slate-100">
                  {fmt(totalSup)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
          <tr>
            <td className="px-3 py-2 font-bold text-xs text-slate-700 sticky left-0 bg-slate-50 z-10">Total</td>
            {datasVisiveis.map(d => {
              const tot = sups.reduce((s, sup) => s + (supDateMap[sup]?.[d] || 0), 0)
              return (
                <td key={d} className="px-1 py-2 text-center font-mono font-semibold text-slate-700 text-[10px]">
                  {tot || '—'}
                </td>
              )
            })}
            <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 text-xs sticky right-0 bg-slate-50 z-10">
              {fmt(sups.reduce((s, sup) => s + Object.values(supDateMap[sup] || {}).reduce((a, v) => a + v, 0), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Tabela supervisores ────────────────────────────────────────
function TabelaSupervisores({ rows, thresholdLabel }) {
  const totalGeral = rows.reduce((s, r) => s + r.total, 0)
  return (
    <div className="rounded-xl overflow-hidden border border-slate-100">
      <table className="w-full text-xs">
        <thead className="bg-slate-800">
          <tr>
            <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-white/60">Supervisor</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">Total</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-red-300">{thresholdLabel}</th>
            <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-white/60">% do Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((r, i) => {
            const pctTot = totalGeral > 0 ? (r.total / totalGeral * 100) : 0
            const pctGrd = r.total > 0 ? (r.grd10d / r.total * 100) : 0
            return (
              <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-3 py-2.5 font-semibold text-slate-800">{r.supervisor}</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(r.total)}</td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className={clsx('font-semibold', pctGrd > 20 ? 'text-red-600' : pctGrd > 5 ? 'text-amber-600' : 'text-slate-600')}>
                    {fmt(r.grd10d)}
                    {r.total > 0 && <span className="ml-1 font-normal text-slate-400 text-[10px]">({pct(pctGrd)})</span>}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-imile-400 rounded-full" style={{ width: `${pctTot}%` }} />
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 w-8 text-right">{pct(pctTot)}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Tabela DS ──────────────────────────────────────────────────
function TabelaDs({ rows, thresholdLabel }) {
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState('total')
  const [sortAsc, setSortAsc] = useState(false)
  const [page,    setPage]    = useState(0)
  const PER_PAGE = 15

  const toggle = (col) => {
    if (sortCol === col) setSortAsc(v => !v); else { setSortCol(col); setSortAsc(false) }
    setPage(0)
  }

  const filtered = rows
    .filter(r => r.ds?.toLowerCase().includes(search.toLowerCase()) ||
                 r.supervisor?.toLowerCase().includes(search.toLowerCase()))
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
        'px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors',
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
              <Th col="ds">DS</Th>
              <Th col="supervisor">Supervisor</Th>
              <Th col="total" right>Total</Th>
              <Th col="grd10d" right>{thresholdLabel}</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageRows.map((r, i) => {
              const pctGrd = r.total > 0 ? (r.grd10d / r.total * 100) : 0
              return (
                <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{r.ds}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.supervisor}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">{fmt(r.total)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className={clsx('font-semibold', pctGrd > 20 ? 'text-red-600' : pctGrd > 5 ? 'text-amber-600' : 'text-slate-600')}>
                      {fmt(r.grd10d)}
                    </span>
                  </td>
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
  const COLORS = ['bg-imile-400', 'bg-blue-400', 'bg-violet-400', 'bg-sky-400', 'bg-slate-400', 'bg-cyan-400']
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

// ── Selector de upload ─────────────────────────────────────────
function UploadSelector({ uploads, selected, onChange }) {
  return (
    <select value={selected || ''} onChange={e => onChange(Number(e.target.value))}
      className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 text-slate-700">
      {uploads.map(u => (
        <option key={u.id} value={u.id}>
          {u.data_ref} — {fmt(u.total)} waybills · {fmt(u.grd10d)} {u.threshold_col || '>10D'}
        </option>
      ))}
    </select>
  )
}

// ── Page ───────────────────────────────────────────────────────
export default function Na() {
  const { isAdmin }    = useAuth()
  const qc             = useQueryClient()
  const [showPanel, setShowPanel] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [flashResult, setFlashResult] = useState(null)

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

  const upload = uploads.find(u => u.id === selectedId)
  const thresholdLabel = upload?.threshold_col || '>10D'

  const handleUploadSuccess = (data) => {
    setFlashResult(data)
    qc.invalidateQueries({ queryKey: ['na-uploads'] })
    setSelectedId(data.upload_id)
  }

  if (loadingUploads) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="w-5 h-5 border-2 border-imile-500/30 border-t-imile-500 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">

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
        <Button onClick={() => setShowPanel(true)} size="md">
          <Upload size={14} /> Novo Upload
        </Button>
      </div>

      {/* Flash */}
      {flashResult && (
        <Alert type="success" onClose={() => setFlashResult(null)}>
          Processado — {fmt(flashResult.total)} waybills · {fmt(flashResult.grd10d)} {flashResult.threshold_col}
        </Alert>
      )}

      {/* Sem uploads */}
      {uploads.length === 0 ? (
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
            <UploadSelector uploads={uploads} selected={selectedId} onChange={setSelectedId} />
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
                icon={TruckIcon}
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
              {/* Heatmap */}
              <SectionHeader title="Tendência por Supervisor" />
              <Card padding={false}>
                <TabelaTendencia rows={tendencia} thresholdLabel={thresholdLabel} />
              </Card>

              {/* Supervisor + Processo lado a lado */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <Card title="Por Supervisor" subtitle={`Total e backlog ${thresholdLabel}`}>
                  {detalhe.por_supervisor.length > 0
                    ? <TabelaSupervisores rows={detalhe.por_supervisor} thresholdLabel={thresholdLabel} />
                    : <EmptyState icon={PackageX} title="Sem dados" />}
                </Card>
                <Card title="Por Processo" subtitle="Tipo de transferência">
                  {detalhe.por_processo.length > 0
                    ? <TabelaProcesso rows={detalhe.por_processo} />
                    : <EmptyState icon={PackageX} title="Sem dados" />}
                </Card>
              </div>

              {/* DS */}
              <SectionHeader title="Por DS" />
              <Card>
                {detalhe.por_ds.length > 0
                  ? <TabelaDs rows={detalhe.por_ds} thresholdLabel={thresholdLabel} />
                  : <EmptyState icon={PackageX} title="Sem dados de DS" />}
              </Card>
            </>
          )}
        </>
      )}

      {showPanel && (
        <UploadPanel onClose={() => setShowPanel(false)} onSuccess={handleUploadSuccess} />
      )}
    </div>
  )
}

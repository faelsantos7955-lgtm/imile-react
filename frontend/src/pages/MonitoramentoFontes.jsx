/**
 * pages/MonitoramentoFontes.jsx
 * Processa os arquivos-fonte do Monitoramento LOCALMENTE no browser via SheetJS.
 * Só o JSON agregado (~KB) é enviado ao servidor — sem upload de arquivos grandes.
 */
import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import api from '../lib/api'
import { PageHeader, Alert, toast } from '../components/ui'
import {
  UploadCloud, X, Loader2, PlayCircle, CheckCircle2,
  ExternalLink, Calendar, Zap,
} from 'lucide-react'
import clsx from 'clsx'

// ── Definição das fontes ──────────────────────────────────────
const FONTES = [
  {
    id: 'rdc',
    label: 'LoadingScan (RDC → DS)',
    hint: 'LoadingScan*.xlsx — coluna "Delivery Station"',
    multiple: true, color: 'blue', icon: '🚚',
  },
  {
    id: 'recebidos',
    label: 'Pacotes Recebidos Hoje',
    hint: 'Arrival*.xlsx — coluna "Scan Station" + "Scan Time"',
    multiple: true, color: 'teal', icon: '📥',
  },
  {
    id: 'expedidos',
    label: 'Pacotes Expedidos de Hoje',
    hint: '"Out Of Delivery Scan List*.xlsx" — "Scan station" + "DA Code"',
    multiple: true, color: 'amber', icon: '📤',
  },
  {
    id: 'estoque',
    label: 'Estoque (在途 / não fechados)',
    hint: '网点首次到件未闭环*.xlsx — aba "details"',
    multiple: true, color: 'orange', icon: '📦',
  },
  {
    id: 'assinaturas',
    label: 'Assinaturas / Entregas de Hoje',
    hint: 'Delivered*.xlsx — coluna "Scan Station"',
    multiple: true, color: 'emerald', icon: '✅',
  },
  {
    id: 'supervisores',
    label: 'Supervisores (opcional)',
    hint: 'Gestão Operacional Supervisores.xlsx — SIGLA / REGION / SUPERVISOR',
    multiple: false, color: 'purple', icon: '👥', optional: true,
  },
]

const COLOR = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-300',    text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700' },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-300',    text: 'text-teal-700',    badge: 'bg-teal-100 text-teal-700' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-300',   text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-300',  text: 'text-orange-700',  badge: 'bg-orange-100 text-orange-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-300',  text: 'text-purple-700',  badge: 'bg-purple-100 text-purple-700' },
}

// ══════════════════════════════════════════════════════════════
//  FUNÇÕES DE AGREGAÇÃO LOCAL (SheetJS)
// ══════════════════════════════════════════════════════════════

function readWorkbook(buffer) {
  return XLSX.read(buffer, {
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellText: false,
  })
}

/** Lê uma sheet e retorna [headers, ...rows] como arrays */
function sheetToRows(wb, sheetName) {
  const wsName = sheetName
    ? (wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0])
    : wb.SheetNames[0]
  const ws = wb.Sheets[wsName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
}

/** Encontra índice de coluna pelo nome (busca parcial, case-insensitive) */
function findCol(headers, ...names) {
  for (const name of names) {
    const n = name.toLowerCase()
    const idx = headers.findIndex(h => String(h).toLowerCase().includes(n))
    if (idx >= 0) return idx
  }
  return -1
}

function normDS(val) {
  const s = String(val || '').trim().toUpperCase()
  return s.startsWith('DS') ? s : null
}

// ── RDC (LoadingScan) ──────────────────────────────────────────
async function parseRDC(files) {
  const counts = {}
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const wb = readWorkbook(buf)
    const rows = sheetToRows(wb, null)
    if (rows.length < 2) continue
    const headers = rows[0]
    const colDS = findCol(headers, 'Delivery Station', 'Destination Statio')
    if (colDS < 0) continue
    for (let i = 1; i < rows.length; i++) {
      const ds = normDS(rows[i][colDS])
      if (ds) counts[ds] = (counts[ds] || 0) + 1
    }
  }
  return counts  // { 'DS ARJ': 2117, ... }
}

// ── Recebidos (Arrival) ────────────────────────────────────────
async function parseRecebidos(files) {
  const counts = {}
  let dataRef = null
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const wb = readWorkbook(buf)
    const rows = sheetToRows(wb, null)
    if (rows.length < 2) continue
    const headers = rows[0]
    const colDS   = findCol(headers, 'Scan Station', 'Delivery Station')
    const colTime = findCol(headers, 'Scan Time', 'Scan time')
    if (colDS < 0) continue
    for (let i = 1; i < rows.length; i++) {
      const ds = normDS(rows[i][colDS])
      if (!ds) continue
      counts[ds] = (counts[ds] || 0) + 1
      if (!dataRef && colTime >= 0 && rows[i][colTime]) {
        const d = rows[i][colTime]
        const dt = d instanceof Date ? d : new Date(d)
        if (!isNaN(dt)) dataRef = dt.toISOString().slice(0, 10)
      }
    }
  }
  return { counts, dataRef }
}

// ── Expedidos (Out Of Delivery Scan List) ─────────────────────
async function parseExpedidos(files) {
  // { ds: { count, daSet } }
  const agg = {}
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const wb = readWorkbook(buf)
    const rows = sheetToRows(wb, null)
    if (rows.length < 2) continue
    const headers = rows[0]
    const colDS = findCol(headers, 'Scan station', 'Scan Station')
    const colDA = findCol(headers, 'DA Code')
    if (colDS < 0) continue
    for (let i = 1; i < rows.length; i++) {
      const ds = normDS(rows[i][colDS])
      if (!ds) continue
      if (!agg[ds]) agg[ds] = { count: 0, daSet: new Set() }
      agg[ds].count++
      const da = String(rows[i][colDA] || '').trim()
      if (da) agg[ds].daSet.add(da)
    }
  }
  // Converte Set → number
  const result = {}
  for (const [ds, v] of Object.entries(agg)) {
    result[ds] = { volume_saida: v.count, qtd_motoristas: v.daSet.size }
  }
  return result
}

// ── Assinaturas (Delivered) ────────────────────────────────────
async function parseAssinaturas(files) {
  const counts = {}
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const wb = readWorkbook(buf)
    const rows = sheetToRows(wb, null)
    if (rows.length < 2) continue
    const headers = rows[0]
    const colDS = findCol(headers, 'Scan Station', 'Scan station')
    if (colDS < 0) continue
    for (let i = 1; i < rows.length; i++) {
      const ds = normDS(rows[i][colDS])
      if (ds) counts[ds] = (counts[ds] || 0) + 1
    }
  }
  return counts
}

// ── Estoque (网点首次到件未闭环) ──────────────────────────────
const AGE_7D = new Set(['7-10D', '11-13D', '14-16D', '17-20D', '≥21D'])

async function parseEstoque(files) {
  // { ds: { estoque_ds, estoque_motorista, estoque_7d } }
  const agg = {}
  for (const file of files) {
    const buf = await file.arrayBuffer()
    const wb = readWorkbook(buf)
    const rows = sheetToRows(wb, 'details')
    if (rows.length < 2) continue
    const headers = rows[0]
    const colDS     = findCol(headers, 'lastScanSite')
    const colStatus = findCol(headers, 'lastScanStatus')
    const colAge    = findCol(headers, 'ageFirstReceive')
    if (colDS < 0) continue
    for (let i = 1; i < rows.length; i++) {
      const ds = normDS(rows[i][colDS])
      if (!ds) continue
      if (!agg[ds]) agg[ds] = { estoque_ds: 0, estoque_motorista: 0, estoque_7d: 0 }
      const status = String(rows[i][colStatus] || '').trim()
      const age    = String(rows[i][colAge]    || '').trim()
      if (status === 'Arrive')              agg[ds].estoque_ds++
      if (status === 'Out For Delivery')    agg[ds].estoque_motorista++
      if (AGE_7D.has(age))                  agg[ds].estoque_7d++
    }
  }
  return agg
}

// ── Supervisores ───────────────────────────────────────────────
async function parseSupervisores(file) {
  if (!file) return {}
  const buf = await file.arrayBuffer()
  const wb = readWorkbook(buf)
  const rows = sheetToRows(wb, null)
  if (rows.length < 2) return {}
  const headers = rows[0]
  const colDS  = findCol(headers, 'SIGLA')
  const colReg = findCol(headers, 'REGION', 'REGIÃO')
  const colSup = findCol(headers, 'SUPERVIS', 'SUPERV')
  if (colDS < 0) return {}
  const map = {}
  for (let i = 1; i < rows.length; i++) {
    const ds = normDS(rows[i][colDS])
    if (!ds) continue
    map[ds] = {
      regiao:     String(rows[i][colReg] || '').trim(),
      supervisor: String(rows[i][colSup] || '').trim(),
    }
  }
  return map
}

// ── Merge final → array de rows ───────────────────────────────
function buildDados(rdc, recv, exp, assin, estoque, sup) {
  // Conjunto de todas as DS encontradas
  const allDS = new Set([
    ...Object.keys(rdc),
    ...Object.keys(recv),
    ...Object.keys(exp),
    ...Object.keys(assin),
    ...Object.keys(estoque),
    ...Object.keys(sup),
  ])

  return Array.from(allDS).sort().map(ds => {
    const e = estoque[ds] || {}
    const x = exp[ds]    || {}
    const recebimento   = recv[ds]           || 0
    const volume_saida  = x.volume_saida     || 0
    const qtd_motoristas= x.qtd_motoristas   || 0
    const entregue      = assin[ds]          || 0
    const estoque_ds    = e.estoque_ds       || 0
    const estoque_mot   = e.estoque_motorista|| 0
    const estoque_7d    = e.estoque_7d       || 0
    const volume_total  = recebimento
    const pendencia     = Math.max(0, volume_total - volume_saida)
    const taxa          = volume_total > 0 ? +(volume_saida / volume_total).toFixed(4) : 0
    const efPessoal     = qtd_motoristas > 0 ? +(volume_saida / qtd_motoristas).toFixed(2) : 0
    const efAssin       = qtd_motoristas > 0 ? +(entregue / qtd_motoristas).toFixed(2) : 0
    const info          = sup[ds] || {}
    return {
      ds,
      supervisor:           info.supervisor || '',
      regiao:               info.regiao     || '',
      rdc_ds:               rdc[ds]         || 0,
      estoque_ds,
      estoque_motorista:    estoque_mot,
      estoque_total:        estoque_ds + estoque_mot,
      estoque_7d,
      recebimento,
      volume_total,
      pendencia_scan:       pendencia,
      volume_saida,
      taxa_expedicao:       taxa,
      qtd_motoristas,
      eficiencia_pessoal:   efPessoal,
      entregue,
      eficiencia_assinatura: efAssin,
    }
  })
}

// ══════════════════════════════════════════════════════════════
//  UI COMPONENTS
// ══════════════════════════════════════════════════════════════

function FonteCard({ fonte, files, onAdd, onRemove, disabled, status }) {
  const inputRef = useRef(null)
  const c = COLOR[fonte.color]

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(xlsx|xlsm)$/i))
    if (dropped.length) onAdd(fonte.multiple ? dropped : [dropped[0]])
  }, [fonte.multiple, onAdd])

  const statusColor = status === 'ok'  ? 'text-emerald-600'
                    : status === 'err' ? 'text-red-500'
                    : status === 'processing' ? 'text-amber-500' : ''

  return (
    <div className={clsx(
      'rounded-xl border bg-white overflow-hidden transition-all',
      files.length > 0 ? `border-2 ${c.border}` : 'border border-slate-200'
    )}>
      <div className={clsx('flex items-center justify-between px-4 py-3', files.length > 0 ? c.bg : 'bg-slate-50')}>
        <div className="flex items-center gap-2">
          <span className="text-base">{fonte.icon}</span>
          <span className={clsx('text-sm font-semibold', files.length > 0 ? c.text : 'text-slate-600')}>
            {fonte.label}
          </span>
          {files.length > 0 && (
            <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', c.badge)}>
              {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}
            </span>
          )}
          {fonte.optional && files.length === 0 && (
            <span className="text-[10px] text-slate-400 font-medium">opcional</span>
          )}
          {status === 'processing' && <Loader2 size={13} className="animate-spin text-amber-500" />}
          {status === 'ok'  && <CheckCircle2 size={13} className="text-emerald-500" />}
        </div>
        {!disabled && (
          <button onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-white/70 transition">
            <UploadCloud size={13} /> Selecionar
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        {!disabled && (
          <div
            className={clsx(
              'border-2 border-dashed rounded-lg px-3 py-3 text-center cursor-pointer transition-colors',
              files.length > 0 ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300 bg-slate-50'
            )}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={16} className={clsx('mx-auto mb-1', files.length > 0 ? c.text : 'text-slate-300')} />
            <p className="text-[11px] text-slate-500">
              Arraste ou <span className="text-imile-600 font-medium">clique para selecionar</span>
              {fonte.multiple ? ' (múltiplos arquivos)' : ''}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fonte.hint}</p>
            <input ref={inputRef} type="file" multiple={fonte.multiple} accept=".xlsx,.xlsm"
              className="hidden"
              onChange={e => {
                const picked = Array.from(e.target.files || [])
                if (picked.length) onAdd(fonte.multiple ? picked : [picked[0]])
                e.target.value = ''
              }}
            />
          </div>
        )}

        {files.length > 0 && (
          <ul className="space-y-1 max-h-36 overflow-y-auto">
            {files.map((file, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 group">
                <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                  {(file.size / 1024).toFixed(0)}KB
                </span>
                <span className="flex-1 text-xs text-slate-700 truncate" title={file.name}>{file.name}</span>
                {!disabled && (
                  <button onClick={() => onRemove(i)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-400 transition">
                    <X size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════════════

export default function MonitoramentoFontes() {
  const navigate = useNavigate()
  const [files,     setFiles]     = useState(() => Object.fromEntries(FONTES.map(f => [f.id, []])))
  const [dataRef,   setDataRef]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [fase,      setFase]      = useState('')   // texto de progresso
  const [fonteStatus, setFonteStatus] = useState({})  // { id: 'processing'|'ok'|'err' }
  const [erro,      setErro]      = useState('')
  const [resultado, setResultado] = useState(null)

  const totalFiles = FONTES.reduce((s, f) => s + files[f.id].length, 0)

  const addFiles = (fonteId, newFiles) => {
    setFiles(prev => {
      const fonte = FONTES.find(f => f.id === fonteId)
      if (fonte?.multiple) return { ...prev, [fonteId]: [...prev[fonteId], ...newFiles] }
      return { ...prev, [fonteId]: [newFiles[0]] }
    })
    setResultado(null)
    setErro('')
  }

  const removeFile = (fonteId, idx) => {
    setFiles(prev => ({ ...prev, [fonteId]: prev[fonteId].filter((_, i) => i !== idx) }))
  }

  const resetAll = () => {
    setFiles(Object.fromEntries(FONTES.map(f => [f.id, []])))
    setDataRef('')
    setResultado(null)
    setErro('')
    setFonteStatus({})
    setFase('')
  }

  const setStatus = (id, s) => setFonteStatus(prev => ({ ...prev, [id]: s }))

  const handleProcessar = async () => {
    if (!totalFiles) return
    setLoading(true)
    setErro('')
    setResultado(null)
    setFonteStatus({})

    try {
      // ── 1. Leitura local de cada fonte ──────────────────────
      setFase('Lendo LoadingScan…'); setStatus('rdc', 'processing')
      const rdc = await parseRDC(files.rdc)
      setStatus('rdc', 'ok')

      setFase('Lendo Arrival…'); setStatus('recebidos', 'processing')
      const { counts: recv, dataRef: drAuto } = await parseRecebidos(files.recebidos)
      setStatus('recebidos', 'ok')

      setFase('Lendo Out Of Delivery…'); setStatus('expedidos', 'processing')
      const exp = await parseExpedidos(files.expedidos)
      setStatus('expedidos', 'ok')

      setFase('Lendo Estoque…'); setStatus('estoque', 'processing')
      const estoque = await parseEstoque(files.estoque)
      setStatus('estoque', 'ok')

      setFase('Lendo Delivered…'); setStatus('assinaturas', 'processing')
      const assin = await parseAssinaturas(files.assinaturas)
      setStatus('assinaturas', 'ok')

      setFase('Lendo Supervisores…'); setStatus('supervisores', 'processing')
      const sup = await parseSupervisores(files.supervisores[0] || null)
      setStatus('supervisores', 'ok')

      // ── 2. Merge e cálculo de métricas ──────────────────────
      setFase('Agregando dados…')
      const dados = buildDados(rdc, recv, exp, assin, estoque, sup)

      if (!dados.length) {
        setErro('Nenhuma DS encontrada nos arquivos. Verifique se as colunas estão corretas.')
        setLoading(false)
        return
      }

      // ── 3. Envio do JSON ao backend ──────────────────────────
      setFase(`Salvando ${dados.length} bases…`)
      const res = await api.post('/api/monitoramento/salvar-agregado', {
        data_ref: dataRef || drAuto || new Date().toISOString().slice(0, 10),
        dados,
      })
      setResultado(res.data)
      toast.ok(`Processado: ${res.data.total_ds} bases — ${res.data.data_ref}`)
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Erro ao processar'
      setErro(typeof msg === 'string' ? msg : JSON.stringify(msg))
    } finally {
      setLoading(false)
      setFase('')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        icon="⚡"
        title="Monitoramento — Processar por Fontes"
        subtitle="Os arquivos são lidos localmente no browser. Só os dados agregados são enviados ao servidor."
      />

      {/* Barra de ação */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 gap-4">
        <div className="flex items-center gap-3">
          <Calendar size={15} className="text-slate-400" />
          <label className="text-xs font-medium text-slate-600 shrink-0">Data de referência</label>
          <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white text-slate-700"
            disabled={loading} />
          <span className="text-[10px] text-slate-400 hidden sm:block">
            (detecta automaticamente pelos arquivos se deixado em branco)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {resultado && (
            <button onClick={resetAll}
              className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              Limpar
            </button>
          )}
          <button onClick={handleProcessar} disabled={!totalFiles || loading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition',
              totalFiles && !loading
                ? 'bg-imile-500 text-white hover:bg-imile-600 shadow-sm'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            )}>
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> {fase || 'Processando…'}</>
              : <><Zap size={13} /> {totalFiles ? `Processar ${totalFiles} arquivo${totalFiles > 1 ? 's' : ''}` : 'Selecione os arquivos'}</>
            }
          </button>
        </div>
      </div>

      {erro && <Alert type="warning">{erro}</Alert>}

      {/* Resultado */}
      {resultado && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Relatório gerado com sucesso!</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {resultado.total_ds} bases · data: <strong>{resultado.data_ref}</strong>
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/monitoramento')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition">
            <ExternalLink size={13} /> Ver Dashboard
          </button>
        </div>
      )}

      {/* Grade de fontes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {FONTES.map(fonte => (
          <FonteCard
            key={fonte.id}
            fonte={fonte}
            files={files[fonte.id]}
            status={fonteStatus[fonte.id]}
            onAdd={newFiles => addFiles(fonte.id, newFiles)}
            onRemove={idx => removeFile(fonte.id, idx)}
            disabled={loading}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400">
        <Zap size={10} className="text-imile-400" />
        Processamento 100% local — os arquivos Excel não são enviados ao servidor
      </div>
    </div>
  )
}

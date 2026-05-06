/**
 * pages/Analise.jsx — Dashboard + Histórico + Comparativos unificados
 * Seletor de período: Hoje / 7d / 28d / 90d / Personalizado
 * Agrupamento: Diário / Semanal / Mensal (quando período > 1 dia)
 * Upload de dados via modal
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api, { pollJob } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { SectionHeader, Card, Alert, Skeleton, toast, chartTheme } from '../components/ui'
import Heatmap from '../components/Heatmap'
import { LineChart, BarChart, RankBar, Donut } from '../components/charts.jsx'
import { Download, Upload, X, Filter, Loader, AlertCircle, ChevronDown, Check, Megaphone, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { validarArquivos } from '../lib/validarArquivo'

const CB     = chartTheme.series       // { recebido, expedido, entregas, ok, nok, fora, backlog }
const COLORS = chartTheme.palette.main

const PRESETS = [
  { key: 'hoje',        label: 'Hoje',         days: 0 },
  { key: '7d',          label: '7 dias',        days: 7 },
  { key: '28d',         label: '28 dias',       days: 28 },
  { key: '90d',         label: '90 dias',       days: 90 },
  { key: 'custom',      label: 'Personalizado', days: null },
]

const AGRUPAMENTOS = ['Diário', 'Semanal', 'Mensal']

function hoje() { return new Date().toISOString().slice(0, 10) }
function diasAtras(n) {
  const d = new Date(); d.setDate(d.getDate() - n + 1)
  return d.toISOString().slice(0, 10)
}
function fD(d) { const [, m, day] = d.split('-'); return `${day}/${m}` }
function fS(d) { return `Sem. ${fD(d)}` }
function fM(d) { const [y, m] = d.split('-'); return `${m}/${y}` }
const F = n => n?.toLocaleString('pt-BR') || '0'
const P = n => `${(n * 100).toFixed(1)}%`

function agruparPorSemana(porDia) {
  const sem = {}
  porDia.forEach(d => {
    const dt = new Date(d.data_ref + 'T12:00:00')
    const day = dt.getDay() || 7
    const mon = new Date(dt); mon.setDate(dt.getDate() - day + 1)
    const key = mon.toISOString().slice(0, 10)
    if (!sem[key]) sem[key] = { semana: key, recebido: 0, expedido: 0, entregas: 0 }
    sem[key].recebido += d.recebido; sem[key].expedido += d.expedido; sem[key].entregas += d.entregas
  })
  return Object.values(sem).sort((a, b) => a.semana.localeCompare(b.semana))
    .map(s => ({ ...s, taxa_exp: s.recebido ? +(s.expedido / s.recebido).toFixed(4) : 0 }))
}

function agruparPorMes(porDia) {
  const mes = {}
  porDia.forEach(d => {
    const key = d.data_ref.slice(0, 7)
    if (!mes[key]) mes[key] = { mes: key, recebido: 0, expedido: 0, entregas: 0 }
    mes[key].recebido += d.recebido; mes[key].expedido += d.expedido; mes[key].entregas += d.entregas
  })
  return Object.values(mes).sort((a, b) => a.mes.localeCompare(b.mes))
    .map(m => ({ ...m, taxa_exp: m.recebido ? +(m.expedido / m.recebido).toFixed(4) : 0 }))
}

// ── Modal de Upload ────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }) {
  const [dataRef, setDataRef]     = useState(diasAtras(1))
  const [recFiles, setRecFiles]   = useState([])
  const [outFiles, setOutFiles]   = useState([])
  const [entFiles, setEntFiles]   = useState([])
  const [supFile, setSupFile]     = useState(null)
  const [metaFile, setMetaFile]   = useState(null)
  const [loading, setLoading]     = useState(false)
  const [fase, setFase]           = useState('')
  const [erro, setErro]           = useState('')
  const [sucesso, setSucesso]     = useState(null)

  const handleSubmit = async () => {
    if (!recFiles.length || !outFiles.length) {
      setErro('Recebimento e Out of Delivery são obrigatórios.')
      return
    }
    const erroVal = validarArquivos([...recFiles, ...outFiles, ...entFiles, supFile, metaFile].filter(Boolean))
    if (erroVal) { setErro(erroVal); return }
    setLoading(true); setFase('enviando'); setErro('')
    try {
      const form = new FormData()
      form.append('data_ref', dataRef)
      recFiles.forEach(f => form.append('recebimento', f))
      outFiles.forEach(f => form.append('out_delivery', f))
      entFiles.forEach(f => form.append('entregas', f))
      if (supFile)  form.append('supervisores', supFile)
      if (metaFile) form.append('metas', metaFile)

      const { data } = await api.post('/api/dashboard/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const result = data.job_id
        ? await pollJob(`/api/dashboard/job/${data.job_id}`, setFase)
        : data
      setSucesso(result)
      onSuccess?.()
    } catch (e) {
      setErro(e.response?.data?.detail || e.message || 'Erro ao processar arquivos.')
    } finally {
      setLoading(false)
      setFase('')
    }
  }

  const FileInput = ({ label, multiple, onChange, files, obrigatorio }) => {
    const ref = useRef(null)
    return (
      <div>
        <label className="text-xs font-semibold text-slate-600">
          {label} {obrigatorio && <span className="text-red-500">*</span>}
          {!obrigatorio && <span className="text-slate-400"> (opcional)</span>}
        </label>
        <div
          onClick={() => ref.current?.click()}
          className="mt-1 border-2 border-dashed border-slate-200 rounded-lg p-3 cursor-pointer hover:border-imile-400 transition-colors"
        >
          {files?.length
            ? <p className="text-xs text-slate-600">{Array.isArray(files) ? files.map(f => f.name).join(', ') : files.name}</p>
            : <p className="text-xs text-slate-400">Clique para selecionar{multiple ? ' (múltiplos)' : ''}</p>
          }
        </div>
        <input ref={ref} type="file" accept=".xlsx,.xls" multiple={multiple} className="hidden"
          onChange={e => onChange(multiple ? [...e.target.files] : e.target.files[0])} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Upload de Dados do Dashboard</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {sucesso ? (
            <div className="text-center py-4">
              <p className="text-emerald-600 font-semibold text-lg">Dados salvos com sucesso!</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Recebido</p><p className="font-bold font-mono">{F(sucesso.recebido)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Expedido</p><p className="font-bold font-mono">{F(sucesso.expedido)}</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Bases</p><p className="font-bold font-mono">{sucesso.n_stations}</p></div>
              </div>
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm">Fechar</button>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-600">Data de Referência <span className="text-red-500">*</span></label>
                <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)}
                  className="block mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <FileInput label="Recebimento" multiple obrigatorio files={recFiles} onChange={setRecFiles} />
              <FileInput label="Out of Delivery" multiple obrigatorio files={outFiles} onChange={setOutFiles} />
              <FileInput label="Entregas / Delivered" multiple files={entFiles} onChange={setEntFiles} />
              <FileInput label="Supervisores (SIGLA / REGION)" files={supFile} onChange={setSupFile} />
              <FileInput label="Metas por Base" files={metaFile} onChange={setMetaFile} />
              {erro && <Alert type="warning">{erro}</Alert>}
              <button onClick={handleSubmit} disabled={loading}
                className="w-full py-2.5 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <><Loader size={14} className="animate-spin" /> {fase || 'Processando...'}</> : 'Processar e Salvar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filtro de Bases (dropdown) ─────────────────────────────────────────
function DsDropdown({ dsDisponiveis, dsSel, setDsSel }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = dsDisponiveis.filter(ds => ds.toLowerCase().includes(search.toLowerCase()))
  const allSel   = dsSel.length === 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
          dsSel.length > 0
            ? 'bg-imile-500 text-white border-imile-500'
            : 'bg-white text-slate-600 border-slate-200 hover:border-imile-400'
        }`}
      >
        <Filter size={11} />
        {dsSel.length > 0 ? `${dsSel.length} bases` : 'Todas as bases'}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-52 bg-white border border-slate-100 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              placeholder="Buscar base..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs text-slate-700 placeholder-slate-400 outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-50">
            <button onClick={() => setDsSel([])} className="text-[10px] text-slate-400 hover:text-imile-600 font-medium">
              Todas
            </button>
            <button onClick={() => setDsSel(filtered)} className="text-[10px] text-slate-400 hover:text-imile-600 font-medium">
              Selecionar filtradas
            </button>
          </div>

          {/* List */}
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map(ds => {
              const sel = dsSel.includes(ds)
              return (
                <li key={ds}>
                  <button
                    onClick={() => setDsSel(p => sel ? p.filter(x => x !== ds) : [...p, ds])}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                      sel ? 'bg-imile-500 border-imile-500' : 'border-slate-300'
                    }`}>
                      {sel && <Check size={9} strokeWidth={3} className="text-white" />}
                    </span>
                    <span className="text-xs text-slate-700">{ds}</span>
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-xs text-slate-400 text-center">Nenhuma base encontrada</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Barra de filtros ───────────────────────────────────────────────────
function FilterBar({
  preset, setPreset, isHoje,
  datas, dataSel, setDataSel,
  customIni, setCustomIni, customFim, setCustomFim,
  agrup, setAgrup,
  dsDisponiveis, dsSel, setDsSel,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 mb-6">
      <div className="flex flex-wrap items-center gap-3">

        {/* Presets */}
        <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                preset === p.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Divisor */}
        <div className="w-px h-5 bg-slate-200" />

        {/* Data (modo Hoje) */}
        {isHoje && datas.length > 0 && (
          <select
            value={dataSel || ''}
            onChange={e => setDataSel(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400"
          >
            {datas.map(d => <option key={d} value={d}>{fD(d)}/{d.slice(0, 4)}</option>)}
          </select>
        )}

        {/* Range personalizado */}
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customIni} onChange={e => setCustomIni(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400" />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={customFim} onChange={e => setCustomFim(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400" />
          </div>
        )}

        {/* Agrupamento (período) */}
        {!isHoje && (
          <>
            <div className="w-px h-5 bg-slate-200" />
            <div className="flex gap-0.5 bg-slate-100 p-0.5 rounded-lg">
              {AGRUPAMENTOS.map(a => (
                <button key={a} onClick={() => setAgrup(a)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    agrup === a ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {a}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Filtro DS (modo Hoje) */}
        {isHoje && dsDisponiveis.length > 0 && (
          <>
            <div className="w-px h-5 bg-slate-200" />
            <DsDropdown dsDisponiveis={dsDisponiveis} dsSel={dsSel} setDsSel={setDsSel} />
            {dsSel.length > 0 && (
              <button onClick={() => setDsSel([])}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors">
                <X size={11} /> Limpar
              </button>
            )}
          </>
        )}
        {!isHoje && (
          <span className="text-[11px] text-slate-400 italic">Filtro por DS disponível apenas no modo Hoje</span>
        )}

      </div>
    </div>
  )
}

// ── Chart tooltip customizado ──────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,16,40,.92)', backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
      padding: '10px 14px', fontSize: 12, color: 'white',
      boxShadow: '0 8px 32px rgba(0,0,0,.3)',
    }}>
      <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 10, marginBottom: 6, fontFamily: 'monospace', letterSpacing: '.04em' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < payload.length-1 ? 4 : 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,.65)', flex: 1 }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: 'white' }}>
            {formatter ? formatter(p.value, p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Gradientes SVG para gráficos ───────────────────────────────────────
function ChartGradients() {
  return (
    <defs>
      <linearGradient id="grad-rec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#3b82f6" stopOpacity={0.9}/>
        <stop offset="100%" stopColor="#0032A0" stopOpacity={0.5}/>
      </linearGradient>
      <linearGradient id="grad-exp" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#1048c8" stopOpacity={0.9}/>
        <stop offset="100%" stopColor="#151741" stopOpacity={0.5}/>
      </linearGradient>
      <linearGradient id="grad-ent" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#34d399" stopOpacity={0.9}/>
        <stop offset="100%" stopColor="#059669" stopOpacity={0.4}/>
      </linearGradient>
      <linearGradient id="grad-area" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#10b981" stopOpacity={0.25}/>
        <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
      </linearGradient>
    </defs>
  )
}

// ── Hero 3D — Globo ────────────────────────────────────────────────────
function Hero3D({ kpis, nBases }) {
  const F = n => n?.toLocaleString('pt-BR') ?? '—'
  const P = n => n != null ? `${(n * 100).toFixed(1)}%` : '—'

  const PINS = [
    { cx: 140, cy: 84,  d: '0s'   },
    { cx: 162, cy: 108, d: '.9s'  },
    { cx: 108, cy: 120, d: '1.7s' },
    { cx: 150, cy: 155, d: '2.5s' },
    { cx: 90,  cy: 128, d: '3.3s' },
  ]
  const PARTS = [
    { cx: 34,  cy: 82,  r: 1.5, d: '0s'   },
    { cx: 222, cy: 96,  r: 1.2, d: '1.2s' },
    { cx: 248, cy: 158, r: 1.8, d: '2.4s' },
    { cx: 165, cy: 232, r: 1.3, d: '.6s'  },
    { cx: 28,  cy: 172, r: 1.6, d: '3s'   },
    { cx: 94,  cy: 20,  r: 1.2, d: '1.8s' },
    { cx: 212, cy: 38,  r: 1.0, d: '2.8s' },
    { cx: 16,  cy: 128, r: 1.4, d: '.4s'  },
  ]

  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 flex items-center gap-8" style={{
      minHeight: 300,
      background: 'linear-gradient(135deg, #060d1a 0%, #091525 55%, #0c1c35 100%)',
      color: 'white', padding: '32px 36px',
    }}>
      {/* Grid perspectiva ao fundo */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{
        height: 130,
        backgroundImage: 'linear-gradient(rgba(0,80,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,80,255,.08) 1px, transparent 1px)',
        backgroundSize: '38px 38px',
        transform: 'perspective(260px) rotateX(60deg)',
        transformOrigin: 'bottom center',
        maskImage: 'linear-gradient(to top, rgba(0,0,0,.55), transparent)',
        WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,.55), transparent)',
      }} />

      {/* Halo de fundo do globo */}
      <div className="absolute pointer-events-none" style={{
        right: 20, top: '50%', transform: 'translateY(-50%)',
        width: 310, height: 310,
        background: 'radial-gradient(circle, rgba(37,99,235,.18) 0%, transparent 68%)',
        borderRadius: '50%',
      }} />

      {/* Conteúdo esquerdo */}
      <div className="relative z-10 flex-1 min-w-0">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
          style={{ background: 'rgba(59,130,246,.14)', border: '1px solid rgba(147,197,253,.25)', color: 'rgba(147,197,253,.9)' }}>
          <span className="pulse-dot relative w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa' }} />
          Live · Portal Operacional
        </div>
        <h2 className="font-bold mb-2" style={{
          fontSize: 30, letterSpacing: '-.8px', lineHeight: 1.1,
          background: 'linear-gradient(90deg, #ffffff 0%, #93c5fd 55%, #60a5fa 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Operação iMile Brasil
        </h2>
        <p style={{ color: 'rgba(203,213,225,.65)', fontSize: 13.5, maxWidth: 380, lineHeight: 1.55 }}>
          Rede de filiais conectadas, monitoramento em tempo real de expedição e entregas.
        </p>
        <div className="flex gap-7 mt-6">
          {[
            { v: F(kpis?.recebido), l: 'Recebido' },
            { v: P(kpis?.taxa_exp), l: 'Taxa Exp.' },
            { v: nBases ?? '—', l: 'Filiais' },
          ].map(({ v, l }) => (
            <div key={l}>
              <div className="font-bold" style={{ fontSize: 22, letterSpacing: '-.5px' }}>{v}</div>
              <div className="font-semibold uppercase tracking-widest mt-1" style={{ fontSize: 10.5, color: 'rgba(147,197,253,.72)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Globo 3D */}
      <div className="relative shrink-0 hidden lg:flex items-center justify-center" style={{ width: 264, height: 264 }}>
        <svg viewBox="0 0 264 264" width="264" height="264" overflow="visible">
          <defs>
            <radialGradient id="gb-body" cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor="#2563eb"/>
              <stop offset="48%" stopColor="#0c2a6e"/>
              <stop offset="100%" stopColor="#04102a"/>
            </radialGradient>
            <radialGradient id="gb-shine" cx="33%" cy="28%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity=".15"/>
              <stop offset="100%" stopColor="white" stopOpacity="0"/>
            </radialGradient>
            <filter id="gb-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="9" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <filter id="gb-pin" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="2.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            <clipPath id="gb-clip"><circle cx="132" cy="132" r="97"/></clipPath>
          </defs>

          {/* Atmospheric glow */}
          <circle cx="132" cy="132" r="106" fill="rgba(37,99,235,.1)" style={{ filter: 'blur(14px)' }}/>
          <circle cx="132" cy="132" r="100" fill="none" stroke="rgba(96,165,250,.16)" strokeWidth="6" style={{ filter: 'blur(5px)' }}/>

          {/* Globe body */}
          <circle cx="132" cy="132" r="97" fill="url(#gb-body)"/>

          {/* Grid lines */}
          <g clipPath="url(#gb-clip)">
            {/* Latitudes — estáticas, referência visual */}
            {[-62, -33, 0, 33, 62].map((lat, i) => {
              const y = 132 + lat
              const rx = Math.sqrt(97 * 97 - lat * lat) * 0.96
              return <ellipse key={i} cx="132" cy={y} rx={rx} ry="8"
                fill="none" stroke="rgba(147,197,253,.1)" strokeWidth=".8"/>
            })}

            {/* Meridianos + massas de terra — deslizam horizontalmente */}
            <g className="globe-slide">
              {/* Meridianos verticais — 2 períodos (194px cada) */}
              {Array.from({length: 9}, (_, i) => 35 + i * 49).map((x, i) => (
                <line key={i} x1={x} y1={35} x2={x} y2={229}
                  stroke="rgba(147,197,253,.1)" strokeWidth=".8"/>
              ))}

              {/* Massas de terra — cópia 1 */}
              {[0, 194].map(dx => (
                <g key={dx} transform={`translate(${dx}, 0)`}>
                  <path d="M 120 75 Q 145 66 162 78 Q 175 94 168 112 Q 152 120 128 117 Q 108 111 104 93 Z"
                    fill="rgba(30,90,220,.55)" stroke="rgba(147,197,253,.5)" strokeWidth=".7"/>
                  <path d="M 82 112 Q 100 105 114 118 Q 110 140 88 137 Q 70 128 82 112 Z"
                    fill="rgba(30,90,220,.45)" stroke="rgba(147,197,253,.38)" strokeWidth=".6"/>
                  <path d="M 138 138 Q 162 130 175 150 Q 174 172 154 178 Q 130 176 127 157 Z"
                    fill="rgba(30,90,220,.48)" stroke="rgba(147,197,253,.45)" strokeWidth=".6"/>
                  <path d="M 95 152 Q 116 145 122 162 Q 117 176 96 174 Q 80 164 95 152 Z"
                    fill="rgba(30,90,220,.35)" stroke="rgba(147,197,253,.3)" strokeWidth=".5"/>
                  <path d="M 58 88 Q 78 80 94 93 Q 90 116 66 113 Q 49 102 58 88 Z"
                    fill="rgba(30,90,220,.4)" stroke="rgba(147,197,253,.35)" strokeWidth=".6"/>
                  <path d="M 172 102 Q 192 94 204 110 Q 202 132 182 134 Q 163 124 172 102 Z"
                    fill="rgba(30,90,220,.38)" stroke="rgba(147,197,253,.32)" strokeWidth=".6"/>
                </g>
              ))}
            </g>
          </g>

          {/* Globe border */}
          <circle cx="132" cy="132" r="97" fill="none" stroke="rgba(147,197,253,.22)" strokeWidth="1"/>
          {/* Shine overlay */}
          <circle cx="132" cy="132" r="97" fill="url(#gb-shine)"/>

          {/* Órbita 1 (inclinada -25°) + satélite */}
          <g transform="translate(132,132) rotate(-25)">
            <ellipse cx="0" cy="0" rx="118" ry="32"
              fill="none" stroke="rgba(96,165,250,.28)" strokeWidth="1" strokeDasharray="4 3"/>
            <circle r="4.5" fill="#60a5fa" style={{ filter: 'drop-shadow(0 0 6px rgba(96,165,250,.9))' }}>
              <animateMotion dur="9s" repeatCount="indefinite"
                path="M 118,0 A 118,32 0 1,0 -118,0 A 118,32 0 1,0 118,0"/>
            </circle>
          </g>

          {/* Órbita 2 (inclinada +42°) + satélite */}
          <g transform="translate(132,132) rotate(42)">
            <ellipse cx="0" cy="0" rx="125" ry="22"
              fill="none" stroke="rgba(147,197,253,.2)" strokeWidth="1" strokeDasharray="3 4"/>
            <circle r="3" fill="#93c5fd" style={{ filter: 'drop-shadow(0 0 4px rgba(147,197,253,.8))' }}>
              <animateMotion dur="14s" repeatCount="indefinite"
                path="M -125,0 A 125,22 0 1,0 125,0 A 125,22 0 1,0 -125,0"/>
            </circle>
          </g>

          {/* Pins pulsantes */}
          {PINS.map((p, i) => (
            <g key={i} filter="url(#gb-pin)">
              <circle cx={p.cx} cy={p.cy} r="2.8" fill="#60a5fa" opacity=".95"/>
              <circle cx={p.cx} cy={p.cy} r="2.8" fill="none" stroke="#60a5fa" strokeWidth="1.2"
                className="globe-pin" style={{ animationDelay: p.d }}/>
            </g>
          ))}

          {/* Partículas flutuantes */}
          {PARTS.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r}
              fill="rgba(96,165,250,.65)" className="globe-particle"
              style={{ animationDelay: p.d }}/>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ── Componente principal ───────────────────────────────────────────────
export default function Analise() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: avisos = [] } = useQuery({
    queryKey: ['avisos'],
    queryFn: () => api.get('/api/avisos').then(r => r.data),
  })
  const naoLidos = avisos.filter(a => !a.lido)
  const [preset, setPreset]         = useState('hoje')
  const [customIni, setCustomIni]   = useState(diasAtras(30))
  const [customFim, setCustomFim]   = useState(hoje())
  const [agrup, setAgrup]           = useState('Diário')
  const [showUpload, setShowUpload] = useState(false)
  const [dataSel, setDataSel]       = useState(null)
  const [dsSel, setDsSel]           = useState([])
  const [dsEvoSel, setDsEvoSel]     = useState('')

  const isHoje = preset === 'hoje'

  // Calcula intervalo conforme preset
  const { ini, fim } = useMemo(() => {
    if (preset === 'hoje') return { ini: null, fim: null }
    if (preset === 'custom') return { ini: customIni, fim: customFim }
    const days = PRESETS.find(p => p.key === preset)?.days || 7
    return { ini: diasAtras(days), fim: hoje() }
  }, [preset, customIni, customFim])

  // Data D-1 para comparação
  const ontemDate = useMemo(() => {
    if (!dataSel) return null
    const d = new Date(dataSel + 'T12:00:00'); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }, [dataSel])

  // ── Queries ────────────────────────────────────────────────
  const { data: datas = [] } = useQuery({
    queryKey: ['dashboard-datas'],
    queryFn: () => api.get('/api/dashboard/datas').then(r => r.data),
  })

  // Inicializa dataSel com o mais recente
  useEffect(() => {
    if (datas.length && !dataSel) setDataSel(datas[0])
  }, [datas])

  const { data: diaData, isLoading: loadingDia } = useQuery({
    queryKey: ['dashboard-dia', dataSel],
    queryFn: () => api.get(`/api/dashboard/dia/${dataSel}`).then(r => r.data),
    enabled: isHoje && !!dataSel,
  })

  const { data: charts } = useQuery({
    queryKey: ['dashboard-charts', dataSel],
    queryFn: () => api.get(`/api/dashboard/charts/${dataSel}`).then(r => r.data),
    enabled: isHoje && !!dataSel,
  })

  const { data: heatmap } = useQuery({
    queryKey: ['dashboard-heatmap', dataSel],
    queryFn: () => api.get(`/api/dashboard/heatmap/${dataSel}`).then(r => r.data).catch(() => ({})),
    enabled: isHoje && !!dataSel,
  })

  const { data: ontemRaw } = useQuery({
    queryKey: ['dashboard-dia', ontemDate],
    queryFn: () => api.get(`/api/dashboard/dia/${ontemDate}`).then(r => r.data).catch(() => ({ kpis: {} })),
    enabled: isHoje && !!ontemDate,
  })
  const ontem = ontemRaw?.kpis || {}

  const { data: periodoData, isLoading: loadingPeriodo } = useQuery({
    queryKey: ['historico-periodo', ini, fim],
    queryFn: () => api.get('/api/historico/periodo', { params: { data_ini: ini, data_fim: fim } }).then(r => r.data),
    enabled: !isHoje && !!ini && !!fim,
  })

  const { data: evoData } = useQuery({
    queryKey: ['historico-evo', ini, fim, dsEvoSel],
    queryFn: () => api.get('/api/historico/evolucao-ds', {
      params: { data_ini: ini, data_fim: fim, ...(dsEvoSel ? { ds: dsEvoSel } : {}) }
    }).then(r => r.data),
    enabled: !isHoje && !!ini && !!fim,
  })

  const loading  = isHoje ? loadingDia : loadingPeriodo
  const dsList   = periodoData?.por_ds?.map(d => d.scan_station) || []

  // Filtro por DS (client-side, modo Hoje)
  const dFiltrado = useMemo(() => {
    if (!diaData || !dsSel.length) return diaData
    const st = diaData.stations.filter(s => dsSel.includes(s.scan_station))
    const r = st.reduce((a, s) => a + s.recebido, 0)
    const e = st.reduce((a, s) => a + s.expedido, 0)
    const en = st.reduce((a, s) => a + s.entregas, 0)
    const nOk = st.filter(s => s.atingiu_meta).length
    return {
      ...diaData,
      kpis: { recebido: r, expedido: e, entregas: en, taxa_exp: r ? +(e / r).toFixed(4) : 0, taxa_ent: r ? +(en / r).toFixed(4) : 0, n_ds: st.length, n_ok: nOk, n_abaixo: st.length - nOk },
      stations: st,
    }
  }, [diaData, dsSel])

  const chFiltrado = useMemo(() => {
    if (!charts || !dsSel.length) return charts
    return { ...charts, volume_ds: charts.volume_ds.filter(x => dsSel.includes(x.ds)), taxa_ds: charts.taxa_ds.filter(x => dsSel.includes(x.ds)) }
  }, [charts, dsSel])

  // Dados agrupados (modo período)
  const chartData = useMemo(() => {
    if (!periodoData?.por_dia?.length) return []
    if (agrup === 'Semanal') return agruparPorSemana(periodoData.por_dia)
    if (agrup === 'Mensal')  return agruparPorMes(periodoData.por_dia)
    return periodoData.por_dia
  }, [periodoData, agrup])

  const xKey = agrup === 'Mensal' ? 'mes' : agrup === 'Semanal' ? 'semana' : 'data_ref'
  const xFmt = agrup === 'Mensal' ? fM : agrup === 'Semanal' ? fS : fD

  // Evolução DS (gráfico multi-linha)
  const evoChartData = useMemo(() => {
    if (!evoData?.series?.length) return []
    const dates = new Set()
    evoData.series.forEach(s => s.data.forEach(d => dates.add(d.data_ref)))
    return [...dates].sort().map(date => {
      const point = { data_ref: date }
      evoData.series.forEach(s => {
        const match = s.data.find(d => d.data_ref === date)
        point[s.ds] = match ? match.taxa_exp : null
      })
      return point
    })
  }, [evoData])

  // Radar
  const radarData = useMemo(() => {
    if (!periodoData?.por_ds?.length) return []
    return periodoData.por_ds
      .filter(d => d.recebido > 0).sort((a, b) => b.taxa_exp - a.taxa_exp).slice(0, 8)
      .map(d => ({ ds: d.scan_station, taxa: +(d.taxa_exp * 100).toFixed(1) }))
  }, [periodoData])

  const handleExcel = async () => {
    try {
      if (isHoje && dataSel) {
        const r = await api.get(`/api/excel/dashboard/${dataSel}`, { responseType: 'blob' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data]))
        a.download = `Dashboard_${dataSel}.xlsx`; a.click()
      } else if (ini && fim) {
        const r = await api.get('/api/excel/historico', { params: { data_ini: ini, data_fim: fim }, responseType: 'blob' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([r.data]))
        a.download = `Analise_${ini}_${fim}.xlsx`; a.click()
      }
    } catch { toast.erro('Erro ao gerar Excel.') }
  }

  return (
    <div className="relative">
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-datas'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-dia'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-charts'] })
            queryClient.invalidateQueries({ queryKey: ['dashboard-heatmap'] })
          }}
        />
      )}

      {/* Page head */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Análise</h1>
          <div className="page-sub">
            Dashboard · Histórico · Comparativos
            {naoLidos.length > 0 && (
              <button onClick={() => navigate('/avisos')}
                style={{ marginLeft: 12, color: 'var(--imile-600)', fontWeight: 700, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Megaphone size={12} /> {naoLidos.length} aviso{naoLidos.length > 1 ? 's' : ''} não lido{naoLidos.length > 1 ? 's' : ''} →
              </button>
            )}
          </div>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <button onClick={() => setShowUpload(true)} className="btn btn-primary">
              <Upload size={14} /> Upload
            </button>
          )}
          <button onClick={handleExcel} className="btn">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Filtros */}
      <FilterBar
        preset={preset} setPreset={setPreset}
        isHoje={isHoje}
        datas={datas} dataSel={dataSel} setDataSel={v => { setDataSel(v); setDsSel([]) }}
        customIni={customIni} setCustomIni={setCustomIni}
        customFim={customFim} setCustomFim={setCustomFim}
        agrup={agrup} setAgrup={setAgrup}
        dsDisponiveis={isHoje ? (diaData?.ds_disponiveis || []) : []}
        dsSel={dsSel} setDsSel={setDsSel}
      />

      {loading && (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {/* ── MODO HOJE ─────────────────────────────────────────── */}
      {!loading && isHoje && dFiltrado && (
        <>
          {dFiltrado.alertas?.length > 0 && (
            <Alert type="warning">
              {dFiltrado.alertas.length} DS abaixo da meta: {dFiltrado.alertas.slice(0, 5).join(', ')}
              {dFiltrado.alertas.length > 5 && ' ...'}
            </Alert>
          )}

          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginTop: 16 }}>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Recebido</div></div><div className="kpi-value">{F(dFiltrado.kpis.recebido)}</div><div className="kpi-foot"><span className="muted">waybills no dia</span></div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Em Rota</div></div><div className="kpi-value">{F(dFiltrado.kpis.expedido)}</div><div className="kpi-foot"><span className="muted">taxa {P(dFiltrado.kpis.taxa_exp)}</span></div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Entregas</div></div><div className="kpi-value">{F(dFiltrado.kpis.entregas)}</div><div className="kpi-foot"><span className="muted">{dFiltrado.kpis.entregas ? `taxa ${P(dFiltrado.kpis.taxa_ent)}` : 'sem dados'}</span></div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">DS na Meta</div><div className="kpi-icon success"><Check size={14}/></div></div><div className="kpi-value" style={{color:'var(--success-600)'}}>{dFiltrado.kpis.n_ok}</div><div className="kpi-foot"><span className="muted">de {dFiltrado.kpis.n_ds} bases</span></div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">DS Abaixo</div><div className="kpi-icon danger"><AlertCircle size={14}/></div></div><div className="kpi-value" style={{color:dFiltrado.kpis.n_abaixo>0?'var(--danger-600)':'var(--slate-900)'}}>{dFiltrado.kpis.n_abaixo}</div><div className="kpi-foot"><span className="muted">precisam atenção</span></div></div>
          </div>

          {ontem?.recebido > 0 && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              {[{ l: 'Recebido', v: dFiltrado.kpis.recebido - ontem.recebido }, { l: 'Expedido', v: dFiltrado.kpis.expedido - ontem.expedido }, { l: 'Taxa', v: dFiltrado.kpis.taxa_exp - (ontem.taxa_exp || 0), pct: true }].map(({ l, v, pct }) => (
                <div key={l} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <p className="text-xs text-slate-500">{l} vs ontem</p>
                  <p className={`text-lg font-bold font-mono ${v >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {v >= 0 ? '+' : ''}{pct ? P(v) : F(v)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {chFiltrado && (
            <div className="grid-12" style={{ marginTop: 20 }}>
              <div className="card">
                <div className="card-head">
                  <h3 className="card-title">Volume por DS</h3>
                  <span className="chip chip-info">Top {Math.min(chFiltrado.volume_ds.length, 15)} DSs</span>
                </div>
                <div className="card-body">
                  <RankBar
                    items={chFiltrado.volume_ds.slice(0, 15).map(d => ({
                      label: d.ds, value: d.recebido, sub: `exp: ${F(d.expedido)}`,
                    }))}
                    formatV={v => F(v)}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-head"><h3 className="card-title">Proporção de Expedição</h3></div>
                <div className="card-body">
                  <Donut
                    items={[
                      { label: 'Expedido', value: chFiltrado.donut.expedido, color: 'var(--imile-500)' },
                      { label: 'Backlog',  value: chFiltrado.donut.backlog,  color: 'var(--slate-200)' },
                    ]}
                    size={170}
                  />
                </div>
              </div>
            </div>
          )}

          <SectionHeader title="Taxa de Expedição por DS" />
          <Card>
            <div className="space-y-2 py-1">
              {dFiltrado.stations?.slice().sort((a, b) => b.taxa_exp - a.taxa_exp).map((s, i) => {
                const pct = Math.min(s.taxa_exp * 100, 110)
                const ok = s.taxa_exp >= (s.meta || 0.9)
                const barColor = ok ? '#10b981' : s.taxa_exp >= 0.7 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={s.scan_station} className="flex items-center gap-3 py-1 px-1 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="text-[10px] font-mono text-slate-400 w-5 text-right">{i+1}</span>
                    <span className="text-xs font-semibold text-slate-700 w-20 shrink-0">{s.scan_station}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <span className="text-xs font-mono font-bold w-12 text-right" style={{ color: barColor }}>
                      {(s.taxa_exp * 100).toFixed(1)}%
                    </span>
                    {s.meta && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                        {ok ? '✓' : '✗'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {heatmap?.heatmap_exp?.length > 0 && (
            <>
              <SectionHeader title="Heatmap DS × Cidade" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card><Heatmap data={heatmap.heatmap_exp} dsList={heatmap.ds_list} cityList={heatmap.city_list} type="exp" title="Taxa de Expedição" /></Card>
                <Card><Heatmap data={heatmap.heatmap_ent} dsList={heatmap.ds_list} cityList={heatmap.city_list} type="ent" title="Taxa de Entrega" /></Card>
              </div>
            </>
          )}

        </>
      )}

      {/* ── MODO PERÍODO ──────────────────────────────────────── */}
      {!loading && !isHoje && periodoData && (
        <>
          {!periodoData.resumo?.recebido
            ? <Alert type="info">Nenhum dado no período selecionado.</Alert>
            : <>
              <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
                <div className="kpi"><div className="kpi-label">Total Recebido</div><div className="kpi-value">{F(periodoData.resumo.recebido)}</div></div>
                <div className="kpi"><div className="kpi-label">Total Expedido</div><div className="kpi-value">{F(periodoData.resumo.expedido)}</div></div>
                <div className="kpi"><div className="kpi-head"><div className="kpi-label">Taxa Média</div><div className="kpi-icon success"><Check size={14}/></div></div><div className="kpi-value" style={{color:'var(--success-600)'}}>{P(periodoData.resumo.taxa_exp)}</div></div>
                <div className="kpi"><div className="kpi-label">{agrup === 'Diário' ? 'Dias' : agrup === 'Semanal' ? 'Semanas' : 'Meses'}</div><div className="kpi-value">{chartData.length}</div></div>
              </div>

              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-head">
                  <h3 className="card-title">Evolução {agrup}</h3>
                  <span className="chip chip-muted">{chartData.length} {agrup === 'Diário' ? 'dias' : agrup === 'Semanal' ? 'semanas' : 'meses'}</span>
                </div>
                <div className="card-body">
                  <LineChart
                    series={[
                      { name: 'Recebido', color: 'var(--imile-500)',   data: chartData.map(d => ({ x: xFmt(d[xKey]), y: d.recebido })) },
                      { name: 'Expedido', color: 'var(--success-500)', data: chartData.map(d => ({ x: xFmt(d[xKey]), y: d.expedido })) },
                    ]}
                    height={340}
                    formatY={v => F(v)}
                  />
                </div>
              </div>

              <div className="grid-12" style={{ marginTop: 16 }}>
                <div className="card">
                  <div className="card-head">
                    <h3 className="card-title">Evolução por DS — Taxa de Expedição</h3>
                    <select value={dsEvoSel} onChange={e => setDsEvoSel(e.target.value)} className="filter-select">
                      <option value="">Top 10 automático</option>
                      {dsList.map(ds => <option key={ds} value={ds}>{ds}</option>)}
                    </select>
                  </div>
                  <div className="card-body">
                    {evoChartData.length > 0 && (
                      <LineChart
                        series={(evoData?.series || []).map((s, i) => ({
                          name: s.ds, color: COLORS[i % COLORS.length], area: false,
                          data: evoChartData.map(d => ({ x: fD(d.data_ref), y: d[s.ds] != null ? +(d[s.ds] * 100).toFixed(1) : 0 })),
                        }))}
                        height={280}
                        formatY={v => v.toFixed(1) + '%'}
                      />
                    )}
                  </div>
                </div>

                {radarData.length >= 3 && (
                  <div className="card">
                    <div className="card-head"><h3 className="card-title">Top DS — Ranking Taxa Exp.</h3></div>
                    <div className="card-body">
                      <RankBar
                        items={radarData.map(d => ({
                          label: d.ds, value: d.taxa,
                          color: d.taxa >= 90 ? 'var(--success-500)' : d.taxa >= 70 ? 'var(--warn-500)' : 'var(--danger-500)',
                        }))}
                        formatV={v => v?.toFixed(1)}
                        valueLabel="%"
                      />
                    </div>
                  </div>
                )}
              </div>

              {periodoData.por_ds?.length > 0 && (
                <>
                  <SectionHeader title="Ranking por DS no Período" />
                  <Card>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr className="text-xs uppercase text-slate-600">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">DS</th>
                            <th className="px-3 py-2 text-left">Região</th>
                            <th className="px-3 py-2 text-right">Recebido</th>
                            <th className="px-3 py-2 text-right">Expedido</th>
                            <th className="px-3 py-2 text-right">Taxa Exp.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {periodoData.por_ds.map((r, i) => (
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td>
                              <td className="px-3 py-2 font-medium">{r.scan_station}</td>
                              <td className="px-3 py-2 text-slate-500 text-xs">{r.region || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.recebido)}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.expedido)}</td>
                              <td className={`px-3 py-2 text-right font-mono font-semibold ${r.taxa_exp >= 0.9 ? 'text-emerald-600' : r.taxa_exp >= 0.7 ? 'text-amber-600' : 'text-red-500'}`}>
                                {P(r.taxa_exp)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

            </>
          }
        </>
      )}

      {!loading && isHoje && !datas.length && (
        <Alert type="info">Nenhum dado disponível. Clique em "Upload" para enviar os arquivos do dia.</Alert>
      )}
    </div>
  )
}

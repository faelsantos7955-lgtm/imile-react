/**
 * pages/Analise.jsx — Dashboard + Histórico + Comparativos unificados
 * Seletor de período: Hoje / 7d / 28d / 90d / Personalizado
 * Agrupamento: Diário / Semanal / Mensal (quando período > 1 dia)
 * Upload de dados via modal
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, KpiCard, SectionHeader, Card, RankingRow, Alert, Skeleton, toast } from '../components/ui'
import Heatmap from '../components/Heatmap'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Label, ComposedChart, Line, LineChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { Download, Upload, X, Filter, Loader, ChevronDown, Check, Megaphone, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { validarArquivos } from '../lib/validarArquivo'

const CB = { recebido: '#095EF7', expedido: '#f97316', entregas: '#10b981' }
const COLORS = ['#095EF7', '#f97316', '#10b981', '#06b6d4', '#ef4444', '#f59e0b', '#84cc16', '#0ea5e9', '#a855f7', '#ec4899']

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
  const [erro, setErro]           = useState('')
  const [sucesso, setSucesso]     = useState(null)

  const handleSubmit = async () => {
    if (!recFiles.length || !outFiles.length) {
      setErro('Recebimento e Out of Delivery são obrigatórios.')
      return
    }
    const erroVal = validarArquivos([...recFiles, ...outFiles, ...entFiles, supFile, metaFile].filter(Boolean))
    if (erroVal) { setErro(erroVal); return }
    setLoading(true); setErro('')
    try {
      const form = new FormData()
      form.append('data_ref', dataRef)
      recFiles.forEach(f => form.append('recebimento', f))
      outFiles.forEach(f => form.append('out_delivery', f))
      entFiles.forEach(f => form.append('entregas', f))
      if (supFile)  form.append('supervisores', supFile)
      if (metaFile) form.append('metas', metaFile)

      const res = await api.post('/api/dashboard/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSucesso(res.data)
      onSuccess?.()
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivos.')
    } finally {
      setLoading(false)
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
                {loading ? <><Loader size={14} className="animate-spin" /> Processando...</> : 'Processar e Salvar'}
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

// ── Hero 3D ────────────────────────────────────────────────────────────
function Hero3D({ kpis, nBases }) {
  const F = n => n?.toLocaleString('pt-BR') ?? '—'
  const P = n => n != null ? `${(n * 100).toFixed(1)}%` : '—'

  return (
    <div className="relative rounded-2xl overflow-hidden mb-6 flex items-center gap-6" style={{
      minHeight: 280,
      background: 'radial-gradient(circle at 20% 30%, rgba(59,130,246,.22) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(14,40,65,.8) 0%, transparent 60%), linear-gradient(135deg, #0a1628 0%, #0E2841 40%, #13305a 100%)',
      color: 'white', padding: '28px 32px',
    }}>
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        maskImage: 'radial-gradient(circle at 70% 50%, black, transparent 70%)',
      }} />

      {/* Trucks */}
      <div className="absolute pointer-events-none overflow-hidden" style={{ top: '14%', left: 0, right: 0 }}>
        <svg className="hero-truck" style={{ width: 56, height: 28, position: 'relative', left: -80 }} viewBox="0 0 80 40" fill="none">
          <rect x="4" y="14" width="40" height="18" rx="2" fill="#1D4ED8"/>
          <rect x="44" y="18" width="22" height="14" rx="2" fill="#1e3a8a"/>
          <rect x="48" y="20" width="14" height="6" rx="1" fill="#93c5fd" fillOpacity=".7"/>
          <text x="8" y="26" fontSize="7" fontWeight="800" fill="white" fontFamily="Arial">iMile</text>
          {[14,32,58].map(cx => <g key={cx}><circle cx={cx} cy={34} r="4" fill="#0f172a"/><circle cx={cx} cy={34} r="1.5" fill="#475569"/></g>)}
        </svg>
      </div>
      <div className="absolute pointer-events-none overflow-hidden" style={{ bottom: '10%', left: 0, right: 0 }}>
        <svg className="hero-truck2" style={{ width: 56, height: 28, position: 'relative', left: -80 }} viewBox="0 0 80 40" fill="none">
          <rect x="4" y="14" width="40" height="18" rx="2" fill="#1D4ED8"/>
          <rect x="44" y="18" width="22" height="14" rx="2" fill="#1e3a8a"/>
          <rect x="48" y="20" width="14" height="6" rx="1" fill="#93c5fd" fillOpacity=".7"/>
          <text x="8" y="26" fontSize="7" fontWeight="800" fill="white" fontFamily="Arial">iMile</text>
          {[14,32,58].map(cx => <g key={cx}><circle cx={cx} cy={34} r="4" fill="#0f172a"/><circle cx={cx} cy={34} r="1.5" fill="#475569"/></g>)}
        </svg>
      </div>

      {/* Floating particles */}
      {[{ top:'20%', left:'40%', delay:'0s' }, { top:'70%', left:'20%', delay:'1.5s' }, { top:'30%', left:'75%', delay:'3s' }].map((p, i) => (
        <span key={i} className="hero-particle" style={{ position:'absolute', width:3, height:3, borderRadius:'50%', background:'rgba(147,197,253,.6)', top:p.top, left:p.left, animationDelay:p.delay }} />
      ))}

      {/* Conteúdo */}
      <div className="relative z-10 flex-1 min-w-0">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-[11px] font-semibold tracking-widest uppercase"
          style={{ background: 'rgba(59,130,246,.14)', border: '1px solid rgba(147,197,253,.25)', color: 'rgba(147,197,253,.9)' }}>
          <span className="pulse-dot relative w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa' }} />
          Live · Portal Operacional
        </div>
        <h2 className="font-bold mb-2" style={{ fontSize: 28, letterSpacing: '-.8px', lineHeight: 1.1, background: 'linear-gradient(90deg, #fff 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Operação iMile Brasil
        </h2>
        <p style={{ color: 'rgba(203,213,225,.75)', fontSize: 13.5, maxWidth: 420, lineHeight: 1.55 }}>
          Rede de delivery stations conectadas, monitoramento em tempo real de expedição e entregas.
        </p>
        <div className="flex gap-7 mt-5">
          {[
            { v: F(kpis?.recebido), l: 'Recebido' },
            { v: P(kpis?.taxa_exp), l: 'Taxa Exp.' },
            { v: nBases ?? '—', l: 'Bases DS' },
          ].map(({ v, l }) => (
            <div key={l}>
              <div className="font-bold" style={{ fontSize: 22, letterSpacing: '-.5px' }}>{v}</div>
              <div className="font-semibold uppercase tracking-widest mt-1" style={{ fontSize: 10.5, color: 'rgba(147,197,253,.75)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mapa do Brasil */}
      <div className="relative shrink-0 hidden lg:block" style={{ width: 340, height: 260 }}>
        <svg viewBox="0 0 340 260" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          <defs>
            <filter id="br-glow">
              <feGaussianBlur stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Contorno Brasil simplificado */}
          <path d="M180 20 L215 25 L245 35 L270 55 L285 80 L295 105 L300 130 L295 155 L285 175 L270 195 L250 215 L225 230 L200 240 L175 245 L150 240 L128 230 L110 215 L95 200 L82 180 L72 160 L62 138 L55 115 L50 95 L48 75 L52 60 L62 48 L78 40 L95 35 L115 30 L140 25 L165 20 Z"
            fill="rgba(147,197,253,.1)" stroke="rgba(147,197,253,.3)" strokeWidth=".8"/>
          {/* Regiões */}
          <path d="M95 55 L145 45 L175 55 L170 90 L130 95 L95 85 Z" fill="rgba(147,197,253,.08)" stroke="rgba(147,197,253,.25)" strokeWidth=".6" opacity=".6"/>
          <path d="M200 40 L260 55 L285 90 L270 125 L225 120 L205 90 L195 65 Z" fill="rgba(59,130,246,.15)" stroke="rgba(147,197,253,.5)" strokeWidth=".7"/>
          <path d="M130 100 L190 95 L215 130 L185 160 L135 155 L115 125 Z" fill="rgba(147,197,253,.07)" stroke="rgba(147,197,253,.2)" strokeWidth=".6" opacity=".8"/>
          <path d="M190 135 L240 130 L260 160 L240 185 L200 180 L180 160 Z" fill="rgba(29,78,216,.5)" stroke="#93c5fd" strokeWidth="1.2"/>
          <path d="M150 175 L200 185 L215 215 L185 235 L140 225 L125 200 Z" fill="rgba(59,130,246,.15)" stroke="rgba(147,197,253,.4)" strokeWidth=".7"/>
          {/* Rotas do hub SP */}
          {[
            { d: 'M220 160 Q250 100 265 65', delay: '0s' },
            { d: 'M220 160 Q210 140 195 120', delay: '.7s' },
            { d: 'M220 160 Q170 100 110 65', delay: '1.3s' },
            { d: 'M220 160 Q190 190 160 220', delay: '2s' },
            { d: 'M220 160 Q245 130 260 100', delay: '2.6s' },
            { d: 'M220 160 Q232 160 245 165', delay: '3.2s' },
          ].map((r, i) => (
            <g key={i}>
              <path d={r.d} fill="none" stroke="rgba(96,165,250,.55)" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="3 4" className="route-dash"/>
              <path d={r.d} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" opacity="0" className="route-glow" style={{ filter:'blur(1.5px)', animationDelay: r.delay }}/>
            </g>
          ))}
          {/* Cidades */}
          {[
            { x:265, y:65,  label:'FOR' }, { x:195, y:120, label:'BSB' },
            { x:110, y:65,  label:'MAO' }, { x:160, y:220, label:'POA' },
            { x:260, y:100, label:'SSA' }, { x:245, y:165, label:'RIO' },
          ].map((c, i) => (
            <g key={i}>
              <circle className="city-ping" cx={c.x} cy={c.y} r="3" fill="none" stroke="#60a5fa" strokeWidth="1" style={{ animationDelay:`${i*.3}s` }}/>
              <circle cx={c.x} cy={c.y} r="2.5" fill="#60a5fa" style={{ filter:'drop-shadow(0 0 6px rgba(96,165,250,.8))' }}/>
              <text x={c.x+5} y={c.y+3} fill="rgba(203,213,225,.9)" fontSize="8" fontFamily="monospace" fontWeight="600" letterSpacing=".04em">{c.label}</text>
            </g>
          ))}
          {/* Hub SP */}
          <circle className="hub-ring" cx="220" cy="160" r="4" fill="none" stroke="#fbbf24" strokeWidth="1.2"/>
          <circle cx="220" cy="160" r="4" fill="#fbbf24" style={{ filter:'drop-shadow(0 0 8px #fbbf24)' }}/>
          <text x="226" y="158" fill="#fbbf24" fontSize="8" fontFamily="monospace" fontWeight="600">SP · HUB</text>
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
    <div>
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

      {/* Hero 3D */}
      <Hero3D
        kpis={isHoje ? dFiltrado?.kpis : periodoData?.totais}
        nBases={isHoje ? dFiltrado?.kpis?.n_ds : periodoData?.por_ds?.length}
      />

      {/* Banner de avisos não lidos */}
      {naoLidos.length > 0 && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-imile-50 border border-imile-200 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-imile-100 flex items-center justify-center shrink-0">
            <Megaphone size={15} className="text-imile-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-imile-800">
              {naoLidos.length === 1
                ? `Você tem 1 aviso não lido`
                : `Você tem ${naoLidos.length} avisos não lidos`}
            </p>
            <p className="text-xs text-imile-600 truncate mt-0.5">
              {naoLidos[0]?.titulo}
              {naoLidos.length > 1 ? ` e mais ${naoLidos.length - 1}...` : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/avisos')}
            className="flex items-center gap-1 text-xs font-semibold text-imile-700 hover:text-imile-900 shrink-0 transition-colors"
          >
            Ver avisos <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <PageHeader icon="📊" title="Análise" subtitle="Dashboard · Histórico · Comparativos" />
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 transition-colors">
              <Upload size={14} /> Upload
            </button>
          )}
          <button onClick={handleExcel}
            className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 transition-colors">
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

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            <KpiCard label="Recebido"  value={F(dFiltrado.kpis.recebido)}  sub="waybills no dia" color="blue" />
            <KpiCard label="Em Rota"   value={F(dFiltrado.kpis.expedido)}  sub={`taxa ${P(dFiltrado.kpis.taxa_exp)}`} color="orange" />
            <KpiCard label="Entregas"  value={F(dFiltrado.kpis.entregas)}  sub={dFiltrado.kpis.entregas ? `taxa ${P(dFiltrado.kpis.taxa_ent)}` : 'sem dados'} color="blue" />
            <KpiCard label="DS na Meta"  value={dFiltrado.kpis.n_ok}      sub={`de ${dFiltrado.kpis.n_ds} bases`} color="green" />
            <KpiCard label="DS Abaixo"   value={dFiltrado.kpis.n_abaixo}  sub="precisam atenção" color="red" />
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
              <Card className="lg:col-span-2">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Volume por DS</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chFiltrado.volume_ds.slice(0, 20)} margin={{ bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="ds" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip formatter={v => F(v)} /><Legend />
                    <Bar dataKey="recebido" fill={CB.recebido} name="Recebido" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="expedido" fill={CB.expedido} name="Expedido" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="entregas" fill={CB.entregas} name="Entregas" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card>
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Proporção de Expedição</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie data={[{ name: 'Expedido', value: chFiltrado.donut.expedido }, { name: 'Backlog', value: chFiltrado.donut.backlog }]}
                      cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={2} dataKey="value">
                      <Cell fill="#2563eb" /><Cell fill="#e2e8f0" />
                      <Label value={P(chFiltrado.donut.taxa)} position="center" fill="#0f172a" />
                    </Pie>
                    <Tooltip formatter={v => F(v)} /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {chFiltrado?.funil && (
            <>
              <SectionHeader title="Funil Operacional" />
              <Card>
                <div className="grid grid-cols-3 gap-8 text-center py-6">
                  <div><div className="w-full h-24 bg-blue-500 rounded-xl flex items-center justify-center text-white">
                    <div><p className="text-2xl font-bold font-mono">{F(chFiltrado.funil.recebido)}</p><p className="text-xs opacity-80">Recebido</p></div>
                  </div></div>
                  <div><div className="w-full h-20 bg-orange-500 rounded-xl flex items-center justify-center text-white mx-auto" style={{ width: '85%' }}>
                    <div><p className="text-2xl font-bold font-mono">{F(chFiltrado.funil.expedido)}</p><p className="text-xs opacity-80">Expedido ({P(chFiltrado.funil.taxa_exp)})</p></div>
                  </div><p className="text-xs text-red-500 mt-1">-{F(chFiltrado.funil.perda_exp)} perdidos</p></div>
                  <div><div className="w-full h-16 bg-emerald-500 rounded-xl flex items-center justify-center text-white mx-auto" style={{ width: '70%' }}>
                    <div><p className="text-2xl font-bold font-mono">{F(chFiltrado.funil.entregas)}</p><p className="text-xs opacity-80">Entregue ({P(chFiltrado.funil.taxa_ent)})</p></div>
                  </div><p className="text-xs text-red-500 mt-1">-{F(chFiltrado.funil.perda_ent)} perdidos</p></div>
                </div>
              </Card>
            </>
          )}

          <SectionHeader title="Taxa de Expedição por DS" />
          <Card>
            <ResponsiveContainer width="100%" height={Math.max(300, (dFiltrado.stations?.length || 0) * 28 + 60)}>
              <BarChart data={dFiltrado.stations?.slice().sort((a, b) => a.taxa_exp - b.taxa_exp)} layout="vertical" margin={{ left: 80, right: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 1.1]} />
                <YAxis type="category" dataKey="scan_station" tick={{ fontSize: 11 }} width={75} />
                <Tooltip formatter={v => P(v)} />
                <Bar dataKey="taxa_exp" name="Taxa" radius={[0, 4, 4, 0]} fill="#10b981"
                  label={{ position: 'right', formatter: v => `${(v * 100).toFixed(1)}%`, fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
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

          <SectionHeader title="Ranking por Taxa de Expedição" />
          <Card>
            <div className="max-h-[500px] overflow-y-auto">
              {dFiltrado.stations?.map((s, i) => (
                <RankingRow key={s.scan_station} pos={i + 1} ds={s.scan_station} taxa={s.taxa_exp} meta={s.meta} atingiu={s.atingiu_meta} />
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── MODO PERÍODO ──────────────────────────────────────── */}
      {!loading && !isHoje && periodoData && (
        <>
          {!periodoData.resumo?.recebido
            ? <Alert type="info">Nenhum dado no período selecionado.</Alert>
            : <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <KpiCard label="Total Recebido" value={F(periodoData.resumo.recebido)} color="blue" />
                <KpiCard label="Total Expedido" value={F(periodoData.resumo.expedido)} color="orange" />
                <KpiCard label="Taxa Média"      value={P(periodoData.resumo.taxa_exp)} color="green" />
                <KpiCard label={agrup === 'Diário' ? 'Dias' : agrup === 'Semanal' ? 'Semanas' : 'Meses'}
                  value={chartData.length} color="slate" />
              </div>

              <SectionHeader title={`Evolução ${agrup}`} />
              <Card>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={chartData} margin={{ bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-30} textAnchor="end" tickFormatter={xFmt} />
                    <YAxis yAxisId="vol" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <YAxis yAxisId="taxa" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 1.1]} />
                    <Tooltip formatter={(v, n) => n === 'Taxa Exp.' ? P(v) : F(v)} /><Legend />
                    <Bar yAxisId="vol" dataKey="recebido" fill="#60a5fa" opacity={0.6} name="Recebido" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="vol" dataKey="expedido" fill="#f97316" opacity={0.6} name="Expedido" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="taxa" dataKey="taxa_exp" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} name="Taxa Exp."
                      label={{ position: 'top', formatter: v => `${(v * 100).toFixed(0)}%`, fontSize: 10, fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                <Card className="lg:col-span-2">
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-sm font-semibold text-slate-700">Evolução por DS</h3>
                    <select value={dsEvoSel} onChange={e => setDsEvoSel(e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm">
                      <option value="">Top 10 automático</option>
                      {dsList.map(ds => <option key={ds} value={ds}>{ds}</option>)}
                    </select>
                  </div>
                  {evoChartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={evoChartData} margin={{ bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="data_ref" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" tickFormatter={fD} />
                        <YAxis tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 1.1]} />
                        <Tooltip formatter={v => v !== null ? P(v) : '—'} /><Legend />
                        {evoData?.series?.map((s, i) => (
                          <Line key={s.ds} type="monotone" dataKey={s.ds} stroke={COLORS[i % COLORS.length]}
                            strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </Card>

                {radarData.length >= 3 && (
                  <Card>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4">Top DS — Taxa de Expedição</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <RadarChart data={radarData}>
                        <PolarGrid /><PolarAngleAxis dataKey="ds" tick={{ fontSize: 9 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                        <Radar name="Taxa %" dataKey="taxa" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </Card>
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

              {periodoData.por_dia?.length > 0 && (
                <>
                  <SectionHeader title="Resumo por Dia" />
                  <Card>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-slate-100">
                          <tr className="text-xs uppercase text-slate-600">
                            <th className="px-3 py-2 text-left">Data</th>
                            <th className="px-3 py-2 text-right">Recebido</th>
                            <th className="px-3 py-2 text-right">Expedido</th>
                            <th className="px-3 py-2 text-right">Entregas</th>
                            <th className="px-3 py-2 text-right">Taxa Exp.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {periodoData.por_dia.map((r, i) => (
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-2 font-medium">{fD(r.data_ref)}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.recebido)}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.expedido)}</td>
                              <td className="px-3 py-2 text-right font-mono">{F(r.entregas)}</td>
                              <td className="px-3 py-2 text-right font-mono">{P(r.taxa_exp)}</td>
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

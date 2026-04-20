/**
 * pages/ContestacoesPublico.jsx — Página pública de contestações
 * Acessível sem login.
 */
import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  Search, Plus, Loader2, FileText, Image,
  AlertCircle, CheckCircle2, ScanSearch, ClipboardList, X,
} from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const pub = axios.create({ baseURL: BASE })

// ── Constantes ────────────────────────────────────────────────
const MOTIVOS = ['Avaria', 'Extravio', 'Fake Delivery', 'Fake POD']
const DS_LIST = [
  'DS BJP','DS SJC','DS CTT','DS UBT','DS GRT','DS SCP','DS TBT','DS NOV','DS PIX','DS PIB',
  'DS CPQ','DS CPX','DS IND','DS IDT','DS MCC','DS MGN','DS VLM','DS AAC','DS JDP','DS BLV',
  'DS PSC','DS LBD','DS MBI','DS GRUI','DS GUL','DS IPR','DS CBL','DS GJU','DS GAU','DS PAR',
  'DS SBB','DS GTS','DS JIR','DS VRE','DS FRZ','DS MOG','DS ARJ','DS RCA','DS GNZ','DS SPO',
  'DS BAR','DS CTI','DS ITE','DS SRQ','DS VAR','DS CPB','DS BIU','DS JDA','DS GUA','DS STL',
  'DS SAM','DS MTS','DS VLB','DS TAMI','DS JMC','DS JSL','DS PRP','DS EBG','DS ITC','DS PQR',
  'DS EAR','DS JER','DS CRP','DS JMI','DS PQP','DS WSC','DS ELM','DS VGI','DS CDR','DS BCC',
  'DS TAS','DS MRA','DS OUR','DS SJP','DS ARU','DS AIF','DS JAU','DS PSD','DS BUR','DS BUXI',
  'DS CTD','DS BRU','DS AVR','DS VOT','DS BRT','DS UAJ','DS JAL','DS ADD','DS JBC','DS FRC',
  'DS RPT','DS PSS','DS SCL','DS AQR','DS VGL','DS RRA','DS BAT','DS MAT','DS SCO','DS SVT',
  'DS LSV','DS VDR','DS SBC','DS SBA','DS DDM','DS STD','DS AET','DS MAU','DS JUD','DS MAI',
  'DS ING','DS SRO','DS SCB','DS TAI','DS VTT',
]

const STATUS_STYLE = {
  'Pendente':              'bg-slate-100 text-slate-600 border-slate-200',
  'Em Andamento':          'bg-amber-50 text-amber-700 border-amber-200',
  'Enviado ao Financeiro': 'bg-blue-50 text-blue-700 border-blue-200',
  'Aprovado':              'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Reprovado':             'bg-red-50 text-red-600 border-red-200',
}
const STATUS_DOT = {
  'Pendente':              'bg-slate-400',
  'Em Andamento':          'bg-amber-400',
  'Enviado ao Financeiro': 'bg-blue-500',
  'Aprovado':              'bg-emerald-500',
  'Reprovado':             'bg-red-500',
}

function fmt(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return isNaN(d) ? v : d.toLocaleDateString('pt-BR')
}
function fmtBrl(v) {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fileToB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

function StatusBadge({ status }) {
  const cls = STATUS_STYLE[status] || 'bg-slate-100 text-slate-600 border-slate-200'
  const dot = STATUS_DOT[status] || 'bg-slate-400'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${cls}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {status}
    </span>
  )
}

// ── Hero 3D ───────────────────────────────────────────────────
function HeroBanner() {
  return (
    <div className="relative overflow-hidden" style={{ background: '#0a0d2e', minHeight: 240 }}>

      {/* Blobs 3D animados */}
      <div className="blob blob-a" style={{
        width: 500, height: 500, top: -150, left: -100,
        background: 'radial-gradient(circle, #0032A0 0%, transparent 70%)',
        opacity: 0.55,
      }} />
      <div className="blob blob-b" style={{
        width: 400, height: 400, top: -80, right: -60,
        background: 'radial-gradient(circle, #1048c8 0%, transparent 70%)',
        opacity: 0.40,
      }} />
      <div className="blob blob-c" style={{
        width: 300, height: 300, bottom: -60, left: '40%',
        background: 'radial-gradient(circle, #0a2080 0%, transparent 70%)',
        opacity: 0.35,
      }} />

      {/* Grade 3D (chão em perspectiva) */}
      <div className="grid-3d absolute bottom-0 left-0 right-0" style={{ height: 120 }} />

      {/* Rotas pontilhadas */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice">
        {[
          'M60,210 Q300,130 520,160',
          'M520,160 Q750,190 960,120',
          'M960,120 Q1100,90 1160,150',
          'M180,220 Q350,155 520,160',
          'M960,120 Q1010,170 1050,215',
        ].map((d, i) => (
          <path key={i} d={d} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="6 8"
            fill="none" strokeOpacity="0.35" className="route-flow"
            style={{ animationDelay: `${i * 0.7}s` }} />
        ))}

        {/* Nós amarelos */}
        {[
          { cx: 60,   cy: 210 }, { cx: 180, cy: 220 }, { cx: 520, cy: 160 },
          { cx: 960,  cy: 120 }, { cx: 1160,cy: 150 }, { cx: 1050,cy: 215 },
        ].map((n, i) => (
          <g key={i}>
            <circle cx={n.cx} cy={n.cy} r="4" fill="rgba(255,255,255,0.75)" />
            <circle cx={n.cx} cy={n.cy} r="10" fill="none" stroke="rgba(255,255,255,0.3)"
              strokeWidth="0.8" strokeOpacity="0.5" className="signal-blink"
              style={{ animationDelay: `${i * 0.4}s` }} />
          </g>
        ))}
      </svg>

      {/* Scanline */}
      <div className="absolute left-0 right-0 h-px pointer-events-none scanline"
        style={{ background: 'linear-gradient(to right, transparent 5%, rgba(255,255,255,0.18) 50%, transparent 95%)' }} />

      {/* Caminhão */}
      <div className="absolute overflow-hidden pointer-events-none" style={{ bottom: 8, left: 0, right: 0, height: 80 }}>
        <div className="truck-anim absolute" style={{ bottom: 0 }}>
          <svg width="260" height="72" viewBox="0 0 260 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* === TRAILER === */}
            {/* Corpo do trailer — branco */}
            <rect x="2" y="12" width="148" height="44" rx="3" fill="white" fillOpacity="0.92"/>
            <rect x="2" y="12" width="148" height="44" rx="3" stroke="#0032A0" strokeWidth="1"/>
            {/* Teto (sombra leve) */}
            <path d="M2 12 L150 12 L150 16 L2 16 Z" fill="#0032A0" fillOpacity="0.12"/>
            {/* Faixa azul principal */}
            <rect x="2" y="44" width="148" height="12" rx="0" fill="#0032A0"/>
            <rect x="2" y="44" width="148" height="12" rx="3" fill="#0032A0"/>
            {/* Faixa fina branca sobre o azul */}
            <rect x="2" y="42" width="148" height="3" fill="white" fillOpacity="0.55"/>
            {/* Texto iMile no trailer */}
            <text x="46" y="40" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="bold"
              fill="#0032A0" fillOpacity="0.7" letterSpacing="3">iMile</text>
            {/* Porta traseira */}
            <line x1="8" y1="16" x2="8" y2="42" stroke="#0032A0" strokeWidth="0.6" strokeOpacity="0.3"/>
            <line x1="8" y1="29" x2="148" y2="29" stroke="#0032A0" strokeWidth="0.5" strokeOpacity="0.18"/>
            {/* Luz traseira */}
            <rect x="2" y="18" width="4" height="7" rx="1" fill="#ff4040" fillOpacity="0.85"/>
            <rect x="2" y="27" width="4" height="5" rx="1" fill="#ff8800" fillOpacity="0.7"/>
            {/* Skirt */}
            <rect x="12" y="56" width="120" height="4" rx="1" fill="#0032A0" fillOpacity="0.4"/>

            {/* === ENGATE === */}
            <rect x="148" y="38" width="8" height="8" rx="1" fill="#aab8cc"/>
            <rect x="152" y="34" width="3" height="5" rx="1" fill="#8899b0"/>

            {/* === CAB (cavalo mecânico) — azul iMile === */}
            {/* Corpo principal */}
            <path d="M156 16 L156 56 L255 56 L255 32 L248 16 Z" fill="#0032A0"/>
            <path d="M156 16 L156 56 L255 56 L255 32 L248 16 Z" stroke="#001d6e" strokeWidth="0.8"/>
            {/* Teto */}
            <path d="M165 16 Q170 9 198 9 L248 9 L255 18 L248 16 L165 16 Z" fill="#0032A0"/>
            <path d="M165 9 Q172 4 202 4 L248 4 L255 13 L248 9 L165 9 Z" fill="#0028a0"/>
            {/* Destaque superior branco */}
            <path d="M168 9 Q174 5 202 5 L246 5 L248 7 L200 7 Q175 7 170 11 Z" fill="white" fillOpacity="0.1"/>
            {/* Para-brisa — vidro azul claro */}
            <path d="M222 11 L250 11 L255 30 L222 30 Z" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="0.7" strokeOpacity="0.4"/>
            {/* Reflexo para-brisa */}
            <path d="M225 13 L240 13 L243 20 L225 20 Z" fill="white" fillOpacity="0.1"/>
            {/* Janela lateral */}
            <rect x="160" y="18" width="28" height="16" rx="2" fill="white" fillOpacity="0.18" stroke="white" strokeWidth="0.6" strokeOpacity="0.35"/>
            <line x1="173" y1="18" x2="173" y2="34" stroke="white" strokeWidth="0.5" strokeOpacity="0.3"/>
            {/* Espelho retrovisor */}
            <rect x="153" y="20" width="5" height="8" rx="1" fill="#001d6e" stroke="white" strokeWidth="0.4" strokeOpacity="0.3"/>
            <rect x="151" y="22" width="3" height="1.5" rx="0.5" fill="#001d6e"/>
            {/* Grade dianteira */}
            <rect x="249" y="33" width="6" height="12" rx="1" fill="#001d6e"/>
            {[35,38,41,44].map(y => (
              <line key={y} x1="249" y1={y} x2="255" y2={y} stroke="white" strokeWidth="0.4" strokeOpacity="0.25"/>
            ))}
            {/* Para-choque — branco */}
            <rect x="247" y="47" width="8" height="9" rx="2" fill="white" fillOpacity="0.85" stroke="#0032A0" strokeWidth="0.6"/>
            {/* Farol — branco */}
            <rect x="251" y="19" width="6" height="9" rx="2" fill="white" fillOpacity="0.95"/>
            <rect x="251" y="30" width="5" height="4" rx="1" fill="white" fillOpacity="0.4"/>
            {/* Feixe */}
            <path d="M257 21 L263 17 L263 31 L257 28 Z" fill="white" fillOpacity="0.06"/>
            {/* Chaminé */}
            <rect x="161" y="1" width="5" height="10" rx="2" fill="#001d6e" stroke="white" strokeWidth="0.4" strokeOpacity="0.2"/>
            {/* Faixa branca lateral no cab */}
            <rect x="156" y="49" width="90" height="3" rx="0" fill="white" fillOpacity="0.15"/>
            {/* Passo da cabine */}
            <rect x="220" y="50" width="22" height="6" rx="1" fill="#001d6e"/>
            <rect x="226" y="56" width="12" height="3" rx="1" fill="#001560"/>

            {/* === RODAS === */}
            {[30, 45].map(cx => (
              <g key={`tw${cx}`}>
                <circle cx={cx} cy={64} r="10" fill="#1a1a2e" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
                <circle cx={cx} cy={64} r="6" fill="#111122" stroke="#0032A0" strokeWidth="1"/>
                <circle cx={cx} cy={64} r="2.5" fill="white" fillOpacity="0.7"/>
                {[0,60,120,180,240,300].map(a => (
                  <line key={a} x1={cx} y1={64}
                    x2={cx + 4.5*Math.cos(a*Math.PI/180)}
                    y2={64 + 4.5*Math.sin(a*Math.PI/180)}
                    stroke="white" strokeWidth="0.8" strokeOpacity="0.4"/>
                ))}
              </g>
            ))}
            {[105, 120].map(cx => (
              <g key={`tw2${cx}`}>
                <circle cx={cx} cy={64} r="10" fill="#1a1a2e" stroke="white" strokeWidth="1.2" strokeOpacity="0.6"/>
                <circle cx={cx} cy={64} r="6" fill="#111122" stroke="#0032A0" strokeWidth="1"/>
                <circle cx={cx} cy={64} r="2.5" fill="white" fillOpacity="0.7"/>
                {[0,60,120,180,240,300].map(a => (
                  <line key={a} x1={cx} y1={64}
                    x2={cx + 4.5*Math.cos(a*Math.PI/180)}
                    y2={64 + 4.5*Math.sin(a*Math.PI/180)}
                    stroke="white" strokeWidth="0.8" strokeOpacity="0.4"/>
                ))}
              </g>
            ))}
            {[190, 235].map(cx => (
              <g key={`cw${cx}`}>
                <circle cx={cx} cy={64} r="11" fill="#1a1a2e" stroke="white" strokeWidth="1.5" strokeOpacity="0.6"/>
                <circle cx={cx} cy={64} r="7" fill="#111122" stroke="#0032A0" strokeWidth="1.2"/>
                <circle cx={cx} cy={64} r="3" fill="white" fillOpacity="0.75"/>
                {[0,45,90,135,180,225,270,315].map(a => (
                  <line key={a} x1={cx} y1={64}
                    x2={cx + 5.5*Math.cos(a*Math.PI/180)}
                    y2={64 + 5.5*Math.sin(a*Math.PI/180)}
                    stroke="white" strokeWidth="0.9" strokeOpacity="0.4"/>
                ))}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Conteúdo do hero */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-9 pb-20">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <img src="/imile-logo.png" alt="iMile" className="h-8 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }} />
          </div>

          <div className="w-px h-9 shrink-0" style={{ background: 'rgba(255,255,255,0.12)' }} />

          <div>
            {/* Tag */}
            <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,.85)' }}>
              PORTAL OPERACIONAL
            </div>
            <h1 className="text-white font-bold text-[22px] leading-tight">
              Contestação de Descontos Logísticos
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
              Registre e acompanhe contestações de desconto de faturamento
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── DsCombobox ────────────────────────────────────────────────
function DsCombobox({ value, onChange, error }) {
  const [query, setQuery] = useState(value || '')
  const [open, setOpen]   = useState(false)
  const ref               = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = query.trim()
    ? DS_LIST.filter(ds => ds.toLowerCase().includes(query.trim().toLowerCase()))
    : DS_LIST

  const select = (ds) => { onChange(ds); setQuery(ds); setOpen(false) }

  const cls = `w-full border rounded-xl px-3 py-2.5 text-[13px] focus:outline-none transition-all bg-white
    ${error ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-[#0032A0] focus:ring-2 focus:ring-[#0032A0]/10'}`

  return (
    <div ref={ref} className="relative">
      <input value={query} onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)} placeholder="Digite para pesquisar a DS..." className={cls} />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(ds => (
            <li key={ds} onMouseDown={() => select(ds)}
              className={`px-3 py-2 text-[13px] cursor-pointer transition-colors ${value === ds ? 'bg-blue-50 font-semibold text-[#0032A0]' : 'text-slate-700 hover:bg-blue-50 hover:text-[#0032A0]'}`}>
              {ds}
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-[13px] text-slate-400">
          Nenhuma DS encontrada
        </div>
      )}
    </div>
  )
}

// ── Helpers de formulário ─────────────────────────────────────
function inputCls(err) {
  return `w-full border rounded-xl px-3 py-2.5 text-[13px] focus:outline-none transition-all bg-white
    ${err ? 'border-red-300 bg-red-50' : 'border-slate-200 focus:border-[#0032A0] focus:ring-2 focus:ring-[#0032A0]/10'}`
}

function F({ label, children, error, required }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
        {label}{required && <span className="text-[#0032A0] ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// FORMULÁRIO
// ════════════════════════════════════════════════════════════════
const EMPTY = {
  data_contestacao: new Date().toISOString().slice(0, 10),
  quem_solicitou: '', ds: '', waybill: '',
  motivo_desconto: '', valor_desconto: '', observacao: '', previsao: '',
  faturamento_b64: null, faturamento_nome: null,
  evidencias: [],
}

function Formulario() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const fatRef = useRef(null)
  const evRef  = useRef(null)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: null })) }

  const handleFile = async (e, campo) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 6_000_000) { setErrors(er => ({ ...er, [campo]: 'Arquivo excede 6 MB' })); return }
    const b64 = await fileToB64(file)
    setForm(f => ({ ...f, [`${campo}_b64`]: b64, [`${campo}_nome`]: file.name }))
    setErrors(er => ({ ...er, [campo]: null }))
  }

  const handleEvidencias = async (e) => {
    const files = Array.from(e.target.files)
    const novos = []
    for (const file of files) {
      if (file.size > 6_000_000) { setErrors(er => ({ ...er, evidencia: `${file.name} excede 6 MB` })); continue }
      const b64 = await fileToB64(file)
      novos.push({ b64, nome: file.name })
    }
    if (novos.length) { setForm(f => ({ ...f, evidencias: [...f.evidencias, ...novos] })); setErrors(er => ({ ...er, evidencia: null })) }
    e.target.value = ''
  }

  const removerEvidencia = (idx) => setForm(f => ({ ...f, evidencias: f.evidencias.filter((_, i) => i !== idx) }))

  const mut = useMutation({
    mutationFn: (payload) => pub.post('/api/contestacoes', payload),
    onSuccess: () => setForm(EMPTY),
  })

  const validate = () => {
    const e = {}
    if (!form.data_contestacao)   e.data_contestacao = 'Obrigatório'
    if (!form.ds.trim())          e.ds = 'Obrigatório'
    if (!form.waybill.trim())     e.waybill = 'Obrigatório'
    if (!form.motivo_desconto)    e.motivo_desconto = 'Obrigatório'
    if (!form.faturamento_b64)    e.faturamento = 'Obrigatório'
    if (!form.valor_desconto)     e.valor_desconto = 'Obrigatório'
    if (!form.observacao?.trim()) e.observacao = 'Obrigatório'
    if (!form.evidencias.length)  e.evidencia = 'Anexe pelo menos uma evidência'
    return e
  }

  const submit = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    mut.mutate({ ...form, valor_desconto: form.valor_desconto ? parseFloat(form.valor_desconto) : null, previsao: null })
  }

  if (mut.isSuccess) return (
    <div className="text-center py-16 px-4">
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: '#0032A0' }} />
        <div className="relative w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#e8eaf3' }}>
          <CheckCircle2 size={36} style={{ color: '#0032A0' }} />
        </div>
      </div>
      <h3 className="text-[20px] font-bold mb-2" style={{ color: '#151741' }}>Contestação registrada!</h3>
      <p className="text-[14px] text-slate-500 mb-2">Seu pedido foi enviado e está em análise.</p>
      <p className="text-[12px] text-slate-400 mb-8">
        Use a aba <strong className="text-slate-600">Consultar Status</strong> com o waybill para acompanhar.
      </p>
      <button onClick={() => mut.reset()}
        className="inline-flex items-center gap-2 px-6 py-2.5 text-white text-[13px] font-semibold rounded-xl transition-colors"
        style={{ background: '#0032A0' }}>
        <Plus size={14} /> Registrar outra contestação
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Linha 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <F label="Data" required error={errors.data_contestacao}>
          <input type="date" value={form.data_contestacao} onChange={e => set('data_contestacao', e.target.value)} className={inputCls(errors.data_contestacao)} />
        </F>
        <F label="Quem Solicitou" error={errors.quem_solicitou}>
          <input value={form.quem_solicitou} onChange={e => set('quem_solicitou', e.target.value)} placeholder="Nome / área" className={inputCls()} />
        </F>
      </div>

      {/* Linha 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <F label="DS" required error={errors.ds}>
          <DsCombobox value={form.ds} onChange={v => set('ds', v)} error={errors.ds} />
        </F>
        <F label="Waybill" required error={errors.waybill}>
          <input value={form.waybill} onChange={e => set('waybill', e.target.value.replace(/\D/g, '').slice(0, 13))}
            placeholder="Somente números, até 13 dígitos" inputMode="numeric" maxLength={13}
            className={inputCls(errors.waybill)} />
        </F>
      </div>

      {/* Linha 3 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <F label="Motivo do Desconto" required error={errors.motivo_desconto}>
          <select value={form.motivo_desconto} onChange={e => set('motivo_desconto', e.target.value)} className={inputCls(errors.motivo_desconto)}>
            <option value="">Selecione...</option>
            {MOTIVOS.map(m => <option key={m}>{m}</option>)}
          </select>
        </F>
        <F label="Valor do Desconto (R$)" required error={errors.valor_desconto}>
          <input type="number" step="0.01" min="0" value={form.valor_desconto}
            onChange={e => set('valor_desconto', e.target.value)} placeholder="0,00"
            className={inputCls(errors.valor_desconto)} />
        </F>
      </div>

      {/* Observação */}
      <F label="Observação" required error={errors.observacao}>
        <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)}
          rows={3} placeholder="Descreva o motivo pelo qual o desconto não procede..."
          className={inputCls(errors.observacao) + ' resize-y'} />
      </F>

      {/* Uploads */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Faturamento */}
        <F label="Faturamento com Desconto" required error={errors.faturamento}>
          <div onClick={() => fatRef.current.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all min-h-[112px]
              ${errors.faturamento ? 'border-red-300 bg-red-50'
              : form.faturamento_nome ? 'border-[#0032A0] bg-blue-50'
              : 'border-slate-200 hover:border-[#0032A0] hover:bg-[#E8EAF3]/40'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors
              ${form.faturamento_nome ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <FileText size={20} style={{ color: form.faturamento_nome ? '#0032A0' : '#94a3b8' }} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-slate-700">
                {form.faturamento_nome ? form.faturamento_nome : 'Clique para anexar'}
              </p>
              <p className="text-[11px] text-slate-400">PDF ou Excel · máx. 6 MB</p>
            </div>
            {form.faturamento_nome && (
              <button onClick={e => { e.stopPropagation(); set('faturamento_b64', null); set('faturamento_nome', null) }}
                className="text-[11px] text-red-500 hover:text-red-700 font-medium flex items-center gap-1">
                <X size={11} /> Remover
              </button>
            )}
          </div>
          <input ref={fatRef} type="file" accept=".pdf,.xlsx,.xls" className="hidden" onChange={e => handleFile(e, 'faturamento')} />
        </F>

        {/* Evidências */}
        <F label="Evidências" required error={errors.evidencia}>
          <div onClick={() => evRef.current.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all min-h-[112px]
              ${errors.evidencia ? 'border-red-300 bg-red-50'
              : form.evidencias.length ? 'border-[#0032A0] bg-blue-50'
              : 'border-slate-200 hover:border-[#0032A0] hover:bg-[#E8EAF3]/40'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors
              ${form.evidencias.length ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <Image size={20} style={{ color: form.evidencias.length ? '#0032A0' : '#94a3b8' }} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-slate-700">
                {form.evidencias.length ? `${form.evidencias.length} arquivo(s) · adicionar mais` : 'Clique para anexar'}
              </p>
              <p className="text-[11px] text-slate-400">PDF, PNG ou JPG · máx. 6 MB cada</p>
            </div>
          </div>
          {form.evidencias.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {form.evidencias.map((ev, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-[12px]">
                  <Image size={12} className="text-slate-400 shrink-0" />
                  <span className="flex-1 truncate text-slate-700">{ev.nome}</span>
                  <button onClick={() => removerEvidencia(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
                </li>
              ))}
            </ul>
          )}
          <input ref={evRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={handleEvidencias} />
        </F>
      </div>

      {mut.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-700">
          <AlertCircle size={14} />{mut.error?.response?.data?.detail || 'Erro ao salvar. Tente novamente.'}
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="text-[11px] text-slate-400">* Campos obrigatórios</span>
        <button onClick={submit} disabled={mut.isPending}
          className="flex items-center gap-2 px-7 py-3 text-white text-[14px] font-bold rounded-xl active:scale-[0.99] disabled:opacity-60 transition-all"
          style={{ background: 'linear-gradient(135deg, #0032A0, #1048c8)', boxShadow: '0 4px 16px rgba(0,50,160,0.35)' }}>
          {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {mut.isPending ? 'Enviando...' : 'Registrar Contestação'}
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// CONSULTA
// ════════════════════════════════════════════════════════════════
function Consulta() {
  const [waybill, setWaybill] = useState('')
  const [buscado, setBuscado] = useState('')

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['pub-consulta', buscado],
    queryFn: () => pub.get(`/api/contestacoes/consulta/${buscado}`).then(r => r.data),
    enabled: !!buscado,
  })

  const buscar = () => { if (waybill.trim()) setBuscado(waybill.trim()) }

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={waybill} onChange={e => setWaybill(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="Digite o número do waybill..."
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 transition-all"
            style={{ ['--tw-ring-color']: '#0032A0' }} />
        </div>
        <button onClick={buscar} disabled={isLoading || isFetching}
          className="flex items-center gap-2 px-5 py-2.5 text-white text-[13px] font-semibold rounded-xl transition-colors disabled:opacity-60"
          style={{ background: '#0032A0', boxShadow: '0 2px 10px rgba(0,50,160,0.3)' }}>
          {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Pesquisar
        </button>
      </div>

      {buscado && !isLoading && !isFetching && (
        data.length === 0 ? (
          <div className="text-center py-14 text-slate-400">
            <ScanSearch size={40} className="mx-auto mb-3 opacity-25" />
            <p className="text-[14px]">Nenhuma contestação para <strong className="text-slate-600">{buscado}</strong></p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500 font-medium">{data.length} resultado{data.length > 1 ? 's' : ''} encontrado{data.length > 1 ? 's' : ''}</p>
            {data.map((r, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 p-5 transition-colors hover:border-blue-200" style={{ background: '#F6F7FA' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Waybill</p>
                    <p className="font-mono font-bold text-[17px]" style={{ color: '#151741' }}>{r.waybill}</p>
                  </div>
                  <StatusBadge status={r.status_analise} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Motivo do Desconto', r.motivo_desconto],
                    ['Valor do Desconto',  fmtBrl(r.valor_desconto)],
                    ['DS', r.ds],
                    ['Data', fmt(r.data_contestacao)],
                    ['Previsão', fmt(r.previsao)],
                    ['Observação', r.observacao || '—'],
                  ].map(([label, val]) => (
                    <div key={label} className={label === 'Observação' ? 'col-span-2' : ''}>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-[13px] text-slate-800 font-medium">{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'form',     label: 'Registrar Contestação', icon: ClipboardList },
  { key: 'consulta', label: 'Consultar Status',       icon: ScanSearch },
]

export default function ContestacoesPublico() {
  const [params, setParams] = useSearchParams()
  const aba = params.get('tab') || 'form'
  const setAba = (key) => setParams({ tab: key }, { replace: true })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F6F7FA' }}>
      <HeroBanner />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 -mt-8">
        {/* Card principal elevado sobre o hero */}
        <div className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: '0 20px 60px rgba(21,23,65,0.14), 0 4px 16px rgba(21,23,65,0.08)', border: '1px solid rgba(226,232,240,0.6)' }}>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setAba(key)}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-[13px] font-semibold transition-all border-b-2"
                style={{
                  borderBottomColor: aba === key ? '#0032A0' : 'transparent',
                  color: aba === key ? '#0032A0' : '#64748b',
                  background: aba === key ? 'rgba(0,50,160,0.04)' : 'transparent',
                }}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          <div className="p-6 md:p-8">
            {aba === 'form'     && <Formulario />}
            {aba === 'consulta' && <Consulta />}
          </div>
        </div>
      </main>

      <footer className="text-center py-5 text-[11px] text-slate-400">
        iMile Brasil · Portal Operacional
      </footer>
    </div>
  )
}

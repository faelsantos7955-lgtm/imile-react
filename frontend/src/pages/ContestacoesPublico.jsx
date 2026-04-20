/**
 * pages/ContestacoesPublico.jsx — Página pública de contestações
 * Acessível sem login. Abas: Novo Registro | Consulta por Waybill
 */
import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  Search, Plus, Loader2, FileText, Image,
  AlertCircle, CheckCircle2, ScanSearch, ClipboardList, X,
  Package, Truck, MapPin,
} from 'lucide-react'

// ── API sem autenticação ──────────────────────────────────────
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

// ── Hero Banner — cena logística ─────────────────────────────
function HeroBanner() {
  return (
    <div className="relative bg-navy-950 overflow-hidden" style={{ minHeight: 200 }}>
      {/* Dot grid */}
      <div className="absolute inset-0 login-dot-grid opacity-70" />

      {/* Gradiente laranja suave */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(233,113,50,0.10) 0%, transparent 65%)' }} />

      {/* SVG: rede de rotas e nós */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMid slice">
        {/* Rotas */}
        {[
          'M100,160 Q300,60 500,100',
          'M500,100 Q700,140 900,80',
          'M900,80 Q1050,50 1150,110',
          'M300,170 Q400,120 500,100',
          'M900,80 Q950,130 1000,170',
        ].map((d, i) => (
          <path key={i} d={d} stroke="#E97132" strokeWidth="1.2" strokeDasharray="8 6"
            fill="none" strokeOpacity="0.22" className="route-flow"
            style={{ animationDelay: `${i * 0.6}s` }} />
        ))}

        {/* Nós das cidades */}
        {[
          { cx: 100,  cy: 160, delay: '0s',    city: 'Santos' },
          { cx: 300,  cy: 170, delay: '0.5s',  city: 'Campinas' },
          { cx: 500,  cy: 100, delay: '1.0s',  city: 'São Paulo' },
          { cx: 900,  cy: 80,  delay: '0.3s',  city: 'Rio de Janeiro' },
          { cx: 1150, cy: 110, delay: '0.8s',  city: 'BH' },
          { cx: 1000, cy: 170, delay: '1.3s',  city: 'Curitiba' },
        ].map(n => (
          <g key={n.city}>
            <circle cx={n.cx} cy={n.cy} r="5" fill="#E97132" fillOpacity="0.55" />
            <circle cx={n.cx} cy={n.cy} r="12" fill="none" stroke="#E97132" strokeWidth="0.8"
              strokeOpacity="0.25" className="signal-blink" style={{ animationDelay: n.delay }} />
            <text x={n.cx + 8} y={n.cy - 8} fill="white" fillOpacity="0.28" fontSize="9" fontFamily="monospace">{n.city}</text>
          </g>
        ))}

        {/* Caixinhas flutuando */}
        <g transform="translate(760, 55)" className="box-float" style={{ animationDelay: '0.4s' }}>
          <rect x="-9" y="-9" width="18" height="18" rx="2" fill="#E97132" fillOpacity="0.08"
            stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.4" />
          <line x1="-9" y1="0" x2="9" y2="0" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.3" />
          <line x1="0" y1="-9" x2="0" y2="9" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.3" />
        </g>
        <g transform="translate(1080, 60)" className="box-float" style={{ animationDelay: '1.6s' }}>
          <rect x="-7" y="-7" width="14" height="14" rx="2" fill="#E97132" fillOpacity="0.07"
            stroke="#E97132" strokeWidth="0.7" strokeOpacity="0.35" />
          <line x1="-7" y1="0" x2="7" y2="0" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.25" />
        </g>

        {/* Estrada */}
        <line x1="0" y1="185" x2="1200" y2="185" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.18" />
        <line x1="0" y1="187" x2="1200" y2="187" stroke="white" strokeWidth="0.3" strokeOpacity="0.05" />
      </svg>

      {/* Scanline */}
      <div className="absolute left-0 right-0 h-px pointer-events-none scanline"
        style={{ background: 'linear-gradient(to right, transparent 5%, rgba(233,113,50,0.35) 50%, transparent 95%)' }} />

      {/* Caminhão animado */}
      <div className="absolute overflow-hidden pointer-events-none" style={{ bottom: 0, left: 0, right: 0, height: 68 }}>
        <div className="truck-anim absolute" style={{ bottom: 2 }}>
          <svg width="180" height="64" viewBox="0 0 200 72" fill="none">
            <rect x="2" y="18" width="116" height="36" rx="3" fill="#1a3557" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.7" />
            <rect x="8" y="26" width="40" height="4" rx="1" fill="#E97132" fillOpacity="0.5" />
            <rect x="118" y="10" width="78" height="44" rx="4" fill="#1f3f60" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.7" />
            <rect x="152" y="14" width="36" height="22" rx="2" fill="#E97132" fillOpacity="0.12" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.5" />
            <rect x="122" y="14" width="24" height="14" rx="2" fill="#E97132" fillOpacity="0.1" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.4" />
            <rect x="190" y="24" width="7" height="6" rx="2" fill="white" fillOpacity="0.9" />
            <path d="M197 24 L200 20 L200 34 L197 30 Z" fill="#E97132" fillOpacity="0.2" />
            <rect x="124" y="4" width="5" height="9" rx="2" fill="#1a3557" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.4" />
            <rect x="114" y="26" width="6" height="14" rx="2" fill="#122035" />
            <circle cx="35" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
            <circle cx="35" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
            <circle cx="85" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
            <circle cx="85" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
            <circle cx="155" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
            <circle cx="155" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
          </svg>
        </div>
      </div>

      {/* Conteúdo do hero */}
      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-8 pb-16 flex items-start gap-4">
        {/* Logo */}
        <img src="/imile-logo.png" alt="iMile" className="h-8 w-auto object-contain shrink-0 mt-1"
          style={{ filter: 'brightness(0) invert(1)' }} />

        <div className="w-px h-8 bg-white/15 shrink-0" />

        <div>
          <p className="text-imile-400 text-[10px] font-bold tracking-widest uppercase mb-0.5">
            Portal Operacional
          </p>
          <h1 className="text-white font-bold text-[20px] leading-tight">
            Contestação de Descontos Logísticos
          </h1>
          <p className="text-white/40 text-[12px] mt-1">
            Registre e acompanhe contestações de desconto de faturamento
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Combobox pesquisável para DS ─────────────────────────────
function DsCombobox({ value, onChange, error }) {
  const [query, setQuery]     = useState(value || '')
  const [open, setOpen]       = useState(false)
  const containerRef          = useRef(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim()
    ? DS_LIST.filter(ds => ds.toLowerCase().includes(query.trim().toLowerCase()))
    : DS_LIST

  const select = (ds) => { onChange(ds); setQuery(ds); setOpen(false) }

  const cls = `w-full border rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 bg-white transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-200'}`

  return (
    <div ref={containerRef} className="relative">
      <input value={query} onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true) }}
        onFocus={() => setOpen(true)} placeholder="Digite para pesquisar a DS..." className={cls} />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(ds => (
            <li key={ds} onMouseDown={() => select(ds)}
              className={`px-3 py-2 text-[13px] cursor-pointer hover:bg-imile-50 hover:text-imile-700 ${value === ds ? 'bg-imile-50 font-semibold text-imile-700' : 'text-slate-700'}`}>
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
  return `w-full border rounded-xl px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 bg-white transition-all ${err ? 'border-red-300 bg-red-50' : 'border-slate-200'}`
}

function F({ label, children, error, required }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
        {label}{required && <span className="text-imile-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// FORMULÁRIO
// ══════════════════════════════════════════════════════════════
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
    mut.mutate({ ...form, valor_desconto: form.valor_desconto ? parseFloat(form.valor_desconto) : null, previsao: null, evidencias: form.evidencias })
  }

  if (mut.isSuccess) return (
    <div className="text-center py-16 px-4">
      {/* Ícone de sucesso com anel */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-30" />
        <div className="relative w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={36} className="text-emerald-500" />
        </div>
      </div>
      <h3 className="text-[20px] font-bold text-slate-800 mb-2">Contestação registrada!</h3>
      <p className="text-[14px] text-slate-500 mb-2">Seu pedido foi enviado e está em análise.</p>
      <p className="text-[12px] text-slate-400 mb-8">
        Use a aba <strong className="text-slate-600">Consultar Status</strong> com o waybill para acompanhar.
      </p>
      <button onClick={() => mut.reset()}
        className="inline-flex items-center gap-2 px-6 py-2.5 bg-navy-950 text-white text-[13px] font-semibold rounded-xl hover:bg-navy-800 transition-colors shadow-sm">
        <Plus size={14} /> Registrar outra contestação
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Linha 1: Data + Solicitante */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <F label="Data" required error={errors.data_contestacao}>
          <input type="date" value={form.data_contestacao} onChange={e => set('data_contestacao', e.target.value)} className={inputCls(errors.data_contestacao)} />
        </F>
        <F label="Quem Solicitou" error={errors.quem_solicitou}>
          <input value={form.quem_solicitou} onChange={e => set('quem_solicitou', e.target.value)} placeholder="Nome / área" className={inputCls()} />
        </F>
      </div>

      {/* Linha 2: DS + Waybill */}
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

      {/* Linha 3: Motivo + Valor */}
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

      {/* Uploads lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Faturamento */}
        <F label="Faturamento com Desconto" required error={errors.faturamento}>
          <div onClick={() => fatRef.current.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all min-h-[110px]
              ${errors.faturamento ? 'border-red-300 bg-red-50'
              : form.faturamento_nome ? 'border-imile-400 bg-imile-50'
              : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/30'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${form.faturamento_nome ? 'bg-imile-100' : 'bg-slate-100'}`}>
              <FileText size={20} className={form.faturamento_nome ? 'text-imile-500' : 'text-slate-400'} />
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
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all min-h-[110px]
              ${errors.evidencia ? 'border-red-300 bg-red-50'
              : form.evidencias.length ? 'border-imile-400 bg-imile-50'
              : 'border-slate-200 hover:border-imile-300 hover:bg-imile-50/30'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center
              ${form.evidencias.length ? 'bg-imile-100' : 'bg-slate-100'}`}>
              <Image size={20} className={form.evidencias.length ? 'text-imile-500' : 'text-slate-400'} />
            </div>
            <div className="text-center">
              <p className="text-[12px] font-semibold text-slate-700">
                {form.evidencias.length
                  ? `${form.evidencias.length} arquivo(s) · adicionar mais`
                  : 'Clique para anexar'}
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

      {/* Botão de envio */}
      <div className="flex justify-end pt-1">
        <button onClick={submit} disabled={mut.isPending}
          className="flex items-center gap-2 px-7 py-3 bg-imile-500 text-white text-[14px] font-bold rounded-xl hover:bg-imile-600 active:scale-[0.99] disabled:opacity-60 transition-all shadow-imile">
          {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          {mut.isPending ? 'Enviando...' : 'Registrar Contestação'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CONSULTA
// ══════════════════════════════════════════════════════════════
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
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 transition-all" />
        </div>
        <button onClick={buscar} disabled={isLoading || isFetching}
          className="flex items-center gap-2 px-5 py-2.5 bg-imile-500 text-white text-[13px] font-semibold rounded-xl hover:bg-imile-600 transition-colors disabled:opacity-60 shadow-imile-sm">
          {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Pesquisar
        </button>
      </div>

      {buscado && !isLoading && !isFetching && (
        data.length === 0 ? (
          <div className="text-center py-14 text-slate-400">
            <Package size={40} className="mx-auto mb-3 opacity-25" />
            <p className="text-[14px]">Nenhuma contestação para <strong className="text-slate-600">{buscado}</strong></p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500 font-medium">{data.length} resultado{data.length > 1 ? 's' : ''} encontrado{data.length > 1 ? 's' : ''}</p>
            {data.map((r, i) => (
              <div key={i} className="bg-slate-50 rounded-2xl border border-slate-200 p-5 hover:border-imile-200 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Waybill</p>
                    <p className="font-mono font-bold text-slate-900 text-[17px]">{r.waybill}</p>
                  </div>
                  <StatusBadge status={r.status_analise} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Motivo do Desconto', r.motivo_desconto],
                    ['Valor do Desconto', fmtBrl(r.valor_desconto)],
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

// ══════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'form',     label: 'Registrar Contestação', icon: ClipboardList },
  { key: 'consulta', label: 'Consultar Status',       icon: ScanSearch },
]

export default function ContestacoesPublico() {
  const [params, setParams] = useSearchParams()
  const aba = params.get('tab') || 'form'
  const setAba = (key) => setParams({ tab: key }, { replace: true })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f1f5f9' }}>
      {/* Hero */}
      <HeroBanner />

      {/* Conteúdo */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 -mt-6">
        {/* Card principal elevado sobre o hero */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200/60 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setAba(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[13px] font-semibold transition-all border-b-2 ${
                  aba === key
                    ? 'border-imile-500 text-imile-600 bg-imile-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <Icon size={14} />{label}
              </button>
            ))}
          </div>

          {/* Formulário ou consulta */}
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

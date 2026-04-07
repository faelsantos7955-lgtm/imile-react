/**
 * pages/ContestacoesPublico.jsx — Página pública de contestações
 * Acessível sem login. Abas: Novo Registro | Consulta por Waybill
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import axios from 'axios'
import {
  Search, Plus, Loader2, FileText, Image,
  AlertCircle, CheckCircle2, ScanSearch, ClipboardList,
} from 'lucide-react'

// ── API sem autenticação ──────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const pub = axios.create({ baseURL: BASE })

// ── Constantes ────────────────────────────────────────────────
const MOTIVOS = ['Extravio', 'Avaria', 'Desconto Indevido', 'Outros']

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

// ── Helpers de formulário (fora de qualquer componente) ───────
function inputCls(err) {
  return `w-full border rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white transition-shadow ${err ? 'border-red-300 bg-red-50' : 'border-slate-200'}`
}

function F({ label, children, error, required }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
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
  evidencia_b64: null, evidencia_nome: null,
}

function Formulario() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const fatRef = useRef(null)
  const evRef  = useRef(null)

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: null }))
  }

  const handleFile = async (e, campo) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 6_000_000) { setErrors(er => ({ ...er, [campo]: 'Arquivo excede 6 MB' })); return }
    const b64 = await fileToB64(file)
    setForm(f => ({ ...f, [`${campo}_b64`]: b64, [`${campo}_nome`]: file.name }))
    setErrors(er => ({ ...er, [campo]: null }))
  }

  const mut = useMutation({
    mutationFn: (payload) => pub.post('/api/contestacoes', payload),
    onSuccess: () => setForm(EMPTY),
  })

  const validate = () => {
    const e = {}
    if (!form.data_contestacao) e.data_contestacao = 'Obrigatório'
    if (!form.ds.trim()) e.ds = 'Obrigatório'
    if (!form.waybill.trim()) e.waybill = 'Obrigatório'
    if (!form.motivo_desconto) e.motivo_desconto = 'Obrigatório'
    if (!form.faturamento_b64) e.faturamento = 'Obrigatório'
    if (!form.evidencia_b64) e.evidencia = 'Obrigatório'
    return e
  }

  const submit = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    mut.mutate({ ...form, valor_desconto: form.valor_desconto ? parseFloat(form.valor_desconto) : null, previsao: form.previsao || null })
  }


  if (mut.isSuccess) return (
    <div className="text-center py-16">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 size={32} className="text-emerald-500" />
      </div>
      <h3 className="text-[18px] font-bold text-slate-800 mb-2">Contestação registrada!</h3>
      <p className="text-[14px] text-slate-500 mb-6">Seu pedido foi enviado e está em análise.</p>
      <button
        onClick={() => mut.reset()}
        className="px-6 py-2.5 bg-[#0a1628] text-white text-[13px] font-semibold rounded-lg hover:bg-[#1e3a5f] transition-colors"
      >
        Registrar outra contestação
      </button>
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <F label="Data" required error={errors.data_contestacao}>
        <input type="date" value={form.data_contestacao} onChange={e => set('data_contestacao', e.target.value)} className={inputCls(errors.data_contestacao)} />
      </F>

      <F label="Quem Solicitou" error={errors.quem_solicitou}>
        <input value={form.quem_solicitou} onChange={e => set('quem_solicitou', e.target.value)} placeholder="Nome do solicitante" className={inputCls()} />
      </F>

      <F label="DS" required error={errors.ds}>
        <input value={form.ds} onChange={e => set('ds', e.target.value.toUpperCase())} placeholder="Ex: DS SLV" className={inputCls(errors.ds)} />
      </F>

      <F label="Waybill" required error={errors.waybill}>
        <input value={form.waybill} onChange={e => set('waybill', e.target.value)} placeholder="Código do pacote" className={inputCls(errors.waybill)} />
      </F>

      <F label="Motivo do Desconto" required error={errors.motivo_desconto}>
        <select value={form.motivo_desconto} onChange={e => set('motivo_desconto', e.target.value)} className={inputCls(errors.motivo_desconto)}>
          <option value="">Selecionar...</option>
          {MOTIVOS.map(m => <option key={m}>{m}</option>)}
        </select>
      </F>

      <F label="Valor do Desconto (R$)" error={errors.valor_desconto}>
        <input type="number" step="0.01" min="0" value={form.valor_desconto} onChange={e => set('valor_desconto', e.target.value)} placeholder="0,00" className={inputCls()} />
      </F>

      <div className="md:col-span-2">
        <F label="Observação" error={errors.observacao}>
          <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)} rows={3} placeholder="Descreva detalhes da contestação..." className={inputCls() + ' resize-none'} />
        </F>
      </div>

      <F label="Previsão de Resolução" error={errors.previsao}>
        <input type="date" value={form.previsao} onChange={e => set('previsao', e.target.value)} className={inputCls()} />
      </F>

      {/* Uploads */}
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
        <F label="Faturamento / Comprovante" required error={errors.faturamento}>
          <div
            onClick={() => fatRef.current.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors
              ${errors.faturamento ? 'border-red-300 bg-red-50' : form.faturamento_nome ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
          >
            <FileText size={24} className={form.faturamento_nome ? 'text-emerald-500' : 'text-slate-400'} />
            <div className="text-center">
              <p className="text-[12px] font-medium text-slate-700">{form.faturamento_nome || 'Clique para selecionar'}</p>
              <p className="text-[11px] text-slate-400">PDF, PNG ou JPG • máx. 6 MB</p>
            </div>
            {form.faturamento_nome && (
              <button onClick={e => { e.stopPropagation(); set('faturamento_b64', null); set('faturamento_nome', null) }}
                className="text-[11px] text-red-500 hover:text-red-700 font-medium">Remover</button>
            )}
          </div>
          <input ref={fatRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => handleFile(e, 'faturamento')} />
        </F>

        <F label="Evidência" required error={errors.evidencia}>
          <div
            onClick={() => evRef.current.click()}
            className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 cursor-pointer transition-colors
              ${errors.evidencia ? 'border-red-300 bg-red-50' : form.evidencia_nome ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
          >
            <Image size={24} className={form.evidencia_nome ? 'text-emerald-500' : 'text-slate-400'} />
            <div className="text-center">
              <p className="text-[12px] font-medium text-slate-700">{form.evidencia_nome || 'Clique para selecionar'}</p>
              <p className="text-[11px] text-slate-400">PDF, PNG ou JPG • máx. 6 MB</p>
            </div>
            {form.evidencia_nome && (
              <button onClick={e => { e.stopPropagation(); set('evidencia_b64', null); set('evidencia_nome', null) }}
                className="text-[11px] text-red-500 hover:text-red-700 font-medium">Remover</button>
            )}
          </div>
          <input ref={evRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => handleFile(e, 'evidencia')} />
        </F>
      </div>

      {mut.isError && (
        <div className="md:col-span-2 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
          <AlertCircle size={14} />{mut.error?.response?.data?.detail || 'Erro ao salvar. Tente novamente.'}
        </div>
      )}

      <div className="md:col-span-2 flex justify-end pt-2">
        <button
          onClick={submit} disabled={mut.isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#0a1628] text-white text-[13px] font-semibold rounded-lg hover:bg-[#1e3a5f] disabled:opacity-60 transition-colors"
        >
          {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
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
        <input
          value={waybill}
          onChange={e => setWaybill(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="Digite o número do waybill..."
          className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        <button
          onClick={buscar} disabled={isLoading || isFetching}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#0a1628] text-white text-[13px] font-semibold rounded-lg hover:bg-[#1e3a5f] transition-colors disabled:opacity-60"
        >
          {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Pesquisar
        </button>
      </div>

      {buscado && !isLoading && !isFetching && (
        data.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <ScanSearch size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">Nenhuma contestação encontrada para <strong className="text-slate-600">{buscado}</strong></p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[12px] text-slate-500">{data.length} resultado{data.length > 1 ? 's' : ''}</p>
            {data.map((r, i) => (
              <div key={i} className="bg-slate-50 rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">WAYBILL</p>
                    <p className="font-mono font-bold text-slate-900 text-[16px]">{r.waybill}</p>
                  </div>
                  <StatusBadge status={r.status_analise} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Motivo do Desconto', r.motivo_desconto],
                    ['Valor do Desconto',  fmtBrl(r.valor_desconto)],
                    ['DS',                 r.ds],
                    ['Data',               fmt(r.data_contestacao)],
                    ['Previsão',           fmt(r.previsao)],
                    ['Observação',         r.observacao || '—'],
                  ].map(([label, val]) => (
                    <div key={label} className={label === 'Observação' ? 'col-span-2' : ''}>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                      <p className="text-[13px] text-slate-800 mt-0.5 font-medium">{val}</p>
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
// PÁGINA PRINCIPAL (sem Layout)
// ══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'form',     label: 'Registrar Contestação', icon: ClipboardList },
  { key: 'consulta', label: 'Consultar Status',       icon: ScanSearch },
]

export default function ContestacoesPublico() {
  const [aba, setAba] = useState('form')

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Header */}
      <header className="bg-[#0a1628] shadow-lg">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <span className="text-white font-black text-[13px]">iM</span>
          </div>
          <div>
            <p className="text-white font-bold text-[15px] leading-none">iMile Delivery</p>
            <p className="text-white/40 text-[11px] mt-0.5">Portal de Contestações</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                aba === key ? 'bg-[#0a1628] text-white shadow' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          {aba === 'form'     && <Formulario />}
          {aba === 'consulta' && <Consulta />}
        </div>
      </main>

      <footer className="text-center py-4 text-[11px] text-slate-400">
        iMile Brasil · Portal Operacional
      </footer>
    </div>
  )
}

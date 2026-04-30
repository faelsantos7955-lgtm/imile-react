/**
 * pages/Contestacoes.jsx — Controle de Contestações de Descontos Logísticos
 * Abas: Base de Dados | Novo Registro | Consulta por Waybill
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useSearchParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ui'
import {
  Search, Plus, Download, Trash2, ChevronDown, Loader2,
  FileText, Image, AlertCircle, CheckCircle2, Clock, X,
  Database, ClipboardList, ScanSearch, RefreshCw,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────
const MOTIVOS = ['Extravio', 'Avaria', 'Fake Delivery', 'Fake POD']

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
const STATUS_LIST = ['Pendente', 'Em Análise', 'Enviado ao Financeiro', 'Atraso do Financeiro', 'Aprovado', 'Reprovado']

const STATUS_STYLE = {
  'Pendente':              'bg-slate-100 text-slate-600 border-slate-200',
  'Em Análise':            'bg-amber-50 text-amber-700 border-amber-200',
  'Em Andamento':          'bg-amber-50 text-amber-700 border-amber-200',
  'Enviado ao Financeiro': 'bg-blue-50 text-blue-700 border-blue-200',
  'Atraso do Financeiro':  'bg-orange-50 text-orange-700 border-orange-200',
  'Aprovado':              'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Reprovado':             'bg-red-50 text-red-600 border-red-200',
}

const STATUS_DOT = {
  'Pendente':              'bg-slate-400',
  'Em Análise':            'bg-amber-400',
  'Em Andamento':          'bg-amber-400',
  'Enviado ao Financeiro': 'bg-blue-500',
  'Atraso do Financeiro':  'bg-orange-500',
  'Aprovado':              'bg-emerald-500',
  'Reprovado':             'bg-red-500',
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function fmt(v) {
  if (!v) return '—'
  if (v instanceof Date) return v.toLocaleDateString('pt-BR')
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

function downloadB64(b64, nome) {
  const a = document.createElement('a')
  a.href = b64
  a.download = nome || 'arquivo'
  a.click()
}

// ── DS Combobox com pesquisa ──────────────────────────────────
function DSCombobox({ value, onChange, error }) {
  const [search, setSearch] = useState(value || '')
  const [open, setOpen] = useState(false)
  const filtered = DS_LIST.filter(ds => ds.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="relative">
      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); if (!e.target.value) onChange('') }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Digite para pesquisar DS..."
        autoComplete="off"
        className={`w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white ${error ? 'border-red-300' : 'border-slate-200'}`}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto mt-1">
          {filtered.map(ds => (
            <button
              key={ds}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(ds); setSearch(ds); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-blue-50 text-slate-700 ${ds === value ? 'bg-blue-50 font-semibold' : ''}`}
            >
              {ds}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Badge de status ───────────────────────────────────────────
function StatusBadge({ status }) {
  const cls = STATUS_STYLE[status] || 'bg-slate-100 text-slate-600 border-slate-200'
  const dot = STATUS_DOT[status] || 'bg-slate-400'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}

// ── Select de status inline ───────────────────────────────────
function StatusSelect({ id, current, onSaved }) {
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: (s) => api.patch(`/api/contestacoes/${id}/status`, { status_analise: s }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contestacoes'] }); onSaved?.() },
  })

  const cls = STATUS_STYLE[current] || 'bg-slate-100 text-slate-600 border-slate-200'

  return (
    <select
      value={current}
      onChange={e => mut.mutate(e.target.value)}
      disabled={mut.isPending}
      className={`text-[11px] font-semibold border rounded-full px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-60 ${cls}`}
    >
      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )
}

// ── Modal de edição de obs/resolução ─────────────────────────
function EditModal({ row, onClose, onSave, isPending }) {
  const [obs,      setObs]      = useState(row.observacao  || '')
  const [resolucao,setResolucao] = useState(row.resolucao  || '')
  const [previsao, setPrevisao]  = useState(row.previsao   || '')
  const [status,   setStatus]    = useState(row.status_analise)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl animate-scale">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Editar Contestação</p>
            <p className="font-mono font-bold text-[16px] text-slate-800 mt-0.5">{row.waybill}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Status + Previsão */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white">
                {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Previsão</label>
              <input type="date" value={previsao} onChange={e => setPrevisao(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Observação</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={5}
              placeholder="Observações internas sobre esta contestação..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y bg-white" />
          </div>

          {/* Resolução */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Resolução <span className="normal-case font-normal text-slate-400">(retorno ao cliente)</span>
            </label>
            <textarea value={resolucao} onChange={e => setResolucao(e.target.value)} rows={4}
              placeholder="Desfecho final — será exibido ao cliente na consulta pública..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-y bg-white" />
            <p className="text-[11px] text-slate-400 mt-1">Este campo aparece para o cliente na aba Consultar Status.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="px-5 py-2 text-[13px] font-semibold text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={() => onSave({ obs, resolucao, previsao, status })} disabled={isPending}
            className="flex items-center gap-2 px-6 py-2 text-[13px] font-semibold text-white rounded-lg disabled:opacity-60 transition-colors"
            style={{ background: '#0032A0' }}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA 1 — BASE DE DADOS
// ══════════════════════════════════════════════════════════════
function BaseDados() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [editando, setEditando] = useState(null) // row completo
  const [confirmDlg, setConfirmDlg] = useState(null) // { message, onConfirm }

  const { data = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['contestacoes'],
    queryFn: () => api.get('/api/contestacoes').then(r => r.data),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  const mutDel = useMutation({
    mutationFn: (id) => api.delete(`/api/contestacoes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contestacoes'] }),
  })

  const mutObs = useMutation({
    mutationFn: ({ id, obs, resolucao, previsao, status }) =>
      api.patch(`/api/contestacoes/${id}/status`, {
        status_analise: status,
        observacao: obs,
        previsao: previsao || null,
        resolucao: resolucao || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contestacoes'] }); setEditando(null) },
  })

  const mutArq = useMutation({
    mutationFn: ({ id, tipo }) => api.get(`/api/contestacoes/${id}/arquivo/${tipo}`).then(r => r.data),
    onSuccess: ({ files }) => files.forEach(f => downloadB64(f.b64, f.nome)),
  })

  const linhas = data.filter(r => {
    const ok = filtroStatus === 'Todos' || r.status_analise === filtroStatus
    if (!ok) return false
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return (
      r.waybill?.toLowerCase().includes(q) ||
      r.ds?.toLowerCase().includes(q) ||
      r.motivo_desconto?.toLowerCase().includes(q) ||
      r.quem_solicitou?.toLowerCase().includes(q)
    )
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 size={20} className="animate-spin text-slate-400" />
    </div>
  )

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Waybill, DS, motivo..."
            className="pl-8 pr-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white w-56"
          />
        </div>
        <select
          value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          <option>Todos</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            title="Atualizar listagem"
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <span className="text-[12px] text-slate-400">{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {['Data','Waybill','Motivo','DS','Solicitante','Valor','Faturamento','Evidência','Status','Observação','Resolução','Previsão',''].map(h => (
                <th key={h} className="px-3 py-2.5 font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {linhas.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-12 text-slate-400">
                  Nenhuma contestação encontrada
                </td>
              </tr>
            )}
            {linhas.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{fmt(r.data_contestacao)}</td>
                <td className="px-3 py-2.5 font-mono text-slate-800 whitespace-nowrap">{r.waybill}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">{r.motivo_desconto}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{r.ds}</td>
                <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.quem_solicitou || '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-800">{fmtBrl(r.valor_desconto)}</td>
                <td className="px-3 py-2.5">
                  {r.faturamento_nome ? (
                    <button
                      onClick={() => mutArq.mutate({ id: r.id, tipo: 'faturamento' })}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                      title={r.faturamento_nome}
                    >
                      <FileText size={13} /><span className="truncate max-w-[120px]">{r.faturamento_nome}</span>
                    </button>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {r.evidencia_nome ? (
                    <button
                      onClick={() => mutArq.mutate({ id: r.id, tipo: 'evidencia' })}
                      className="flex items-center gap-1 text-violet-600 hover:text-violet-800 transition-colors"
                      title={r.evidencia_nome}
                    >
                      <Image size={13} /><span className="truncate max-w-[120px]">{r.evidencia_nome}</span>
                    </button>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <StatusSelect id={r.id} current={r.status_analise} />
                </td>
                {/* Observação — preview + abre modal */}
                <td className="px-3 py-2.5 max-w-[200px]">
                  <button onClick={() => setEditando(r)}
                    className="text-left w-full hover:bg-blue-50 rounded-lg px-2 py-1.5 transition-colors group">
                    {r.observacao
                      ? <span className="text-[12px] text-slate-700 line-clamp-2 leading-relaxed">{r.observacao}</span>
                      : <span className="text-[11px] text-slate-300 italic">clique para editar</span>}
                  </button>
                </td>
                {/* Resolução — preview + abre modal */}
                <td className="px-3 py-2.5 max-w-[200px]">
                  <button onClick={() => setEditando(r)}
                    className="text-left w-full hover:bg-emerald-50 rounded-lg px-2 py-1.5 transition-colors">
                    {r.resolucao
                      ? <span className="text-[12px] text-emerald-700 font-medium line-clamp-2 leading-relaxed">{r.resolucao}</span>
                      : <span className="text-[11px] text-slate-300 italic">clique para editar</span>}
                  </button>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-slate-500">{fmt(r.previsao)}</td>
                <td className="px-3 py-2.5">
                  {isAdmin && (
                    <button
                      onClick={() => setConfirmDlg({ message: `Excluir contestação ${r.waybill}?`, onConfirm: () => mutDel.mutate(r.id) })}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmDlg && (
        <ConfirmDialog
          message={confirmDlg.message}
          onConfirm={confirmDlg.onConfirm}
          onCancel={() => setConfirmDlg(null)}
        />
      )}
      {editando && (
        <EditModal
          row={editando}
          isPending={mutObs.isPending}
          onClose={() => setEditando(null)}
          onSave={({ obs, resolucao, previsao, status }) =>
            mutObs.mutate({ id: editando.id, obs, resolucao, previsao, status })
          }
        />
      )}
    </div>
  )
}

// ── Helpers de formulário (fora de qualquer componente) ───────
function inputCls(err) {
  return `w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white ${err ? 'border-red-300' : 'border-slate-200'}`
}

function F({ label, children, error, required }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA 2 — NOVO REGISTRO
// ══════════════════════════════════════════════════════════════
const _today = new Date().toISOString().slice(0, 10)
const EMPTY_FORM = {
  data_contestacao: _today,
  quem_solicitou: '',
  ds: '',
  waybill: '',
  motivo_desconto: '',
  valor_desconto: '',
  observacao: '',
  previsao: addDays(_today, 3),
  faturamento_b64: null,
  faturamento_nome: null,
  evidencias: [],
}

function NovoRegistro({ onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const fatRef = useRef(null)
  const evRef = useRef(null)
  const qc = useQueryClient()

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: null }))
  }

  const handleFile = async (e, campo) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 6_000_000) {
      setErrors(er => ({ ...er, [campo]: 'Arquivo excede 6 MB' }))
      return
    }
    const b64 = await fileToB64(file)
    setForm(f => ({ ...f, [`${campo}_b64`]: b64, [`${campo}_nome`]: file.name }))
    setErrors(er => ({ ...er, [campo]: null }))
  }

  const handleEvidencias = async (e) => {
    const files = Array.from(e.target.files)
    const MAX = 6_000_000
    const novos = []
    for (const file of files) {
      if (file.size > MAX) {
        setErrors(er => ({ ...er, evidencia: `${file.name} excede 6 MB` }))
        continue
      }
      const b64 = await fileToB64(file)
      novos.push({ b64, nome: file.name })
    }
    if (novos.length) {
      setForm(f => ({ ...f, evidencias: [...f.evidencias, ...novos] }))
      setErrors(er => ({ ...er, evidencia: null }))
    }
    e.target.value = ''
  }

  const removerEvidencia = (idx) =>
    setForm(f => ({ ...f, evidencias: f.evidencias.filter((_, i) => i !== idx) }))

  const mut = useMutation({
    mutationFn: (payload) => api.post('/api/contestacoes', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contestacoes'] })
      setForm(EMPTY_FORM)
      onSaved?.()
    },
  })

  const validate = () => {
    const e = {}
    if (!form.data_contestacao)   e.data_contestacao = 'Obrigatório'
    if (!form.ds.trim())          e.ds = 'Obrigatório'
    if (!form.waybill.trim())     e.waybill = 'Obrigatório'
    if (!form.motivo_desconto)    e.motivo_desconto = 'Obrigatório'
    if (!form.faturamento_b64)        e.faturamento = 'Obrigatório'
    if (!form.valor_desconto)         e.valor_desconto = 'Obrigatório'
    if (!form.observacao?.trim())     e.observacao = 'Obrigatório'
    if (!form.evidencias.length)      e.evidencia = 'Anexe pelo menos uma evidência'
    return e
  }

  const submit = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    mut.mutate({
      ...form,
      valor_desconto: form.valor_desconto ? parseFloat(form.valor_desconto) : null,
      previsao: form.previsao || null,
      evidencias: form.evidencias,
    })
  }

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-[14px] font-bold text-slate-800 mb-5">Novo Registro de Contestação</h3>

        <div className="flex flex-col gap-4">
          <F label="DATA" required error={errors.data_contestacao}>
            <input type="date" value={form.data_contestacao} onChange={e => {
              const v = e.target.value
              setForm(f => ({ ...f, data_contestacao: v, previsao: v ? addDays(v, 3) : f.previsao }))
              setErrors(er => ({ ...er, data_contestacao: null }))
            }} className={inputCls(errors.data_contestacao)} />
          </F>

          <F label="Quem Solicitou" error={errors.quem_solicitou}>
            <input value={form.quem_solicitou} onChange={e => set('quem_solicitou', e.target.value)}
              placeholder="Área de resposta"
              className={inputCls()} />
          </F>

          <F label="DS" required error={errors.ds}>
            <DSCombobox value={form.ds} onChange={v => set('ds', v)} error={errors.ds} />
          </F>

          <F label="WAYBILL" required error={errors.waybill}>
            <input
              value={form.waybill}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 13)
                set('waybill', v)
              }}
              placeholder="Somente números, até 13 dígitos"
              inputMode="numeric"
              maxLength={13}
              className={inputCls(errors.waybill)}
            />
          </F>

          <F label="MOTIVO DESCONTO" required error={errors.motivo_desconto}>
            <select value={form.motivo_desconto} onChange={e => set('motivo_desconto', e.target.value)}
              className={inputCls(errors.motivo_desconto)}>
              <option value="">Área de resposta</option>
              {MOTIVOS.map(m => <option key={m}>{m}</option>)}
            </select>
          </F>

          <F label="FATURAMENTO QUE HOUVE O DESCONTO" required error={errors.faturamento}>
            <div
              onClick={() => fatRef.current.click()}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors
                ${errors.faturamento ? 'border-red-300 bg-red-50' : form.faturamento_nome ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
            >
              <FileText size={20} className={form.faturamento_nome ? 'text-emerald-500' : 'text-slate-400'} />
              <span className="text-[12px] text-slate-600 text-center">
                {form.faturamento_nome || 'Área de carregamento'}
              </span>
              {form.faturamento_nome && (
                <button onClick={e => { e.stopPropagation(); set('faturamento_b64', null); set('faturamento_nome', null) }}
                  className="text-[10px] text-red-500 hover:text-red-700">Remover</button>
              )}
            </div>
            <input ref={fatRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls" className="hidden"
              onChange={e => handleFile(e, 'faturamento')} />
          </F>

          <F label="VALOR DO DESCONTO" required error={errors.valor_desconto}>
            <input type="number" step="0.01" min="0" value={form.valor_desconto}
              onChange={e => set('valor_desconto', e.target.value)}
              placeholder="Área de resposta"
              className={inputCls(errors.valor_desconto)} />
          </F>

          <F label="OBSERVAÇÃO" required error={errors.observacao}>
            <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)}
              rows={2} placeholder="Descreva o motivo pelo qual o desconto não procede"
              className={inputCls(errors.observacao) + ' resize-none'} />
          </F>

          <F label="EVIDENCIA" required error={errors.evidencia}>
            <div
              onClick={() => evRef.current.click()}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors
                ${errors.evidencia ? 'border-red-300 bg-red-50' : form.evidencias.length ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
            >
              <Image size={20} className={form.evidencias.length ? 'text-emerald-500' : 'text-slate-400'} />
              <span className="text-[12px] text-slate-600 text-center">
                {form.evidencias.length ? `${form.evidencias.length} arquivo(s) anexado(s) — clique para adicionar mais` : 'Área de carregamento'}
              </span>
              <span className="text-[11px] text-slate-400">PDF, PNG ou JPG • máx. 6 MB cada</span>
            </div>
            {form.evidencias.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {form.evidencias.map((ev, i) => (
                  <li key={i} className="flex items-center gap-2 px-2 py-1 bg-slate-50 rounded-lg border border-slate-200 text-[11px]">
                    <Image size={12} className="text-slate-400 shrink-0" />
                    <span className="flex-1 truncate text-slate-700">{ev.nome}</span>
                    <button onClick={() => removerEvidencia(i)} className="text-slate-300 hover:text-red-500 transition-colors shrink-0">
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={evRef} type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden"
              onChange={handleEvidencias} />
          </F>
        </div>

        {mut.isError && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[12px] text-red-700">
            <AlertCircle size={14} />
            {mut.error?.response?.data?.detail || 'Erro ao salvar'}
          </div>
        )}

        {mut.isSuccess && (
          <div className="mt-4 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-700">
            <CheckCircle2 size={14} />
            Contestação registrada com sucesso!
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            onClick={submit}
            disabled={mut.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-[13px] font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {mut.isPending ? 'Salvando...' : 'Registrar Contestação'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA 3 — CONSULTA POR WAYBILL
// ══════════════════════════════════════════════════════════════
function Consulta() {
  const [waybill, setWaybill] = useState('')
  const [buscado, setBuscado] = useState('')

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['contestacoes-consulta', buscado],
    queryFn: () => api.get(`/api/contestacoes/consulta/${buscado}`).then(r => r.data),
    enabled: !!buscado,
  })

  const buscar = () => {
    const wb = waybill.trim()
    if (wb) setBuscado(wb)
  }

  return (
    <div className="max-w-xl">
      {/* Search box estilo portal */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-gradient-to-br from-[#0a1628] to-[#1e3a5f] px-8 py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black text-[15px]">iM</span>
          </div>
          <h2 className="text-white font-bold text-lg leading-none">iMile Delivery</h2>
          <p className="text-white/50 text-[13px] mt-1">Consulte o status da sua contestação</p>
        </div>

        <div className="p-6">
          <label className="block text-[12px] font-semibold text-slate-600 mb-2">WAYBILL</label>
          <div className="flex gap-2">
            <input
              value={waybill}
              onChange={e => setWaybill(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscar()}
              placeholder="Digite o número do waybill..."
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            <button
              onClick={buscar}
              disabled={isLoading || isFetching}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0a1628] text-white text-[13px] font-semibold rounded-lg hover:bg-[#1e3a5f] transition-colors disabled:opacity-60"
            >
              {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Pesquisar
            </button>
          </div>
        </div>
      </div>

      {/* Resultado */}
      {buscado && !isLoading && !isFetching && (
        data.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <ScanSearch size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-[13px]">Nenhuma contestação encontrada para <strong>{buscado}</strong></p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-500 mb-2">{data.length} resultado{data.length > 1 ? 's' : ''} encontrado{data.length > 1 ? 's' : ''}</p>
            {data.map((r, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">WAYBILL</p>
                    <p className="font-mono font-bold text-slate-900 text-[15px] mt-0.5">{r.waybill}</p>
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
                    ...(r.resolucao ? [['Resolução / Desfecho', r.resolucao]] : []),
                  ].map(([label, val]) => (
                    <div key={label} className={label === 'Observação' || label === 'Resolução / Desfecho' ? 'col-span-2' : ''}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                      <p className={`text-[13px] mt-0.5 font-medium ${label === 'Resolução / Desfecho' ? 'text-emerald-700' : 'text-slate-800'}`}>{val}</p>
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
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'base',     label: 'Base de Dados',     icon: Database },
  { key: 'novo',     label: 'Novo Registro',      icon: ClipboardList },
  { key: 'consulta', label: 'Consulta por Waybill', icon: ScanSearch },
]

export default function Contestacoes() {
  const [params, setParams] = useSearchParams()
  const aba = params.get('tab') || 'base'
  const setAba = (key) => setParams({ tab: key }, { replace: true })

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Contestações de Descontos</h1>
          <div className="page-sub">Registre, acompanhe e consulte contestações de descontos logísticos</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`tab${aba === key ? ' active' : ''}`} onClick={() => setAba(key)}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {aba === 'base'     && <BaseDados />}
      {aba === 'novo'     && <NovoRegistro onSaved={() => setAba('base')} />}
      {aba === 'consulta' && <Consulta />}
    </div>
  )
}

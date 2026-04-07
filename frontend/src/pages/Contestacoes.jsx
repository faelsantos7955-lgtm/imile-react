/**
 * pages/Contestacoes.jsx — Controle de Contestações de Descontos Logísticos
 * Abas: Base de Dados | Novo Registro | Consulta por Waybill
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  Search, Plus, Download, Trash2, ChevronDown, Loader2,
  FileText, Image, AlertCircle, CheckCircle2, Clock, X,
  Database, ClipboardList, ScanSearch,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────
const MOTIVOS = ['Extravio', 'Avaria', 'Desconto Indevido', 'Outros']
const STATUS_LIST = ['Pendente', 'Em Andamento', 'Enviado ao Financeiro', 'Aprovado', 'Reprovado']

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
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: (s) => api.patch(`/api/contestacoes/${id}/status`, { status_analise: s }),
    onSuccess: () => { qc.invalidateQueries(['contestacoes']); onSaved?.() },
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 group"
      >
        <StatusBadge status={current} />
        <ChevronDown size={11} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[190px]">
          {STATUS_LIST.map(s => (
            <button
              key={s}
              onClick={() => { mut.mutate(s); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
              <span className="text-[12px] font-medium text-slate-700">{s}</span>
              {s === current && <CheckCircle2 size={11} className="text-emerald-500 ml-auto" />}
            </button>
          ))}
        </div>
      )}
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
  const [editando, setEditando] = useState(null) // { id, obs, previsao }

  const { data = [], isLoading } = useQuery({
    queryKey: ['contestacoes'],
    queryFn: () => api.get('/api/contestacoes').then(r => r.data),
    refetchInterval: 30_000,
  })

  const mutDel = useMutation({
    mutationFn: (id) => api.delete(`/api/contestacoes/${id}`),
    onSuccess: () => qc.invalidateQueries(['contestacoes']),
  })

  const mutObs = useMutation({
    mutationFn: ({ id, observacao, previsao, status_analise }) =>
      api.patch(`/api/contestacoes/${id}/status`, { status_analise, observacao, previsao }),
    onSuccess: () => { qc.invalidateQueries(['contestacoes']); setEditando(null) },
  })

  const mutArq = useMutation({
    mutationFn: ({ id, tipo }) => api.get(`/api/contestacoes/${id}/arquivo/${tipo}`).then(r => r.data),
    onSuccess: ({ b64, nome }) => downloadB64(b64, nome),
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
        <span className="ml-auto text-[12px] text-slate-400 self-center">{linhas.length} registro{linhas.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              {['Data','Waybill','Motivo','DS','Solicitante','Valor','Faturamento','Evidência','Status','Observação','Previsão',''].map(h => (
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
                      <FileText size={13} /><span className="truncate max-w-[80px]">{r.faturamento_nome}</span>
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
                      <Image size={13} /><span className="truncate max-w-[80px]">{r.evidencia_nome}</span>
                    </button>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <StatusSelect id={r.id} current={r.status_analise} />
                </td>
                <td className="px-3 py-2.5 max-w-[160px]">
                  {editando?.id === r.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        value={editando.obs}
                        onChange={e => setEditando(v => ({ ...v, obs: e.target.value }))}
                        className="border border-slate-200 rounded px-2 py-1 text-[11px] w-full"
                        placeholder="Observação..."
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => mutObs.mutate({
                            id: r.id,
                            observacao: editando.obs,
                            previsao: editando.previsao || null,
                            status_analise: r.status_analise,
                          })}
                          className="flex-1 bg-blue-600 text-white text-[10px] rounded px-2 py-0.5 hover:bg-blue-700"
                        >Salvar</button>
                        <button
                          onClick={() => setEditando(null)}
                          className="text-slate-400 hover:text-slate-600"
                        ><X size={12} /></button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditando({ id: r.id, obs: r.observacao || '', previsao: r.previsao || '' })}
                      className="text-left text-slate-600 hover:text-slate-900 transition-colors group flex items-start gap-1"
                    >
                      <span className="flex-1 truncate">{r.observacao || <span className="text-slate-300 italic">editar...</span>}</span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {editando?.id === r.id ? (
                    <input
                      type="date"
                      value={editando.previsao || ''}
                      onChange={e => setEditando(v => ({ ...v, previsao: e.target.value }))}
                      className="border border-slate-200 rounded px-2 py-1 text-[11px] w-32"
                    />
                  ) : (
                    <span className="text-slate-500">{fmt(r.previsao)}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {isAdmin && (
                    <button
                      onClick={() => window.confirm(`Excluir contestação ${r.waybill}?`) && mutDel.mutate(r.id)}
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
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// ABA 2 — NOVO REGISTRO
// ══════════════════════════════════════════════════════════════
const EMPTY_FORM = {
  data_contestacao: new Date().toISOString().slice(0, 10),
  quem_solicitou: '',
  ds: '',
  waybill: '',
  motivo_desconto: '',
  valor_desconto: '',
  observacao: '',
  previsao: '',
  faturamento_b64: null,
  faturamento_nome: null,
  evidencia_b64: null,
  evidencia_nome: null,
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

  const mut = useMutation({
    mutationFn: (payload) => api.post('/api/contestacoes', payload),
    onSuccess: () => {
      qc.invalidateQueries(['contestacoes'])
      setForm(EMPTY_FORM)
      onSaved?.()
    },
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
    mut.mutate({
      ...form,
      valor_desconto: form.valor_desconto ? parseFloat(form.valor_desconto) : null,
      previsao: form.previsao || null,
    })
  }

  const F = ({ label, children, error, required }) => (
    <div>
      <label className="block text-[12px] font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )

  const inputCls = (err) =>
    `w-full border rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white ${err ? 'border-red-300' : 'border-slate-200'}`

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-[14px] font-bold text-slate-800 mb-5">Novo Registro de Contestação</h3>

        <div className="grid grid-cols-2 gap-4">
          <F label="Data" required error={errors.data_contestacao}>
            <input type="date" value={form.data_contestacao} onChange={e => set('data_contestacao', e.target.value)}
              className={inputCls(errors.data_contestacao)} />
          </F>

          <F label="Quem Solicitou" error={errors.quem_solicitou}>
            <input value={form.quem_solicitou} onChange={e => set('quem_solicitou', e.target.value)}
              placeholder="Nome do solicitante"
              className={inputCls(errors.quem_solicitou)} />
          </F>

          <F label="DS" required error={errors.ds}>
            <input value={form.ds} onChange={e => set('ds', e.target.value.toUpperCase())}
              placeholder="Ex: DS SLV"
              className={inputCls(errors.ds)} />
          </F>

          <F label="Waybill" required error={errors.waybill}>
            <input value={form.waybill} onChange={e => set('waybill', e.target.value)}
              placeholder="Código do pacote"
              className={inputCls(errors.waybill)} />
          </F>

          <F label="Motivo do Desconto" required error={errors.motivo_desconto}>
            <select value={form.motivo_desconto} onChange={e => set('motivo_desconto', e.target.value)}
              className={inputCls(errors.motivo_desconto)}>
              <option value="">Selecionar...</option>
              {MOTIVOS.map(m => <option key={m}>{m}</option>)}
            </select>
          </F>

          <F label="Valor do Desconto (R$)" error={errors.valor_desconto}>
            <input type="number" step="0.01" min="0" value={form.valor_desconto}
              onChange={e => set('valor_desconto', e.target.value)}
              placeholder="0,00"
              className={inputCls(errors.valor_desconto)} />
          </F>

          <div className="col-span-2">
            <F label="Observação" error={errors.observacao}>
              <textarea value={form.observacao} onChange={e => set('observacao', e.target.value)}
                rows={2} placeholder="Detalhes da contestação..."
                className={inputCls(errors.observacao) + ' resize-none'} />
            </F>
          </div>

          <F label="Previsão de Resolução" error={errors.previsao}>
            <input type="date" value={form.previsao} onChange={e => set('previsao', e.target.value)}
              className={inputCls(errors.previsao)} />
          </F>

          {/* Upload Faturamento */}
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <F label="Faturamento / Comprovante" required error={errors.faturamento}>
              <div
                onClick={() => fatRef.current.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors
                  ${errors.faturamento ? 'border-red-300 bg-red-50' : form.faturamento_nome ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
              >
                <FileText size={20} className={form.faturamento_nome ? 'text-emerald-500' : 'text-slate-400'} />
                <span className="text-[12px] text-slate-600 text-center">
                  {form.faturamento_nome || 'Clique para selecionar'}
                </span>
                {form.faturamento_nome && (
                  <button onClick={e => { e.stopPropagation(); set('faturamento_b64', null); set('faturamento_nome', null) }}
                    className="text-[10px] text-red-500 hover:text-red-700">Remover</button>
                )}
              </div>
              <input ref={fatRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                onChange={e => handleFile(e, 'faturamento')} />
            </F>

            <F label="Evidência" required error={errors.evidencia}>
              <div
                onClick={() => evRef.current.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors
                  ${errors.evidencia ? 'border-red-300 bg-red-50' : form.evidencia_nome ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
              >
                <Image size={20} className={form.evidencia_nome ? 'text-emerald-500' : 'text-slate-400'} />
                <span className="text-[12px] text-slate-600 text-center">
                  {form.evidencia_nome || 'Clique para selecionar'}
                </span>
                {form.evidencia_nome && (
                  <button onClick={e => { e.stopPropagation(); set('evidencia_b64', null); set('evidencia_nome', null) }}
                    className="text-[10px] text-red-500 hover:text-red-700">Remover</button>
                )}
              </div>
              <input ref={evRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                onChange={e => handleFile(e, 'evidencia')} />
            </F>
          </div>
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
                  ].map(([label, val]) => (
                    <div key={label} className={label === 'Observação' ? 'col-span-2' : ''}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
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
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'base',     label: 'Base de Dados',     icon: Database },
  { key: 'novo',     label: 'Novo Registro',      icon: ClipboardList },
  { key: 'consulta', label: 'Consulta por Waybill', icon: ScanSearch },
]

export default function Contestacoes() {
  const [aba, setAba] = useState('base')

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[18px] font-bold text-slate-900 leading-none">Contestações de Descontos</h1>
        <p className="text-[12px] text-slate-400 mt-1">Registre, acompanhe e consulte contestações de descontos logísticos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all ${
              aba === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'base'     && <BaseDados />}
      {aba === 'novo'     && <NovoRegistro onSaved={() => setAba('base')} />}
      {aba === 'consulta' && <Consulta />}
    </div>
  )
}

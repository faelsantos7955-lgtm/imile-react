/**
 * Chat.jsx — Interface de atendimento WhatsApp com visual iMile
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  Search, Send, LogOut, RefreshCw, ChevronDown, Check, CheckCheck,
  MessageCircle,
} from 'lucide-react'

// ── Status ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendente:       { label: 'Pendente',       dot: 'bg-slate-400',  badge: 'text-slate-500 bg-slate-100' },
  enviado:        { label: 'Enviado',        dot: 'bg-blue-500',   badge: 'text-blue-600 bg-blue-50' },
  confirmado:     { label: 'Confirmou',      dot: 'bg-green-500',  badge: 'text-green-700 bg-green-50' },
  nao_recebeu:    { label: 'Não recebeu',    dot: 'bg-red-500',    badge: 'text-red-600 bg-red-50' },
  em_atendimento: { label: 'Em atendimento', dot: 'bg-imile-500',  badge: 'text-imile-600 bg-imile-50' },
  encerrado:      { label: 'Encerrado',      dot: 'bg-slate-300',  badge: 'text-slate-400 bg-slate-50' },
  erro:           { label: 'Erro',           dot: 'bg-red-400',    badge: 'text-red-500 bg-red-50' },
}

const sdot  = (s) => STATUS_CONFIG[s]?.dot   || 'bg-slate-400'
const sbadge = (s) => STATUS_CONFIG[s]?.badge || 'text-slate-500 bg-slate-100'
const slabel = (s) => STATUS_CONFIG[s]?.label || s

// ── Helpers ────────────────────────────────────────────────────

function hora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function dataLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function groupByDate(msgs) {
  const groups = []
  let lastDate = null
  for (const m of msgs) {
    const label = dataLabel(m.criado_em)
    if (label !== lastDate) { groups.push({ type: 'date', label }); lastDate = label }
    groups.push({ type: 'msg', ...m })
  }
  return groups
}

function Avatar({ nome, telefone, size = 40 }) {
  const letra = nome?.[0]?.toUpperCase() || telefone?.slice(-2) || '?'
  const colors = ['bg-imile-500', 'bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-rose-500', 'bg-amber-500']
  const idx = ((nome || telefone || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length
  return (
    <div style={{ width: size, height: size, minWidth: size }}
      className={`${colors[idx]} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
      <span style={{ fontSize: size * 0.38 }}>{letra}</span>
    </div>
  )
}

// ── Lista de contatos (esquerda) ───────────────────────────────

function ContactList({ campanhaId, contatoId, onSelect }) {
  const [busca, setBusca]           = useState('')
  const [statusFiltro, setStatus]   = useState('')
  const [page, setPage]             = useState(0)

  const { data: contatos = [], isLoading } = useQuery({
    queryKey: ['chat-contatos', campanhaId, statusFiltro, busca, page],
    queryFn: () => api.get('/api/whatsapp/contatos', {
      params: { campanha_id: campanhaId || 0, status: statusFiltro, busca, page, limit: 60 }
    }).then(r => r.data),
    refetchInterval: 8_000,
  })

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-100">

      {/* Search */}
      <div className="px-3 py-3 space-y-2 border-b border-slate-100">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={busca} onChange={e => { setBusca(e.target.value); setPage(0) }}
            placeholder="Buscar contato…"
            className="w-full pl-8 pr-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-imile-300" />
        </div>

        {/* Filtros de status */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {[['', 'Todas'], ['em_atendimento', 'Atend.'], ['nao_recebeu', 'Não recebeu'], ['confirmado', 'Confirmou'], ['pendente', 'Pendente'], ['enviado', 'Enviado']].map(([v, l]) => (
            <button key={v} onClick={() => { setStatus(v); setPage(0) }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${statusFiltro === v ? 'bg-imile-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Contatos */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-center py-8 text-xs text-slate-400">Carregando…</p>}
        {!isLoading && contatos.length === 0 && (
          <p className="text-center py-12 text-xs text-slate-400">Nenhuma conversa encontrada.</p>
        )}

        {contatos.map(c => (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors text-left ${contatoId === c.id ? 'bg-imile-50 border-l-2 border-l-imile-500' : ''}`}>
            <Avatar nome={c.nome} telefone={c.telefone} size={42} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[12px] font-semibold text-slate-800 truncate">{c.nome || c.telefone}</p>
                <span className="text-[10px] text-slate-400 shrink-0">{hora(c.ultima_mensagem_em || c.enviado_em)}</span>
              </div>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <p className="text-[11px] text-slate-400 truncate flex-1">
                  {c.ultima_mensagem
                    ? (c.ultima_direcao === 'enviado' ? '↗ ' : '↙ ') + c.ultima_mensagem
                    : c.telefone}
                </p>
                <span className={`w-2 h-2 rounded-full shrink-0 ${sdot(c.status)}`} />
              </div>
            </div>
          </button>
        ))}

        {contatos.length >= 60 && (
          <button onClick={() => setPage(p => p + 1)}
            className="w-full py-3 text-xs text-imile-600 hover:bg-slate-50 font-semibold">
            Carregar mais…
          </button>
        )}
      </div>
    </div>
  )
}

// ── Painel de conversa (direita) ──────────────────────────────

function ChatPanel({ contatoId }) {
  const qc = useQueryClient()
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const [mensagem, setMensagem]     = useState('')
  const [showStatus, setShowStatus] = useState(false)

  const { data: dadosContato } = useQuery({
    queryKey: ['chat-msgs', contatoId],
    queryFn: () => api.get(`/api/whatsapp/contatos/${contatoId}/mensagens`).then(r => r.data),
    refetchInterval: 4_000,
    enabled: !!contatoId,
  })

  const contato  = dadosContato?.contato
  const msgs     = dadosContato?.mensagens || []
  const grupos   = groupByDate(msgs)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])
  useEffect(() => { if (contatoId) inputRef.current?.focus() }, [contatoId])

  const mutEnviar = useMutation({
    mutationFn: (texto) => api.post(`/api/whatsapp/contatos/${contatoId}/enviar`, { texto }),
    onSuccess: () => {
      setMensagem('')
      qc.invalidateQueries({ queryKey: ['chat-msgs', contatoId] })
      qc.invalidateQueries({ queryKey: ['chat-contatos'] })
    },
    onError: () => toast.error('Erro ao enviar mensagem.'),
  })

  const mutStatus = useMutation({
    mutationFn: ({ status }) => api.put(`/api/whatsapp/contatos/${contatoId}/status`, { status, observacao: '' }),
    onSuccess: () => {
      setShowStatus(false)
      qc.invalidateQueries({ queryKey: ['chat-msgs', contatoId] })
      qc.invalidateQueries({ queryKey: ['chat-contatos'] })
      toast.success('Status atualizado.')
    },
  })

  const handleSend = () => {
    const txt = mensagem.trim()
    if (!txt || mutEnviar.isPending) return
    mutEnviar.mutate(txt)
  }

  if (!contatoId) return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 gap-3">
      <div className="w-16 h-16 rounded-2xl bg-imile-50 border border-imile-100 flex items-center justify-center">
        <MessageCircle size={28} className="text-imile-400" />
      </div>
      <p className="text-slate-600 text-sm font-semibold">Selecione uma conversa</p>
      <p className="text-slate-400 text-xs">Escolha um contato na lista ao lado</p>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc]" onClick={() => setShowStatus(false)}>

      {/* Header da conversa */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm">
        {contato && <Avatar nome={contato.nome} telefone={contato.telefone} size={38} />}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-slate-800 truncate">{contato?.nome || contato?.telefone}</p>
          <p className="text-[11px] text-slate-400 truncate">{contato?.nome ? contato.telefone : contato?.rastreio}</p>
        </div>

        {/* Status dropdown */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowStatus(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${sbadge(contato?.status)}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sdot(contato?.status)}`} />
            {slabel(contato?.status)}
            <ChevronDown size={11} />
          </button>

          {showStatus && (
            <div className="absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 w-48">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => mutStatus.mutate({ status: k })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors ${contato?.status === k ? 'bg-slate-50' : ''}`}>
                  <span className={`w-2 h-2 rounded-full ${v.dot} shrink-0`} />
                  <span className="text-[12px] text-slate-700">{v.label}</span>
                  {contato?.status === k && <Check size={12} className="ml-auto text-imile-500" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => qc.invalidateQueries({ queryKey: ['chat-msgs', contatoId] })}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {grupos.map((item, i) => {
          if (item.type === 'date') return (
            <div key={i} className="flex justify-center my-4">
              <span className="bg-white border border-slate-200 text-slate-500 text-[10px] font-semibold px-3 py-1 rounded-full shadow-sm">
                {item.label}
              </span>
            </div>
          )

          const sent = item.direcao === 'enviado'
          return (
            <div key={item.id} className={`flex ${sent ? 'justify-end' : 'justify-start'} mb-1`}>
              <div className={`max-w-[65%] px-3.5 py-2 rounded-2xl shadow-sm ${
                sent
                  ? 'bg-imile-500 text-white rounded-tr-sm'
                  : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'
              }`}>
                <p className="text-[13px] whitespace-pre-wrap break-words leading-snug">{item.conteudo}</p>
                <div className={`flex items-center gap-1 mt-1 ${sent ? 'justify-end' : 'justify-start'}`}>
                  <span className={`text-[10px] ${sent ? 'text-white/60' : 'text-slate-400'}`}>{hora(item.criado_em)}</span>
                  {sent && <CheckCheck size={12} className="text-white/70" />}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input de envio */}
      <div className="bg-white border-t border-slate-100 px-3 py-2.5 flex items-end gap-2 shrink-0">
        <textarea ref={inputRef} value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          rows={1} placeholder="Digite uma mensagem… (Enter para enviar)"
          className="flex-1 bg-slate-100 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-imile-300 resize-none max-h-28 overflow-y-auto leading-snug"
          style={{ minHeight: 42 }}
        />
        <button onClick={handleSend} disabled={!mensagem.trim() || mutEnviar.isPending}
          className="w-10 h-10 rounded-xl bg-imile-500 hover:bg-imile-600 disabled:bg-slate-200 flex items-center justify-center transition-colors shrink-0 shadow-sm">
          {mutEnviar.isPending
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Send size={15} className="text-white" />}
        </button>
      </div>
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────

export default function Chat() {
  const { user, logout } = useAuth()
  const [campanhaId, setCampanhaId] = useState(0)
  const [contatoId, setContatoId]   = useState(null)

  const { data: campanhas = [] } = useQuery({
    queryKey: ['chat-campanhas'],
    queryFn: () => api.get('/api/whatsapp/campanhas').then(r => r.data),
    refetchInterval: 30_000,
  })

  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial   = firstName[0]?.toUpperCase() || '?'

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc]">

      {/* Header global — estilo iMile */}
      <header className="h-14 bg-navy-950 px-4 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-imile-500 rounded-lg flex items-center justify-center shrink-0">
            <MessageCircle size={14} className="text-white" />
          </div>
          <div>
            <p className="text-white text-[13px] font-semibold leading-none">Atendimento WhatsApp</p>
            <p className="text-white/30 text-[10px] mt-0.5">iMile Brasil · Portal Operacional</p>
          </div>

          {/* Filtro de campanha */}
          {campanhas.length > 0 && (
            <select value={campanhaId} onChange={e => { setCampanhaId(Number(e.target.value)); setContatoId(null) }}
              className="ml-3 bg-white/10 border border-white/15 text-white/80 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none hover:bg-white/15 transition-colors">
              <option value={0}>Todas as campanhas</option>
              {campanhas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-imile-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {initial}
            </div>
            <span className="text-white/70 text-xs hidden sm:block">{firstName}</span>
          </div>
          <button onClick={logout} title="Sair"
            className="p-1.5 text-white/30 hover:text-red-400 transition-colors">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Corpo — dois painéis */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[300px] shrink-0 flex flex-col overflow-hidden">
          <ContactList campanhaId={campanhaId} contatoId={contatoId} onSelect={setContatoId} />
        </div>
        <ChatPanel contatoId={contatoId} />
      </div>
    </div>
  )
}

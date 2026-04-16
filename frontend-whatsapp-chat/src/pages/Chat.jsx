/**
 * Chat.jsx — Interface estilo WhatsApp Web para atendimento pós-entrega
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import {
  Search, Send, LogOut, RefreshCw, ChevronDown, Check, CheckCheck,
} from 'lucide-react'

// ── Constantes ─────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendente:       { label: 'Pendente',       dot: 'bg-slate-400' },
  enviado:        { label: 'Enviado',        dot: 'bg-blue-500' },
  confirmado:     { label: 'Confirmou',      dot: 'bg-green-500' },
  nao_recebeu:    { label: 'Não recebeu',    dot: 'bg-red-500' },
  em_atendimento: { label: 'Em atendimento', dot: 'bg-yellow-500' },
  encerrado:      { label: 'Encerrado',      dot: 'bg-slate-300' },
  erro:           { label: 'Erro',           dot: 'bg-red-400' },
}

function statusDot(s) {
  return STATUS_CONFIG[s]?.dot || 'bg-slate-400'
}

function statusLabel(s) {
  return STATUS_CONFIG[s]?.label || s
}

// Formata hora HH:MM
function hora(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Formata data para separador
function dataLabel(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(); ontem.setDate(ontem.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Agrupa mensagens por data
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

// Avatar com iniciais
function Avatar({ nome, telefone, size = 40 }) {
  const letra = nome?.[0]?.toUpperCase() || telefone?.slice(-2) || '?'
  const hue = ((nome || telefone || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 6) * 60
  return (
    <div
      style={{ width: size, height: size, minWidth: size, backgroundColor: `hsl(${hue},45%,55%)` }}
      className="rounded-full flex items-center justify-center text-white font-bold"
      aria-label={nome || telefone}
    >
      <span style={{ fontSize: size * 0.38 }}>{letra}</span>
    </div>
  )
}

// ── Painel esquerdo — lista de contatos ───────────────────────

function ContactList({ campanhaId, contatoId, onSelect }) {
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage] = useState(0)

  const { data: contatos = [], isLoading, refetch } = useQuery({
    queryKey: ['chat-contatos', campanhaId, statusFiltro, busca, page],
    queryFn: () => api.get('/api/whatsapp/contatos', {
      params: { campanha_id: campanhaId || 0, status: statusFiltro, busca, page, limit: 60 }
    }).then(r => r.data),
    refetchInterval: 8_000,
  })

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">

      {/* Barra de busca */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(0) }}
            placeholder="Buscar conversas…"
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-full text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/30"
          />
        </div>

        {/* Filtro de status */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {[['', 'Todas'], ['em_atendimento', 'Atend.'], ['nao_recebeu', 'Não recebeu'], ['confirmado', 'Confirmou'], ['pendente', 'Pendente']].map(([v, l]) => (
            <button key={v} onClick={() => { setStatusFiltro(v); setPage(0) }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-colors ${statusFiltro === v ? 'bg-[#25D366] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="text-center py-8 text-xs text-slate-400">Carregando…</p>}
        {!isLoading && contatos.length === 0 && (
          <p className="text-center py-12 text-xs text-slate-400">Nenhuma conversa encontrada.</p>
        )}
        {contatos.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 text-left ${contatoId === c.id ? 'bg-slate-100' : ''}`}
          >
            <Avatar nome={c.nome} telefone={c.telefone} size={44} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{c.nome || c.telefone}</p>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {hora(c.ultima_mensagem_em || c.enviado_em)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className="text-[11px] text-slate-500 truncate flex-1">
                  {c.ultima_mensagem
                    ? (c.ultima_direcao === 'enviado' ? '✓ ' : '') + c.ultima_mensagem
                    : c.telefone}
                </p>
                <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(c.status)}`} />
              </div>
            </div>
          </button>
        ))}

        {/* Mais */}
        {contatos.length >= 60 && (
          <button onClick={() => setPage(p => p + 1)}
            className="w-full py-3 text-xs text-[#075E54] hover:bg-slate-50 font-semibold">
            Carregar mais…
          </button>
        )}
      </div>
    </div>
  )
}

// ── Painel direito — conversa ─────────────────────────────────

function ChatPanel({ contatoId, onClose }) {
  const qc = useQueryClient()
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const [mensagem, setMensagem]     = useState('')
  const [showStatus, setShowStatus] = useState(false)

  // Dados do contato + mensagens
  const { data: dadosContato } = useQuery({
    queryKey: ['chat-msgs', contatoId],
    queryFn: () => api.get(`/api/whatsapp/contatos/${contatoId}/mensagens`).then(r => r.data),
    refetchInterval: 4_000,
    enabled: !!contatoId,
  })

  const contato  = dadosContato?.contato
  const mensagens = dadosContato?.mensagens || []
  const grupos = groupByDate(mensagens)

  // Scroll para o fim ao receber novas mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length])

  // Focar input ao trocar contato
  useEffect(() => {
    inputRef.current?.focus()
  }, [contatoId])

  // Enviar mensagem
  const mutEnviar = useMutation({
    mutationFn: (texto) => api.post(`/api/whatsapp/contatos/${contatoId}/enviar`, { texto }),
    onSuccess: () => {
      setMensagem('')
      qc.invalidateQueries({ queryKey: ['chat-msgs', contatoId] })
      qc.invalidateQueries({ queryKey: ['chat-contatos'] })
    },
    onError: () => toast.error('Erro ao enviar mensagem.'),
  })

  // Alterar status
  const mutStatus = useMutation({
    mutationFn: ({ status, observacao }) =>
      api.put(`/api/whatsapp/contatos/${contatoId}/status`, { status, observacao: observacao || '' }),
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

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (!contatoId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5] gap-3">
        <div className="w-20 h-20 rounded-full bg-slate-200 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="#aaa" className="w-10 h-10">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </div>
        <p className="text-slate-500 text-sm font-medium">Selecione uma conversa</p>
        <p className="text-slate-400 text-xs">Escolha um contato na lista ao lado</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#ECE5DD]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

      {/* Header da conversa */}
      <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3 shrink-0">
        <Avatar nome={contato?.nome} telefone={contato?.telefone} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{contato?.nome || contato?.telefone}</p>
          <p className="text-white/60 text-[11px] truncate">{contato?.nome ? contato.telefone : contato?.rastreio}</p>
        </div>

        {/* Status badge + dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatus(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full ${statusDot(contato?.status)}`} />
            <span className="text-white text-[11px] font-medium">{statusLabel(contato?.status)}</span>
            <ChevronDown size={11} className="text-white/70" />
          </button>

          {showStatus && (
            <div className="absolute right-0 top-9 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 w-44">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => mutStatus.mutate({ status: k })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors ${contato?.status === k ? 'bg-slate-50' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full ${v.dot} shrink-0`} />
                  <span className="text-[12px] text-slate-700">{v.label}</span>
                  {contato?.status === k && <Check size={12} className="ml-auto text-[#25D366]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => qc.invalidateQueries({ queryKey: ['chat-msgs', contatoId] })}
          className="p-1.5 text-white/60 hover:text-white transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" onClick={() => setShowStatus(false)}>
        {grupos.map((item, i) => {
          if (item.type === 'date') return (
            <div key={i} className="flex justify-center my-3">
              <span className="bg-[#E1F3FB] text-[#075E54] text-[11px] font-medium px-3 py-1 rounded-full shadow-sm">
                {item.label}
              </span>
            </div>
          )

          const sent = item.direcao === 'enviado'
          return (
            <div key={item.id} className={`flex ${sent ? 'justify-end' : 'justify-start'} msg-${sent ? 'out' : 'in'}`}>
              <div className={`max-w-[65%] px-3 py-2 rounded-xl shadow-sm relative ${
                sent
                  ? 'bg-[#DCF8C6] rounded-tr-none'
                  : 'bg-white rounded-tl-none'
              }`}>
                <p className="text-[13px] text-slate-800 whitespace-pre-wrap break-words leading-snug">{item.conteudo}</p>
                <div className={`flex items-center gap-1 mt-1 ${sent ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-slate-400">{hora(item.criado_em)}</span>
                  {sent && <CheckCheck size={12} className="text-[#4FC3F7]" />}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input de envio */}
      <div className="bg-[#F0F0F0] px-3 py-2.5 flex items-end gap-2 shrink-0 border-t border-slate-200">
        <textarea
          ref={inputRef}
          value={mensagem}
          onChange={e => setMensagem(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
          placeholder="Digite uma mensagem…"
          className="flex-1 bg-white rounded-2xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none max-h-32 overflow-y-auto leading-snug"
          style={{ minHeight: 42 }}
        />
        <button
          onClick={handleSend}
          disabled={!mensagem.trim() || mutEnviar.isPending}
          className="w-10 h-10 rounded-full bg-[#25D366] hover:bg-[#1da851] disabled:bg-slate-300 flex items-center justify-center transition-colors shrink-0"
        >
          {mutEnviar.isPending
            ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Send size={16} className="text-white" />
          }
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

  return (
    <div className="h-screen flex flex-col overflow-hidden">

      {/* Header global */}
      <div className="bg-[#075E54] px-4 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm">iMile — Atendimento WhatsApp</span>

          {/* Filtro de campanha */}
          {campanhas.length > 0 && (
            <select
              value={campanhaId}
              onChange={e => { setCampanhaId(Number(e.target.value)); setContatoId(null) }}
              className="ml-2 bg-white/10 border border-white/20 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value={0}>Todas as campanhas</option>
              {campanhas.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs hidden sm:block">{user?.email}</span>
          <button onClick={logout} title="Sair"
            className="p-1.5 text-white/50 hover:text-white transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Corpo — dois painéis */}
      <div className="flex flex-1 overflow-hidden">
        {/* Painel esquerdo — 320px fixo */}
        <div className="w-[320px] shrink-0 flex flex-col overflow-hidden">
          <ContactList
            campanhaId={campanhaId}
            contatoId={contatoId}
            onSelect={setContatoId}
          />
        </div>

        {/* Painel direito — flex */}
        <ChatPanel contatoId={contatoId} onClose={() => setContatoId(null)} />
      </div>
    </div>
  )
}

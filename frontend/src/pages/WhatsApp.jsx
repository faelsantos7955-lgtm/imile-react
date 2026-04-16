/**
 * pages/WhatsApp.jsx — CRM de pós-entrega via WhatsApp
 * Campanhas de disparo + gestão de respostas
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import {
  Upload, Play, Trash2, ChevronLeft, MessageCircle,
  CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Search
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────

const STATUS_LABELS = {
  pendente:       { label: 'Pendente',       color: 'text-slate-500  bg-slate-100' },
  enviado:        { label: 'Enviado',        color: 'text-blue-600   bg-blue-50' },
  confirmado:     { label: 'Confirmou',      color: 'text-green-600  bg-green-50' },
  nao_recebeu:    { label: 'Não recebeu',    color: 'text-red-600    bg-red-50' },
  em_atendimento: { label: 'Em atendimento', color: 'text-yellow-700 bg-yellow-50' },
  encerrado:      { label: 'Encerrado',      color: 'text-slate-400  bg-slate-50' },
  erro:           { label: 'Erro',           color: 'text-red-500    bg-red-50' },
  disparando:     { label: 'Disparando…',    color: 'text-imile-600  bg-imile-50' },
  concluido:      { label: 'Concluído',      color: 'text-green-700  bg-green-100' },
}

function StatusBadge({ status }) {
  const s = STATUS_LABELS[status] || { label: status, color: 'text-slate-500 bg-slate-100' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.color}`}>
      {s.label}
    </span>
  )
}

function fmt(n) { return (n ?? 0).toLocaleString('pt-BR') }

// ── Tela de detalhe da campanha ────────────────────────────────

function CampanhaDetalhe({ campanhaId, onVoltar }) {
  const qc = useQueryClient()
  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage] = useState(0)
  const [contatoAtivo, setContatoAtivo] = useState(null)
  const [novoStatus, setNovoStatus] = useState('')
  const [obs, setObs] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['wpp-detalhe', campanhaId, statusFiltro, page],
    queryFn: () => api.get(`/api/whatsapp/campanhas/${campanhaId}`, {
      params: { status: statusFiltro, page, limit: 50 }
    }).then(r => r.data),
    refetchInterval: data?.campanha?.status === 'disparando' ? 5000 : false,
  })

  const { data: msgs } = useQuery({
    queryKey: ['wpp-msgs', contatoAtivo],
    queryFn: () => api.get(`/api/whatsapp/contatos/${contatoAtivo}/mensagens`).then(r => r.data),
    enabled: !!contatoAtivo,
  })

  const mutStatus = useMutation({
    mutationFn: ({ id, status, observacao }) =>
      api.put(`/api/whatsapp/contatos/${id}/status`, { status, observacao }),
    onSuccess: () => { refetch(); setContatoAtivo(null) },
  })

  const mutDisparar = useMutation({
    mutationFn: () => api.post(`/api/whatsapp/campanhas/${campanhaId}/disparar`),
    onSuccess: () => refetch(),
  })

  if (isLoading) return <div className="p-8 text-center text-slate-400 text-sm">Carregando…</div>
  if (!data) return null

  const { campanha, contatos } = data

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVoltar} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft size={16} /> Voltar
        </button>
        <h2 className="text-base font-semibold text-slate-800 flex-1 truncate">{campanha.nome}</h2>
        <StatusBadge status={campanha.status} />
        {campanha.status === 'pendente' && (
          <button
            onClick={() => mutDisparar.mutate()}
            disabled={mutDisparar.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            <Play size={13} /> Disparar
          </button>
        )}
        <button onClick={() => refetch()} className="p-1.5 text-slate-400 hover:text-slate-600">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total',       value: campanha.total,        color: 'text-slate-700' },
          { label: 'Enviados',    value: campanha.enviados,     color: 'text-blue-600' },
          { label: 'Confirmados', value: campanha.confirmados,  color: 'text-green-600' },
          { label: 'Não recebeu', value: campanha.nao_recebidos, color: 'text-red-600' },
          { label: 'Pendentes',   value: campanha.pendentes,    color: 'text-slate-500' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm">
            <p className={`text-xl font-bold ${c.color}`}>{fmt(c.value)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500">Filtrar:</span>
        {['', 'pendente', 'enviado', 'confirmado', 'nao_recebeu', 'em_atendimento', 'encerrado', 'erro'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFiltro(s); setPage(0) }}
            className={`px-2 py-1 rounded-full text-[11px] font-semibold transition-colors ${
              statusFiltro === s
                ? 'bg-imile-600 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {s || 'Todos'}
          </button>
        ))}
      </div>

      {/* Tabela contatos */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Nome', 'Telefone', 'Rastreio', 'Empresa', 'UF', 'Status', 'Enviado em', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {contatos.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Nenhum contato encontrado.</td></tr>
              )}
              {contatos.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 font-medium text-slate-700 max-w-[140px] truncate">{c.nome || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{c.telefone}</td>
                  <td className="px-3 py-2 text-slate-500 font-mono whitespace-nowrap">{c.rastreio}</td>
                  <td className="px-3 py-2 text-slate-500">{c.empresa || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{c.uf || '—'}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                    {c.enviado_em ? new Date(c.enviado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => { setContatoAtivo(c.id); setNovoStatus(c.status); setObs(c.observacao || '') }}
                      className="p-1 text-slate-400 hover:text-imile-600 transition-colors"
                      title="Ver mensagens / alterar status"
                    >
                      <MessageCircle size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação simples */}
        <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            className="text-xs text-slate-500 disabled:opacity-30 hover:text-slate-700"
          >
            ← Anterior
          </button>
          <span className="text-xs text-slate-400">Página {page + 1}</span>
          <button
            disabled={contatos.length < 50}
            onClick={() => setPage(p => p + 1)}
            className="text-xs text-slate-500 disabled:opacity-30 hover:text-slate-700"
          >
            Próxima →
          </button>
        </div>
      </div>

      {/* Modal de mensagens + status */}
      {contatoAtivo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Contato #{contatoAtivo}</p>
              <button onClick={() => setContatoAtivo(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">&times;</button>
            </div>

            {/* Histórico */}
            <div className="p-4 max-h-52 overflow-y-auto space-y-2 bg-slate-50">
              {msgs?.mensagens?.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">Sem mensagens</p>
              )}
              {msgs?.mensagens?.map(m => (
                <div key={m.id} className={`flex ${m.direcao === 'enviado' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`px-3 py-1.5 rounded-xl text-xs max-w-[80%] ${
                    m.direcao === 'enviado'
                      ? 'bg-imile-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}>
                    <p>{m.conteudo}</p>
                    <p className={`text-[10px] mt-0.5 ${m.direcao === 'enviado' ? 'text-imile-200' : 'text-slate-400'}`}>
                      {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Alterar status manual */}
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Alterar status manualmente</label>
                <select
                  value={novoStatus}
                  onChange={e => setNovoStatus(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 bg-white"
                >
                  {Object.entries(STATUS_LABELS).filter(([k]) => !['disparando', 'concluido'].includes(k)).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Observação</label>
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 resize-none"
                  placeholder="Anotação interna…"
                />
              </div>
              <button
                onClick={() => mutStatus.mutate({ id: contatoAtivo, status: novoStatus, observacao: obs })}
                disabled={mutStatus.isPending}
                className="w-full py-2 bg-imile-600 hover:bg-imile-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                {mutStatus.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tela principal (lista de campanhas) ───────────────────────

export default function WhatsApp() {
  const qc = useQueryClient()
  const fileRef = useRef()
  const [nome, setNome] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [campanhaAberta, setCampanhaAberta] = useState(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const { data: campanhas = [], isLoading, refetch } = useQuery({
    queryKey: ['wpp-campanhas'],
    queryFn: () => api.get('/api/whatsapp/campanhas').then(r => r.data),
    refetchInterval: 10_000,
  })

  const mutCriar = useMutation({
    mutationFn: (fd) => api.post('/api/whatsapp/campanhas', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    }),
    onSuccess: (res) => {
      setSucesso(`Campanha criada com ${res.data.total} contatos.`)
      setNome(''); setArquivo(null)
      if (fileRef.current) fileRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['wpp-campanhas'] })
    },
    onError: (e) => setErro(e.response?.data?.detail || 'Erro ao criar campanha.'),
  })

  const mutDeletar = useMutation({
    mutationFn: (id) => api.delete(`/api/whatsapp/campanhas/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wpp-campanhas'] }),
  })

  function handleCriar(e) {
    e.preventDefault()
    setErro(''); setSucesso('')
    if (!nome.trim()) return setErro('Informe o nome da campanha.')
    if (!arquivo) return setErro('Selecione uma planilha.')
    const fd = new FormData()
    fd.append('nome', nome.trim())
    fd.append('file', arquivo)
    mutCriar.mutate(fd)
  }

  if (campanhaAberta) {
    return <CampanhaDetalhe campanhaId={campanhaAberta} onVoltar={() => setCampanhaAberta(null)} />
  }

  const listaFiltrada = campanhas.filter(c =>
    !busca || c.nome?.toLowerCase().includes(busca.toLowerCase())
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-base font-semibold text-slate-800">WhatsApp CRM — Confirmação de Entrega</h2>
        <p className="text-xs text-slate-400 mt-0.5">Suba uma planilha de destinatários e dispare mensagens via WhatsApp Business API.</p>
      </div>

      {/* Formulário de nova campanha */}
      <form onSubmit={handleCriar} className="bg-white border border-slate-100 rounded-xl shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Nova campanha</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Nome da campanha</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="ex.: SP1 — Semana 16"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-imile-300"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Planilha de contatos (.xlsx)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setArquivo(e.target.files[0] || null)}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-imile-50 file:text-imile-700 hover:file:bg-imile-100"
            />
          </div>
        </div>

        {/* Dica de colunas */}
        <p className="text-[11px] text-slate-400">
          Colunas esperadas: <span className="font-mono">Nome do Comprador · Telefone do Comprador · Numero de Rastreio (BR) · Empresa · UF · Data de Envio da acareacao</span>
        </p>

        {erro && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
        {sucesso && <p className="text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">{sucesso}</p>}

        <button
          type="submit"
          disabled={mutCriar.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-imile-600 hover:bg-imile-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
        >
          <Upload size={14} />
          {mutCriar.isPending ? 'Importando…' : 'Importar planilha'}
        </button>
      </form>

      {/* Lista de campanhas */}
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <p className="text-xs font-semibold text-slate-600 flex-1">Campanhas recentes</p>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar…"
              className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 w-40 focus:outline-none focus:ring-2 focus:ring-imile-300"
            />
          </div>
          <button onClick={() => refetch()} className="p-1.5 text-slate-400 hover:text-slate-600">
            <RefreshCw size={14} />
          </button>
        </div>

        {isLoading ? (
          <p className="text-center py-10 text-sm text-slate-400">Carregando…</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="text-center py-10 text-sm text-slate-400">Nenhuma campanha encontrada.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Campanha', 'Total', 'Enviados', 'Confirmados', 'Não recebeu', 'Status', 'Criado em', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 text-[11px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {listaFiltrada.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setCampanhaAberta(c.id)}>
                  <td className="px-3 py-2.5 font-medium text-slate-700 max-w-[180px] truncate">{c.nome}</td>
                  <td className="px-3 py-2.5 text-slate-500">{fmt(c.total)}</td>
                  <td className="px-3 py-2.5 text-blue-600">{fmt(c.enviados)}</td>
                  <td className="px-3 py-2.5 text-green-600">{fmt(c.confirmados)}</td>
                  <td className="px-3 py-2.5 text-red-500">{fmt(c.nao_recebidos)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                    {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        if (confirm('Excluir campanha e todos os contatos?')) {
                          mutDeletar.mutate(c.id)
                        }
                      }}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                      title="Excluir campanha"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

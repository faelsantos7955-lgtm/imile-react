/**
 * pages/Admin.jsx — Painel administrativo completo
 * Permissões granulares por usuário: páginas + ações
 */
import { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { PageHeader, Alert, Card, SectionHeader } from '../components/ui'
import {
  Upload, Users, Settings, CheckCircle, XCircle,
  ShieldOff, ShieldCheck, Loader, Terminal,
  UserCheck, UserX, Edit2, Save, X, Check, History, ChevronLeft, ChevronRight,
  Target, Plus, Trash2, PackageSearch,
} from 'lucide-react'
import BulkUpload from './BulkUpload'

// ── Definição de permissões disponíveis ──────────────────────
export const PAGINAS = [
  { key: 'dashboard',    label: 'Dashboard',      icon: '📊' },
  { key: 'historico',    label: 'Histórico',      icon: '📅' },
  { key: 'comparativos', label: 'Comparativos',   icon: '📈' },
  { key: 'triagem',      label: 'Triagem DC×DS',  icon: '🔀' },
  { key: 'reclamacoes',  label: 'Reclamações',    icon: '📋' },
  { key: 'admin',        label: 'Administração',  icon: '⚙️' },
]

export const ACOES = [
  { key: 'excel',          label: 'Baixar Excel',          icon: '📥' },
  { key: 'bloquear_motorista', label: 'Bloquear Motoristas', icon: '🚫' },
  { key: 'aprovar_acesso', label: 'Aprovar Solicitações',  icon: '✅' },
]

// ── Upload / Processar ────────────────────────────────────────
function UploadPage() {
  return (
    <div>
      <PageHeader icon="📤" title="Upload / Processar" subtitle="Instruções para processar e enviar dados ao portal" />
      <Alert type="info">
        O processamento é feito <strong>localmente</strong> via <code className="bg-blue-100 px-1 rounded">processar.py</code>. Abra o <code className="bg-blue-100 px-1 rounded">PROCESSAR.bat</code> na máquina admin.
      </Alert>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[
          { n: 1, title: 'Dashboard', color: 'blue', files: ['Pasta Recebimento', 'Pasta Out of Delivery', 'Entregas (opcional)', 'Supervisores', 'Metas'], opt: '[1]' },
          { n: 2, title: 'Reclamações', color: 'orange', files: ['Bilhete de Reclamação', 'Consulta Carta de Porte', 'Gestão de Bases (opcional)', 'Delivered (opcional)'], opt: '[2]' },
          { n: 3, title: 'Triagem DC×DS', color: 'emerald', files: ['Pasta Loading Scan(s)', 'Arquivo Bases (BASE, BASE_PAI, SUPERVISOR)'], opt: '[3]' },
        ].map(({ n, title, color, files, opt }) => (
          <Card key={n}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-8 h-8 rounded-full bg-${color}-100 text-${color}-600 flex items-center justify-center font-bold`}>{n}</span>
              <h3 className="font-semibold text-slate-800">{title}</h3>
            </div>
            <ul className="text-sm text-slate-600 space-y-1">
              {files.map(f => <li key={f}>• {f}</li>)}
            </ul>
            <div className={`mt-3 px-2 py-1 bg-${color}-50 rounded text-xs text-${color}-700 font-mono`}>Opção {opt} no menu</div>
          </Card>
        ))}
      </div>
      <SectionHeader title="Como rodar" />
      <Card>
        <ol className="text-sm text-slate-600 space-y-2">
          {['Abra a pasta do processador local', 'Dê duplo clique em PROCESSAR.bat', 'Escolha a opção (1, 2 ou 3)', 'Selecione os arquivos', 'Aguarde a mensagem de sucesso', 'Atualize o portal'].map((s, i) => (
            <li key={i} className="flex gap-2"><span className="font-bold text-slate-800">{i+1}.</span>{s}</li>
          ))}
        </ol>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          ⚠️ Use sempre <strong>Python 3.12</strong>: configure o PROCESSAR.bat com <code>py -3.12 processar.py</code>
        </div>
      </Card>
    </div>
  )
}

// ── Editor de permissões granulares ──────────────────────────
function PermissoesEditor({ paginas, acoes, onChange }) {
  const toggle = (list, key, setList) => {
    const next = list.includes(key) ? list.filter(k => k !== key) : [...list, key]
    setList(next)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Páginas visíveis</p>
        <div className="flex flex-wrap gap-2">
          {PAGINAS.map(p => {
            const ativo = paginas.includes(p.key)
            return (
              <button key={p.key}
                onClick={() => onChange('paginas', paginas.includes(p.key) ? paginas.filter(k => k !== p.key) : [...paginas, p.key])}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  ativo ? 'bg-imile-500 text-white border-imile-500' : 'bg-white text-slate-600 border-slate-200 hover:border-imile-400'
                }`}>
                {ativo && <Check size={11} />}
                {p.icon} {p.label}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Ações permitidas</p>
        <div className="flex flex-wrap gap-2">
          {ACOES.map(a => {
            const ativo = acoes.includes(a.key)
            return (
              <button key={a.key}
                onClick={() => onChange('acoes', acoes.includes(a.key) ? acoes.filter(k => k !== a.key) : [...acoes, a.key])}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  ativo ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400'
                }`}>
                {ativo && <Check size={11} />}
                {a.icon} {a.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Solicitações & Usuários ───────────────────────────────────
function SolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [usuarios, setUsuarios]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState('pendentes')
  const [aprovando, setAprovando]       = useState({})
  const [editando, setEditando]         = useState(null)
  const [editForm, setEditForm]         = useState({})
  const [saving, setSaving]             = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([
        api.get('/api/admin/solicitacoes?status=pendente'),
        api.get('/api/admin/usuarios'),
      ])
      setSolicitacoes(s.data)
      setUsuarios(u.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const iniciarEdicao = (u) => {
    setEditando(u.id)
    setEditForm({
      role:    u.role || 'viewer',
      ativo:   u.ativo !== false,
      paginas: u.paginas || PAGINAS.map(p => p.key), // default: todas
      acoes:   u.acoes   || [],
    })
  }

  const salvar = async (userId) => {
    setSaving(true)
    try {
      await api.put(`/api/admin/usuarios/${userId}`, {
        role:    editForm.role,
        ativo:   editForm.ativo,
        paginas: editForm.paginas,
        acoes:   editForm.acoes,
        bases:   [],
      })
      setEditando(null)
      await carregar()
    } catch { alert('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const aprovar = async (id, role = 'viewer') => {
    setAprovando(p => ({ ...p, [id]: 'aprovando' }))
    try {
      await api.post(`/api/admin/solicitacoes/${id}/aprovar?role=${role}`)
      await carregar()
    } catch { alert('Erro ao aprovar') }
    finally { setAprovando(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  const rejeitar = async (id) => {
    if (!window.confirm('Rejeitar esta solicitação?')) return
    setAprovando(p => ({ ...p, [id]: 'rejeitando' }))
    try {
      await api.post(`/api/admin/solicitacoes/${id}/rejeitar`)
      await carregar()
    } catch { alert('Erro') }
    finally { setAprovando(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  if (loading) return <div className="flex items-center gap-2 text-slate-500 mt-8"><Loader size={16} className="animate-spin" /> Carregando...</div>

  return (
    <div>
      <PageHeader icon="👥" title="Solicitações & Usuários" subtitle="Gerencie acessos e permissões do portal" />

      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {[['pendentes', `Pendentes (${solicitacoes.length})`], ['usuarios', `Usuários (${usuarios.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Pendentes */}
      {tab === 'pendentes' && (
        solicitacoes.length === 0
          ? <Alert type="info">Nenhuma solicitação pendente.</Alert>
          : <div className="space-y-3">
            {solicitacoes.map(sol => (
              <Card key={sol.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-800">{sol.nome}</p>
                    <p className="text-sm text-slate-500">{sol.email}</p>
                    {sol.motivo && <p className="text-sm text-slate-600 mt-1 italic">"{sol.motivo}"</p>}
                    <p className="text-xs text-slate-400 mt-1">{fmtDate(sol.criado_em)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select id={`role-${sol.id}`} defaultValue="viewer"
                      className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white">
                      {['viewer','operador','supervisor','admin'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => aprovar(sol.id, document.getElementById(`role-${sol.id}`)?.value || 'viewer')}
                      disabled={!!aprovando[sol.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                      {aprovando[sol.id] === 'aprovando' ? <Loader size={13} className="animate-spin" /> : <UserCheck size={13} />} Aprovar
                    </button>
                    <button onClick={() => rejeitar(sol.id)} disabled={!!aprovando[sol.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {aprovando[sol.id] === 'rejeitando' ? <Loader size={13} className="animate-spin" /> : <UserX size={13} />} Rejeitar
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
      )}

      {/* Usuários */}
      {tab === 'usuarios' && (
        <div className="space-y-3">
          {usuarios.map(u => (
            <Card key={u.id} className={editando === u.id ? 'border-imile-400 border-2' : ''}>
              {editando === u.id ? (
                /* Modo edição expandido */
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-semibold text-slate-800">{u.nome || '—'}</p>
                      <p className="text-sm text-slate-500">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={editForm.role}
                        onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                        className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg">
                        {['viewer','operador','supervisor','admin'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <select value={editForm.ativo ? 'true' : 'false'}
                        onChange={e => setEditForm(p => ({ ...p, ativo: e.target.value === 'true' }))}
                        className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg">
                        <option value="true">Ativo</option>
                        <option value="false">Inativo</option>
                      </select>
                    </div>
                  </div>

                  <PermissoesEditor
                    paginas={editForm.paginas || []}
                    acoes={editForm.acoes || []}
                    onChange={(field, val) => setEditForm(p => ({ ...p, [field]: val }))}
                  />

                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                    <button onClick={() => salvar(u.id)} disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm hover:bg-imile-600 disabled:opacity-50">
                      {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />} Salvar permissões
                    </button>
                    <button onClick={() => setEditando(null)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200">
                      <X size={13} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Modo visualização */
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="font-medium text-slate-800">{u.nome || '—'}</p>
                      <p className="text-sm text-slate-500">{u.email}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.role}
                    </span>
                    {u.ativo
                      ? <span className="text-emerald-600 flex items-center gap-1 text-xs"><CheckCircle size={12} /> Ativo</span>
                      : <span className="text-red-500 flex items-center gap-1 text-xs"><XCircle size={12} /> Inativo</span>
                    }
                    {/* Preview de páginas */}
                    <div className="flex gap-1 flex-wrap">
                      {(u.paginas || PAGINAS.map(p => p.key)).map(pk => {
                        const pg = PAGINAS.find(p => p.key === pk)
                        return pg ? (
                          <span key={pk} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                            {pg.icon}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                  <button onClick={() => iniciarEdicao(u)}
                    className="p-2 text-slate-400 hover:text-imile-500 hover:bg-slate-100 rounded-lg transition-colors">
                    <Edit2 size={15} />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Configurações ─────────────────────────────────────────────
function ConfigPage() {
  const [motoristas, setMotoristas] = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState({})
  const [novoId, setNovoId]         = useState('')
  const [novoNome, setNovoNome]     = useState('')
  const [novoMotivo, setNovoMotivo] = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try { const r = await api.get('/api/reclamacoes/motoristas'); setMotoristas(r.data || []) }
    finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const toggle = async (m) => {
    setSaving(p => ({ ...p, [m.id_motorista]: true }))
    try {
      await api.post('/api/admin/motoristas', { id_motorista: m.id_motorista, nome_motorista: m.nome_motorista || '', ativo: !m.ativo, motivo: m.motivo || '' })
      await carregar()
    } catch { alert('Erro') }
    finally { setSaving(p => { const n = { ...p }; delete n[m.id_motorista]; return n }) }
  }

  const adicionar = async () => {
    if (!novoId.trim()) return
    setAdicionando(true)
    try {
      await api.post('/api/admin/motoristas', { id_motorista: novoId.trim(), nome_motorista: novoNome.trim(), ativo: false, motivo: novoMotivo.trim() || 'Bloqueado manualmente' })
      setNovoId(''); setNovoNome(''); setNovoMotivo('')
      await carregar()
    } catch { alert('Erro') }
    finally { setAdicionando(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-slate-500 mt-8"><Loader size={16} className="animate-spin" /> Carregando...</div>

  const inativos = motoristas.filter(m => !m.ativo)
  const ativos   = motoristas.filter(m => m.ativo)

  return (
    <div>
      <PageHeader icon="⚙️" title="Configurações" subtitle="Gerenciamento de motoristas bloqueados" />

      <SectionHeader title="Bloquear Motorista Manualmente" />
      <Card>
        <p className="text-sm text-slate-500 mb-4">Motoristas bloqueados são removidos do ranking de reclamações e substituídos pelo próximo da fila.</p>
        <div className="flex gap-3 flex-wrap">
          <input value={novoId}     onChange={e => setNovoId(e.target.value)}     placeholder="ID do Motorista *" className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[140px]" />
          <input value={novoNome}   onChange={e => setNovoNome(e.target.value)}   placeholder="Nome (opcional)"  className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[140px]" />
          <input value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)} placeholder="Motivo (opcional)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[140px]" />
          <button onClick={adicionar} disabled={adicionando || !novoId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {adicionando ? <Loader size={13} className="animate-spin" /> : <ShieldOff size={13} />} Bloquear
          </button>
        </div>
      </Card>

      {inativos.length > 0 && (
        <>
          <SectionHeader title={`Bloqueados (${inativos.length})`} />
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr className="text-xs uppercase text-slate-500">
                <th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Nome</th>
                <th className="px-4 py-3 text-left">Motivo</th><th className="px-4 py-3 text-center">Ação</th>
              </tr></thead>
              <tbody>
                {inativos.map(m => (
                  <tr key={m.id_motorista} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{m.id_motorista}</td>
                    <td className="px-4 py-3">{m.nome_motorista || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.motivo || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggle(m)} disabled={saving[m.id_motorista]}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-lg hover:bg-emerald-100 mx-auto">
                        {saving[m.id_motorista] ? <Loader size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Reativar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {ativos.length > 0 && (
        <>
          <SectionHeader title={`Ativos no Sistema (${ativos.length})`} />
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr className="text-xs uppercase text-slate-500">
                <th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Nome</th><th className="px-4 py-3 text-center">Ação</th>
              </tr></thead>
              <tbody>
                {ativos.map(m => (
                  <tr key={m.id_motorista} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{m.id_motorista}</td>
                    <td className="px-4 py-3">{m.nome_motorista || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggle(m)} disabled={saving[m.id_motorista]}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100 mx-auto">
                        {saving[m.id_motorista] ? <Loader size={11} className="animate-spin" /> : <ShieldOff size={11} />} Bloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {motoristas.length === 0 && <Alert type="info">Nenhum motorista cadastrado ainda.</Alert>}
    </div>
  )
}

// ── Audit Log ─────────────────────────────────────────────────
const ACOES_LABEL = {
  upload_deletado:         { label: 'Upload excluído',       cor: 'text-red-600 bg-red-50' },
  permissoes_atualizadas:  { label: 'Permissões alteradas',  cor: 'text-blue-600 bg-blue-50' },
  solicitacao_aprovada:    { label: 'Acesso aprovado',       cor: 'text-emerald-600 bg-emerald-50' },
  solicitacao_rejeitada:   { label: 'Acesso rejeitado',      cor: 'text-orange-600 bg-orange-50' },
}

function AuditLogPage() {
  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroEmail, setFiltroEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [page, setPage] = useState(0)
  const limit = 25

  const params = new URLSearchParams({ limit, offset: page * limit })
  if (filtroAcao)  params.set('acao', filtroAcao)
  if (filtroEmail) params.set('email', filtroEmail)

  const { data: registros = [], isLoading, isFetching } = useQuery({
    queryKey: ['audit-log', filtroAcao, filtroEmail, page],
    queryFn: () => api.get(`/api/admin/audit-log?${params}`).then(r => r.data),
  })

  const fmtData = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div>
      <PageHeader icon="📋" title="Histórico de Ações" subtitle="Registro de todas as ações administrativas" />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filtroAcao}
          onChange={e => { setFiltroAcao(e.target.value); setPage(0) }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
        >
          <option value="">Todas as ações</option>
          {Object.entries(ACOES_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <div className="flex gap-2 flex-1 min-w-[200px] max-w-xs">
          <input
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setFiltroEmail(emailInput); setPage(0) } }}
            placeholder="Filtrar por e-mail..."
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1"
          />
          {filtroEmail && (
            <button onClick={() => { setFiltroEmail(''); setEmailInput(''); setPage(0) }}
              className="px-2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
          <button onClick={() => { setFiltroEmail(emailInput); setPage(0) }}
            className="px-3 py-2 bg-imile-500 text-white rounded-lg text-sm hover:bg-imile-600">
            Buscar
          </button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
            <Loader size={16} className="animate-spin" /> Carregando...
          </div>
        ) : registros.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-12">Nenhum registro encontrado</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white text-xs">
                  <th className="px-4 py-3 text-left">Data/Hora</th>
                  <th className="px-4 py-3 text-left">Ação</th>
                  <th className="px-4 py-3 text-left">Alvo</th>
                  <th className="px-4 py-3 text-left">Executado por</th>
                  <th className="px-4 py-3 text-left">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => {
                  const meta = ACOES_LABEL[r.acao] || { label: r.acao, cor: 'text-slate-600 bg-slate-100' }
                  return (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap font-mono">
                        {fmtData(r.criado_em)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cor}`}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-mono">{r.alvo}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 truncate max-w-[180px]">{r.email}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px]">
                        {r.detalhe && Object.keys(r.detalhe).length > 0
                          ? Object.entries(r.detalhe).map(([k, v]) => (
                              <span key={k} className="inline-block mr-2">
                                <span className="text-slate-400">{k}:</span>{' '}
                                <span className="font-medium">{JSON.stringify(v)}</span>
                              </span>
                            ))
                          : '—'
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
        <span>{isFetching ? 'Atualizando...' : `${registros.length} registros`}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
            <ChevronLeft size={16} />
          </button>
          <span className="px-3 py-1 text-xs font-medium">Pág. {page + 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={registros.length < limit}
            className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Metas por DS ──────────────────────────────────────────────
function MetasPage() {
  const qc = useQueryClient()
  const { data: metas = [], isLoading } = useQuery({
    queryKey: ['admin-metas'],
    queryFn: () => api.get('/api/admin/metas').then(r => r.data),
  })

  const [edits, setEdits]   = useState({})   // ds → { meta_expedicao, meta_entrega, regiao }
  const [novoDs, setNovoDs] = useState('')
  const [novoExp, setNovoExp]  = useState('90')
  const [novoEnt, setNovoEnt]  = useState('90')
  const [novoReg, setNovoReg]  = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const mutation = useMutation({
    mutationFn: (rows) => api.put('/api/admin/metas', rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-metas'] }),
  })

  const delMutation = useMutation({
    mutationFn: (ds) => api.delete(`/api/admin/metas/${encodeURIComponent(ds)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-metas'] }),
  })

  const setEdit = (ds, field, val) =>
    setEdits(p => ({ ...p, [ds]: { ...(p[ds] || {}), [field]: val } }))

  const saveRow = (m) => {
    const e = edits[m.ds] || {}
    mutation.mutate([{
      ds:             m.ds,
      meta_expedicao: parseFloat(e.meta_expedicao ?? m.meta_expedicao) / 100,
      meta_entrega:   parseFloat(e.meta_entrega   ?? m.meta_entrega)   / 100,
      regiao:         e.regiao ?? m.regiao ?? '',
    }])
    setEdits(p => { const n = { ...p }; delete n[m.ds]; return n })
  }

  const adicionar = async () => {
    if (!novoDs.trim()) return
    setAdicionando(true)
    try {
      await mutation.mutateAsync([{
        ds:             novoDs.trim().toUpperCase(),
        meta_expedicao: parseFloat(novoExp) / 100,
        meta_entrega:   parseFloat(novoEnt) / 100,
        regiao:         novoReg.trim(),
      }])
      setNovoDs(''); setNovoExp('90'); setNovoEnt('90'); setNovoReg('')
    } finally { setAdicionando(false) }
  }

  const pct = (v) => `${Math.round((v ?? 0.9) * 100)}%`

  if (isLoading) return (
    <div className="flex items-center gap-2 text-slate-500 mt-8">
      <Loader size={16} className="animate-spin" /> Carregando...
    </div>
  )

  return (
    <div>
      <PageHeader icon="🎯" title="Metas por DS" subtitle="Defina as metas de expedição e entrega por estação de destino" />

      <SectionHeader title="Adicionar / Atualizar Meta" />
      <Card>
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">DS *</label>
            <input value={novoDs} onChange={e => setNovoDs(e.target.value.toUpperCase())}
              placeholder="Ex: DS-001" className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-36" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Meta Expedição (%)</label>
            <input type="number" min="0" max="100" value={novoExp} onChange={e => setNovoExp(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-32" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Meta Entrega (%)</label>
            <input type="number" min="0" max="100" value={novoEnt} onChange={e => setNovoEnt(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-32" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">Região</label>
            <input value={novoReg} onChange={e => setNovoReg(e.target.value)}
              placeholder="SP, RJ..." className="px-3 py-2 border border-slate-200 rounded-lg text-sm w-28" />
          </div>
          <button onClick={adicionar} disabled={adicionando || !novoDs.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm hover:bg-imile-600 disabled:opacity-50">
            {adicionando ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />} Salvar
          </button>
        </div>
      </Card>

      {metas.length === 0 ? (
        <Alert type="info">Nenhuma meta cadastrada ainda. Adicione a primeira acima.</Alert>
      ) : (
        <>
          <SectionHeader title={`Metas cadastradas (${metas.length})`} />
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs">
                    <th className="px-4 py-3 text-left">DS</th>
                    <th className="px-4 py-3 text-left">Região</th>
                    <th className="px-4 py-3 text-center">Meta Expedição</th>
                    <th className="px-4 py-3 text-center">Meta Entrega</th>
                    <th className="px-4 py-3 text-left">Atualizado por</th>
                    <th className="px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {metas.map(m => {
                    const e = edits[m.ds] || {}
                    const dirty = !!edits[m.ds]
                    return (
                      <tr key={m.ds} className={`border-t border-slate-100 hover:bg-slate-50 ${dirty ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{m.ds}</td>
                        <td className="px-4 py-3">
                          <input value={e.regiao ?? (m.regiao || '')} onChange={ev => setEdit(m.ds, 'regiao', ev.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded text-xs w-20 bg-white" />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min="0" max="100" step="1"
                              value={e.meta_expedicao ?? Math.round((m.meta_expedicao ?? 0.9) * 100)}
                              onChange={ev => setEdit(m.ds, 'meta_expedicao', ev.target.value)}
                              className="px-2 py-1 border border-slate-200 rounded text-xs w-16 text-center bg-white" />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" min="0" max="100" step="1"
                              value={e.meta_entrega ?? Math.round((m.meta_entrega ?? 0.9) * 100)}
                              onChange={ev => setEdit(m.ds, 'meta_entrega', ev.target.value)}
                              className="px-2 py-1 border border-slate-200 rounded text-xs w-16 text-center bg-white" />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 truncate max-w-[140px]">{m.atualizado_por || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {dirty && (
                              <button onClick={() => saveRow(m)} disabled={mutation.isPending}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                                {mutation.isPending ? <Loader size={11} className="animate-spin" /> : <Save size={11} />} Salvar
                              </button>
                            )}
                            <button onClick={() => { if (window.confirm(`Remover meta de ${m.ds}?`)) delMutation.mutate(m.ds) }}
                              disabled={delMutation.isPending}
                              className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}


// ── Admin root ────────────────────────────────────────────────
export default function Admin() {
  const tabClass = isActive =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive ? 'bg-imile-500 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
    }`

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6 bg-white border border-slate-200 p-1.5 rounded-xl w-fit">
        <NavLink to="/admin" end className={({ isActive }) => tabClass(isActive)}>
          <Upload size={15} /> Upload / Processar
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => tabClass(isActive)}>
          <Users size={15} /> Solicitações
        </NavLink>
        <NavLink to="/admin/config" className={({ isActive }) => tabClass(isActive)}>
          <Settings size={15} /> Configurações
        </NavLink>
        <NavLink to="/admin/auditlog" className={({ isActive }) => tabClass(isActive)}>
          <History size={15} /> Histórico
        </NavLink>
        <NavLink to="/admin/metas" className={({ isActive }) => tabClass(isActive)}>
          <Target size={15} /> Metas por DS
        </NavLink>
        <NavLink to="/admin/lote" className={({ isActive }) => tabClass(isActive)}>
          <PackageSearch size={15} /> Carga em Lote
        </NavLink>
      </div>

      <Routes>
        <Route index element={<UploadPage />} />
        <Route path="users" element={<SolicitacoesPage />} />
        <Route path="config" element={<ConfigPage />} />
        <Route path="auditlog" element={<AuditLogPage />} />
        <Route path="metas" element={<MetasPage />} />
        <Route path="lote" element={<BulkUpload />} />
      </Routes>
    </div>
  )
}

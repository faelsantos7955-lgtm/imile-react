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
  ShieldOff, ShieldCheck, Loader,
  UserCheck, UserX, Edit2, Save, X, Check, History, ChevronLeft, ChevronRight,
  Target, Plus, Trash2, PackageSearch, Search, ChevronDown, Mail,
} from 'lucide-react'
import BulkUpload from './BulkUpload'

// ── Definição de permissões disponíveis ──────────────────────
export const PAGINAS = [
  { key: 'dashboard',     label: 'Dashboard',      icon: '📊' },
  { key: 'historico',     label: 'Histórico',      icon: '📅' },
  { key: 'comparativos',  label: 'Comparativos',   icon: '📈' },
  { key: 'triagem',       label: 'Triagem DC×DS',  icon: '🔀' },
  { key: 'reclamacoes',   label: 'Reclamações',    icon: '📋' },
  { key: 'backlog',       label: 'Backlog SLA',    icon: '📦' },
  { key: 'monitoramento', label: 'Monitoramento',  icon: '🔍' },
  { key: 'admin',         label: 'Administração',  icon: '⚙️' },
]

export const ACOES = [
  { key: 'excel',               label: 'Baixar Excel',         icon: '📥' },
  { key: 'bloquear_motorista',  label: 'Bloquear Motoristas',  icon: '🚫' },
  { key: 'aprovar_acesso',      label: 'Aprovar Solicitações', icon: '✅' },
]

const PERFIS = [
  {
    key: 'basico', label: 'Básico', desc: 'Somente Dashboard e Histórico',
    cor: 'border-slate-300 bg-slate-50 text-slate-700', dot: 'bg-slate-400',
    paginas: ['dashboard', 'historico'], acoes: [], role: 'viewer',
  },
  {
    key: 'operacional', label: 'Operacional', desc: 'Operações diárias + Excel',
    cor: 'border-blue-300 bg-blue-50 text-blue-700', dot: 'bg-blue-500',
    paginas: ['dashboard', 'historico', 'reclamacoes', 'backlog', 'monitoramento'], acoes: ['excel'], role: 'operador',
  },
  {
    key: 'supervisao', label: 'Supervisão', desc: 'Acesso completo exceto admin',
    cor: 'border-amber-300 bg-amber-50 text-amber-700', dot: 'bg-amber-500',
    paginas: ['dashboard', 'historico', 'comparativos', 'triagem', 'reclamacoes', 'backlog', 'monitoramento'], acoes: ['excel'], role: 'supervisor',
  },
  {
    key: 'admin', label: 'Administrador', desc: 'Acesso total ao sistema',
    cor: 'border-red-300 bg-red-50 text-red-700', dot: 'bg-red-500',
    paginas: PAGINAS.map(p => p.key), acoes: ACOES.map(a => a.key), role: 'admin',
  },
]

const ROLE_COR = {
  admin:      'bg-red-100 text-red-700',
  supervisor: 'bg-blue-100 text-blue-700',
  operador:   'bg-amber-100 text-amber-700',
  viewer:     'bg-slate-100 text-slate-600',
}

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
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase text-slate-500">Páginas visíveis</p>
          <div className="flex gap-2">
            <button onClick={() => onChange('paginas', PAGINAS.map(p => p.key))}
              className="text-[10px] text-blue-600 hover:underline">Todas</button>
            <button onClick={() => onChange('paginas', [])}
              className="text-[10px] text-slate-400 hover:underline">Limpar</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PAGINAS.map(p => {
            const ativo = paginas.includes(p.key)
            return (
              <button key={p.key}
                onClick={() => onChange('paginas', ativo ? paginas.filter(k => k !== p.key) : [...paginas, p.key])}
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
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase text-slate-500">Ações permitidas</p>
          <div className="flex gap-2">
            <button onClick={() => onChange('acoes', ACOES.map(a => a.key))}
              className="text-[10px] text-blue-600 hover:underline">Todas</button>
            <button onClick={() => onChange('acoes', [])}
              className="text-[10px] text-slate-400 hover:underline">Limpar</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACOES.map(a => {
            const ativo = acoes.includes(a.key)
            return (
              <button key={a.key}
                onClick={() => onChange('acoes', ativo ? acoes.filter(k => k !== a.key) : [...acoes, a.key])}
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

// ── Modal de aprovação ────────────────────────────────────────
function ModalAprovar({ sol, onClose, onConfirm, loading }) {
  const [perfilKey, setPerfilKey] = useState('operacional')
  const [form, setForm] = useState(() => {
    const p = PERFIS.find(p => p.key === 'operacional')
    return { role: p.role, paginas: [...p.paginas], acoes: [...p.acoes] }
  })
  const [showCustom, setShowCustom] = useState(false)

  const selecionarPerfil = (key) => {
    const p = PERFIS.find(p => p.key === key)
    setPerfilKey(key)
    setForm({ role: p.role, paginas: [...p.paginas], acoes: [...p.acoes] })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-[15px]">Aprovar Acesso</p>
            <p className="text-slate-400 text-[12px] mt-0.5">Defina as permissões antes de confirmar</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Solicitante */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="font-semibold text-slate-800">{sol.nome}</p>
            <p className="text-sm text-slate-500">{sol.email}</p>
            {sol.motivo && <p className="text-sm text-slate-600 mt-1 italic">"{sol.motivo}"</p>}
          </div>

          {/* Perfis */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Perfil de acesso</p>
            <div className="grid grid-cols-2 gap-2">
              {PERFIS.map(p => (
                <button key={p.key} onClick={() => selecionarPerfil(p.key)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    perfilKey === p.key ? p.cor + ' border-current' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                    <span className="font-semibold text-[13px]">{p.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 ml-4">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Personalizar */}
          <button onClick={() => setShowCustom(v => !v)}
            className="flex items-center gap-1.5 text-[12px] text-slate-500 hover:text-slate-700">
            <ChevronDown size={13} className={`transition-transform ${showCustom ? 'rotate-180' : ''}`} />
            Personalizar permissões
          </button>
          {showCustom && (
            <PermissoesEditor
              paginas={form.paginas} acoes={form.acoes}
              onChange={(field, val) => setForm(p => ({ ...p, [field]: val }))}
            />
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[13px] font-medium hover:bg-slate-200">
              Cancelar
            </button>
            <button onClick={() => onConfirm(form)} disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-xl text-[13px] font-semibold hover:bg-emerald-700 disabled:opacity-60">
              {loading ? <Loader size={14} className="animate-spin" /> : <UserCheck size={14} />}
              Confirmar aprovação
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Drawer lateral de permissões ──────────────────────────────
function DrawerPermissoes({ usuario, onClose, onSaved }) {
  const [form, setForm] = useState({
    role:    usuario.role    || 'viewer',
    ativo:   usuario.ativo  !== false,
    paginas: usuario.paginas || PAGINAS.map(p => p.key),
    acoes:   usuario.acoes  || [],
  })
  const [saving, setSaving] = useState(false)

  const aplicarPerfil = (key) => {
    const p = PERFIS.find(p => p.key === key)
    setForm(prev => ({ ...prev, role: p.role, paginas: [...p.paginas], acoes: [...p.acoes] }))
  }

  const salvar = async () => {
    setSaving(true)
    try {
      await api.put(`/api/admin/usuarios/${usuario.id}`, { ...form, bases: [] })
      onSaved()
      onClose()
    } catch { alert('Erro ao salvar') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <p className="text-white font-bold text-[14px]">{usuario.nome || '—'}</p>
            <p className="text-slate-400 text-[12px]">{usuario.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-300">
                {['viewer','operador','supervisor','admin'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Status</label>
              <button onClick={() => setForm(p => ({ ...p, ativo: !p.ativo }))}
                className={`w-full px-3 py-2 text-[13px] font-semibold rounded-lg border transition-colors ${
                  form.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-red-50 text-red-600 border-red-300'
                }`}>
                {form.ativo ? '● Ativo' : '○ Inativo'}
              </button>
            </div>
          </div>

          {/* Perfis rápidos */}
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase mb-2">Aplicar perfil</p>
            <div className="grid grid-cols-2 gap-2">
              {PERFIS.map(p => (
                <button key={p.key} onClick={() => aplicarPerfil(p.key)}
                  className={`text-left px-3 py-2 rounded-lg border text-[12px] font-medium transition-colors hover:opacity-90 ${p.cor}`}>
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${p.dot}`} />
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Editor granular */}
          <PermissoesEditor
            paginas={form.paginas} acoes={form.acoes}
            onChange={(field, val) => setForm(p => ({ ...p, [field]: val }))}
          />
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[13px] font-medium hover:bg-slate-200">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-imile-500 text-white rounded-xl text-[13px] font-semibold hover:bg-imile-600 disabled:opacity-60">
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </>
  )
}

// ── Solicitações & Usuários ───────────────────────────────────
function SolicitacoesPage() {
  const qc = useQueryClient()
  const [tab, setTab]           = useState('pendentes')
  const [busca, setBusca]       = useState('')
  const [modalSol, setModalSol] = useState(null)
  const [drawerUser, setDrawerUser] = useState(null)
  const [aprovando, setAprovando]   = useState(false)
  const [rejeitando, setRejeitando] = useState({})
  const [reenviando, setReenviando] = useState({})

  const { data: solicitacoes = [], isLoading: loadingSol } = useQuery({
    queryKey: ['solicitacoes'],
    queryFn: () => api.get('/api/admin/solicitacoes?status=pendente').then(r => r.data),
  })

  const { data: usuarios = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['usuarios-admin'],
    queryFn: () => api.get('/api/admin/usuarios').then(r => r.data),
  })

  const aprovar = async ({ role, paginas, acoes }) => {
    setAprovando(true)
    try {
      await api.post(`/api/admin/solicitacoes/${modalSol.id}/aprovar?role=${role}`)
      const users = await api.get('/api/admin/usuarios').then(r => r.data)
      const novo = users.find(u => u.email === modalSol.email)
      if (novo) {
        await api.put(`/api/admin/usuarios/${novo.id}`, { role, paginas, acoes, bases: [], ativo: true })
      }
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['usuarios-admin'] })
      setModalSol(null)
    } catch (e) {
      const msg = e.code === 'ECONNABORTED'
        ? 'O servidor demorou para responder. Aguarde alguns segundos e tente novamente (o servidor pode estar acordando).'
        : 'Erro ao aprovar: ' + (e.response?.data?.detail || e.message)
      alert(msg)
    } finally { setAprovando(false) }
  }

  const reenviarConvite = async (u) => {
    setReenviando(p => ({ ...p, [u.id]: true }))
    try {
      await api.post(`/api/admin/usuarios/${u.id}/reenviar-convite`)
      alert(`Convite reenviado para ${u.email}`)
    } catch (e) {
      alert('Erro ao reenviar: ' + (e.response?.data?.detail || e.message))
    } finally {
      setReenviando(p => { const n = { ...p }; delete n[u.id]; return n })
    }
  }

  const rejeitar = async (id) => {
    if (!window.confirm('Rejeitar esta solicitação?')) return
    setRejeitando(p => ({ ...p, [id]: true }))
    try {
      await api.post(`/api/admin/solicitacoes/${id}/rejeitar`)
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
    } catch { alert('Erro') }
    finally { setRejeitando(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
  const usuariosFiltrados = usuarios.filter(u => {
    if (!busca.trim()) return true
    const q = busca.toLowerCase()
    return u.nome?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q)
  })

  if (loadingSol || loadingUsers) return (
    <div className="flex items-center gap-2 text-slate-500 mt-8">
      <Loader size={16} className="animate-spin" /> Carregando...
    </div>
  )

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
                      <button onClick={() => setModalSol(sol)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
                        <UserCheck size={13} /> Aprovar
                      </button>
                      <button onClick={() => rejeitar(sol.id)} disabled={rejeitando[sol.id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50">
                        {rejeitando[sol.id] ? <Loader size={13} className="animate-spin" /> : <UserX size={13} />} Rejeitar
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
      )}

      {/* Usuários */}
      {tab === 'usuarios' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, e-mail ou role..."
                className="pl-8 pr-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white w-72" />
            </div>
            <span className="text-[12px] text-slate-400">{usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}</span>
          </div>

          <Card className="p-0 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Páginas</th>
                  <th className="px-4 py-3 text-center">Editar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {usuariosFiltrados.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nenhum usuário encontrado</td></tr>
                )}
                {usuariosFiltrados.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{u.nome || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-[12px]">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COR[u.role] || 'bg-slate-100 text-slate-600'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {u.ativo
                        ? <span className="text-emerald-600 flex items-center gap-1 text-[12px]"><CheckCircle size={12} /> Ativo</span>
                        : <span className="text-red-500 flex items-center gap-1 text-[12px]"><XCircle size={12} /> Inativo</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(u.paginas || PAGINAS.map(p => p.key)).map(pk => {
                          const pg = PAGINAS.find(p => p.key === pk)
                          return pg ? (
                            <span key={pk} title={pg.label} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                              {pg.icon}
                            </span>
                          ) : null
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => reenviarConvite(u)}
                          disabled={reenviando[u.id]}
                          className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
                          title="Reenviar convite por e-mail">
                          {reenviando[u.id] ? <Loader size={14} className="animate-spin" /> : <Mail size={14} />}
                        </button>
                        <button onClick={() => setDrawerUser(u)}
                          className="p-1.5 text-slate-400 hover:text-imile-500 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar permissões">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {modalSol && (
        <ModalAprovar sol={modalSol} onClose={() => setModalSol(null)} onConfirm={aprovar} loading={aprovando} />
      )}
      {drawerUser && (
        <DrawerPermissoes
          usuario={drawerUser}
          onClose={() => setDrawerUser(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['usuarios-admin'] })}
        />
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

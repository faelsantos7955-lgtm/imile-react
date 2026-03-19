/**
 * pages/Admin.jsx — Painel administrativo completo
 * Sub-páginas: Upload/Processar, Solicitações, Configurações
 */
import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { PageHeader, Alert, Card, SectionHeader } from '../components/ui'
import {
  Upload, Users, Settings, CheckCircle, XCircle,
  ShieldOff, ShieldCheck, Loader, Terminal,
  RefreshCw, UserCheck, UserX, Edit2, Save, X
} from 'lucide-react'

// ── Upload / Processar ────────────────────────────────────────
function UploadPage() {
  return (
    <div>
      <PageHeader icon="📤" title="Upload / Processar" subtitle="Instruções para processar e enviar dados ao portal" />

      <Alert type="info">
        O processamento de arquivos é feito <strong>localmente</strong> via o script <code className="bg-blue-100 px-1 rounded">processar.py</code>. Abra o <code className="bg-blue-100 px-1 rounded">PROCESSAR.bat</code> na máquina admin para subir novos dados.
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">1</span>
            <h3 className="font-semibold text-slate-800">Dashboard</h3>
          </div>
          <p className="text-sm text-slate-500 mb-2">Arquivos necessários:</p>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Pasta Recebimento</li>
            <li>• Pasta Out of Delivery</li>
            <li>• Pasta Entregas (opcional)</li>
            <li>• Arquivo de Supervisores</li>
            <li>• Arquivo de Metas</li>
          </ul>
          <div className="mt-3 px-2 py-1 bg-blue-50 rounded text-xs text-blue-700 font-mono">Opção [1] no menu</div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold">2</span>
            <h3 className="font-semibold text-slate-800">Reclamações</h3>
          </div>
          <p className="text-sm text-slate-500 mb-2">Arquivos necessários:</p>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Bilhete de Reclamação</li>
            <li>• Consulta Carta de Porte</li>
            <li>• Gestão de Bases (opcional)</li>
            <li>• Delivered / Entregas (opcional)</li>
          </ul>
          <div className="mt-3 px-2 py-1 bg-orange-50 rounded text-xs text-orange-700 font-mono">Opção [2] no menu</div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-3">
            <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">3</span>
            <h3 className="font-semibold text-slate-800">Triagem DC×DS</h3>
          </div>
          <p className="text-sm text-slate-500 mb-2">Arquivos necessários:</p>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Pasta Loading Scan(s)</li>
            <li>• Arquivo Bases (BASE, BASE_PAI, SUPERVISOR)</li>
          </ul>
          <div className="mt-3 px-2 py-1 bg-emerald-50 rounded text-xs text-emerald-700 font-mono">Opção [3] no menu</div>
        </Card>
      </div>

      <SectionHeader title="Como rodar" />
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Passo a passo</span>
        </div>
        <ol className="text-sm text-slate-600 space-y-2">
          <li className="flex gap-2"><span className="font-bold text-slate-800">1.</span> Abra a pasta do processador local</li>
          <li className="flex gap-2"><span className="font-bold text-slate-800">2.</span> Dê duplo clique em <code className="bg-slate-100 px-1 rounded">PROCESSAR.bat</code></li>
          <li className="flex gap-2"><span className="font-bold text-slate-800">3.</span> Escolha a opção no menu (1, 2 ou 3)</li>
          <li className="flex gap-2"><span className="font-bold text-slate-800">4.</span> Selecione os arquivos quando solicitado</li>
          <li className="flex gap-2"><span className="font-bold text-slate-800">5.</span> Aguarde a mensagem de sucesso</li>
          <li className="flex gap-2"><span className="font-bold text-slate-800">6.</span> Atualize o portal — os dados aparecem automaticamente</li>
        </ol>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          ⚠️ Use sempre <strong>Python 3.12</strong>: <code>py -3.12 processar.py</code> ou configure o .bat para usar a versão correta.
        </div>
      </Card>
    </div>
  )
}

// ── Solicitações de Acesso ────────────────────────────────────
function SolicitacoesPage() {
  const [solicitacoes, setSolicitacoes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pendentes')
  const [aprovando, setAprovando] = useState({})
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState({})

  const ROLES = ['viewer', 'operador', 'supervisor', 'admin']

  const carregar = async () => {
    setLoading(true)
    try {
      const [solRes, usrRes] = await Promise.all([
        api.get('/api/admin/solicitacoes?status=pendente'),
        api.get('/api/admin/usuarios'),
      ])
      setSolicitacoes(solRes.data)
      setUsuarios(usrRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

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
    } catch { alert('Erro ao rejeitar') }
    finally { setAprovando(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  const salvarUsuario = async (userId) => {
    try {
      await api.put(`/api/admin/usuarios/${userId}`, editForm)
      setEditando(null)
      await carregar()
    } catch { alert('Erro ao salvar') }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'

  if (loading) return <div className="flex items-center gap-2 text-slate-500 mt-8"><Loader size={16} className="animate-spin" /> Carregando...</div>

  return (
    <div>
      <PageHeader icon="👥" title="Solicitações & Usuários" subtitle="Gerencie acessos ao portal" />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {[['pendentes', `Pendentes (${solicitacoes.length})`], ['usuarios', `Usuários (${usuarios.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Pendentes */}
      {tab === 'pendentes' && (
        solicitacoes.length === 0
          ? <Alert type="info">Nenhuma solicitação pendente no momento.</Alert>
          : <div className="space-y-3">
            {solicitacoes.map(sol => (
              <Card key={sol.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-800">{sol.nome}</p>
                    <p className="text-sm text-slate-500">{sol.email}</p>
                    {sol.motivo && <p className="text-sm text-slate-600 mt-1 italic">"{sol.motivo}"</p>}
                    <p className="text-xs text-slate-400 mt-1">Solicitado em {fmtDate(sol.criado_em)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select className="text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white"
                      defaultValue="viewer"
                      onChange={e => e.target.dataset.role = e.target.value}
                      id={`role-${sol.id}`}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => aprovar(sol.id, document.getElementById(`role-${sol.id}`)?.value || 'viewer')}
                      disabled={!!aprovando[sol.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                      {aprovando[sol.id] === 'aprovando' ? <Loader size={13} className="animate-spin" /> : <UserCheck size={13} />}
                      Aprovar
                    </button>
                    <button
                      onClick={() => rejeitar(sol.id)}
                      disabled={!!aprovando[sol.id]}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50">
                      {aprovando[sol.id] === 'rejeitando' ? <Loader size={13} className="animate-spin" /> : <UserX size={13} />}
                      Rejeitar
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
      )}

      {/* Usuários */}
      {tab === 'usuarios' && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-center">Role</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{u.nome || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      {editando === u.id
                        ? <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                            className="text-xs px-2 py-1 border border-slate-300 rounded">
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        : <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.role === 'admin' ? 'bg-red-100 text-red-700' : u.role === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {u.role}
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editando === u.id
                        ? <select value={editForm.ativo ? 'true' : 'false'} onChange={e => setEditForm(p => ({ ...p, ativo: e.target.value === 'true' }))}
                            className="text-xs px-2 py-1 border border-slate-300 rounded">
                            <option value="true">Ativo</option>
                            <option value="false">Inativo</option>
                          </select>
                        : u.ativo
                          ? <span className="text-emerald-600 flex items-center justify-center gap-1"><CheckCircle size={13} /> Ativo</span>
                          : <span className="text-red-500 flex items-center justify-center gap-1"><XCircle size={13} /> Inativo</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editando === u.id
                        ? <div className="flex items-center justify-center gap-2">
                            <button onClick={() => salvarUsuario(u.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save size={14} /></button>
                            <button onClick={() => setEditando(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X size={14} /></button>
                          </div>
                        : <button onClick={() => { setEditando(u.id); setEditForm({ role: u.role, ativo: u.ativo, bases: u.bases || [], paginas: u.paginas || [] }) }}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                            <Edit2 size={14} />
                          </button>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Configurações ─────────────────────────────────────────────
function ConfigPage() {
  const [motoristas, setMotoristas] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [novoId, setNovoId] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoMotivo, setNovoMotivo] = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/reclamacoes/motoristas')
      setMotoristas(res.data || [])
    } catch { } finally { setLoading(false) }
  }

  useEffect(() => { carregar() }, [])

  const toggleMotorista = async (m) => {
    setSaving(p => ({ ...p, [m.id_motorista]: true }))
    try {
      await api.post('/api/admin/motoristas', {
        id_motorista: m.id_motorista,
        nome_motorista: m.nome_motorista || '',
        ativo: !m.ativo,
        motivo: m.motivo || '',
      })
      await carregar()
    } catch { alert('Erro ao atualizar') }
    finally { setSaving(p => { const n = { ...p }; delete n[m.id_motorista]; return n }) }
  }

  const adicionarMotorista = async () => {
    if (!novoId.trim()) return
    setAdicionando(true)
    try {
      await api.post('/api/admin/motoristas', {
        id_motorista: novoId.trim(),
        nome_motorista: novoNome.trim(),
        ativo: false,
        motivo: novoMotivo.trim() || 'Bloqueado manualmente',
      })
      setNovoId(''); setNovoNome(''); setNovoMotivo('')
      await carregar()
    } catch { alert('Erro ao adicionar') }
    finally { setAdicionando(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-slate-500 mt-8"><Loader size={16} className="animate-spin" /> Carregando...</div>

  const ativos   = motoristas.filter(m => m.ativo)
  const inativos = motoristas.filter(m => !m.ativo)

  return (
    <div>
      <PageHeader icon="⚙️" title="Configurações" subtitle="Gerenciamento de motoristas e sistema" />

      <SectionHeader title="Bloquear Motorista Manualmente" />
      <Card>
        <p className="text-sm text-slate-500 mb-4">
          Motoristas bloqueados são removidos automaticamente do ranking de reclamações e substituídos pelo próximo da fila.
        </p>
        <div className="flex gap-3 flex-wrap">
          <input value={novoId} onChange={e => setNovoId(e.target.value)}
            placeholder="ID do Motorista *" className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[150px]" />
          <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
            placeholder="Nome (opcional)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[150px]" />
          <input value={novoMotivo} onChange={e => setNovoMotivo(e.target.value)}
            placeholder="Motivo (opcional)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm flex-1 min-w-[150px]" />
          <button onClick={adicionarMotorista} disabled={adicionando || !novoId.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {adicionando ? <Loader size={13} className="animate-spin" /> : <ShieldOff size={13} />}
            Bloquear
          </button>
        </div>
      </Card>

      {inativos.length > 0 && (
        <>
          <SectionHeader title={`Motoristas Bloqueados (${inativos.length})`} />
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Motivo</th>
                  <th className="px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {inativos.map((m, i) => (
                  <tr key={m.id_motorista} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{m.id_motorista}</td>
                    <td className="px-4 py-3">{m.nome_motorista || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.motivo || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleMotorista(m)} disabled={saving[m.id_motorista]}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs rounded-lg hover:bg-emerald-100 mx-auto">
                        {saving[m.id_motorista] ? <Loader size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                        Reativar
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
          <SectionHeader title={`Motoristas Ativos no Sistema (${ativos.length})`} />
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-4 py-3 text-left">ID</th>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody>
                {ativos.map((m, i) => (
                  <tr key={m.id_motorista} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{m.id_motorista}</td>
                    <td className="px-4 py-3">{m.nome_motorista || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleMotorista(m)} disabled={saving[m.id_motorista]}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100 mx-auto">
                        {saving[m.id_motorista] ? <Loader size={11} className="animate-spin" /> : <ShieldOff size={11} />}
                        Bloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {motoristas.length === 0 && (
        <Alert type="info">Nenhum motorista cadastrado ainda. Motoristas aparecem aqui automaticamente quando bloqueados pela página de Reclamações.</Alert>
      )}
    </div>
  )
}

// ── Admin root com sub-navegação ──────────────────────────────
export default function Admin() {
  const tabClass = (isActive) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
      isActive ? 'bg-imile-500 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
    }`

  return (
    <div>
      {/* Sub-navegação admin */}
      <div className="flex gap-2 mb-6 bg-white border border-slate-200 p-1.5 rounded-xl w-fit">
        <NavLink to="/admin" end className={({ isActive }) => tabClass(isActive)}>
          <Upload size={15} /> Upload / Processar
        </NavLink>
        <NavLink to="/admin/users" className={({ isActive }) => tabClass(isActive)}>
          <Users size={15} /> Solicitações
        </NavLink>
        <NavLink to="/admin/config" className={({ isActive }) => tabClass(isActive)}>
          <Settings size={15} /> Configurações
        </NavLink>
      </div>

      <Routes>
        <Route index element={<UploadPage />} />
        <Route path="users" element={<SolicitacoesPage />} />
        <Route path="config" element={<ConfigPage />} />
      </Routes>
    </div>
  )
}

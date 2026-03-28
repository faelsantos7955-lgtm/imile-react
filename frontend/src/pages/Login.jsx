/**
 * pages/Login.jsx — Tela de login corporativa iMile
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import api from '../lib/api'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')

  const [regNome, setRegNome] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regMotivo, setRegMotivo] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !senha) { setError('Preencha email e senha.'); return }
    setLoading(true)
    try {
      await login(email.trim(), senha)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou senha incorretos.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!regNome || !regEmail) { setError('Nome e email são obrigatórios.'); return }
    setLoading(true)
    try {
      await api.post('/api/auth/register', {
        nome: regNome.trim(),
        email: regEmail.trim(),
        motivo: regMotivo.trim(),
      })
      setSuccess('Solicitação enviada! Aguarde aprovação do administrador.')
      setRegNome(''); setRegEmail(''); setRegMotivo('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erro ao enviar.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = `
    mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white
    text-sm text-slate-900 placeholder:text-slate-300
    focus:outline-none focus:ring-2 focus:ring-imile-500/15 focus:border-imile-400
    transition-all duration-150
  `

  return (
    <div className="min-h-screen flex">

      {/* ── Painel Esquerdo — Brand ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[42%] bg-navy-950 flex-col justify-between p-12 relative overflow-hidden">
        {/* Gradiente de fundo */}
        <div className="absolute inset-0 bg-gradient-to-br from-imile-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-navy-950 to-transparent pointer-events-none" />

        {/* Pontos decorativos */}
        <div className="absolute top-0 right-0 w-72 h-72 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-imile-500 flex items-center justify-center shadow-imile">
              <span className="text-white font-black text-base">iM</span>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-tight">iMile Delivery</p>
              <p className="text-white/40 text-xs">Brasil Operations</p>
            </div>
          </div>
        </div>

        {/* Copy central */}
        <div className="relative z-10">
          <div className="w-10 h-1 bg-imile-500 rounded-full mb-6" />
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            Portal de<br />Gestão Operacional
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            Acompanhe métricas de entrega, gestão de backlog, triagem e reclamações em tempo real.
          </p>

          <div className="mt-10 space-y-3">
            {['Expedição diária por base', 'Backlog SLA e aging', 'Triagem e reclamações', 'Ranking de performance'].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-imile-500" />
                <span className="text-white/60 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé */}
        <div className="relative z-10">
          <p className="text-white/25 text-xs">© 2025 iMile Delivery Brasil. Acesso restrito.</p>
        </div>
      </div>

      {/* ── Painel Direito — Form ───────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#f8fafc] px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-imile-500 flex items-center justify-center">
              <span className="text-white font-black text-sm">iM</span>
            </div>
            <span className="font-bold text-slate-800">iMile Delivery</span>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="animate-in">
              <p className="text-xs font-semibold uppercase tracking-widest text-imile-500 mb-1">Portal Operacional</p>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Bem-vindo de volta</h1>
              <p className="text-sm text-slate-500 mb-7">Entre com suas credenciais corporativas</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Email corporativo</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@imile.com"
                    className={inputClass}
                    autoComplete="email"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600">Senha</label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'} value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="••••••••"
                      className={inputClass + ' pr-11'}
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors mt-0.5">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200/80 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-imile-500 text-white font-semibold text-sm hover:bg-imile-600 active:scale-[0.99] transition-all disabled:opacity-60 shadow-imile">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Entrar <ArrowRight size={15} /></>
                )}
              </button>

              <div className="mt-5 pt-5 border-t border-slate-200">
                <button type="button" onClick={() => { setTab('register'); setError('') }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all font-medium">
                  Solicitar acesso ao portal
                </button>
              </div>
            </form>

          ) : (
            <form onSubmit={handleRegister} className="animate-in">
              <button type="button" onClick={() => { setTab('login'); setError(''); setSuccess('') }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 mb-6 transition-colors">
                <ArrowLeft size={13} /> Voltar ao login
              </button>

              <p className="text-xs font-semibold uppercase tracking-widest text-imile-500 mb-1">Novo acesso</p>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">Solicitar acesso</h1>
              <p className="text-sm text-slate-500 mb-7">O administrador receberá e avaliará sua solicitação.</p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Nome completo</label>
                  <input type="text" value={regNome} onChange={(e) => setRegNome(e.target.value)}
                    placeholder="João Silva" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Email corporativo</label>
                  <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="joao.silva@imile.com" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Motivo / área de atuação</label>
                  <textarea value={regMotivo} onChange={(e) => setRegMotivo(e.target.value)}
                    placeholder="Ex: Supervisor de operações, região São Paulo..."
                    rows={3}
                    className={inputClass + ' resize-none'} />
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 px-3.5 py-2.5 bg-red-50 border border-red-200/80 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
              {success && (
                <div className="mt-4 flex items-start gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200/80 rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <p className="text-xs text-emerald-700">{success}</p>
                </div>
              )}

              <button type="submit" disabled={loading}
                className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-imile-500 text-white font-semibold text-sm hover:bg-imile-600 active:scale-[0.99] transition-all disabled:opacity-60 shadow-imile">
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Enviar solicitação <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

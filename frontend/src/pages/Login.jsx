/**
 * pages/Login.jsx — Editorial photo background style
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'
import api from '../lib/api'

const LOGIN_BG_LOCAL    = '/login-bg.jpg'
const LOGIN_BG_FALLBACK = 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80&fit=crop&crop=center'

// ── Componente principal ──────────────────────────────────────
export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab]       = useState('login')
  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [bgError, setBgError] = useState(false)

  const [regNome, setRegNome]     = useState('')
  const [regEmail, setRegEmail]   = useState('')
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
    focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-400
    transition-all duration-150
  `

  return (
    <div className="min-h-screen flex">

      {/* ── Painel Esquerdo — Editorial foto ─────────────────────── */}
      <div className="hidden lg:flex lg:w-[48%] flex-col justify-between relative overflow-hidden">

        {/* Foto de fundo — local primeiro, fallback Unsplash via onError */}
        <img
          src={bgError ? LOGIN_BG_FALLBACK : LOGIN_BG_LOCAL}
          onError={() => { if (!bgError) setBgError(true) }}
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Overlay principal — navy escuro */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(135deg, rgba(10,16,40,.82) 0%, rgba(0,20,70,.70) 40%, rgba(10,22,50,.78) 100%)',
        }} />

        {/* Gradiente de baixo mais intenso (legibilidade do copy) */}
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to top, rgba(5,10,30,.97) 0%, rgba(5,10,30,.5) 35%, transparent 65%)',
        }} />

        {/* Linha de acento azul no topo */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{
          background: 'linear-gradient(to right, #0032A0, #1048c8, #0032A0)',
        }} />

        {/* Logo */}
        <div className="relative z-10 p-10 pb-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[9px] flex items-center justify-center font-extrabold text-white text-[15px]"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #0032A0)', boxShadow: '0 4px 16px rgba(0,50,160,.4)' }}>
              i
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-none">iMile</p>
              <p className="text-white/35 text-[10px] tracking-widest mt-0.5">PORTAL BRASIL</p>
            </div>
          </div>
        </div>

        {/* Copy editorial */}
        <div className="relative z-10 px-10 pb-10">

          {/* Tag */}
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full"
            style={{ background: 'rgba(0,50,160,.25)', border: '1px solid rgba(100,150,255,.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            <span style={{ color: 'rgba(147,197,253,.9)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' }}>
              Logística em tempo real
            </span>
          </div>

          {/* Headline editorial grande */}
          <h2 style={{
            fontSize: 38, fontWeight: 800, lineHeight: 1.08,
            letterSpacing: '-1.2px', color: 'white', marginBottom: 14,
          }}>
            Gestão<br />
            <span style={{
              background: 'linear-gradient(90deg, #60a5fa 0%, #93c5fd 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Operacional</span><br />
            iMile Brasil
          </h2>

          <p style={{ color: 'rgba(203,213,225,.65)', fontSize: 13.5, lineHeight: 1.6, maxWidth: 300, marginBottom: 28 }}>
            Entregas, backlog, contestações e triagem — visibilidade total da operação em um único painel.
          </p>

          <p className="mt-6" style={{ color: 'rgba(255,255,255,.18)', fontSize: 11 }}>
            © 2025 iMile Delivery Brasil · Acesso restrito
          </p>
        </div>
      </div>

      {/* ── Painel Direito — Formulário ─────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#f8fafc] px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Logo mobile */}
          <div className="mb-8 lg:hidden flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-white text-[13px]"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #0032A0)' }}>i</div>
            <span className="font-bold text-slate-800 text-[15px]">iMile</span>
          </div>

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="animate-in">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-1">Portal Operacional</p>
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
                  <label className="text-xs font-semibold text-slate-600">Senha</label>
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
                className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-semibold text-sm active:scale-[0.99] transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #0032A0, #1048c8)', boxShadow: '0 4px 16px rgba(0,50,160,.35)' }}>
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

              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-1">Novo acesso</p>
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
                className="mt-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white font-semibold text-sm active:scale-[0.99] transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #0032A0, #1048c8)', boxShadow: '0 4px 16px rgba(0,50,160,.35)' }}>
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

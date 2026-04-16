/**
 * pages/Login.jsx — Tela de login do WhatsApp CRM
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Eye, EyeOff, ArrowRight, MessageCircle } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]   = useState('')
  const [senha, setSenha]   = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="min-h-screen flex">

      {/* Painel esquerdo */}
      <div className="hidden lg:flex lg:w-[42%] bg-navy-950 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-imile-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-72 h-72 opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 bg-imile-500 rounded-xl flex items-center justify-center">
            <MessageCircle size={18} className="text-white" />
          </div>
          <span className="text-white font-bold text-sm tracking-wide">iMile WhatsApp CRM</span>
        </div>

        <div className="relative z-10">
          <div className="w-10 h-1 bg-imile-500 rounded-full mb-6" />
          <h2 className="text-3xl font-bold text-white leading-tight mb-4">
            CRM de<br />Pós-Entrega
          </h2>
          <p className="text-white/50 text-sm leading-relaxed max-w-xs">
            Dispare campanhas de confirmação de entrega via WhatsApp e gerencie as respostas dos destinatários em tempo real.
          </p>
          <div className="mt-10 space-y-3">
            {[
              'Upload de planilha de destinatários',
              'Disparo em massa via Meta API',
              'Gestão de respostas por status',
              'Histórico de conversas',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-imile-500" />
                <span className="text-white/60 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/25 text-xs">© 2025 iMile Delivery Brasil. Acesso restrito.</p>
      </div>

      {/* Painel direito */}
      <div className="flex-1 flex items-center justify-center bg-[#f8fafc] px-6 py-12">
        <div className="w-full max-w-[360px]">

          <div className="mb-8 lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 bg-imile-500 rounded-xl flex items-center justify-center">
              <MessageCircle size={15} className="text-white" />
            </div>
            <span className="text-slate-800 font-bold text-sm">iMile WhatsApp CRM</span>
          </div>

          <form onSubmit={handleLogin} className="animate-in">
            <p className="text-xs font-semibold uppercase tracking-widest text-imile-500 mb-1">WhatsApp CRM</p>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Bem-vindo</h1>
            <p className="text-sm text-slate-500 mb-7">Entre com suas credenciais corporativas</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@imile.com"
                  className="mt-1.5 w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-imile-500/15 focus:border-imile-400 transition-all"
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
                    className="mt-1.5 w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-imile-500/15 focus:border-imile-400 transition-all"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 mt-0.5">
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
          </form>
        </div>
      </div>
    </div>
  )
}

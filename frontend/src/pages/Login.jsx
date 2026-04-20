/**
 * pages/Login.jsx — Tela de login corporativa iMile
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react'
import api from '../lib/api'

// ── SVG: caminhão iMile (visão lateral direita) ───────────────
function Truck({ className = '' }) {
  return (
    <svg width="200" height="72" viewBox="0 0 200 72" fill="none" className={className}>
      {/* Trailer */}
      <rect x="2" y="18" width="116" height="36" rx="3" fill="#1a3557" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.7" />
      <rect x="8" y="24" width="98" height="8" rx="1" fill="#E97132" fillOpacity="0.18" />
      <rect x="8" y="35" width="60" height="5" rx="1" fill="#E97132" fillOpacity="0.12" />
      {/* iMile stripe */}
      <rect x="18" y="26" width="40" height="4" rx="1" fill="#E97132" fillOpacity="0.55" />
      {/* Cab */}
      <rect x="118" y="10" width="78" height="44" rx="4" fill="#1f3f60" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.7" />
      {/* Windshield */}
      <rect x="152" y="14" width="36" height="22" rx="2" fill="#E97132" fillOpacity="0.12" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.5" />
      {/* Side window */}
      <rect x="122" y="14" width="24" height="14" rx="2" fill="#E97132" fillOpacity="0.1" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.4" />
      {/* Headlight */}
      <rect x="190" y="24" width="7" height="6" rx="2" fill="white" fillOpacity="0.9" />
      {/* Light cone */}
      <path d="M197 24 L200 20 L200 34 L197 30 Z" fill="#E97132" fillOpacity="0.2" />
      {/* Exhaust */}
      <rect x="124" y="4" width="5" height="9" rx="2" fill="#1a3557" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.4" />
      <ellipse cx="126" cy="4" rx="3" ry="1.5" fill="#E97132" fillOpacity="0.3" />
      {/* Connector */}
      <rect x="114" y="26" width="6" height="14" rx="2" fill="#122035" />
      {/* Road ground line */}
      <line x1="0" y1="62" x2="200" y2="62" stroke="#E97132" strokeWidth="0.4" strokeOpacity="0.25" />
      {/* Wheel 1 */}
      <circle cx="35" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
      <circle cx="35" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
      {/* Wheel 2 */}
      <circle cx="85" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
      <circle cx="85" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
      {/* Wheel 3 */}
      <circle cx="155" cy="62" r="9" fill="#0d1e30" stroke="#E97132" strokeWidth="1.8" />
      <circle cx="155" cy="62" r="3.5" fill="#E97132" fillOpacity="0.6" />
    </svg>
  )
}

// ── SVG: caixinha de entrega flutuante ────────────────────────
function Package({ size = 24, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" fill="#E97132" fillOpacity="0.15" stroke="#E97132" strokeWidth="1" strokeOpacity="0.6" />
      <line x1="2" y1="7" x2="12" y2="12" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="22" y1="7" x2="12" y2="12" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="12" y1="12" x2="12" y2="22" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.5" />
      <line x1="7" y1="4.5" x2="17" y2="9.5" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.4" />
    </svg>
  )
}

// ── Cena logística SVG (painel esquerdo) ──────────────────────
function LogisticsScene() {
  const nodes = [
    { cx: 80,  cy: 200, delay: '0s',    label: 'São Paulo' },
    { cx: 280, cy: 150, delay: '0.9s',  label: 'Rio' },
    { cx: 160, cy: 310, delay: '1.7s',  label: 'Campinas' },
    { cx: 340, cy: 280, delay: '0.4s',  label: 'BH' },
    { cx: 60,  cy: 360, delay: '1.2s',  label: 'Santos' },
  ]

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 400 700"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* ── Rotas (linhas tracejadas laranja) */}
      {[
        'M80,200 Q180,120 280,150',
        'M80,200 Q120,260 160,310',
        'M280,150 Q310,215 340,280',
        'M160,310 Q250,295 340,280',
        'M60,360 Q110,330 160,310',
        'M60,360 Q70,280 80,200',
      ].map((d, i) => (
        <path
          key={i}
          d={d}
          stroke="#E97132"
          strokeWidth="1.2"
          strokeDasharray="7 5"
          fill="none"
          strokeOpacity="0.25"
          className="route-flow"
          style={{ animationDelay: `${i * 0.5}s` }}
        />
      ))}

      {/* ── Nós de entrega */}
      {nodes.map((n) => (
        <g key={n.label}>
          {/* Anel pulsante */}
          <circle cx={n.cx} cy={n.cy} r="8" fill="#E97132" fillOpacity="0.06" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.5" />
          <circle cx={n.cx} cy={n.cy} r="4" fill="#E97132" fillOpacity="0.5" />
          <circle cx={n.cx} cy={n.cy} r="4" fill="none" stroke="#E97132" strokeWidth="1" strokeOpacity="0.8"
            className="signal-blink" style={{ animationDelay: n.delay }} />
          {/* Anel externo pulsando */}
          <circle cx={n.cx} cy={n.cy} r="14" fill="none" stroke="#E97132" strokeWidth="0.8"
            strokeOpacity="0.3" className="signal-blink" style={{ animationDelay: n.delay }} />
          {/* Label */}
          <text x={n.cx + 10} y={n.cy - 8} fill="white" fillOpacity="0.35" fontSize="8" fontFamily="monospace">{n.label}</text>
        </g>
      ))}

      {/* ── Radar (canto superior direito) */}
      <g transform="translate(340, 80)">
        <circle cx="0" cy="0" r="35" fill="none" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.15" />
        <circle cx="0" cy="0" r="22" fill="none" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.12" />
        <circle cx="0" cy="0" r="10" fill="#E97132" fillOpacity="0.07" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.2" />
        {/* Ponteiro do radar */}
        <g className="radar-rotate">
          <line x1="0" y1="0" x2="0" y2="-34" stroke="#E97132" strokeWidth="1" strokeOpacity="0.5" />
          <path d="M0,0 L-6,-34 L6,-34 Z" fill="#E97132" fillOpacity="0.08" />
        </g>
        {/* Blip */}
        <circle cx="14" cy="-10" r="2" fill="#E97132" fillOpacity="0.8" className="signal-blink" style={{ animationDelay: '0.3s' }} />
        <circle cx="-8" cy="-22" r="1.5" fill="#E97132" fillOpacity="0.6" className="signal-blink" style={{ animationDelay: '1.1s' }} />
      </g>

      {/* ── Caixinhas flutuando */}
      <g transform="translate(320, 180)" className="box-float" style={{ animationDelay: '0s' }}>
        <rect x="-10" y="-10" width="20" height="20" rx="2" fill="#E97132" fillOpacity="0.08" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="-10" y1="0" x2="10" y2="0" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.3" />
        <line x1="0" y1="-10" x2="0" y2="10" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.3" />
      </g>
      <g transform="translate(50, 270)" className="box-float" style={{ animationDelay: '1.8s' }}>
        <rect x="-8" y="-8" width="16" height="16" rx="2" fill="#E97132" fillOpacity="0.06" stroke="#E97132" strokeWidth="0.7" strokeOpacity="0.35" />
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.25" />
      </g>
      <g transform="translate(230, 60)" className="box-float" style={{ animationDelay: '0.9s' }}>
        <rect x="-12" y="-12" width="24" height="24" rx="2" fill="#E97132" fillOpacity="0.07" stroke="#E97132" strokeWidth="0.8" strokeOpacity="0.4" />
        <line x1="-12" y1="0" x2="12" y2="0" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.3" />
        <line x1="0" y1="-12" x2="0" y2="12" stroke="#E97132" strokeWidth="0.6" strokeOpacity="0.3" />
      </g>

      {/* ── Skyline (silhueta cidade) */}
      <g fill="#1a2d45" opacity="0.55">
        {/* Prédios */}
        <rect x="0"   y="555" width="28"  height="145" />
        <rect x="32"  y="530" width="22"  height="170" />
        <rect x="58"  y="560" width="16"  height="140" />
        <rect x="78"  y="510" width="30"  height="190" />
        <rect x="112" y="540" width="18"  height="160" />
        <rect x="134" y="520" width="25"  height="180" />
        <rect x="163" y="548" width="20"  height="152" />
        <rect x="187" y="505" width="35"  height="195" />
        <rect x="226" y="535" width="22"  height="165" />
        <rect x="252" y="558" width="18"  height="142" />
        <rect x="274" y="515" width="28"  height="185" />
        <rect x="306" y="542" width="20"  height="158" />
        <rect x="330" y="525" width="30"  height="175" />
        <rect x="364" y="550" width="36"  height="150" />
        {/* Antenas */}
        <rect x="84"  y="495" width="2"   height="16" />
        <rect x="193" y="490" width="2"   height="16" />
        <rect x="337" y="510" width="2"   height="16" />
        {/* Janelas (retângulinhos claros) */}
      </g>
      {/* Janelas */}
      {[
        [10,570],[10,585],[10,600],[10,615],
        [38,545],[38,560],[38,575],
        [85,525],[85,540],[85,555],[85,570],
        [140,535],[140,550],[140,565],
        [192,520],[192,535],[192,550],
        [280,530],[280,545],[280,560],
        [338,540],[338,555],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="5" height="4" rx="0.5"
          fill="#E97132" fillOpacity={Math.random() > 0.4 ? 0.25 : 0.08} />
      ))}

      {/* ── Estrada (linha horizontal) */}
      <line x1="0" y1="490" x2="400" y2="490" stroke="#E97132" strokeWidth="0.5" strokeOpacity="0.2" />
      <line x1="0" y1="492" x2="400" y2="492" stroke="white" strokeWidth="0.3" strokeOpacity="0.06" />
    </svg>
  )
}

// ── Componente principal ──────────────────────────────────────
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

      {/* ── Painel Esquerdo — Cena logística ───────────────────── */}
      <div className="hidden lg:flex lg:w-[45%] bg-navy-950 flex-col justify-between relative overflow-hidden">

        {/* Dot grid de fundo */}
        <div className="absolute inset-0 login-dot-grid" />

        {/* Gradiente de profundidade */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 60% 30%, rgba(233,113,50,0.07) 0%, transparent 60%)' }} />
        <div className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{ background: 'linear-gradient(to top, #0E2841 0%, transparent 100%)' }} />

        {/* Cena SVG */}
        <LogisticsScene />

        {/* Linha de varredura (scanline) */}
        <div className="absolute left-0 right-0 h-px pointer-events-none scanline"
          style={{ background: 'linear-gradient(to right, transparent, rgba(233,113,50,0.4), transparent)' }} />

        {/* Caminhão animado */}
        <div className="absolute overflow-hidden pointer-events-none" style={{ bottom: '92px', left: 0, right: 0, height: '72px' }}>
          <div className="truck-anim absolute" style={{ bottom: 0 }}>
            <Truck />
          </div>
        </div>

        {/* ── Conteúdo textual (sobre a cena) */}
        {/* Logo */}
        <div className="relative z-10 p-10 pb-0">
          <img
            src="/imile-logo.png"
            alt="iMile Delivery"
            className="h-9 w-auto object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>

        {/* Copy central */}
        <div className="relative z-10 px-10">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-0.5 bg-imile-500 rounded-full" />
            <span className="text-imile-400 text-[11px] font-semibold tracking-widest uppercase">Logística em tempo real</span>
          </div>
          <h2 className="text-[28px] font-bold text-white leading-snug mb-3">
            Portal de<br />Gestão Operacional
          </h2>
          <p className="text-white/45 text-[13px] leading-relaxed max-w-[280px]">
            Métricas de entrega, backlog, triagem e contestações — tudo em um único painel.
          </p>
        </div>

        {/* Stats bar */}
        <div className="relative z-10 mx-8 mb-10 rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
            {[
              { v: '15+', l: 'Bases DS' },
              { v: '100k+', l: 'Pacotes/mês' },
              { v: '24h', l: 'Monitoramento' },
            ].map(({ v, l }) => (
              <div key={l} className="px-5 py-3 text-center">
                <p className="text-imile-400 font-bold text-base leading-none mb-0.5">{v}</p>
                <p className="text-white/30 text-[10px] font-medium tracking-wide">{l}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 px-10 pb-5 text-white/20 text-[11px]">
          © 2025 iMile Delivery Brasil · Acesso restrito
        </p>
      </div>

      {/* ── Painel Direito — Formulário ─────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-[#f8fafc] px-6 py-12">
        <div className="w-full max-w-[360px]">

          {/* Logo mobile */}
          <div className="mb-8 lg:hidden">
            <img src="/imile-logo.png" alt="iMile Delivery" className="h-8 w-auto object-contain" />
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

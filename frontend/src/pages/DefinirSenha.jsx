import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import api from '../lib/api'

export default function DefinirSenha() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''

  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')

    if (!token) {
      setErro('Link inválido. Solicite um novo e-mail ao administrador.')
      return
    }
    if (senha.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      await api.post('/api/auth/definir-senha', { token, senha })
      setSucesso(true)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Erro ao definir senha. O link pode ter expirado.'
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-block bg-white text-[#0a1628] font-black text-2xl px-6 py-3 rounded-xl tracking-widest">
            iMile
          </div>
          <p className="text-slate-400 text-sm mt-3">Dashboard Interno</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {sucesso ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Senha definida!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Sua senha foi cadastrada com sucesso. Você já pode fazer login.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-[#0a1628] text-white py-3 rounded-xl font-semibold hover:bg-[#1a2d4a] transition-colors"
              >
                Ir para o login
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-slate-800 mb-1">Cadastrar senha</h2>
              <p className="text-slate-500 text-sm mb-6">
                Crie uma senha para acessar o iMile Dashboard.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Senha */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nova senha</label>
                  <div className="relative">
                    <input
                      type={showSenha ? 'text' : 'password'}
                      value={senha}
                      onChange={e => setSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1628]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSenha(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirmação */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar senha</label>
                  <input
                    type={showSenha ? 'text' : 'password'}
                    value={confirmacao}
                    onChange={e => setConfirmacao(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1628]/30"
                  />
                </div>

                {erro && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                    {erro}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0a1628] text-white py-3 rounded-xl font-semibold hover:bg-[#1a2d4a] transition-colors disabled:opacity-60 mt-2"
                >
                  {loading ? 'Salvando...' : 'Cadastrar senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

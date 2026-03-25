/**
 * lib/AuthContext.jsx — Contexto de autenticação com permissões granulares
 * Tokens: access_token em memória (api.js), refresh_token em HttpOnly cookie
 */
import { createContext, useContext, useState, useEffect } from 'react'
import api, { setAccessToken, clearAccessToken } from './api'

const AuthContext = createContext(null)

const PAGINAS_DEFAULT = ['dashboard','historico','comparativos','triagem','reclamacoes']
const ACOES_DEFAULT   = ['excel']

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // Na inicialização tenta restaurar sessão via refresh_token (cookie HttpOnly)
  useEffect(() => {
    const savedUser = localStorage.getItem('user')
    if (!savedUser) { setLoading(false); return }

    api.post('/api/auth/refresh', {})
      .then(({ data }) => {
        setAccessToken(data.access_token)
        try { setUser(JSON.parse(savedUser)) } catch {}
      })
      .catch(() => {
        // Cookie expirado ou inválido — limpa dados locais
        localStorage.removeItem('user')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = res.data

    // Access token apenas em memória
    setAccessToken(access_token)

    // Dados do usuário (não sensíveis) em localStorage para restaurar nome/role ao recarregar
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    clearAccessToken()
    localStorage.removeItem('user')
    setUser(null)
  }

  const isAdmin = user?.role === 'admin'

  const paginasPermitidas = isAdmin
    ? ['dashboard','historico','comparativos','triagem','reclamacoes','admin','backlog','monitoramento']
    : (user?.paginas?.length ? user.paginas : PAGINAS_DEFAULT)

  const acoesPermitidas = isAdmin
    ? ['excel','bloquear_motorista','aprovar_acesso']
    : (user?.acoes?.length ? user.acoes : ACOES_DEFAULT)

  const podeVer  = (pagina) => isAdmin || paginasPermitidas.includes(pagina)
  const podeAção = (acao)   => isAdmin || acoesPermitidas.includes(acao)

  return (
    <AuthContext.Provider value={{
      user, login, logout, loading, isAdmin,
      paginasPermitidas, acoesPermitidas,
      podeVer, podeAção
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

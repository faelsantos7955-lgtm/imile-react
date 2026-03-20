/**
 * lib/AuthContext.jsx — Contexto de autenticação com permissões granulares
 */
import { createContext, useContext, useState, useEffect } from 'react'
import api from './api'

const AuthContext = createContext(null)

const PAGINAS_DEFAULT = ['dashboard','historico','comparativos','triagem','reclamacoes']
const ACOES_DEFAULT   = ['excel']

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const saved = localStorage.getItem('user')
    if (token && saved) {
      try { setUser(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = res.data
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const isAdmin = user?.role === 'admin'

  // Permissões granulares
  const paginasPermitidas = isAdmin
    ? ['dashboard','historico','comparativos','triagem','reclamacoes','admin']
    : (user?.paginas?.length ? user.paginas : PAGINAS_DEFAULT)

  const acoesPermitidas = isAdmin
    ? ['excel','bloquear_motorista','aprovar_acesso']
    : (user?.acoes?.length ? user.acoes : ACOES_DEFAULT)

  const podeVer   = (pagina) => isAdmin || paginasPermitidas.includes(pagina)
  const podeAção  = (acao)   => isAdmin || acoesPermitidas.includes(acao)

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

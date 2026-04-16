import { createContext, useContext, useState, useEffect } from 'react'
import api, { setToken, clearToken } from './api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('chat_user')
    if (!saved) { setLoading(false); return }
    api.post('/api/auth/refresh', {})
      .then(({ data }) => { setToken(data.access_token); try { setUser(JSON.parse(saved)) } catch {} })
      .catch(() => localStorage.removeItem('chat_user'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    setToken(data.access_token)
    localStorage.setItem('chat_user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    clearToken(); localStorage.removeItem('chat_user'); setUser(null)
  }

  return <Ctx.Provider value={{ user, login, logout, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

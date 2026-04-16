import { createContext, useContext, useState, useEffect } from 'react'
import api, { setAccessToken, clearAccessToken } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedUser = localStorage.getItem('wpp_user')
    if (!savedUser) { setLoading(false); return }

    api.post('/api/auth/refresh', {})
      .then(({ data }) => {
        setAccessToken(data.access_token)
        try { setUser(JSON.parse(savedUser)) } catch {}
      })
      .catch(() => {
        localStorage.removeItem('wpp_user')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = res.data
    setAccessToken(access_token)
    localStorage.setItem('wpp_user', JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = async () => {
    try { await api.post('/api/auth/logout') } catch {}
    clearAccessToken()
    localStorage.removeItem('wpp_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

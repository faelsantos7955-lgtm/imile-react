import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true, // envia cookies HttpOnly automaticamente
})

// Access token em memória — não persiste no localStorage (seguro contra XSS)
let _accessToken = null

export function setAccessToken(token) { _accessToken = token }
export function clearAccessToken()    { _accessToken = null }

// Anexa Authorization header com o access token em memória
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

let isRefreshing = false
let pendingQueue = []

const processQueue = (error, token = null) => {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
  pendingQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    if (err.response?.status === 429) {
      err.response.data = { detail: 'Muitas requisições. Aguarde um momento e tente novamente.' }
      return Promise.reject(err)
    }

    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err)
    }

    // Evita loop de retry no próprio endpoint de refresh
    if (original.url?.includes('/api/auth/refresh')) {
      clearAccessToken()
      window.location.href = '/login'
      return Promise.reject(err)
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    original._retry = true
    isRefreshing = true

    try {
      // O refresh_token vai automaticamente via cookie HttpOnly
      const { data } = await api.post('/api/auth/refresh', {})
      setAccessToken(data.access_token)
      api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`
      processQueue(null, data.access_token)
      original.headers.Authorization = `Bearer ${data.access_token}`
      return api(original)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      clearAccessToken()
      localStorage.removeItem('user')
      window.location.href = '/login'
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

export default api

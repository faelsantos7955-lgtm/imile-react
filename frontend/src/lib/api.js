import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true, // envia cookies HttpOnly automaticamente
  timeout: 40000, // 40s — cobre cold start do Render (~30s)
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
      const PUBLIC_PATHS = ['/contestar', '/definir-senha']
      const isPublic = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))
      if (!isPublic) window.location.href = '/login'
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
      const PUBLIC_PATHS = ['/contestar', '/definir-senha']
      const isPublic = PUBLIC_PATHS.some(p => window.location.pathname.startsWith(p))
      if (!isPublic) window.location.href = '/login'
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)

/**
 * Faz polling de um job de background até concluir ou dar erro.
 * @param {string} jobUrl  — URL do endpoint GET de status (ex: '/api/notracking/job/xxx')
 * @param {function} onFase — callback opcional com a fase atual
 * @param {number} maxAttempts — máximo de tentativas (default 120 × 1.5s = 3min)
 */
export async function pollJob(jobUrl, onFase, maxAttempts = 120) {
  let attempts = 0
  while (attempts++ < maxAttempts) {
    await new Promise(r => setTimeout(r, 1500))
    const { data: job } = await api.get(jobUrl)
    if (job.status === 'done')  return job
    if (job.status === 'error') throw new Error(job.erro || 'Erro no processamento')
    onFase?.(job.fase || 'processando')
  }
  throw new Error('Timeout: processamento demorou demais. Verifique o histórico de uploads.')
}

export default api

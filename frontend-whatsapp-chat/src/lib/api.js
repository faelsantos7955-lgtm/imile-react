import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true,
  timeout: 120_000,
})

let _token = null
export const setToken = (t) => { _token = t }
export const clearToken = () => { _token = null }

api.interceptors.request.use((c) => {
  if (_token) c.headers.Authorization = `Bearer ${_token}`
  return c
})

let refreshing = false, queue = []
const flush = (err, tok) => { queue.forEach(p => err ? p.reject(err) : p.resolve(tok)); queue = [] }

api.interceptors.response.use(res => res, async (err) => {
  const orig = err.config
  if (err.response?.status !== 401 || orig._retry) return Promise.reject(err)
  if (orig.url?.includes('/api/auth/refresh')) {
    clearToken(); localStorage.removeItem('chat_user'); window.location.href = '/login'
    return Promise.reject(err)
  }
  if (refreshing) return new Promise((res, rej) => queue.push({ resolve: res, reject: rej }))
    .then(tok => { orig.headers.Authorization = `Bearer ${tok}`; return api(orig) })

  orig._retry = true; refreshing = true
  try {
    const { data } = await api.post('/api/auth/refresh', {})
    setToken(data.access_token); flush(null, data.access_token)
    orig.headers.Authorization = `Bearer ${data.access_token}`
    return api(orig)
  } catch (e) {
    flush(e); clearToken(); localStorage.removeItem('chat_user')
    window.location.href = '/login'; return Promise.reject(e)
  } finally { refreshing = false }
})

export default api

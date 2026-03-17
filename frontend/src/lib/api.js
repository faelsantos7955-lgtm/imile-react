/**
 * lib/api.js — Cliente HTTP com interceptor de auth
 */
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
})

// Interceptor: injeta token em todas as requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor: redireciona pro login se 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
/**
 * App.jsx — Router principal com proteção de rotas
 */
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Analise from './pages/Analise'
import Operacional from './pages/Operacional'
import Reclamacoes from './pages/Reclamacoes'
import Admin from './pages/Admin'
import Backlog from './pages/Backlog'

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (adminOnly && !isAdmin) return <Navigate to="/" />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={
        <ProtectedRoute><Layout /></ProtectedRoute>
      }>
        <Route index element={<Analise />} />
        <Route path="operacional" element={<Operacional />} />
        <Route path="reclamacoes" element={<Reclamacoes />} />
        <Route path="backlog" element={<Backlog />} />
        <Route path="admin/*" element={
          <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
        } />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

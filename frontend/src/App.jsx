/**
 * App.jsx — Router principal com proteção de rotas
 * Páginas carregadas com React.lazy() para reduzir o bundle inicial.
 */
import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Layout from './components/Layout'

// Páginas — lazy loaded
const Login                = lazy(() => import('./pages/Login'))
const Analise              = lazy(() => import('./pages/Analise'))
const Operacional          = lazy(() => import('./pages/Operacional'))
const Reclamacoes          = lazy(() => import('./pages/Reclamacoes'))
const Admin                = lazy(() => import('./pages/Admin'))
const Backlog              = lazy(() => import('./pages/Backlog'))
const NotArrived           = lazy(() => import('./pages/NotArrived'))
const Na                   = lazy(() => import('./pages/Na'))
const Correlacao           = lazy(() => import('./pages/Correlacao'))
const Extravios            = lazy(() => import('./pages/Extravios'))
const NoTracking           = lazy(() => import('./pages/NoTracking'))
const Contestacoes         = lazy(() => import('./pages/Contestacoes'))
const ContestacoesPublico  = lazy(() => import('./pages/ContestacoesPublico'))
const DefinirSenha         = lazy(() => import('./pages/DefinirSenha'))
const Avisos               = lazy(() => import('./pages/Avisos'))

function PageFallback() {
  // Sutil: barra superior que aparece se a chunk demorar > ~200ms
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2,
        background: 'linear-gradient(90deg, transparent, #1D4ED8, transparent)',
        animation: 'lazy-progress 1.2s ease-in-out infinite',
        zIndex: 9999,
      }}
    />
  )
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" />
  if (adminOnly && !isAdmin) return <Navigate to="/" />
  return children
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/contestar" element={<ContestacoesPublico />} />
        <Route path="/definir-senha" element={<DefinirSenha />} />

        <Route path="/" element={
          <ProtectedRoute><Layout /></ProtectedRoute>
        }>
          <Route index element={<Analise />} />
          <Route path="operacional" element={<Operacional />} />
          <Route path="reclamacoes" element={<Reclamacoes />} />
          <Route path="backlog" element={<Backlog />} />
          <Route path="correlacao" element={<Correlacao />} />
          <Route path="extravios" element={<Extravios />} />
          <Route path="notracking" element={<NoTracking />} />
          <Route path="not-arrived" element={<NotArrived />} />
          <Route path="na" element={<Na />} />
          <Route path="contestacoes" element={<Contestacoes />} />
          <Route path="avisos" element={<Avisos />} />
          <Route path="admin/*" element={
            <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
          } />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

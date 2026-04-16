import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import Login from './pages/Login'
import Chat from './pages/Chat'

function Guard({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center bg-[#ECE5DD]"><div className="w-8 h-8 border-4 border-[#25D366]/30 border-t-[#25D366] rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/login" />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Guard><Chat /></Guard>} />
      </Routes>
    </AuthProvider>
  )
}

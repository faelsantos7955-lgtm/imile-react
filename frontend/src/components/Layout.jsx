/**
 * components/Layout.jsx — Clean & Premium · iMile Portal
 * Mobile: sidebar como drawer com overlay
 */
import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import {
  BarChart2, Wrench, FileWarning, Upload, Users, Settings,
  LogOut, Bell, Package, Menu, X, History, AlertCircle, PackageX,
  GitMerge, Target, ShieldAlert, Clock,
} from 'lucide-react'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/',            icon: BarChart2,   label: 'Análise' },
  { to: '/operacional', icon: Wrench,      label: 'Operacional' },
  { to: '/reclamacoes', icon: FileWarning, label: 'Reclamações' },
  { to: '/backlog',     icon: Package,     label: 'Backlog SLA' },
  { to: '/correlacao',  icon: GitMerge,    label: 'Correlação' },
  { to: '/extravios',   icon: ShieldAlert, label: 'Extravios' },
  { to: '/notracking',  icon: Clock,       label: 'No Tracking' },
  { to: '/na',          icon: PackageX,    label: 'Not Arrived' },
  { to: '/not-arrived', icon: AlertCircle, label: 'Not Arrived Mov.' },
]

const ADMIN_ITEMS = [
  { to: '/admin',          icon: Upload,   label: 'Upload / Processar' },
  { to: '/admin/users',    icon: Users,    label: 'Solicitações' },
  { to: '/admin/config',   icon: Settings, label: 'Configurações' },
  { to: '/admin/auditlog', icon: History,  label: 'Histórico' },
  { to: '/admin/metas',    icon: Target,   label: 'Metas por DS' },
]

const PAGE_TITLES = [
  { path: '/',                label: 'Análise' },
  { path: '/operacional',     label: 'Operacional' },
  { path: '/reclamacoes',     label: 'Reclamações' },
  { path: '/backlog',         label: 'Backlog SLA' },
  { path: '/correlacao',      label: 'Correlação Backlog × Reclamações' },
  { path: '/extravios',       label: 'Controle de Extravios' },
  { path: '/notracking',      label: 'No Tracking (断更)' },
  { path: '/na',              label: 'Not Arrived' },
  { path: '/not-arrived',     label: 'Not Arrived com Movimentação' },
  { path: '/admin',           label: 'Upload / Processar' },
  { path: '/admin/users',     label: 'Solicitações de Acesso' },
  { path: '/admin/config',    label: 'Configurações' },
  { path: '/admin/auditlog',  label: 'Histórico de Ações' },
  { path: '/admin/metas',     label: 'Metas por DS' },
]

// ── Nav link ──────────────────────────────────────────────────
function SideLink({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) => clsx(
        'group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/40 hover:text-white/80 hover:bg-white/5'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-imile-400" />
          )}
          <Icon size={16} strokeWidth={isActive ? 2 : 1.8} className="shrink-0" />
          <span className="flex-1 truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

// ── Nav group ─────────────────────────────────────────────────
function NavGroup({ label, children }) {
  return (
    <div className="mb-2">
      <p className="px-3 pt-5 pb-2 text-[9px] font-bold uppercase tracking-widest text-white/20">
        {label}
      </p>
      <div className="space-y-px">{children}</div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar({ onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial = firstName[0]?.toUpperCase() || '?'
  const handleLogout = () => { onClose?.(); logout() }

  return (
    <aside className="w-[220px] bg-navy-950 flex flex-col h-full border-r border-white/5">

      {/* Logo */}
      <div className="px-4 h-14 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-imile-500 flex items-center justify-center shadow-imile-sm shrink-0">
            <span className="text-white font-black text-[11px] leading-none tracking-tighter">iM</span>
          </div>
          <div>
            <p className="text-white font-bold text-[13px] leading-none tracking-tight">iMile</p>
            <p className="text-white/25 text-[10px] leading-none mt-0.5">Portal Operacional</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 text-white/30 hover:text-white/70">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 overflow-y-auto sidebar-scroll py-1">
        <NavGroup label="Menu">
          {NAV_ITEMS.map(item => (
            <SideLink key={item.to} {...item} onClick={onClose} />
          ))}
        </NavGroup>
        {isAdmin && (
          <NavGroup label="Admin">
            {ADMIN_ITEMS.map(item => (
              <SideLink key={item.to} {...item} onClick={onClose} />
            ))}
          </NavGroup>
        )}
      </nav>

      {/* User footer */}
      <div className="p-2.5 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg">
          <div className="w-6 h-6 rounded-full bg-imile-500/20 border border-imile-500/20 flex items-center justify-center text-imile-300 text-[11px] font-bold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/80 text-[12px] font-semibold truncate leading-none">{firstName}</p>
            {isAdmin && <p className="text-imile-400/70 text-[9px] font-semibold mt-0.5">Admin</p>}
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            className="p-1.5 text-white/20 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── Bell / Notificações ───────────────────────────────────────
function BellMenu({ isAdmin }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  const navigate = useNavigate()

  const { data: pendentes = [] } = useQuery({
    queryKey: ['solicitacoes-pendentes'],
    queryFn: () => api.get('/api/admin/solicitacoes?status=pendente').then(r => r.data),
    enabled: isAdmin,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!isAdmin) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
          open ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        )}
      >
        <Bell size={16} />
        {pendentes.length > 0 && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white border border-slate-100 rounded-xl shadow-popover z-50 overflow-hidden animate-scale">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Solicitações Pendentes</p>
            {pendentes.length > 0 && (
              <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-100">
                {pendentes.length}
              </span>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Nenhuma solicitação pendente</p>
          ) : (
            <ul className="max-h-60 overflow-y-auto divide-y divide-slate-50">
              {pendentes.map(s => (
                <li key={s.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <p className="text-xs font-semibold text-slate-800 truncate">{s.nome || s.email}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{s.email}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-2.5">
            <button
              onClick={() => { navigate('/admin/users'); setOpen(false) }}
              className="text-[11px] font-semibold text-imile-600 hover:text-imile-700 transition-colors"
            >
              Ver todas as solicitações →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Layout principal ──────────────────────────────────────────
export default function Layout() {
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial = firstName[0]?.toUpperCase() || '?'
  const pageTitle = PAGE_TITLES.find(p => p.path === location.pathname)?.label || 'Dashboard'

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">

      {/* Sidebar desktop */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden animate-fade"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden animate-slide">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Abrir menu"
            >
              <Menu size={18} />
            </button>
            <div>
              <h1 className="text-[13px] font-semibold text-slate-900 leading-none">{pageTitle}</h1>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-none hidden sm:block tracking-wide">
                iMile Brasil · Portal Operacional
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <BellMenu isAdmin={isAdmin} />
            <div className="w-px h-5 bg-slate-100 mx-0.5" />
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-default transition-colors">
              <div className="w-6 h-6 rounded-full bg-imile-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {initial}
              </div>
              <div className="hidden sm:block">
                <p className="text-[12px] font-semibold text-slate-700 leading-none">{firstName}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

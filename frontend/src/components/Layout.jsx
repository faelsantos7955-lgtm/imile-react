/**
 * components/Layout.jsx — Sidebar corporativa iMile + área de conteúdo
 * Mobile: sidebar como drawer com overlay
 */
import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import {
  BarChart2, Wrench, FileWarning, Upload, Users, Settings,
  LogOut, Bell, Package, ChevronRight, Menu, X, History,
} from 'lucide-react'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/',            icon: BarChart2,   label: 'Análise' },
  { to: '/operacional', icon: Wrench,      label: 'Operacional' },
  { to: '/reclamacoes', icon: FileWarning, label: 'Reclamações' },
  { to: '/backlog',     icon: Package,     label: 'Backlog SLA' },
]

const ADMIN_ITEMS = [
  { to: '/admin',           icon: Upload,   label: 'Upload / Processar' },
  { to: '/admin/users',     icon: Users,    label: 'Solicitações' },
  { to: '/admin/config',    icon: Settings, label: 'Configurações' },
  { to: '/admin/auditlog',  icon: History,  label: 'Histórico' },
]

const PAGE_TITLES = [
  { path: '/',                label: 'Análise' },
  { path: '/operacional',     label: 'Operacional' },
  { path: '/reclamacoes',     label: 'Reclamações' },
  { path: '/backlog',         label: 'Backlog SLA' },
  { path: '/admin',           label: 'Upload / Processar' },
  { path: '/admin/users',     label: 'Solicitações de Acesso' },
  { path: '/admin/config',    label: 'Configurações' },
  { path: '/admin/auditlog',  label: 'Histórico de Ações' },
]

function SideLink({ to, icon: Icon, label, onClick }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) => clsx(
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-imile-500 text-white shadow-imile'
          : 'text-navy-100/60 hover:text-white hover:bg-white/8'
      )}
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <ChevronRight size={13} className="opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
    </NavLink>
  )
}

function NavGroup({ label, children, accent = false }) {
  return (
    <div className="mb-1">
      <p className={clsx(
        'px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em]',
        accent ? 'text-imile-400/70' : 'text-white/25'
      )}>
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Sidebar({ onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial = firstName[0]?.toUpperCase() || '?'

  const handleLogout = () => { onClose?.(); logout() }

  return (
    <aside className="w-60 bg-navy-950 flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-imile-500 flex items-center justify-center shadow-imile shrink-0">
            <span className="text-white font-black text-sm leading-none">iM</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight tracking-tight">iMile Delivery</p>
            <p className="text-white/30 text-[10px] leading-tight">Portal Operacional</p>
          </div>
        </div>
        {/* Botão fechar — só aparece em mobile */}
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 text-white/40 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 overflow-y-auto pt-1">
        <NavGroup label="Menu">
          {NAV_ITEMS.map((item) => (
            <SideLink key={item.to} {...item} onClick={onClose} />
          ))}
        </NavGroup>

        {isAdmin && (
          <NavGroup label="Administração" accent>
            {ADMIN_ITEMS.map((item) => (
              <SideLink key={item.to} {...item} onClick={onClose} />
            ))}
          </NavGroup>
        )}
      </nav>

      {/* User + Logout */}
      <div className="p-2.5 border-t border-white/5">
        <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-imile-500/20 border border-imile-500/30 flex items-center justify-center text-imile-400 text-xs font-bold shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">{firstName}</p>
            {isAdmin && <span className="text-[10px] text-imile-400 font-semibold">Admin</span>}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-colors"
        >
          <LogOut size={15} />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  )
}

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

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isAdmin) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <Bell size={17} />
        {pendentes.length > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {pendentes.length > 9 ? '9+' : pendentes.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-700">Solicitações Pendentes</p>
            {pendentes.length > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">
                {pendentes.length}
              </span>
            )}
          </div>
          {pendentes.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Nenhuma solicitação pendente</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {pendentes.map(s => (
                <li key={s.id} className="px-4 py-3">
                  <p className="text-xs font-semibold text-slate-800 truncate">{s.nome || s.email}</p>
                  <p className="text-[10px] text-slate-400 truncate">{s.email}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-100 px-4 py-2.5">
            <button
              onClick={() => { navigate('/admin/users'); setOpen(false) }}
              className="text-xs font-semibold text-imile-600 hover:text-imile-700"
            >
              Ver todas as solicitações →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial = firstName[0]?.toUpperCase() || '?'
  const pageTitle = PAGE_TITLES.find(p => p.path === location.pathname)?.label || 'Dashboard'

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">

      {/* ── Sidebar desktop (sempre visível) ──────────────────── */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* ── Sidebar mobile (drawer com overlay) ───────────────── */}
      {mobileOpen && (
        <>
          {/* Overlay escuro */}
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden animate-slide">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* ── Content Area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* Hambúrguer — só em mobile */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-slate-800 leading-none">{pageTitle}</h1>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-none hidden sm:block">
                iMile Brasil · Portal Operacional
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <BellMenu isAdmin={isAdmin} />
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-default transition-colors">
              <div className="w-7 h-7 rounded-full bg-imile-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initial}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-semibold text-slate-700 leading-tight">{firstName}</p>
                <p className="text-[10px] text-slate-400 leading-tight truncate max-w-[120px]">{user?.email}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

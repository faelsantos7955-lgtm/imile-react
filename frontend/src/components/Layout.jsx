/**
 * Layout.jsx — Shell visual v2 · iMile Portal
 * Sidebar light + topbar Stripe-style · Plus Jakarta Sans
 */
import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import {
  Wrench, FileWarning, Upload, Users, Settings,
  LogOut, Bell, Package, Menu, X, History, AlertCircle, PackageX,
  GitMerge, Target, ShieldAlert, PackageSearch, Scale, Megaphone,
  Search, PanelLeft, Home, EyeOff, Rows3, Rows2,
} from 'lucide-react'

// ── Navegação ─────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    section: 'Painel',
    items: [
      { to: '/',            icon: Home,         label: 'Análise',          end: true },
    ],
  },
  {
    section: 'Operações',
    items: [
      { to: '/operacional', icon: Wrench,        label: 'Operacional' },
      { to: '/backlog',     icon: Package,       label: 'Backlog SLA',     badge: true },
      { to: '/correlacao',  icon: GitMerge,      label: 'Correlação' },
      { to: '/notracking',  icon: EyeOff,        label: 'No Tracking' },
      { to: '/not-arrived', icon: AlertCircle,   label: 'Not Arrived Mov.' },
      { to: '/na',          icon: PackageX,      label: 'Not Arrived' },
    ],
  },
  {
    section: 'Ocorrências',
    items: [
      { to: '/reclamacoes',  icon: FileWarning,  label: 'Reclamações' },
      { to: '/extravios',    icon: ShieldAlert,  label: 'Extravios' },
      { to: '/contestacoes', icon: Scale,        label: 'Contestações' },
      { to: '/avisos',       icon: Megaphone,    label: 'Avisos' },
    ],
  },
]

const ADMIN_ITEMS = [
  { to: '/admin',          icon: Upload,        label: 'Upload / Processar' },
  { to: '/admin/lote',     icon: PackageSearch, label: 'Carga em Lote' },
  { to: '/admin/users',    icon: Users,         label: 'Solicitações' },
  { to: '/admin/config',   icon: Settings,      label: 'Configurações' },
  { to: '/admin/auditlog', icon: History,       label: 'Histórico' },
  { to: '/admin/metas',    icon: Target,        label: 'Metas por DS' },
  { to: '/admin/avisos',   icon: Megaphone,     label: 'Quadro de Avisos' },
]

const PAGE_TITLES = {
  '/':                'Análise',
  '/operacional':     'Operacional',
  '/reclamacoes':     'Reclamações',
  '/backlog':         'Backlog SLA',
  '/correlacao':      'Correlação',
  '/extravios':       'Extravios',
  '/notracking':      'No Tracking',
  '/na':              'Not Arrived',
  '/not-arrived':     'Not Arrived c/ Mov.',
  '/contestacoes':    'Contestações',
  '/avisos':          'Avisos',
  '/admin':           'Upload / Processar',
  '/admin/lote':      'Carga em Lote',
  '/admin/users':     'Solicitações',
  '/admin/config':    'Configurações',
  '/admin/auditlog':  'Histórico',
  '/admin/metas':     'Metas por DS',
  '/admin/avisos':    'Quadro de Avisos',
}

// ── BellMenu (notificações admin) ─────────────────────────────
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="tb-btn" onClick={() => setOpen(v => !v)} title="Notificações">
        <Bell size={16} />
        {pendentes.length > 0 && <span className="ind" />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 280, background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
          zIndex: 50, overflow: 'hidden',
          animation: 'scaleIn .15s ease-out',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate-700)' }}>Solicitações pendentes</span>
            {pendentes.length > 0 && <span className="chip chip-danger">{pendentes.length}</span>}
          </div>
          {pendentes.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--slate-400)', textAlign: 'center', padding: '20px 0' }}>Nenhuma pendente</p>
          ) : (
            <ul style={{ maxHeight: 220, overflowY: 'auto', listStyle: 'none', margin: 0, padding: 0 }}>
              {pendentes.map(s => (
                <li key={s.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-2)' }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--slate-800)' }}>{s.nome || s.email}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate-400)' }}>{s.email}</p>
                </li>
              ))}
            </ul>
          )}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-2)' }}>
            <button className="btn-ghost btn" style={{ fontSize: 12, color: 'var(--imile-600)', padding: 0 }}
              onClick={() => { navigate('/admin/users'); setOpen(false) }}>
              Ver todas as solicitações →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar({ collapsed, onClose }) {
  const { user, logout, isAdmin } = useAuth()
  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const initial = (firstName[0] || '?').toUpperCase()
  const role = isAdmin ? 'Admin · iMile Brasil' : 'Portal iMile Brasil'

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = (label) => !q || label.toLowerCase().includes(q)

  const filteredGroups = q
    ? NAV_GROUPS
        .map(g => ({ ...g, items: g.items.filter(i => matches(i.label)) }))
        .filter(g => g.items.length > 0)
    : NAV_GROUPS
  const filteredAdmin = q ? ADMIN_ITEMS.filter(i => matches(i.label)) : ADMIN_ITEMS
  const totalShown = filteredGroups.reduce((s, g) => s + g.items.length, 0)
                   + (isAdmin ? filteredAdmin.length : 0)

  const { data: naoLidos } = useQuery({
    queryKey: ['avisos-nao-lidos'],
    queryFn: () => api.get('/api/avisos/nao-lidos').then(r => r.data.total),
    refetchInterval: 2 * 60 * 1000,
  })

  return (
    <aside className="sidebar" style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-w)' }}>

      {/* Logo */}
      <div className="sb-head">
        <div className="sb-mark">iM</div>
        {!collapsed && (
          <div>
            <div className="sb-brand">iMile <small>Operations Hub</small></div>
          </div>
        )}
        {onClose && (
          <button onClick={onClose} className="btn-ghost btn" style={{ marginLeft: 'auto', padding: 4 }} aria-label="Fechar menu">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div className="sb-search">
          <Search size={14} className="sb-search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar páginas…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
            aria-label="Buscar páginas"
          />
        </div>
      )}

      {/* Navigation */}
      <nav className="sb-nav" aria-label="Navegação principal">
        {filteredGroups.map(group => (
          <div key={group.section}>
            <div className="sb-section-label">{group.section}</div>
            {group.items.map(item => {
              const Icon = item.icon
              const avisosBadge = item.to === '/avisos' ? (naoLidos || 0) : 0
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="sb-icon" aria-hidden="true" />
                  <span className="sb-link-label">{item.label}</span>
                  {avisosBadge > 0 && <span className="sb-badge">{avisosBadge > 99 ? '99+' : avisosBadge}</span>}
                </NavLink>
              )
            })}
          </div>
        ))}

        {isAdmin && filteredAdmin.length > 0 && (
          <div>
            <div className="sb-section-label">Admin</div>
            {filteredAdmin.map(item => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => `sb-link${isActive ? ' active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="sb-icon" aria-hidden="true" />
                  <span className="sb-link-label">{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        )}

        {q && totalShown === 0 && !collapsed && (
          <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--slate-400)' }}>
            Nenhuma página corresponde a “{query}”.
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="sb-foot">
        <div className="sb-avatar">{initial}</div>
        {!collapsed && (
          <div className="sb-foot-text">
            <div className="sb-user-name">{firstName}</div>
            <div className="sb-user-role">{role}</div>
          </div>
        )}
        {!collapsed && (
          <button onClick={logout} title="Sair" className="btn-ghost btn" style={{ padding: 6, color: 'var(--slate-400)', marginLeft: 'auto' }}>
            <LogOut size={14} />
          </button>
        )}
      </div>
    </aside>
  )
}

// ── Layout principal ──────────────────────────────────────────
const SIDEBAR_KEY = 'imile.sidebar.collapsed'
const DENSITY_KEY = 'imile.tables.density'

function readCollapsed() {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1' }
  catch { return false }
}
function readCompact() {
  try { return localStorage.getItem(DENSITY_KEY) === 'compact' }
  catch { return false }
}

export default function Layout() {
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [compact, setCompact] = useState(readCompact)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') }
    catch { /* iOS Safari modo privado pode lançar */ }
  }, [collapsed])

  useEffect(() => {
    try { localStorage.setItem(DENSITY_KEY, compact ? 'compact' : 'cozy') }
    catch {}
    document.body.classList.toggle('compact-tables', compact)
  }, [compact])

  const firstName = user?.nome?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const pageTitle = PAGE_TITLES[location.pathname] || 'Dashboard'

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(4px)', zIndex: 45, animation: 'fadeIn .15s ease-out' }}
          />
          <div style={{ position: 'fixed', inset: '0 auto 0 0', zIndex: 50, animation: 'slideIn .2s ease-out' }}>
            <Sidebar collapsed={false} onClose={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Desktop layout */}
      <div className={`app${collapsed ? ' collapsed' : ''}`}>

        {/* Sidebar (desktop) */}
        <div className="hidden lg:block" style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <Sidebar collapsed={collapsed} />
        </div>

        {/* Main */}
        <div className="portal-main">

          {/* Topbar */}
          <header className="topbar">
            {/* Mobile menu toggle */}
            <button className="tb-toggle lg:hidden" onClick={() => setMobileOpen(true)}>
              <Menu size={16} />
            </button>

            {/* Desktop sidebar toggle */}
            <button className="tb-toggle hidden lg:grid" onClick={() => setCollapsed(c => !c)} title="Recolher menu">
              <PanelLeft size={16} />
            </button>

            {/* Breadcrumb */}
            <div className="tb-breadcrumb">
              <span>iMile</span>
              <span className="sep">/</span>
              <span className="current">{pageTitle}</span>
            </div>

            <div className="tb-spacer" />

            {/* Actions */}
            <BellMenu isAdmin={isAdmin} />

            <button
              className="tb-btn"
              onClick={() => setCompact(c => !c)}
              title={compact ? 'Densidade confortável' : 'Densidade compacta'}
              aria-pressed={compact}
              aria-label="Alternar densidade das tabelas"
            >
              {compact ? <Rows3 size={16} /> : <Rows2 size={16} />}
            </button>

            {/* User chip */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px 5px 6px',
              border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
              background: 'white', cursor: 'default',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--imile-400), var(--imile-600))',
                color: 'white', display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                {(firstName[0] || '?').toUpperCase()}
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate-700)', whiteSpace: 'nowrap' }} className="hidden sm:block">
                {firstName}
              </span>
            </div>
          </header>

          {/* Page content */}
          <div className="portal-content" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </div>
    </>
  )
}

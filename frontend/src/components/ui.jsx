/**
 * components/ui.jsx — Design System iMile · Clean & Premium
 */
import { useState as _useState, useState, useEffect, useRef } from 'react'
import { toast as _sonner } from 'sonner'
import clsx from 'clsx'

// ── Toast helpers ─────────────────────────────────────────────
export const toast = {
  ok:      (msg) => _sonner.success(msg),
  erro:    (msg) => _sonner.error(msg),
  aviso:   (msg) => _sonner.warning(msg),
  info:    (msg) => _sonner.info(msg),
  promise: (p, opts) => _sonner.promise(p, opts),
}

// ── Counter hook ──────────────────────────────────────────────
function useCounter(target, duration = 900) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) { setCount(target ?? 0); return }
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setCount(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return count
}

// ── KPI Card ──────────────────────────────────────────────────
const KPI_ACCENT = {
  blue:   { dot: 'bg-imile-500',   bar: '#0032A0' },
  green:  { dot: 'bg-emerald-500', bar: '#10b981' },
  red:    { dot: 'bg-red-500',     bar: '#ef4444' },
  violet: { dot: 'bg-violet-500',  bar: '#8b5cf6' },
  slate:  { dot: 'bg-slate-400',   bar: '#94a3b8' },
}

export function KpiCard({ label, value, sub, color = 'blue', icon: Icon, trend, index = 0 }) {
  const ac = KPI_ACCENT[color] || KPI_ACCENT.blue
  const ref = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 })

  // Counter: if value is a number, animate it
  const isNum = typeof value === 'number'
  const counted = useCounter(isNum ? value : null, 900)
  const display = isNum ? counted.toLocaleString('pt-BR') : value

  const onMove = (e) => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    setMousePos({ x: nx, y: ny })
    setTilt({ x: (ny - 0.5) * -14, y: (nx - 0.5) * 14 })
  }
  const onLeave = () => { setTilt({ x: 0, y: 0 }); setHovering(false) }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={onLeave}
      className="stagger relative bg-white rounded-xl p-5 cursor-default overflow-hidden"
      style={{
        border: hovering ? '1px solid rgba(0,50,160,.18)' : '1px solid #f1f5f9',
        transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateY(${hovering ? -4 : 0}px)`,
        transition: hovering
          ? 'transform .08s ease-out, box-shadow .2s, border-color .2s'
          : 'transform .5s cubic-bezier(.2,.8,.2,1), box-shadow .3s, border-color .2s',
        boxShadow: hovering
          ? '0 20px 48px -14px rgba(0,50,160,.22), 0 4px 16px -4px rgba(0,0,0,.08)'
          : '0 1px 3px rgba(0,0,0,.05)',
        animationDelay: `${index * 90}ms`,
        willChange: 'transform',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Shine spotlight seguindo o mouse */}
      <div className="absolute inset-0 rounded-xl pointer-events-none transition-opacity duration-300"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(circle at ${mousePos.x * 100}% ${mousePos.y * 100}%, rgba(255,255,255,.18) 0%, transparent 65%)`,
        }} />

      {/* Accent bar no topo */}
      <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl transition-opacity duration-300"
        style={{ background: ac.bar, opacity: hovering ? 1 : 0 }} />

      <div className="flex items-start justify-between mb-3 relative">
        <div className="flex items-center gap-2">
          <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', ac.dot)} />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">
            {label}
          </p>
        </div>
        {Icon && <Icon size={15} className="text-slate-300 group-hover:text-slate-400 transition-colors shrink-0" />}
      </div>

      <p className="text-[1.75rem] font-bold font-mono leading-none tracking-tight text-slate-900 relative">
        {display}
      </p>

      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-2 relative">
          {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
          {trend !== undefined && (
            <span className={clsx(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
              trend >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
            )}>
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Particle Field ────────────────────────────────────────────
export function ParticleField({ count = 22, className = '' }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    left:  `${(i * 4.7 + Math.sin(i * 1.3) * 30 + 50) % 100}%`,
    top:   `${(i * 7.1 + Math.cos(i * 0.9) * 20 + 50) % 100}%`,
    size:  1.5 + (i % 3) * 1.2,
    dur:   `${8 + (i % 7) * 2.5}s`,
    delay: `${-(i * 1.3)}s`,
    op:    0.15 + (i % 4) * 0.08,
  }))
  return (
    <div className={clsx('absolute inset-0 overflow-hidden pointer-events-none', className)}>
      {particles.map((p, i) => (
        <span key={i} className="particle-dot absolute rounded-full"
          style={{
            left: p.left, top: p.top,
            width: p.size, height: p.size,
            background: `rgba(0,50,160,${p.op})`,
            animationDuration: p.dur,
            animationDelay: p.delay,
          }} />
      ))}
    </div>
  )
}

// ── Page Header ───────────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-500 mt-1 leading-snug">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────
export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mt-8 mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────
export function Card({ children, className = '', title, subtitle, action, padding = true }) {
  return (
    <div className={clsx(
      'bg-white rounded-xl border border-slate-100 animate-in',
      className
    )}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0 ml-4">{action}</div>}
        </div>
      )}
      <div className={clsx(padding && 'p-5')}>
        {children}
      </div>
    </div>
  )
}

// ── Ranking Row ───────────────────────────────────────────────
export function RankingRow({ pos, ds, taxa, meta, atingiu }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60 transition-colors">
      <div className="flex items-center gap-3">
        <span className={clsx(
          'w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0',
          pos === 1 ? 'bg-amber-100 text-amber-700' :
          pos === 2 ? 'bg-slate-100 text-slate-500' :
          pos === 3 ? 'bg-orange-100 text-orange-600' :
          'bg-slate-50 text-slate-400'
        )}>
          {pos}
        </span>
        <span className="text-sm font-medium text-slate-700">{ds}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono font-semibold text-slate-700">
          {(taxa * 100).toFixed(1)}%
        </span>
        <span className={clsx(
          'px-2 py-0.5 rounded-md text-[10px] font-semibold',
          atingiu
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-red-50 text-red-600'
        )}>
          {atingiu ? 'OK' : 'NOK'}
        </span>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────
export function Skeleton({ className = 'h-4 w-full' }) {
  return (
    <div className={clsx(
      'animate-pulse rounded-lg bg-slate-100',
      className
    )} />
  )
}

// ── Table Skeleton ────────────────────────────────────────────
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden animate-in">
      {/* Header */}
      <div className="grid gap-3 px-4 py-3 bg-slate-800" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-white/10 animate-pulse" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className={clsx('grid gap-3 px-4 py-3 border-t border-slate-50', ri % 2 === 1 && 'bg-slate-50/40')}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <div
              key={ci}
              className="h-3 rounded bg-slate-200 animate-pulse"
              style={{ width: `${60 + Math.random() * 40}%`, animationDelay: `${(ri * cols + ci) * 30}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── KPI Skeleton ──────────────────────────────────────────────
export function KpiSkeleton({ count = 4 }) {
  return (
    <div className={`grid gap-3 grid-cols-2 sm:grid-cols-${count}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-100 p-5 animate-pulse">
          <div className="h-2.5 w-20 bg-slate-100 rounded mb-4" />
          <div className="h-8 w-24 bg-slate-200 rounded mb-2" />
          <div className="h-2 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Alert ─────────────────────────────────────────────────────
export function Alert({ type = 'warning', children, onClose }) {
  const styles = {
    warning: 'bg-amber-50  border-amber-200  text-amber-800',
    error:   'bg-red-50    border-red-200    text-red-700',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    info:    'bg-imile-50  border-imile-200  text-imile-800',
  }
  const icons = {
    warning: '⚠',
    error:   '✕',
    success: '✓',
    info:    'ℹ',
  }
  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm animate-fade',
      styles[type]
    )}>
      <span className="text-xs font-bold mt-0.5 shrink-0 opacity-70">{icons[type]}</span>
      <span className="flex-1 leading-snug">{children}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 opacity-50 hover:opacity-80 text-xs ml-1">✕</button>
      )}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const styles = {
    blue:   'bg-imile-50   text-imile-700   border-imile-100',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
    red:    'bg-red-50     text-red-700     border-red-100',
    orange: 'bg-orange-50  text-orange-700  border-orange-100',
    slate:  'bg-slate-100  text-slate-600   border-slate-200',
  }
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border',
      styles[color] || styles.blue
    )}>
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary:   'bg-imile-500 text-white hover:bg-imile-600 shadow-imile-sm active:scale-[0.98]',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-[0.98]',
    danger:    'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]',
    ghost:     'text-slate-600 hover:bg-slate-100',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  }
  return (
    <button
      className={clsx(
        'inline-flex items-center font-semibold transition-all duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ── Upload Guide ──────────────────────────────────────────────
export function UploadGuide({ title, items = [], accent = 'blue' }) {
  const [open, setOpen] = _useState(false)
  const colors = {
    blue:   { btn: 'text-slate-400 hover:text-imile-500 border-slate-200 hover:border-imile-300', box: 'bg-white border-slate-200 text-slate-800' },
    orange: { btn: 'text-slate-400 hover:text-orange-500 border-slate-200 hover:border-orange-300', box: 'bg-white border-slate-200 text-slate-800' },
  }
  const c = colors[accent] || colors.blue
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={clsx(
          'w-7 h-7 rounded-full text-[11px] font-bold border flex items-center justify-center transition-all',
          c.btn
        )}
        title="O que devo subir?"
      >
        ?
      </button>
      {open && (
        <div className={clsx(
          'absolute right-0 top-9 z-50 w-80 rounded-xl border p-4 shadow-popover text-sm animate-scale',
          c.box
        )}>
          <p className="font-semibold text-slate-900 mb-3 text-sm">{title}</p>
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                <span className="mt-1 w-1 h-1 rounded-full bg-slate-400 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-in">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon size={22} className="text-slate-400" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-700 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = true }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 animate-in">
        <p className="text-sm text-slate-700 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >Cancelar</button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className={`px-4 py-2 text-xs rounded-lg text-white transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * components/ui.jsx — Design System iMile · Editorial Navy
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

// ── Chart theme (use in tooltip/grid) ────────────────────────
export const chartTheme = {
  tooltip: {
    contentStyle: {
      background: '#ffffff',
      border: '1px solid #e5e9f0',
      borderRadius: 10,
      color: '#1a2030',
      fontSize: 12,
      boxShadow: '0 4px 12px rgba(15,23,42,.08)',
    },
    labelStyle: { color: '#64748b', fontSize: 11, marginBottom: 4 },
    itemStyle:  { color: '#1a2030' },
    cursor:     { fill: 'rgba(29,78,216,.04)' },
  },
  grid:    { strokeDasharray: '3 3', stroke: '#eef1f6' },
  axisStyle: { fontSize: 11, fill: '#94a3b8' },
}

// ── Counter hook ──────────────────────────────────────────────
const _prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useCounter(target, duration = 900) {
  const [count, setCount] = useState(target ?? 0)
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) { setCount(target ?? 0); return }
    if (_prefersReducedMotion()) { setCount(target); return }
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
  blue:   { bar: 'linear-gradient(90deg,#0032A0,#1048c8)', dot: '#0032A0', glow: 'rgba(0,50,160,.25)' },
  green:  { bar: 'linear-gradient(90deg,#059669,#10b981)', dot: '#10b981', glow: 'rgba(16,185,129,.2)'  },
  red:    { bar: 'linear-gradient(90deg,#dc2626,#ef4444)', dot: '#ef4444', glow: 'rgba(239,68,68,.2)'   },
  orange: { bar: 'linear-gradient(90deg,#d97706,#f59e0b)', dot: '#f59e0b', glow: 'rgba(245,158,11,.2)'  },
  violet: { bar: 'linear-gradient(90deg,#7c3aed,#8b5cf6)', dot: '#8b5cf6', glow: 'rgba(139,92,246,.2)'  },
  slate:  { bar: 'linear-gradient(90deg,#475569,#64748b)', dot: '#94a3b8', glow: 'rgba(148,163,184,.15)'},
}

export function KpiCard({ label, value, sub, color = 'blue', icon: Icon, trend, index = 0 }) {
  const ac = KPI_ACCENT[color] || KPI_ACCENT.blue
  const ref = useRef(null)

  const isNum = typeof value === 'number'
  const counted = useCounter(isNum ? value : null, 900)
  const display = isNum ? counted.toLocaleString('pt-BR') : value

  // Mousemove escreve direto em CSS vars — zero re-render React
  const onMove = (e) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${nx * 100}%`)
    el.style.setProperty('--my', `${ny * 100}%`)
    el.style.setProperty('--rx', `${(ny - 0.5) * -12}deg`)
    el.style.setProperty('--ry', `${(nx - 0.5) * 12}deg`)
  }
  const onEnter = () => { ref.current?.classList.add('is-hovering') }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    el.classList.remove('is-hovering')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="kpi-card stagger"
      style={{
        '--ac-dot':  ac.dot,
        '--ac-glow': ac.glow,
        '--ac-bar':  ac.bar,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div className="kpi-bar" />
      <div className="kpi-spot" />

      <div className="p-5 pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="kpi-dot" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-none">
              {label}
            </p>
          </div>
          {Icon && <Icon size={15} className="text-slate-300 shrink-0" />}
        </div>

        <p className="kpi-value-num text-[1.85rem] font-extrabold font-mono leading-none tracking-tight">
          {display}
        </p>

        {(sub || trend !== undefined) && (
          <div className="flex items-center gap-2 mt-2.5">
            {sub && <p className="text-[11px] text-slate-400 leading-snug">{sub}</p>}
            {trend !== undefined && (
              <span className={clsx(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                trend >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
              )}>
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
            )}
          </div>
        )}
      </div>
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
export function PageHeader({ title, subtitle, action, tag }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        {/* Tag opcional acima do título */}
        {(tag || subtitle) && (
          <div className="inline-flex items-center gap-2 mb-2 px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(0,50,160,.08)', border: '1px solid rgba(0,50,160,.12)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span style={{ color: '#0032A0', fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>
              {tag || subtitle}
            </span>
          </div>
        )}
        <h1 className="text-[22px] font-extrabold text-slate-900 tracking-tight leading-tight">
          {title}
        </h1>
      </div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────
export function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mt-8 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-1 h-4 rounded-full shrink-0"
          style={{ background: 'linear-gradient(180deg,#0032A0,#1048c8)' }} />
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {title}
        </p>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────
export function Card({ children, className = '', title, subtitle, action, padding = true }) {
  return (
    <div className={clsx(
      'bg-white rounded-2xl border border-slate-200 animate-in',
      'shadow-[0_1px_4px_rgba(0,0,0,.04)]',
      className
    )}>
      {title && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 rounded-t-2xl"
          style={{ background: 'linear-gradient(135deg,#0a1628 0%,#1e3a5f 100%)' }}>
          <div>
            <h3 className="text-[13px] font-bold text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-[11px] text-white/50 mt-0.5">{subtitle}</p>}
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
          atingiu ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
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
    <div className={clsx('animate-pulse rounded-lg bg-slate-100', className)} />
  )
}

// ── Table Skeleton ────────────────────────────────────────────
export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-in">
      <div className="grid gap-3 px-4 py-3 rounded-t-2xl"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, background: 'linear-gradient(135deg,#0a1628,#1e3a5f)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-white/10 animate-pulse" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri}
          className={clsx('grid gap-3 px-4 py-3 border-t border-slate-50', ri % 2 === 1 && 'bg-slate-50/40')}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        >
          {Array.from({ length: cols }).map((_, ci) => (
            <div key={ci} className="h-3 rounded bg-slate-200 animate-pulse"
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
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
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
    info:    'bg-blue-50   border-blue-200   text-blue-800',
  }
  const dots = {
    warning: 'bg-amber-500',
    error:   'bg-red-500',
    success: 'bg-emerald-500',
    info:    'bg-blue-500',
  }
  return (
    <div className={clsx(
      'flex items-start gap-3 px-4 py-3 rounded-xl border text-sm animate-fade',
      styles[type]
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', dots[type])} />
      <span className="flex-1 leading-snug">{children}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 opacity-40 hover:opacity-70 text-xs ml-1">✕</button>
      )}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const styles = {
    blue:   'bg-blue-50   text-blue-700   border-blue-100',
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
    primary:   'text-white active:scale-[0.98]',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-[0.98]',
    danger:    'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]',
    ghost:     'text-slate-600 hover:bg-slate-100',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
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
      style={variant === 'primary' ? {
        background: 'linear-gradient(135deg,#0032A0,#1048c8)',
        boxShadow: '0 4px 14px rgba(0,50,160,.3)',
      } : undefined}
      {...props}
    >
      {children}
    </button>
  )
}

// ── Upload Guide ──────────────────────────────────────────────
export function UploadGuide({ title, items = [], accent = 'blue' }) {
  const [open, setOpen] = _useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-7 h-7 rounded-full text-[11px] font-bold border border-slate-200 text-slate-400
          hover:text-blue-600 hover:border-blue-300 flex items-center justify-center transition-all"
        title="O que devo subir?"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-2xl border border-slate-200 p-4 shadow-xl
          bg-white text-sm animate-scale">
          <p className="font-bold text-slate-900 mb-3 text-sm">{title}</p>
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
                <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400 shrink-0" />
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
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'linear-gradient(135deg,rgba(0,50,160,.08),rgba(16,72,200,.08))', border: '1px solid rgba(0,50,160,.1)' }}>
          <Icon size={24} style={{ color: '#0032A0', opacity: .5 }} />
        </div>
      )}
      <p className="text-sm font-bold text-slate-700 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Animated Logistics Empty State ───────────────────────────
export function LogisticsEmptyState({ title = 'Nenhum dado disponível', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center animate-in select-none">
      {/* Animated SVG package */}
      <div className="relative mb-5" style={{ width: 80, height: 80 }}>
        {/* Glow ring */}
        <div className="absolute inset-0 rounded-full" style={{
          background: 'radial-gradient(circle, rgba(0,50,160,0.12) 0%, transparent 70%)',
          animation: 'pulse-ring 2.4s ease-out infinite',
        }} />
        {/* Box float */}
        <div className="box-float absolute inset-0 flex items-center justify-center">
          <svg width={48} height={44} viewBox="0 0 48 44" fill="none">
            {/* Box body */}
            <rect x={4} y={14} width={40} height={26} rx={4} fill="url(#box-grad)" stroke="rgba(0,50,160,0.2)" strokeWidth={1}/>
            {/* Box top flaps */}
            <path d="M4 20 L24 14 L44 20" stroke="rgba(0,50,160,0.25)" strokeWidth={1} fill="none"/>
            {/* Center tape */}
            <rect x={21} y={14} width={6} height={26} rx={1} fill="rgba(0,50,160,0.12)"/>
            {/* Shine */}
            <rect x={7} y={17} width={10} height={5} rx={2} fill="white" fillOpacity={0.3}/>
            {/* Lock dots */}
            <circle cx={24} cy={27} r={2.5} fill="rgba(0,50,160,0.3)"/>
            <defs>
              <linearGradient id="box-grad" x1="4" y1="14" x2="44" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#E8EAF3"/>
                <stop offset="100%" stopColor="#d0d5e8"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-px pointer-events-none scanline"
          style={{ background: 'linear-gradient(to right, transparent 10%, rgba(0,50,160,0.3) 50%, transparent 90%)' }} />
      </div>

      <p className="text-sm font-bold text-slate-600 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = true }) {
  const dialogRef = useRef(null)
  const cancelBtnRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    cancelBtnRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-msg"
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-in"
      >
        <p id="confirm-dialog-msg" className="text-sm text-slate-700 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            onClick={onCancel}
            className="px-4 py-2 text-xs rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onConfirm(); onCancel(); }}
            className={clsx(
              'px-4 py-2 text-xs rounded-xl text-white font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              danger
                ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-500'
                : 'bg-blue-600 hover:bg-blue-700 focus-visible:outline-blue-500'
            )}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

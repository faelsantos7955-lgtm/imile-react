/**
 * components/ui.jsx — Design System iMile · Clean & Premium
 */
import { useState as _useState } from 'react'
import clsx from 'clsx'

// ── KPI Card ──────────────────────────────────────────────────
const KPI_ACCENT = {
  blue:   { dot: 'bg-imile-500',    num: 'text-slate-900' },
  orange: { dot: 'bg-orange-500',   num: 'text-slate-900' },
  green:  { dot: 'bg-emerald-500',  num: 'text-slate-900' },
  red:    { dot: 'bg-red-500',      num: 'text-slate-900' },
  violet: { dot: 'bg-violet-500',   num: 'text-slate-900' },
  slate:  { dot: 'bg-slate-400',    num: 'text-slate-900' },
}

export function KpiCard({ label, value, sub, color = 'blue', icon: Icon, trend }) {
  const ac = KPI_ACCENT[color] || KPI_ACCENT.blue
  return (
    <div className={clsx(
      'group bg-white rounded-xl border border-slate-100 p-5',
      'hover:border-slate-200 hover:shadow-card-hover transition-all duration-200 animate-in cursor-default'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', ac.dot)} />
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 leading-none">
            {label}
          </p>
        </div>
        {Icon && (
          <Icon
            size={15}
            className="text-slate-300 group-hover:text-slate-400 transition-colors shrink-0"
          />
        )}
      </div>

      <p className={clsx('text-[1.75rem] font-bold font-mono leading-none tracking-tight', ac.num)}>
        {value}
      </p>

      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-2">
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

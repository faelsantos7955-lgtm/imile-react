/**
 * components/ui.jsx — Componentes reutilizáveis
 */
import clsx from 'clsx'

// ── KPI Card ──────────────────────────────────────────────────
const BORDER_COLORS = {
  blue:   'border-l-imile-500',
  orange: 'border-l-orange-500',
  green:  'border-l-emerald-500',
  red:    'border-l-red-500',
  violet: 'border-l-violet-500',
  slate:  'border-l-slate-300',
}

const VALUE_COLORS = {
  blue:   'text-imile-600',
  orange: 'text-orange-600',
  green:  'text-emerald-600',
  red:    'text-red-600',
  violet: 'text-violet-600',
  slate:  'text-slate-600',
}

export function KpiCard({ label, value, sub, color = 'blue', icon: Icon }) {
  return (
    <div className={clsx(
      'bg-white rounded-xl border border-slate-200/80 border-l-[3px] px-5 py-4 shadow-card hover:shadow-card-hover transition-shadow animate-in',
      BORDER_COLORS[color] || BORDER_COLORS.blue
    )}>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <Icon size={16} className={clsx('opacity-40 mt-0.5', VALUE_COLORS[color] || VALUE_COLORS.blue)} />}
      </div>
      <p className={clsx(
        'text-2xl font-bold font-mono mt-2 leading-none',
        VALUE_COLORS[color] || VALUE_COLORS.blue
      )}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
    </div>
  )
}

// ── Page Header ───────────────────────────────────────────────
export function PageHeader({ icon, title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-imile-500/10 flex items-center justify-center">
            <span className="text-xl">{icon}</span>
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────
export function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-3">
      <div className="w-1 h-4 rounded-full bg-imile-500" />
      <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
        {title}
      </h3>
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────
export function Card({ children, className = '', title, action }) {
  return (
    <div className={clsx(
      'bg-white rounded-xl border border-slate-200/80 shadow-card animate-in',
      className
    )}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!title && 'p-5', title && 'p-5')}>
        {children}
      </div>
    </div>
  )
}

// ── Ranking Row ───────────────────────────────────────────────
export function RankingRow({ pos, ds, taxa, meta, atingiu }) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/80 transition-colors">
      <div className="flex items-center gap-3">
        <span className={clsx(
          'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold',
          pos === 1 ? 'bg-amber-100 text-amber-700' :
          pos === 2 ? 'bg-slate-100 text-slate-600' :
          pos === 3 ? 'bg-orange-100 text-orange-700' :
          'bg-slate-50 text-slate-400'
        )}>
          {pos}
        </span>
        <span className="text-sm font-medium text-slate-700">{ds}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono font-semibold text-slate-600">
          {(taxa * 100).toFixed(1)}%
        </span>
        <span className={clsx(
          'px-2 py-0.5 rounded-full text-[10px] font-semibold',
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

// ── Loading skeleton ──────────────────────────────────────────
export function Skeleton({ className = 'h-4 w-full' }) {
  return (
    <div className={clsx('animate-pulse rounded-lg bg-slate-100', className)} />
  )
}

// ── Alert bar ─────────────────────────────────────────────────
export function Alert({ type = 'warning', children }) {
  const styles = {
    warning: 'bg-amber-50 border-amber-200/80 text-amber-800',
    error:   'bg-red-50 border-red-200/80 text-red-700',
    success: 'bg-emerald-50 border-emerald-200/80 text-emerald-700',
    info:    'bg-imile-50 border-imile-200/80 text-imile-800',
  }
  const dots = {
    warning: 'bg-amber-400',
    error:   'bg-red-500',
    success: 'bg-emerald-500',
    info:    'bg-imile-500',
  }
  return (
    <div className={clsx('flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm', styles[type])}>
      <span className={clsx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', dots[type])} />
      <span>{children}</span>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const styles = {
    blue:   'bg-imile-50 text-imile-700 border-imile-200/60',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    red:    'bg-red-50 text-red-700 border-red-200/60',
    orange: 'bg-orange-50 text-orange-700 border-orange-200/60',
    slate:  'bg-slate-100 text-slate-600 border-slate-200/60',
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
    primary:   'bg-imile-500 text-white hover:bg-imile-600 shadow-imile active:scale-[0.98]',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-[0.98]',
    danger:    'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]',
    ghost:     'text-slate-600 hover:bg-slate-100',
  }
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-lg',
    lg: 'px-5 py-2.5 text-sm rounded-xl',
  }
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
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

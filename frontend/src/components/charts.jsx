/**
 * components/charts.jsx — Biblioteca de charts do protótipo v2
 * SVG puro, responsivo, sem dependência externa
 */
import { useState, useEffect, useRef, useMemo } from 'react'

// ── Formatadores ──────────────────────────────────────────────
export const fmt = {
  num: (n, d = 0) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }),
  pct: (n, d = 1) => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%',
  brl: (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  k: (n) => {
    if (n == null) return '—'
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k'
    return String(n)
  },
}

// ── Sparkline ─────────────────────────────────────────────────
export const Sparkline = ({ data = [], w = 80, h = 28, color = 'var(--imile-500)', area = true }) => {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = w / (data.length - 1 || 1)
  const points = data.map((v, i) => [i * stepX, h - 4 - ((v - min) / range) * (h - 8)])
  const path = points.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
  const areaPath = path + ` L${w},${h} L0,${h} Z`
  const gradId = 'sg' + Math.abs(data[0] + data.length).toString(36)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="2.2" fill={color} />
    </svg>
  )
}

// ── KPI card ──────────────────────────────────────────────────
export const Kpi = ({ icon: Icon, iconKind = '', label, value, unit, delta, deltaLabel, sparkData, sparkColor }) => {
  const deltaCls   = delta == null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : ''
  const deltaArrow = delta == null ? '' : delta > 0 ? '↑' : delta < 0 ? '↓' : '·'
  return (
    <div className="kpi">
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        {Icon && <div className={`kpi-icon ${iconKind}`}><Icon size={14} /></div>}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      <div className="kpi-foot">
        {delta != null && (
          <span className={`kpi-delta ${deltaCls}`}>
            {deltaArrow} {Math.abs(delta).toFixed(1)}%
            {deltaLabel && <span style={{ color: 'var(--slate-400)', fontWeight: 500, marginLeft: 4 }}>{deltaLabel}</span>}
          </span>
        )}
        {sparkData?.length > 0 && (
          <div className="kpi-spark">
            <Sparkline data={sparkData} w={90} h={28} color={sparkColor || 'var(--imile-500)'} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Line Chart ────────────────────────────────────────────────
export const LineChart = ({ series = [], height = 260, showLegend = true, formatY = fmt.num, comparison = null }) => {
  const ref = useRef(null)
  const [hover, setHover] = useState(null)
  const [w, setW] = useState(600)

  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const padL = 50, padR = 20, padT = 16, padB = 32
  const innerW = w - padL - padR
  const innerH = height - padT - padB
  const allXLen = Math.max(...series.map(s => s.data.length), 1)
  const allY = series.flatMap(s => s.data.map(d => d.y)).concat(
    comparison ? comparison.flatMap(s => s.data.map(d => d.y)) : []
  )
  const yMin = Math.min(0, ...allY)
  const yMaxRaw = Math.max(1, ...allY)
  const yMax = yMaxRaw + (yMaxRaw - yMin) * .1

  const xToPx = i => padL + (i / Math.max(1, allXLen - 1)) * innerW
  const yToPx = v => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * innerH
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yMax - yMin) * (i / 4))

  const mkPath = (data, area = false) => {
    const pts = data.map((d, i) => [xToPx(i), yToPx(d.y)])
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
    if (!area) return line
    return line + ` L${pts[pts.length - 1][0]},${padT + innerH} L${pts[0][0]},${padT + innerH} Z`
  }

  const onMove = e => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left - padL) / innerW) * (allXLen - 1))
    if (i >= 0 && i < allXLen) setHover(i)
  }

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {showLegend && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12, flexWrap: 'wrap' }}>
          {series.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--slate-600)', fontWeight: 600 }}>{s.name}</span>
            </div>
          ))}
          {comparison?.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 1, borderTop: `1.5px dashed ${s.color}`, flexShrink: 0 }} />
              <span style={{ color: 'var(--slate-500)', fontWeight: 500, fontSize: 11.5 }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        style={{ display: 'block', cursor: 'crosshair' }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`lc${i}${w}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".2" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={yToPx(v)} y2={yToPx(v)} stroke="var(--border-2)" strokeDasharray="2 3" />
            <text x={padL - 8} y={yToPx(v)} textAnchor="end" dominantBaseline="middle" fontSize="10.5"
              fill="var(--slate-500)" fontFamily="var(--font-mono)">{formatY(v)}</text>
          </g>
        ))}
        {series[0]?.data.map((d, i) => {
          if (allXLen > 12 && i % Math.ceil(allXLen / 8) !== 0 && i !== allXLen - 1) return null
          return <text key={i} x={xToPx(i)} y={height - 10} textAnchor="middle" fontSize="10.5"
            fill="var(--slate-500)" fontWeight="600">{d.x}</text>
        })}
        {comparison?.map((s, i) => (
          <path key={i} d={mkPath(s.data)} fill="none" stroke={s.color} strokeWidth="1.5"
            strokeDasharray="3 3" opacity=".55" />
        ))}
        {series.map((s, i) => s.area !== false && (
          <path key={i} d={mkPath(s.data, true)} fill={`url(#lc${i}${w})`} />
        ))}
        {series.map((s, i) => (
          <path key={i} d={mkPath(s.data)} fill="none" stroke={s.color}
            strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && (
          <g>
            <line x1={xToPx(hover)} x2={xToPx(hover)} y1={padT} y2={padT + innerH}
              stroke="var(--slate-300)" strokeDasharray="2 2" />
            {series.map((s, i) => {
              const d = s.data[hover]; if (!d) return null
              return (
                <g key={i}>
                  <circle cx={xToPx(hover)} cy={yToPx(d.y)} r="5" fill="white" stroke={s.color} strokeWidth="2" />
                  <circle cx={xToPx(hover)} cy={yToPx(d.y)} r="2" fill={s.color} />
                </g>
              )
            })}
          </g>
        )}
      </svg>
      {hover != null && series[0]?.data[hover] && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(xToPx(hover) - 70, 4), w - 160),
          top: padT,
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-lg)',
          padding: '8px 12px', fontSize: 12, minWidth: 140, pointerEvents: 'none', zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            {series[0].data[hover].x}
          </div>
          {series.map(s => (
            <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--slate-700)' }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                {s.name}
              </span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--slate-900)' }}>
                {formatY(s.data[hover]?.y ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────
export const BarChart = ({ data = [], height = 240, color = 'var(--imile-500)', formatY = fmt.num, threshold = null, thresholdLabel = '' }) => {
  const ref = useRef(null)
  const [hover, setHover] = useState(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const padL = 44, padR = 16, padT = 14, padB = 38
  const innerW = w - padL - padR
  const innerH = height - padT - padB
  const yMax = Math.max(...data.map(d => d.value), threshold || 0) * 1.15 || 1
  const barW  = innerW / data.length * .65
  const gap   = innerW / data.length * .35

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        {[0, .25, .5, .75, 1].map((p, i) => {
          const y = padT + (1 - p) * innerH
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="var(--border-2)" strokeDasharray="2 3" />
              <text x={padL - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10.5"
                fill="var(--slate-500)" fontFamily="var(--font-mono)">{formatY(yMax * p)}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const x   = padL + (innerW / data.length) * i + gap / 2
          const bh  = (d.value / yMax) * innerH
          const y   = padT + innerH - bh
          const isH = hover === i
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
              <rect x={x} y={y} width={barW} height={bh} fill={d.color || color} rx="3"
                opacity={isH ? 1 : .88} style={{ transition: 'opacity .12s' }} />
              {isH && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11.5" fontWeight="700"
                  fill="var(--slate-900)" fontFamily="var(--font-mono)">{formatY(d.value)}</text>
              )}
              <text x={x + barW / 2} y={height - 18} textAnchor="middle" fontSize="11"
                fill="var(--slate-600)" fontWeight={isH ? 700 : 500}>{d.label}</text>
              {d.sub && <text x={x + barW / 2} y={height - 6} textAnchor="middle" fontSize="9.5" fill="var(--slate-400)">{d.sub}</text>}
            </g>
          )
        })}
        {threshold != null && (
          <g>
            <line x1={padL} x2={w - padR}
              y1={padT + (1 - threshold / yMax) * innerH}
              y2={padT + (1 - threshold / yMax) * innerH}
              stroke="var(--danger-500)" strokeWidth="1.2" strokeDasharray="4 3" />
            <text x={w - padR - 4} y={padT + (1 - threshold / yMax) * innerH - 4}
              textAnchor="end" fontSize="10" fill="var(--danger-600)" fontWeight="700">
              {thresholdLabel}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

// ── Rank Bar (horizontal) ─────────────────────────────────────
export const RankBar = ({ items = [], formatV = fmt.num, valueLabel = '' }) => {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--slate-400)', fontWeight: 700, textAlign: 'right' }}>{i + 1}</span>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: 'var(--slate-800)' }}>{it.label}</span>
              {it.sub && <span style={{ color: 'var(--slate-500)', fontSize: 11.5 }}>{it.sub}</span>}
            </div>
            <div style={{ height: 7, background: 'var(--slate-100)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: ((it.value / max) * 100).toFixed(1) + '%', height: '100%',
                background: it.color || 'linear-gradient(90deg, var(--imile-400), var(--imile-600))',
                borderRadius: 4, transition: 'width var(--t-slow) var(--easing-spring)',
              }} />
            </div>
          </div>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--slate-900)', minWidth: 60, textAlign: 'right' }}>
            {formatV(it.value)}{valueLabel}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Heatmap ───────────────────────────────────────────────────
export const Heatmap = ({ rows = [], cols = [], data = [], formatV = fmt.num, label = '', max: maxProp = null }) => {
  const realMax = maxProp || Math.max(...data.flat().filter(v => v != null), 1)
  const heatColor = v => {
    if (v == null || v === 0) return 'var(--slate-50)'
    const t = v / realMax
    if (t < .15) return '#dbe7fb'
    if (t < .3)  return '#b9d2f8'
    if (t < .45) return '#8ab5f1'
    if (t < .6)  return '#5b97e8'
    if (t < .75) return '#3274d6'
    if (t < .9)  return 'var(--imile-500)'
    return 'var(--imile-700)'
  }
  const cellSize = 28
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'inline-block' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `90px repeat(${cols.length}, ${cellSize}px)`, gap: 2, alignItems: 'center' }}>
          <div />
          {cols.map((c, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--slate-500)', fontWeight: 600, textAlign: 'center', padding: '4px 0' }}>{c}</div>
          ))}
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--slate-700)', paddingRight: 8, textAlign: 'right', whiteSpace: 'nowrap' }}>{r}</div>
              {(data[i] || []).map((v, j) => (
                <div key={j} title={`${r} · ${cols[j]}: ${formatV(v)}`}
                  style={{
                    width: cellSize, height: cellSize, background: heatColor(v),
                    borderRadius: 4, display: 'grid', placeItems: 'center',
                    fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: v && (v / realMax) > .5 ? 'white' : 'var(--slate-700)',
                    cursor: 'default', transition: 'transform var(--t-fast)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                  onMouseLeave={e => e.currentTarget.style.transform = ''}>
                  {v > 0 ? (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) : ''}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Treemap ───────────────────────────────────────────────────
export const Treemap = ({ items = [], height = 320, formatV = fmt.num }) => {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const layout = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value)
    const rects = []
    let x = 0, y = 0, rowW = w, rowH = height, dir = 'h'
    let remaining = [...sorted]
    while (remaining.length) {
      const n = remaining.length
      const head = remaining.slice(0, Math.min(4, Math.ceil(n / 2)))
      const headSum = head.reduce((s, i) => s + i.value, 0)
      const ratio = headSum / remaining.reduce((s, i) => s + i.value, 0)
      if (dir === 'h') {
        const stripeH = rowH * ratio
        let cx = x
        for (const it of head) {
          const cw = rowW * (it.value / headSum)
          rects.push({ ...it, x: cx, y, w: cw, h: stripeH })
          cx += cw
        }
        y += stripeH; rowH -= stripeH
      } else {
        const stripeW = rowW * ratio
        let cy = y
        for (const it of head) {
          const ch = rowH * (it.value / headSum)
          rects.push({ ...it, x, y: cy, w: stripeW, h: ch })
          cy += ch
        }
        x += stripeW; rowW -= stripeW
      }
      remaining = remaining.slice(head.length)
      dir = dir === 'h' ? 'v' : 'h'
    }
    return rects
  }, [items, w, height])

  const cats = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height, borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface-2)' }}>
      {layout.map((r, i) => (
        <div key={i} title={`${r.label}: ${formatV(r.value)}`}
          style={{
            position: 'absolute', left: r.x, top: r.y, width: r.w - 2, height: r.h - 2,
            background: r.color || cats[i % cats.length], borderRadius: 4,
            padding: 8, color: 'white', cursor: 'pointer',
            transition: 'all var(--t-fast)', overflow: 'hidden',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'scale(.98)' }}
          onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = '' }}>
          {r.w > 60 && r.h > 30 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: .95, lineHeight: 1.2 }}>{r.label}</div>
              <div style={{ fontSize: 11, opacity: .8, marginTop: 2, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatV(r.value)}</div>
              {r.w > 100 && r.h > 60 && r.sub && <div style={{ fontSize: 10.5, opacity: .7, marginTop: 4 }}>{r.sub}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Donut ─────────────────────────────────────────────────────
export const Donut = ({ items = [], size = 180, thickness = 28, total: totalProp = null }) => {
  const sum = totalProp || items.reduce((s, i) => s + i.value, 0) || 1
  const r = size / 2 - thickness / 2
  const cx = size / 2, cy = size / 2
  let angle = -Math.PI / 2
  const cats = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)']
  const arcs = items.map((it, i) => {
    const frac = it.value / sum
    const a0 = angle, a1 = angle + frac * Math.PI * 2
    angle = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    return { ...it, d: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`, frac, c: it.color || cats[i % cats.length] }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} stroke="var(--slate-100)" strokeWidth={thickness} fill="none" />
        {arcs.map((a, i) => (
          <path key={i} d={a.d} stroke={a.c} strokeWidth={thickness} fill="none" strokeLinecap="butt" />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="var(--slate-500)" fontWeight="700" letterSpacing=".05em">TOTAL</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--slate-900)">{fmt.k(sum)}</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 120 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto auto', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: a.c, flexShrink: 0 }} />
            <span style={{ color: 'var(--slate-700)', fontWeight: 500 }}>{a.label}</span>
            <span className="mono" style={{ color: 'var(--slate-500)', fontSize: 11.5 }}>{(a.frac * 100).toFixed(1)}%</span>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--slate-900)' }}>{fmt.num(a.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gauge ─────────────────────────────────────────────────────
export const Gauge = ({ value, target = 100, size = 120, label = '', formatV = v => v + '%', color = 'var(--imile-500)' }) => {
  const r = size / 2 - 10, c = size / 2
  const pct = Math.min(1, Math.max(0, value / target))
  const a0 = Math.PI, a1 = a0 + pct * Math.PI
  const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0)
  const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1)
  const xe = c + r, ye = c
  return (
    <svg width={size} height={size * .7} style={{ overflow: 'visible' }}>
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${xe} ${ye}`} stroke="var(--slate-100)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" />
      <text x={c} y={c - 4} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--slate-900)">{formatV(value)}</text>
      {label && <text x={c} y={c + 14} textAnchor="middle" fontSize="10.5" fill="var(--slate-500)" fontWeight="700" letterSpacing=".05em">{label.toUpperCase()}</text>}
    </svg>
  )
}

// Precisamos de React para JSX no Fragment do Heatmap
import React from 'react'

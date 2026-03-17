/**
 * components/Heatmap.jsx — Heatmap DS × Cidade
 */
import { useMemo } from 'react'

const COLORS_EXP = ['#fee2e2','#fecaca','#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a']
const COLORS_ENT = ['#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8']

function getColor(value, type) {
  const colors = type === 'ent' ? COLORS_ENT : COLORS_EXP
  if (type === 'exp') {
    // Red below 50%, transition to green above
    if (value < 0.3) return '#fee2e2'
    if (value < 0.5) return '#fca5a5'
    if (value < 0.6) return '#fde68a'
    if (value < 0.7) return '#fef08a'
    if (value < 0.8) return '#bbf7d0'
    if (value < 0.9) return '#86efac'
    return '#22c55e'
  }
  // Entrega: blue scale
  const idx = Math.min(Math.floor(value * colors.length), colors.length - 1)
  return colors[Math.max(0, idx)]
}

export default function Heatmap({ data, dsList, cityList, type = 'exp', title = '' }) {
  if (!data?.length || !dsList?.length || !cityList?.length) {
    return <p className="text-sm text-slate-500 text-center py-8">Sem dados de cidades para heatmap</p>
  }

  const cellSize = 36
  const labelW = 90

  return (
    <div>
      {title && <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>}
      <div className="overflow-auto max-h-[500px]">
        <div style={{ display: 'inline-block', minWidth: labelW + cityList.length * cellSize }}>
          {/* City headers */}
          <div className="flex" style={{ marginLeft: labelW }}>
            {cityList.map((city, ci) => (
              <div key={ci} style={{ width: cellSize, minWidth: cellSize }}
                className="text-[9px] text-slate-500 transform -rotate-45 origin-bottom-left whitespace-nowrap h-16 flex items-end">
                {city?.length > 12 ? city.slice(0, 12) + '…' : city}
              </div>
            ))}
          </div>

          {/* Rows */}
          {dsList.map((ds, ri) => (
            <div key={ri} className="flex items-center">
              <div style={{ width: labelW, minWidth: labelW }}
                className="text-[10px] font-medium text-slate-700 truncate pr-2 text-right">
                {ds}
              </div>
              {cityList.map((_, ci) => {
                const val = data[ri]?.[ci] || 0
                return (
                  <div key={ci}
                    style={{ width: cellSize, height: cellSize - 4, minWidth: cellSize, backgroundColor: getColor(val, type) }}
                    className="border border-white/50 rounded-[2px] flex items-center justify-center cursor-default group relative"
                    title={`${ds} → ${cityList[ci]}: ${(val * 100).toFixed(1)}%`}>
                    <span className="text-[8px] font-mono text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      {val > 0 ? `${(val * 100).toFixed(0)}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 ml-[90px]">
            <span className="text-[10px] text-slate-500">0%</span>
            <div className="flex h-3">
              {(type === 'exp'
                ? ['#fee2e2','#fca5a5','#fde68a','#bbf7d0','#86efac','#22c55e']
                : ['#dbeafe','#93c5fd','#3b82f6','#1d4ed8']
              ).map((c, i) => (
                <div key={i} style={{ backgroundColor: c, width: 24, height: 12 }} />
              ))}
            </div>
            <span className="text-[10px] text-slate-500">100%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

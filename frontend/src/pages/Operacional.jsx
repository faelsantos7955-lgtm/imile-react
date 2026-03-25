/**
 * pages/Operacional.jsx — Triagem + Monitoramento unificados com abas
 */
import { useState } from 'react'
import Triagem from './Triagem'
import Monitoramento from './Monitoramento'

const ABAS = [
  { key: 'triagem',       label: '🔀 Triagem DC×DS' },
  { key: 'monitoramento', label: '🚚 Monitoramento' },
]

export default function Operacional() {
  const [aba, setAba] = useState('triagem')

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              aba === a.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo — key força reset de estado ao trocar aba */}
      <div key={aba}>
        {aba === 'triagem'       && <Triagem />}
        {aba === 'monitoramento' && <Monitoramento />}
      </div>
    </div>
  )
}

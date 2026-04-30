/**
 * pages/Operacional.jsx — Triagem + Monitoramento
 */
import { useState } from 'react'
import Triagem from './Triagem'
import Monitoramento from './Monitoramento'
import { Wrench } from 'lucide-react'

const ABAS = [
  { key: 'triagem',       label: 'Triagem DC×DS' },
  { key: 'monitoramento', label: 'Monitoramento' },
]

export default function Operacional() {
  const [aba, setAba] = useState('triagem')

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Operacional</h1>
          <div className="page-sub">Triagem em tempo real · monitoramento de fontes</div>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {ABAS.map(a => (
          <button key={a.key} className={`tab${aba === a.key ? ' active' : ''}`} onClick={() => setAba(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      <div key={aba}>
        {aba === 'triagem'       && <Triagem />}
        {aba === 'monitoramento' && <Monitoramento />}
      </div>
    </>
  )
}

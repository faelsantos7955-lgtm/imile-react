/**
 * UploadActions — bloco de header com 3 partes:
 *   - <UploadSelect />   : dropdown de uploads (sort por data_ref desc)
 *   - <ExcelButton />    : exporta Excel via useUploadFlow
 *   - <DeleteButton />   : exclui upload (só renderiza se isAdmin)
 *
 * Cada um pode ser usado isolado, ou compostos via <UploadActions />.
 */
import { Download, Trash2, Loader } from 'lucide-react'

const fmtDate = (d) => {
  if (!d) return 'Sem data'
  const [y, m, day] = String(d).split('-')
  return `${day}/${m}/${y}`
}

export function UploadSelect({ uploads, value, onChange, totalLabel = 'reg.' }) {
  if (!uploads.length) return null
  const sorted = [...uploads].sort((a, b) =>
    String(b.data_ref || '').localeCompare(String(a.data_ref || ''))
  )
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className="filter-select"
    >
      {sorted.map((u) => (
        <option key={u.id} value={u.id}>
          {fmtDate(u.data_ref)} — {u.total?.toLocaleString('pt-BR')} {totalLabel}
        </option>
      ))}
    </select>
  )
}

export function ExcelButton({ onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled} className="btn">
      {loading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
      {loading ? 'Gerando…' : 'Excel'}
    </button>
  )
}

export function DeleteButton({ onClick, loading, disabled, isAdmin }) {
  if (!isAdmin) return null
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="btn"
      style={{ color: 'var(--danger-600)' }}
    >
      {loading ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
      Excluir
    </button>
  )
}

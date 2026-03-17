/**
 * pages/Admin.jsx — Painel administrativo
 */
import { PageHeader } from '../components/ui'

export default function Admin() {
  return (
    <div>
      <PageHeader icon="⚙️" title="Administração" subtitle="Upload, usuários e configurações" />
      <p className="text-slate-500 text-sm">
        Painel admin em construção. O processamento continua via <code className="bg-slate-100 px-1 rounded">processar.py</code> local.
      </p>
    </div>
  )
}

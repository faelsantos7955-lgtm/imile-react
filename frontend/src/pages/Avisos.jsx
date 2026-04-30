/**
 * pages/Avisos.jsx — Quadro de Avisos
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, Info, AlertTriangle, Zap, Megaphone, Plus } from 'lucide-react'
import { toast } from '../components/ui'
import api from '../lib/api'

const TIPO_CONFIG = {
  info:    { kind: 'info',    label: 'Informativo' },
  aviso:   { kind: 'warn',    label: 'Aviso' },
  urgente: { kind: 'danger',  label: 'Urgente' },
}

const TIPO_ICON = { info: Info, aviso: AlertTriangle, urgente: Zap }

function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AvisoCard({ aviso, onMarcarLido }) {
  const cfg  = TIPO_CONFIG[aviso.tipo] || TIPO_CONFIG.info
  const Icon = TIPO_ICON[aviso.tipo]   || Info
  const variantBg = { info: 'var(--info-50)', warn: 'var(--warn-50)', danger: 'var(--danger-50)' }[cfg.kind]
  const variantBorder = { info: 'var(--imile-200)', warn: 'var(--warn-100)', danger: 'var(--danger-100)' }[cfg.kind]
  const variantText   = { info: 'var(--imile-700)', warn: 'var(--warn-600)', danger: 'var(--danger-600)' }[cfg.kind]

  return (
    <div style={{
      background: 'white', border: `1px solid var(--border)`,
      borderRadius: 'var(--r-lg)', padding: '16px 20px',
      transition: 'all var(--t-base)', opacity: aviso.lido ? .65 : 1,
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: variantBg, border: `1px solid ${variantBorder}`,
        display: 'grid', placeItems: 'center', color: variantText,
      }}>
        <Icon size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--slate-900)' }}>{aviso.titulo}</h3>
            <span className={`chip chip-${cfg.kind}`}>{cfg.label}</span>
            {aviso.lido && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--slate-400)' }}>
                <CheckCheck size={11} /> Lido
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: 'var(--slate-400)', flexShrink: 0 }}>{fmtData(aviso.criado_em)}</span>
        </div>

        {aviso.conteudo && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--slate-600)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {aviso.conteudo}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>
            Publicado por <strong style={{ color: 'var(--slate-600)' }}>{aviso.criado_por}</strong>
          </span>
          {!aviso.lido && (
            <button
              onClick={() => onMarcarLido(aviso.id)}
              className="btn-ghost btn"
              style={{ padding: '2px 8px', fontSize: 11, color: 'var(--success-600)', gap: 4 }}>
              <CheckCheck size={11} /> Marcar como lido
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Avisos() {
  const qc = useQueryClient()

  const { data: avisos = [], isLoading } = useQuery({
    queryKey: ['avisos'],
    queryFn: () => api.get('/api/avisos').then(r => r.data),
  })

  const marcarLido = useMutation({
    mutationFn: (id) => api.post(`/api/avisos/${id}/lido`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['avisos-nao-lidos'] })
    },
    onError: () => toast.erro('Erro ao marcar como lido.'),
  })

  const marcarTodos = useMutation({
    mutationFn: () => api.post('/api/avisos/marcar-todos-lidos'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['avisos-nao-lidos'] })
      toast.ok('Todos os avisos marcados como lidos.')
    },
    onError: () => toast.erro('Erro ao marcar todos.'),
  })

  const naoLidos = avisos.filter(a => !a.lido)
  const urgentes = avisos.filter(a => a.tipo === 'urgente').length

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Avisos & Comunicados</h1>
          <div className="page-sub">
            {avisos.length} avisos ativos
            {urgentes > 0 && ` · ${urgentes} urgentes`}
            {naoLidos.length > 0 && ` · ${naoLidos.length} não lidos`}
          </div>
        </div>
        <div className="page-actions">
          {naoLidos.length > 0 && (
            <button className="btn" onClick={() => marcarTodos.mutate()} disabled={marcarTodos.isPending}>
              <CheckCheck size={14} /> Marcar todos como lidos
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-head"><div className="kpi-label">Total de avisos</div><div className="kpi-icon"><Megaphone size={14} /></div></div>
          <div className="kpi-value">{avisos.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><div className="kpi-label">Urgentes</div><div className="kpi-icon danger"><Zap size={14} /></div></div>
          <div className="kpi-value" style={{ color: urgentes > 0 ? 'var(--danger-600)' : 'var(--slate-900)' }}>{urgentes}</div>
        </div>
        <div className="kpi">
          <div className="kpi-head"><div className="kpi-label">Não lidos</div><div className="kpi-icon warn"><Bell size={14} /></div></div>
          <div className="kpi-value" style={{ color: naoLidos.length > 0 ? 'var(--warn-600)' : 'var(--slate-900)' }}>{naoLidos.length}</div>
        </div>
      </div>

      {/* Lista */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skel" style={{ height: 96, borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      )}

      {!isLoading && avisos.length === 0 && (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <BellOff size={32} style={{ margin: '0 auto 12px', color: 'var(--slate-300)' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--slate-700)', margin: 0 }}>Nenhum aviso no momento</p>
          <p style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 4 }}>Comunicados do time de gestão aparecerão aqui.</p>
        </div>
      )}

      {!isLoading && avisos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {avisos.map(a => (
            <AvisoCard key={a.id} aviso={a} onMarcarLido={(id) => marcarLido.mutate(id)} />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * pages/Avisos.jsx — Quadro de Avisos
 * Todos os usuários logados veem os avisos ativos e marcam como lido.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, Info, AlertTriangle, Zap } from 'lucide-react'
import { PageHeader, Button, EmptyState, toast } from '../components/ui'
import api from '../lib/api'
import clsx from 'clsx'

const TIPO_CONFIG = {
  info:    { icon: Info,          bg: 'bg-imile-50',   border: 'border-imile-200',  text: 'text-imile-700',  badge: 'bg-imile-100 text-imile-700',  label: 'Informativo' },
  aviso:   { icon: AlertTriangle, bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700',  label: 'Aviso' },
  urgente: { icon: Zap,           bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700',      label: 'Urgente' },
}

function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AvisoCard({ aviso, onMarcarLido }) {
  const cfg = TIPO_CONFIG[aviso.tipo] || TIPO_CONFIG.info
  const Icone = cfg.icon
  return (
    <div className={clsx(
      'rounded-xl border p-5 transition-all duration-200 animate-in',
      cfg.bg, cfg.border,
      aviso.lido && 'opacity-60'
    )}>
      <div className="flex items-start gap-4">
        <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', cfg.bg, 'border', cfg.border)}>
          <Icone size={16} className={cfg.text} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-slate-900">{aviso.titulo}</h3>
              <span className={clsx('px-2 py-0.5 rounded-md text-[10px] font-semibold', cfg.badge)}>
                {cfg.label}
              </span>
              {aviso.lido && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <CheckCheck size={11} /> Lido
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 shrink-0">{fmtData(aviso.criado_em)}</p>
          </div>

          {aviso.conteudo && (
            <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
              {aviso.conteudo}
            </p>
          )}

          <div className="flex items-center gap-3 mt-3">
            <p className="text-[11px] text-slate-400">Publicado por <span className="font-medium">{aviso.criado_por}</span></p>
            {!aviso.lido && (
              <button
                onClick={() => onMarcarLido(aviso.id)}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
              >
                <CheckCheck size={11} /> Marcar como lido
              </button>
            )}
          </div>
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

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Quadro de Avisos"
        subtitle="Comunicados e atualizações do time de gestão operacional"
        action={
          naoLidos.length > 0 && (
            <Button
              variant="secondary" size="sm"
              onClick={() => marcarTodos.mutate()}
              disabled={marcarTodos.isPending}
            >
              <CheckCheck size={13} /> Marcar todos como lidos
            </Button>
          )
        }
      />

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="w-9 h-9 bg-slate-100 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-48" />
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && avisos.length === 0 && (
        <EmptyState
          icon={BellOff}
          title="Nenhum aviso no momento"
          description="Quando a equipe de gestão publicar comunicados, eles aparecerão aqui."
        />
      )}

      {!isLoading && avisos.length > 0 && (
        <>
          {naoLidos.length > 0 && (
            <p className="text-xs font-semibold text-slate-500 mb-3">
              {naoLidos.length} aviso{naoLidos.length > 1 ? 's' : ''} não lido{naoLidos.length > 1 ? 's' : ''}
            </p>
          )}
          <div className="space-y-3">
            {avisos.map(a => (
              <AvisoCard
                key={a.id}
                aviso={a}
                onMarcarLido={(id) => marcarLido.mutate(id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

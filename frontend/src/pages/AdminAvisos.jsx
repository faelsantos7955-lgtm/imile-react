/**
 * pages/AdminAvisos.jsx — Gerenciamento do Quadro de Avisos (Admin)
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Loader, Eye, EyeOff, Info, AlertTriangle, Zap,
} from 'lucide-react'
import { Card, SectionHeader, Button, EmptyState, toast } from '../components/ui'
import api from '../lib/api'
import clsx from 'clsx'

const TIPO_CONFIG = {
  info:    { icon: Info,          color: 'text-imile-600',  bg: 'bg-imile-50',  border: 'border-imile-200',  label: 'Informativo' },
  aviso:   { icon: AlertTriangle, color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Aviso' },
  urgente: { icon: Zap,           color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200',    label: 'Urgente' },
}

function fmtData(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const EMPTY_FORM = { titulo: '', conteudo: '', tipo: 'info' }

function NovoAvisoForm({ onClose, onSuccess }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const qc = useQueryClient()

  const criar = useMutation({
    mutationFn: () => api.post('/api/avisos', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['avisos-admin'] })
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['avisos-nao-lidos'] })
      toast.ok('Aviso publicado com sucesso!')
      onSuccess?.()
    },
    onError: (err) => toast.erro(err?.response?.data?.detail || 'Erro ao criar aviso.'),
  })

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-imile-500/20 focus:border-imile-400 transition-all'

  return (
    <Card title="Novo Aviso" className="mb-6">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Título *</label>
          <input
            type="text" value={form.titulo}
            onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
            placeholder="Título do aviso..."
            className={inputCls}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Conteúdo</label>
          <textarea
            value={form.conteudo}
            onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
            placeholder="Descreva o comunicado, mudança de processo, etc..."
            rows={4}
            className={inputCls + ' resize-none'}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-2">Tipo</label>
          <div className="flex gap-2">
            {Object.entries(TIPO_CONFIG).map(([key, cfg]) => {
              const Icone = cfg.icon
              return (
                <button
                  key={key} type="button"
                  onClick={() => setForm(f => ({ ...f, tipo: key }))}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                    form.tipo === key
                      ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  )}
                >
                  <Icone size={12} /> {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary" size="sm" className="flex-1"
            onClick={onClose} disabled={criar.isPending}
          >
            Cancelar
          </Button>
          <Button
            size="sm" className="flex-2"
            onClick={() => criar.mutate()}
            disabled={!form.titulo.trim() || criar.isPending}
          >
            {criar.isPending ? <><Loader size={12} className="animate-spin" /> Publicando…</> : <><Plus size={12} /> Publicar aviso</>}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default function AdminAvisos() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [deletando, setDeletando] = useState(null)

  const { data: avisos = [], isLoading } = useQuery({
    queryKey: ['avisos-admin'],
    queryFn: () => api.get('/api/avisos/admin/todos').then(r => r.data),
  })

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }) => api.patch(`/api/avisos/${id}`, { ativo }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['avisos-admin'] })
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['avisos-nao-lidos'] })
      toast.ok(vars.ativo ? 'Aviso reativado.' : 'Aviso desativado.')
    },
    onError: () => toast.erro('Erro ao alterar aviso.'),
  })

  const excluir = async (id) => {
    if (!window.confirm('Excluir este aviso permanentemente?')) return
    setDeletando(id)
    try {
      await api.delete(`/api/avisos/${id}`)
      qc.invalidateQueries({ queryKey: ['avisos-admin'] })
      qc.invalidateQueries({ queryKey: ['avisos'] })
      qc.invalidateQueries({ queryKey: ['avisos-nao-lidos'] })
      toast.ok('Aviso excluído.')
    } catch {
      toast.erro('Erro ao excluir aviso.')
    } finally {
      setDeletando(null)
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Quadro de Avisos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Gerencie comunicados visíveis para todos os usuários</p>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={13} /> Novo aviso
          </Button>
        )}
      </div>

      {showForm && (
        <NovoAvisoForm
          onClose={() => setShowForm(false)}
          onSuccess={() => setShowForm(false)}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-100 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-48 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && avisos.length === 0 && (
        <EmptyState
          icon={Plus}
          title="Nenhum aviso criado"
          description="Crie o primeiro aviso para comunicar mudanças a todos os usuários."
          action={<Button size="sm" onClick={() => setShowForm(true)}><Plus size={12} /> Criar aviso</Button>}
        />
      )}

      {!isLoading && avisos.length > 0 && (
        <div className="space-y-3">
          {avisos.map(a => {
            const cfg = TIPO_CONFIG[a.tipo] || TIPO_CONFIG.info
            const Icone = cfg.icon
            return (
              <div key={a.id} className={clsx(
                'flex items-start gap-4 p-4 rounded-xl border bg-white transition-all',
                !a.ativo && 'opacity-50'
              )}>
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.bg)}>
                  <Icone size={14} className={cfg.color} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{a.titulo}</p>
                      {a.conteudo && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{a.conteudo}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleAtivo.mutate({ id: a.id, ativo: !a.ativo })}
                        title={a.ativo ? 'Desativar' : 'Reativar'}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                      >
                        {a.ativo ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={() => excluir(a.id)}
                        disabled={deletando === a.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        {deletando === a.id ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-md', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{fmtData(a.criado_em)}</span>
                    <span className="text-[10px] text-slate-400">
                      {a.total_lidos ?? 0} leitura{a.total_lidos !== 1 ? 's' : ''}
                    </span>
                    {!a.ativo && (
                      <span className="text-[10px] text-slate-400 font-medium">· Inativo</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

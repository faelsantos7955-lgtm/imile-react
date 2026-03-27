/**
 * pages/Monitoramento.jsx — Monitoramento Diário de Entregas
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { PageHeader, Card, Alert, UploadGuide } from '../components/ui'
import { Upload, Loader, RefreshCw, Trash2, TrendingUp, Package, Truck, AlertTriangle } from 'lucide-react'
import { validarArquivos } from '../lib/validarArquivo'

function KPI({ label, value, icon: Icon, color = '#334155', suffix = '' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
          <p className="text-xl font-bold font-mono mt-1" style={{ color }}>
            {value}{suffix}
          </p>
        </div>
        {Icon && <Icon size={20} className="text-slate-300" />}
      </div>
    </div>
  )
}

function TaxaCell({ value }) {
  const pct = (value * 100)
  const cor = pct >= 90 ? 'text-emerald-600' : pct >= 70 ? 'text-amber-600' : pct > 0 ? 'text-red-600' : 'text-slate-400'
  return (
    <td className={`px-2 py-2 text-center border border-slate-200 font-mono font-bold text-xs ${cor}`}>
      {pct > 0 ? `${pct.toFixed(1)}%` : '-'}
    </td>
  )
}

export default function Monitoramento() {
  const { isAdmin }               = useAuth()
  const queryClient               = useQueryClient()
  const [uploadSel, setUploadSel] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [erro, setErro]           = useState('')
  const [sortCol, setSortCol]     = useState(null)
  const [sortAsc, setSortAsc]     = useState(true)
  const inputRef = useRef()

  const { data: uploads = [] } = useQuery({
    queryKey: ['monitoramento-uploads'],
    queryFn: () => api.get('/api/monitoramento/uploads').then(r => r.data || []).catch(() => []),
  })

  useEffect(() => {
    if (uploads.length && !uploadSel) setUploadSel(uploads[0].id)
  }, [uploads])

  const { data: dados, isLoading: loading } = useQuery({
    queryKey: ['monitoramento-dados', uploadSel],
    queryFn: () => api.get(`/api/monitoramento/upload/${uploadSel}`).then(r => r.data),
    enabled: !!uploadSel,
  })

  const carregarUploads = () => queryClient.invalidateQueries({ queryKey: ['monitoramento-uploads'] })

  const handleDelete = async () => {
    if (!uploadSel || !window.confirm('Excluir este upload permanentemente?')) return
    try {
      await api.delete(`/api/monitoramento/upload/${uploadSel}`)
      setUploadSel(null)
      carregarUploads()
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao excluir.')
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const erroVal = validarArquivos(file)
    if (erroVal) { setErro(erroVal); return }
    setUploading(true); setErro('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/monitoramento/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      await carregarUploads()
      setUploadSel(res.data.upload_id)
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivo.')
    } finally { setUploading(false) }
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
  }

  const fmtDate = d => d || '—'
  const F = n => n?.toLocaleString('pt-BR') ?? '0'

  const sortedDados = dados?.dados ? [...dados.dados].sort((a, b) => {
    if (!sortCol) return 0
    const va = a[sortCol] ?? 0
    const vb = b[sortCol] ?? 0
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? va - vb : vb - va
  }) : []

  const COLS = [
    { key: 'ds',                   label: 'DS',             align: 'left', bold: true },
    { key: 'supervisor',           label: 'Supervisor',     align: 'left' },
    { key: 'regiao',               label: 'Região',         align: 'left' },
    { key: 'rdc_ds',               label: 'RDC→DS',         align: 'center', num: true },
    { key: 'estoque_ds',           label: 'Est. DS',        align: 'center', num: true },
    { key: 'estoque_motorista',    label: 'Est. Mot.',      align: 'center', num: true },
    { key: 'estoque_total',        label: 'Est. Total',     align: 'center', num: true },
    { key: 'estoque_7d',           label: '>7d',            align: 'center', num: true, danger: true },
    { key: 'recebimento',          label: 'Recebido',       align: 'center', num: true },
    { key: 'volume_total',         label: 'Vol. Total',     align: 'center', num: true },
    { key: 'pendencia_scan',       label: 'Pendência',      align: 'center', num: true },
    { key: 'volume_saida',         label: 'Saída',          align: 'center', num: true },
    { key: 'taxa_expedicao',       label: 'Taxa Exp.',      align: 'center', pct: true },
    { key: 'qtd_motoristas',       label: 'DV',             align: 'center', num: true },
    { key: 'eficiencia_pessoal',   label: 'Ef. Pessoal',    align: 'center', dec: true },
    { key: 'entregue',             label: 'Entregue',       align: 'center', num: true },
    { key: 'eficiencia_assinatura', label: 'Ef. Assin.',    align: 'center', dec: true },
  ]

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📊" title="Monitoramento Diário" subtitle="Controle operacional diário por DS — estoque, expedição, entrega" />
        <div className="flex gap-2">
          <UploadGuide
            title="Arquivo de Monitoramento Diário"
            items={[
              'Arquivo .xlsm do relatório diário de entregas',
              'Deve conter a aba "Relatorio" com as colunas na ordem: DS, Supervisor, Região, RDC_DS, Estoque DS, Estoque Motorista, Estoque Total, Estoque >7d, Recebimento, Volume Total, Pendência Scan, Volume Saída, Taxa Expedição, Qtd Motoristas, Eficiência Pessoal, Entregue, Eficiência Assinatura',
              'A primeira coluna (DS) deve começar com "DS"',
              'Não altere a ordem das colunas nem o nome da aba',
            ]}
          />
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {erro && <Alert type="warning" className="mb-4">{erro}</Alert>}

      {/* Seletor de upload */}
      {uploads.length > 0 && (
        <div className="flex items-center gap-3 mb-6 bg-white border border-slate-200 rounded-xl p-3">
          <span className="text-xs font-semibold text-slate-500 uppercase">Upload</span>
          <select value={uploadSel || ''} onChange={e => setUploadSel(Number(e.target.value))}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white flex-1 max-w-xs">
            {uploads.map(u => (
              <option key={u.id} value={u.id}>
                {fmtDate(u.data_ref)} — {u.total_ds} bases
              </option>
            ))}
          </select>
          <button onClick={() => carregarUploads()} className="p-1.5 text-slate-400 hover:text-slate-600">
            <RefreshCw size={14} />
          </button>
          {isAdmin && uploadSel && (
            <button onClick={handleDelete} className="p-1.5 text-red-400 hover:text-red-600" title="Excluir upload">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {uploads.length === 0 && !loading && (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o arquivo de Monitoramento Diário (.xlsm)</p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 mt-8 justify-center">
          <Loader size={18} className="animate-spin" /> Carregando...
        </div>
      )}

      {!loading && dados && <>
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <KPI label="Volume Total" value={F(dados.totais.volume_total)} icon={Package} color="#095EF7" />
          <KPI label="Recebimento" value={F(dados.totais.recebimento)} icon={TrendingUp} color="#16A34A" />
          <KPI label="Saída" value={F(dados.totais.volume_saida)} icon={Truck} color="#7C3AED" />
          <KPI label="Taxa Expedição" value={`${(dados.totais.taxa_expedicao * 100).toFixed(1)}`} suffix="%" icon={TrendingUp}
            color={dados.totais.taxa_expedicao >= 0.9 ? '#16A34A' : dados.totais.taxa_expedicao >= 0.7 ? '#EA580C' : '#DC2626'} />
          <KPI label="Entregue" value={F(dados.totais.entregue)} icon={Package} color="#0891B2" />
          <KPI label="Estoque >7d" value={F(dados.totais.estoque_7d)} icon={AlertTriangle}
            color={dados.totais.estoque_7d > 100 ? '#DC2626' : '#334155'} />
        </div>

        {/* Tabela principal */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  {COLS.map(col => (
                    <th key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-2 py-2.5 border border-slate-700 cursor-pointer hover:bg-slate-700 whitespace-nowrap
                        ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                      {col.label}
                      {sortCol === col.key && (sortAsc ? ' ↑' : ' ↓')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedDados.map((row, i) => (
                  <tr key={i} className={`${i % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'} hover:bg-imile-50/60`}>
                    {COLS.map(col => {
                      const val = row[col.key]

                      if (col.pct) return <TaxaCell key={col.key} value={val || 0} />

                      if (col.danger && val > 0) {
                        return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono font-bold text-xs text-red-600 bg-red-50">
                            {(val || 0).toLocaleString('pt-BR')}
                          </td>
                        )
                      }

                      if (col.dec) {
                        return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono text-xs text-slate-600">
                            {val ? val.toFixed(1) : '0'}
                          </td>
                        )
                      }

                      if (col.num) {
                        return (
                          <td key={col.key} className="px-2 py-2 text-center border border-slate-200 font-mono text-xs text-slate-700">
                            {(val || 0).toLocaleString('pt-BR')}
                          </td>
                        )
                      }

                      return (
                        <td key={col.key} className={`px-2 py-2 border border-slate-200 text-xs
                          ${col.bold ? 'font-semibold text-slate-800' : 'text-slate-600'}
                          ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                          {val || '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Linha de total */}
                <tr className="bg-slate-800 text-white font-bold">
                  <td className="px-2 py-2 border border-slate-700 text-xs">TOTAL</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center">—</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center">—</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.rdc_ds)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_ds)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_motorista)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_total)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.estoque_7d)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.recebimento)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.volume_total)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">—</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.volume_saida)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">
                    {(dados.totais.taxa_expedicao * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.qtd_motoristas)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">
                    {dados.totais.eficiencia_pessoal?.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">{F(dados.totais.entregue)}</td>
                  <td className="px-2 py-2 border border-slate-700 text-xs text-center font-mono">
                    {dados.totais.eficiencia_assinatura?.toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </>}
    </div>
  )
}

/**
 * pages/Backlog.jsx — Backlog SLA com histórico salvo no banco
 */
import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'
import { PageHeader, SectionHeader, Card, Alert } from '../components/ui'
import { Upload, Download, Loader, RefreshCw } from 'lucide-react'

const FAIXAS = ['1-3', '3-5', '5-7', '7-10', '10-15', '15-20', 'Backlog >20']
const FAIXAS_LABELS = ['1D<3D', '3D<5D', '5D<7D', '7D<10D', '10D<15D', '15D<20D', '≥20D']
const CORES = {
  '1-3':         { bg: '#92D050', text: '#000' },
  '3-5':         { bg: '#FFFF00', text: '#000' },
  '5-7':         { bg: '#FFC000', text: '#000' },
  '7-10':        { bg: '#FF7F00', text: '#fff' },
  '10-15':       { bg: '#FF0000', text: '#fff' },
  '15-20':       { bg: '#C00000', text: '#fff' },
  'Backlog >20': { bg: '#7030A0', text: '#fff' },
}

function FaixaCell({ faixa, value }) {
  if (!value) return <td className="px-2 py-2 text-center text-xs border border-slate-200 text-slate-300">0</td>
  const { bg, text } = CORES[faixa] || {}
  return (
    <td className="px-2 py-2 text-center text-xs border border-slate-200 font-bold"
      style={{ backgroundColor: bg, color: text }}>
      {value.toLocaleString('pt-BR')}
    </td>
  )
}

function TabelaBacklog({ titulo, dados, cor = '#1F3864', showSupervisor = false, showRegiao = false }) {
  return (
    <div className="mb-6">
      <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm"
        style={{ backgroundColor: cor }}>
        {titulo}
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: cor }} className="text-white text-center">
              {showRegiao    && <th className="px-3 py-2 border border-white/20 text-left">Região</th>}
              {showSupervisor && <th className="px-3 py-2 border border-white/20 text-left">Supervisor</th>}
              <th className="px-3 py-2 border border-white/20 text-left">Nome</th>
              <th className="px-3 py-2 border border-white/20">Orders</th>
              <th className="px-3 py-2 border border-white/20">Backlog</th>
              <th className="px-3 py-2 border border-white/20">% Backlog</th>
              {FAIXAS_LABELS.map((f, i) => (
                <th key={i} className="px-2 py-2 border border-white/20"
                  style={{ backgroundColor: CORES[FAIXAS[i]]?.bg, color: CORES[FAIXAS[i]]?.text }}>
                  {f}
                </th>
              ))}
              <th className="px-3 py-2 border border-white/20">&gt;7D</th>
              {showSupervisor && <th className="px-3 py-2 border border-white/20">Prior.</th>}
            </tr>
          </thead>
          <tbody>
            {dados.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}>
                {showRegiao && (
                  <td className="px-3 py-2 border border-slate-200 text-slate-500">{row.regiao || '—'}</td>
                )}
                {showSupervisor && (
                  <td className="px-3 py-2 border border-slate-200 text-slate-600">{row.supervisor || '—'}</td>
                )}
                <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">{row.nome}</td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono">
                  {(row.orders || 0).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-blue-700">
                  {(row.backlog || 0).toLocaleString('pt-BR')}
                </td>
                <td className={`px-3 py-2 text-center border border-slate-200 font-mono
                  ${row.pct_backlog > 50 ? 'text-red-600 font-bold' : row.pct_backlog > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {row.pct_backlog?.toFixed(1)}%
                </td>
                {FAIXAS.map((f, fi) => (
                  <FaixaCell key={fi} faixa={f} value={row.faixas?.[f] || 0} />
                ))}
                <td className={`px-3 py-2 text-center border border-slate-200 font-mono font-bold
                  ${row.total_7d > 500 ? 'text-red-600' : row.total_7d > 100 ? 'text-amber-600' : 'text-slate-600'}`}>
                  {(row.total_7d || 0).toLocaleString('pt-BR')}
                </td>
                {showSupervisor && (
                  <td className="px-2 py-2 text-center border border-slate-200">
                    <span className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: '#1F3864' }}>
                      {row.prioridade}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Backlog() {
  const [uploads, setUploads]         = useState([])
  const [uploadSel, setUploadSel]     = useState(null)
  const [dados, setDados]             = useState(null)
  const [loading, setLoading]         = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [erro, setErro]               = useState('')
  const inputRef = useRef()

  const carregarUploads = async () => {
    try {
      const res = await api.get('/api/backlog/uploads')
      setUploads(res.data || [])
      if (res.data?.length && !uploadSel) {
        setUploadSel(res.data[0].id)
      }
    } catch {}
  }

  const carregarDados = async (id) => {
    setLoading(true); setErro('')
    try {
      const res = await api.get(`/api/backlog/upload/${id}`)
      setDados(res.data)
    } catch { setErro('Erro ao carregar dados.') }
    finally { setLoading(false) }
  }

  useEffect(() => { carregarUploads() }, [])
  useEffect(() => { if (uploadSel) carregarDados(uploadSel) }, [uploadSel])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErro('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/backlog/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      await carregarUploads()
      setUploadSel(res.data.upload_id)
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivo.')
    } finally { setUploading(false) }
  }

  const baixarExcel = async () => {
    if (!uploadSel) return
    setDownloading(true)
    try {
      const res = await api.post(`/api/backlog/excel/${uploadSel}`, {}, { responseType: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([res.data]))
      a.download = `Backlog_SLA.xlsx`
      a.click()
    } catch { alert('Erro ao gerar Excel') }
    finally { setDownloading(false) }
  }

  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
  const F = n => n?.toLocaleString('pt-BR') ?? '0'

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📦" title="Backlog SLA" subtitle="Pedidos acima do SLA por RDC, Supervisor, DS e Motivo" />
        <div className="flex gap-2">
          {dados && (
            <button onClick={baixarExcel} disabled={downloading}
              className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 disabled:opacity-50">
              {downloading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              Excel
            </button>
          )}
          <button onClick={() => inputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-imile-500 text-white rounded-lg text-sm font-medium hover:bg-imile-600 disabled:opacity-50">
            {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? 'Processando...' : 'Novo Upload'}
          </button>
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
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
                {fmtDate(u.data_ref)} — {(u.total || 0).toLocaleString('pt-BR')} pedidos
              </option>
            ))}
          </select>
          <button onClick={() => carregarUploads()} className="p-1.5 text-slate-400 hover:text-slate-600">
            <RefreshCw size={14} />
          </button>
        </div>
      )}

      {uploads.length === 0 && !loading && (
        <Card className="text-center py-12">
          <Upload size={40} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhum upload ainda</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Novo Upload" para enviar o arquivo Excel de Backlog SLA</p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 mt-8 justify-center">
          <Loader size={18} className="animate-spin" /> Carregando...
        </div>
      )}

      {!loading && dados && <>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { l: 'Total Backlog', v: F(dados.kpis.total),      c: '#2563EB' },
            { l: 'Na DS',        v: F(dados.kpis.na_ds),       c: '#16A34A' },
            { l: 'Em Trânsito',  v: F(dados.kpis.em_transito), c: '#EA580C' },
            { l: 'Críticos >7d', v: F(dados.kpis.total_7d),    c: '#DC2626' },
            { l: '% Crítico',    v: `${dados.kpis.pct_7d}%`,   c: '#1E3A5F' },
          ].map(({ l, v, c }) => (
            <div key={l} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm"
              style={{ borderLeftWidth: 4, borderLeftColor: c }}>
              <p className="text-[10px] font-bold uppercase text-slate-400">{l}</p>
              <p className="text-2xl font-bold font-mono mt-1" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Faixas */}
        <div className="flex gap-2 flex-wrap mb-6">
          {FAIXAS.map((f, i) => {
            const qtd = dados.kpis.por_faixa?.[f] || 0
            const { bg, text } = CORES[f]
            return (
              <div key={f} className="rounded-lg px-3 py-2 text-center min-w-[80px]"
                style={{ backgroundColor: bg, color: text }}>
                <p className="text-[10px] font-bold">{FAIXAS_LABELS[i]}</p>
                <p className="text-lg font-bold font-mono">{qtd.toLocaleString('pt-BR')}</p>
              </div>
            )
          })}
        </div>

        {/* Tabelas */}
        <TabelaBacklog titulo="LH — Por RDC"           dados={dados.por_rdc}        cor="#2E75B6" showRegiao />
        <TabelaBacklog titulo="DS — Por Supervisor"     dados={dados.por_supervisor} cor="#375623" />
        <TabelaBacklog titulo="DS — Detalhado por Base" dados={dados.por_ds}         cor="#1F3864" showSupervisor />

        {/* Tabela de Motivos */}
        {dados.por_motivo?.length > 0 && (
          <div className="mb-6">
            <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm"
              style={{ backgroundColor: '#7030A0' }}>
              DS — Por Motivo (Último Status)
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#7030A0' }} className="text-white text-center">
                    <th className="px-3 py-2 border border-white/20 text-left">Motivo</th>
                    <th className="px-3 py-2 border border-white/20">Backlog</th>
                    <th className="px-3 py-2 border border-white/20">% Backlog</th>
                    {FAIXAS_LABELS.map((f, i) => (
                      <th key={i} className="px-2 py-2 border border-white/20"
                        style={{ backgroundColor: CORES[FAIXAS[i]]?.bg, color: CORES[FAIXAS[i]]?.text }}>
                        {f}
                      </th>
                    ))}
                    <th className="px-3 py-2 border border-white/20">&gt;7D</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_motivo.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-blue-50/30' : 'bg-white'}>
                      <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">{row.nome}</td>
                      <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-blue-700">
                        {(row.backlog || 0).toLocaleString('pt-BR')}
                      </td>
                      <td className={`px-3 py-2 text-center border border-slate-200 font-mono
                        ${row.pct_backlog > 50 ? 'text-red-600 font-bold' : row.pct_backlog > 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {row.pct_backlog?.toFixed(1)}%
                      </td>
                      {FAIXAS.map((f, fi) => (
                        <FaixaCell key={fi} faixa={f} value={row.faixas?.[f] || 0} />
                      ))}
                      <td className={`px-3 py-2 text-center border border-slate-200 font-mono font-bold
                        ${row.total_7d > 500 ? 'text-red-600' : row.total_7d > 100 ? 'text-amber-600' : 'text-slate-600'}`}>
                        {(row.total_7d || 0).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}

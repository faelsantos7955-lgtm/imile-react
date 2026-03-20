/**
 * pages/Backlog.jsx — Backlog SLA Dashboard
 * Upload do arquivo Excel → processa no backend → exibe tabelas idênticas ao original
 */
import { useState, useRef } from 'react'
import api from '../lib/api'
import { PageHeader, SectionHeader, Card, Alert } from '../components/ui'
import { Upload, Download, Loader, ChevronDown, ChevronRight } from 'lucide-react'

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

function TabelaBacklog({ titulo, dados, cor = '#1F3864', showSupervisor = false }) {
  const [expandidos, setExpandidos] = useState({})

  return (
    <div className="mb-6">
      <div className="rounded-t-xl px-4 py-2 text-white font-bold text-sm"
        style={{ backgroundColor: cor }}>
        {titulo}
      </div>
      <div className="overflow-x-auto border border-slate-200 rounded-b-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white text-center" style={{ backgroundColor: cor }}>
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
                {showSupervisor && (
                  <td className="px-3 py-2 border border-slate-200 font-medium text-slate-700">
                    {row.supervisor || '—'}
                  </td>
                )}
                <td className="px-3 py-2 border border-slate-200 font-semibold text-slate-800">
                  {row.nome}
                </td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono">
                  {(row.orders || 0).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2 text-center border border-slate-200 font-mono font-bold text-blue-700">
                  {(row.backlog || 0).toLocaleString('pt-BR')}
                </td>
                <td className={`px-3 py-2 text-center border border-slate-200 font-mono text-xs
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
                    <span className="inline-block w-7 h-7 rounded-full bg-navy-900 text-white text-[10px] font-bold flex items-center justify-center"
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
  const [dados, setDados]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [arquivo, setArquivo]     = useState(null)
  const [erro, setErro]           = useState('')
  const inputRef = useRef()

  const processar = async (file) => {
    setLoading(true); setErro('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/api/backlog/processar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setDados(res.data)
    } catch (e) {
      setErro(e.response?.data?.detail || 'Erro ao processar arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setArquivo(file)
    processar(file)
  }

  const baixarExcel = async () => {
    if (!arquivo) return
    setDownloading(true)
    try {
      const form = new FormData()
      form.append('file', arquivo)
      const res = await api.post('/api/backlog/excel', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob'
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([res.data]))
      a.download = `Backlog_SLA_${new Date().toISOString().slice(0,10)}.xlsx`
      a.click()
    } catch { alert('Erro ao gerar Excel') }
    finally { setDownloading(false) }
  }

  const F = n => n?.toLocaleString('pt-BR') ?? '0'

  return (
    <div>
      <div className="flex items-start justify-between">
        <PageHeader icon="📦" title="Backlog SLA" subtitle="Análise de pedidos acima do SLA por RDC, Supervisor e DS" />
        {dados && (
          <button onClick={baixarExcel} disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 bg-navy-900 text-white rounded-lg text-sm font-medium hover:bg-navy-800 disabled:opacity-50">
            {downloading ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            Excel
          </button>
        )}
      </div>

      {/* Upload */}
      <Card className="mb-6">
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-imile-400 hover:bg-slate-50 transition-all">
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
          {loading
            ? <div className="flex flex-col items-center gap-3">
                <Loader size={32} className="animate-spin text-imile-500" />
                <p className="text-slate-600 font-medium">Processando arquivo...</p>
              </div>
            : <div className="flex flex-col items-center gap-3">
                <Upload size={32} className="text-slate-400" />
                <p className="text-slate-600 font-medium">
                  {arquivo ? `✅ ${arquivo.name}` : 'Clique para selecionar o arquivo Excel de Backlog SLA'}
                </p>
                <p className="text-slate-400 text-xs">Arquivo com abas: Backlog_Details + Resume_</p>
              </div>
          }
        </div>
      </Card>

      {erro && <Alert type="warning">{erro}</Alert>}

      {dados && <>
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { l: 'Total Backlog',  v: F(dados.kpis.total),       c: 'blue'   },
            { l: 'Na DS',         v: F(dados.kpis.na_ds),        c: 'green'  },
            { l: 'Em Trânsito',   v: F(dados.kpis.em_transito),  c: 'orange' },
            { l: 'Críticos >7d',  v: F(dados.kpis.total_7d),     c: 'red'    },
            { l: '% Crítico',     v: `${dados.kpis.pct_7d}%`,    c: 'violet' },
          ].map(({ l, v, c }) => (
            <div key={l} className={`bg-white rounded-xl border-l-4 p-4 shadow-sm border-${c}-500`}>
              <p className="text-[10px] font-bold uppercase text-slate-400">{l}</p>
              <p className={`text-2xl font-bold font-mono text-${c}-600 mt-1`}>{v}</p>
            </div>
          ))}
        </div>

        {/* Faixas resumo */}
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
        <TabelaBacklog
          titulo="LH — Por RDC"
          dados={dados.por_rdc}
          cor="#2E75B6"
        />
        <TabelaBacklog
          titulo="DS — Por Supervisor"
          dados={dados.por_supervisor}
          cor="#375623"
        />
        <TabelaBacklog
          titulo="DS — Detalhado por Base (ordenado por >7D)"
          dados={dados.por_ds}
          cor="#1F3864"
          showSupervisor
        />
      </>}
    </div>
  )
}

/**
 * pages/Extravios.jsx — Controle de Extravios (perdas e avarias)
 */
import { RankBar, Donut, LineChart } from '../components/charts.jsx'
import { AlertCircle } from 'lucide-react'
import { TableSkeleton, LogisticsEmptyState } from '../components/ui'
import { useAuth } from '../lib/AuthContext'
import { useUploadFlow } from '../lib/useUploadFlow'
import UploadCard from '../components/UploadCard'
import { UploadSelect, ExcelButton, DeleteButton } from '../components/UploadActions'


const CORES_MOTIVO = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#a855f7',
]
const BRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`


export default function Extravios() {
  const { isAdmin } = useAuth()
  const {
    uploads, uploadSel, setUploadSel, detalhe, loading,
    handleExcel, deletar, baixando, deletando,
  } = useUploadFlow({
    dataset: 'extravios',
    excelLabel: 'Extravios',
    deleteConfirm: 'Excluir este upload de extravios?',
  })

  const up      = detalhe?.upload
  const porDs   = detalhe?.por_ds     ?? []
  const porMot  = detalhe?.por_motivo ?? []
  const porSem  = detalhe?.por_semana ?? []
  const top15   = porDs.slice(0, 15)
  const dataRefAtual = uploads.find(u => u.id === uploadSel)?.data_ref

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Extravios</h1>
          <div className="page-sub">Perdas e avarias · {up?.total?.toLocaleString('pt-BR') || 0} ocorrências · {dataRefAtual || '—'}</div>
        </div>
        <div className="page-actions">
          <UploadSelect uploads={uploads} value={uploadSel} onChange={setUploadSel} />
          {uploadSel && <ExcelButton onClick={handleExcel} loading={baixando} />}
          {uploadSel && <DeleteButton onClick={deletar} loading={deletando} isAdmin={isAdmin} />}
        </div>
      </div>

      <UploadCard
        dataset="extravios"
        inputId="ext-upload"
        title="Upload — Controle de Extravios"
        hint={<>Excel com aba <code className="bg-slate-200 px-1 rounded">BD</code> (Waybill, Reason, Resp, Motivo PT...)</>}
        colorClass="bg-red-600 hover:bg-red-700"
        onSuccess={(id) => setUploadSel(id)}
      />

      {loading && (
        <div className="mt-6">
          <TableSkeleton rows={8} cols={7} />
        </div>
      )}

      {!loading && up && (
        <>
          {/* KPIs */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginTop: 16 }}>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Total ocorrências</div><div className="kpi-icon danger"><AlertCircle size={14}/></div></div><div className="kpi-value" style={{color:'var(--danger-600)'}}>{up.total?.toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Valor declarado</div></div><div className="kpi-value" style={{fontSize:20}}>{BRL(up.valor_total)}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Goods Lost</div></div><div className="kpi-value" style={{color:'var(--danger-700)'}}>{porDs.reduce((s,d)=>s+(d.total_lost||0),0).toLocaleString('pt-BR')}</div></div>
            <div className="kpi"><div className="kpi-head"><div className="kpi-label">Avarias</div></div><div className="kpi-value" style={{color:'var(--warn-600)'}}>{porDs.reduce((s,d)=>s+(d.total_damaged||0),0).toLocaleString('pt-BR')}</div></div>
          </div>

          {/* Top DS */}
          {top15.length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-head"><h3 className="card-title">Top 15 DS — Ocorrências</h3></div>
              <div className="card-body">
                <RankBar
                  items={top15.map(d => ({
                    label: d.ds,
                    value: d.total,
                    sub: `lost: ${d.total_lost} · avaria: ${d.total_damaged}`,
                    color: 'var(--danger-500)',
                  }))}
                  formatV={v => String(v)}
                />
              </div>
            </div>
          )}

          <div className="grid-2" style={{ marginTop: 20 }}>
            {/* Motivos */}
            {porMot.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Por Motivo</h3></div>
                <div className="card-body">
                  <Donut
                    items={porMot.map((m, i) => ({
                      label: m.motivo.length > 28 ? m.motivo.slice(0, 28) + '…' : m.motivo,
                      value: m.total,
                      color: CORES_MOTIVO[i % CORES_MOTIVO.length],
                    }))}
                    size={160}
                  />
                </div>
              </div>
            )}

            {porSem.length > 0 && (
              <div className="card">
                <div className="card-head"><h3 className="card-title">Evolução Semanal</h3></div>
                <div className="card-body">
                  <LineChart
                    series={[
                      { name: 'Ocorrências', color: 'var(--danger-500)', data: porSem.map(s => ({ x: s.semana, y: s.total })) },
                    ]}
                    height={260}
                    formatY={v => v.toLocaleString('pt-BR')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tabela por DS */}
          {porDs.length > 0 && (
            <div className="card" style={{ marginTop: 20, padding: 0, overflow: 'hidden' }}>
              <div className="card-head"><h3 className="card-title">Detalhe por DS ({porDs.length})</h3></div>
              <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>#</th><th>DS</th><th>Supervisor</th>
                        <th className="num">Total</th><th className="num">Goods Lost</th>
                        <th className="num">Avaria</th><th className="num">Valor Declarado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porDs.map((d, i) => (
                        <tr key={d.ds} className="border-t border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold">{d.ds}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{d.supervisor || '—'}</td>
                          <td className="px-4 py-3 text-center font-semibold">{d.total.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-center text-red-600">{d.total_lost.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-center text-orange-600">{d.total_damaged.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right text-slate-700">{BRL(d.valor_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
          )}
        </>
      )}

      {!loading && !uploadSel && uploads.length === 0 && (
        <LogisticsEmptyState
          title="Nenhum dado carregado"
          description="Envie o arquivo de Controle de Extravios acima para visualizar os dados."
        />
      )}
    </div>
  )
}

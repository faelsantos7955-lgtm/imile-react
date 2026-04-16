/**
 * processarLocal.js — Agrega arquivos Excel localmente (SheetJS) e retorna
 * JSON pronto para enviar ao /salvar-agregado, sem upload do arquivo bruto.
 */
import * as XLSX from 'xlsx'

// ── Utilitários compartilhados ────────────────────────────────

function readWb(buffer) {
  return XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false })
}

function parseSheet(wb, name) {
  const ws = wb.Sheets[name]
  if (!ws) return { headers: [], rows: [] }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!data.length) return { headers: [], rows: [] }
  const headers = (data[0] || []).map(h => (h == null ? '' : String(h).trim()))
  return { headers, rows: data.slice(1) }
}

function g(row, idx) {
  if (idx == null || idx < 0 || row == null || row[idx] == null) return ''
  return String(row[idx]).trim()
}

function gn(row, idx, def = 0) {
  if (idx == null || idx < 0 || row == null || row[idx] == null) return def
  const n = Number(row[idx])
  return isNaN(n) ? def : n
}

function toDate(val) {
  if (val == null) return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.toISOString().slice(0, 10)
  }
  if (typeof val === 'number') {
    const ms = (val - 25569) * 86400000
    const d = new Date(ms)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const d = new Date(String(val))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function maxDate(dates) {
  const valid = dates.filter(Boolean)
  return valid.length ? valid.sort().at(-1) : null
}

function findIdx(headers, ...names) {
  const lower = headers.map(h => h.toLowerCase())
  for (const name of names) {
    const nl = name.toLowerCase()
    let i = lower.indexOf(nl)
    if (i >= 0) return i
    i = lower.findIndex(h => h.includes(nl))
    if (i >= 0) return i
  }
  return -1
}

function mode(arr) {
  if (!arr.length) return ''
  const counts = {}
  arr.forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ── NoTracking (断更) ─────────────────────────────────────────

const NT_ABAS = ['BD', 'SemMovimentaçãoBase', 'Sem Movimentação', 'SemMovimentacao']
const NT_STATUS_REMOVER = new Set([
  'transferência concluída', 'envio', 'entregue', 'em transferência',
  'descarregado', 'coleta concluída', 'pedido finalizado anormal',
])
const NT_7D = new Set(['7 ≤ X < 10', '10 ≤ X < 16', '16 ≤ X < 20', 'X ≥ 20'])
const NT_FAIXA_ORDER = { '<1': 0, '1 ≤ X < 3': 1, '3 ≤ X < 5': 2, '5 ≤ X < 7': 3, '7 ≤ X < 10': 4, '10 ≤ X < 16': 5, '16 ≤ X < 20': 6, 'X ≥ 20': 7 }
const NT_FAIXA_FROM_RANGE = { '<1': 0, '1 ≤ X < 3': 1, '3 ≤ X < 5': 3, '5 ≤ X < 7': 5, '7 ≤ X < 10': 7, '10 ≤ X < 16': 10, '16 ≤ X < 20': 16, 'X ≥ 20': 20 }

function ntFaixa(aging) {
  if (aging < 1) return '<1'
  if (aging < 3) return '1 ≤ X < 3'
  if (aging < 5) return '3 ≤ X < 5'
  if (aging < 7) return '5 ≤ X < 7'
  if (aging < 10) return '7 ≤ X < 10'
  if (aging < 16) return '10 ≤ X < 16'
  if (aging < 20) return '16 ≤ X < 20'
  return 'X ≥ 20'
}

function ntMapCols(headers) {
  const m = {}
  headers.forEach((orig, i) => {
    const cl = orig.toLowerCase()
    if (!m.etiqueta && (cl.includes('etiqueta') || cl.includes('número da') ||
        ['waybill number', 'waybill no', 'waybill no.', 'waybillno', 'tracking no.', 'tracking number'].includes(cl)))
      m.etiqueta = i
    else if (!m.status && (cl.includes('último status') || ['last scan type', 'lastscantype', 'status'].includes(cl)))
      m.status = i
    else if (!m.status_oc && (cl.includes('statusocorr') || cl.includes('status ocorr')))
      m.status_oc = i
    else if (!m.station && cl === 'current branch name')
      m.station = i
    else if (!m.station && ['station', 'ds²', 'ds2', 'ds'].includes(cl))
      m.station = i
    else if (!m.supervisor && ['supervisor', 'responsável', 'responsavel'].includes(cl))
      m.supervisor = i
    else if (!m.regional && ['regional', 'região', 'regiao'].includes(cl))
      m.regional = i
    else if (!m.aging && ['aging', 'age', 'no tracking time (d)', 'dias sem tracking'].includes(cl))
      m.aging = i
    else if (!m.faixa && ['dias em aberto', 'rangesemmovimentação', 'range', 'faixa'].includes(cl))
      m.faixa = i
    else if (!m.valor && (cl.includes('valor declarado') || ['uploaded declared value', 'declared value'].includes(cl)))
      m.valor = i
  })
  return m
}

export async function processNoTracking(file) {
  const buf = await file.arrayBuffer()
  const wb = readWb(new Uint8Array(buf))
  const abaName = NT_ABAS.find(a => wb.SheetNames.includes(a)) || wb.SheetNames[0]
  const { headers, rows } = parseSheet(wb, abaName)
  const m = ntMapCols(headers)

  if (m.etiqueta == null) throw new Error(`Coluna de etiqueta não encontrada. Disponíveis: ${headers.join(', ')}`)
  if (m.station == null) throw new Error(`Coluna de station não encontrada. Disponíveis: ${headers.join(', ')}`)

  let data = rows.filter(r => { const v = g(r, m.etiqueta); return v && /^\d+$/.test(v) })
  if (m.status != null)
    data = data.filter(r => !NT_STATUS_REMOVER.has(g(r, m.status).toLowerCase()))
  if (m.status_oc != null) {
    const hasC = data.some(r => g(r, m.status_oc).toLowerCase() === 'considerar')
    if (hasC) data = data.filter(r => g(r, m.status_oc).toLowerCase() === 'considerar')
  }
  if (!data.length) throw new Error('Nenhum pacote restante após filtros.')

  const processed = data.map(r => {
    const station = g(r, m.station).toUpperCase()
    const supervisor = m.supervisor != null ? g(r, m.supervisor).toUpperCase() : ''
    const regional = m.regional != null ? g(r, m.regional) : ''
    const valor = m.valor != null ? gn(r, m.valor) : 0
    const status = m.status != null ? g(r, m.status) : ''
    let aging = m.aging != null ? Math.min(gn(r, m.aging), 999) : 0
    let faixa
    if (m.faixa != null) {
      const f = g(r, m.faixa)
      if (f && NT_FAIXA_FROM_RANGE[f] != null) {
        faixa = f
        if (aging === 0) aging = NT_FAIXA_FROM_RANGE[f]
      } else faixa = ntFaixa(aging)
    } else faixa = ntFaixa(aging)
    return { station, supervisor, regional, valor, status, faixa, is7d: NT_7D.has(faixa) }
  })

  const total = processed.length
  const valor_total = +processed.reduce((s, r) => s + r.valor, 0).toFixed(2)
  const total_7d_mais = processed.filter(r => r.is7d).length

  const dsMap = new Map()
  processed.forEach(r => {
    if (!r.station) return
    const k = `${r.station}|${r.supervisor}|${r.regional}`
    const e = dsMap.get(k) || { station: r.station, supervisor: r.supervisor, regional: r.regional, total: 0, valor_total: 0, total_7d_mais: 0 }
    e.total++; e.valor_total += r.valor; if (r.is7d) e.total_7d_mais++
    dsMap.set(k, e)
  })
  const por_ds = [...dsMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => b.total - a.total)

  const supMap = new Map()
  processed.forEach(r => {
    if (!r.supervisor) return
    const k = `${r.supervisor}|${r.regional}`
    const e = supMap.get(k) || { supervisor: r.supervisor, regional: r.regional, total: 0, valor_total: 0, total_7d_mais: 0 }
    e.total++; e.valor_total += r.valor; if (r.is7d) e.total_7d_mais++
    supMap.set(k, e)
  })
  const por_sup = [...supMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => b.total - a.total)

  const stMap = new Map()
  processed.forEach(r => {
    const k = r.status || 'Sem status'
    const e = stMap.get(k) || { status: k, total: 0, valor_total: 0 }
    e.total++; e.valor_total += r.valor
    stMap.set(k, e)
  })
  const por_status = [...stMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => b.total - a.total)

  const fMap = new Map()
  processed.forEach(r => {
    const e = fMap.get(r.faixa) || { faixa: r.faixa, total: 0, valor_total: 0 }
    e.total++; e.valor_total += r.valor
    fMap.set(r.faixa, e)
  })
  const por_faixa = [...fMap.values()]
    .map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2), pct: total > 0 ? +(e.total / total * 100).toFixed(2) : 0 }))
    .sort((a, b) => (NT_FAIXA_ORDER[a.faixa] ?? 99) - (NT_FAIXA_ORDER[b.faixa] ?? 99))

  return { data_ref: today(), total, valor_total, total_7d_mais, por_ds, por_sup, por_status, por_faixa }
}

// ── Extravios ─────────────────────────────────────────────────

export async function processExtravios(file) {
  const buf = await file.arrayBuffer()
  const wb = readWb(new Uint8Array(buf))
  if (!wb.SheetNames.includes('BD'))
    throw new Error(`Aba 'BD' não encontrada. Abas: ${wb.SheetNames.join(', ')}`)

  const { headers, rows } = parseSheet(wb, 'BD')
  const iWaybill = findIdx(headers, 'Waybill')
  const iReason  = findIdx(headers, 'Reason')
  const iResp    = findIdx(headers, 'Resp')
  const iDate    = findIdx(headers, 'Date')
  const iValor   = findIdx(headers, 'Uploaded Declared Value')
  const iMotivo  = findIdx(headers, 'Motivo PT')
  const iWeek    = findIdx(headers, 'week')
  const iMes     = findIdx(headers, 'mês', 'mes')
  const iSup     = findIdx(headers, 'SUPERVISOR')
  const iReg     = findIdx(headers, 'Regional')

  if (iWaybill < 0 || iMotivo < 0)
    throw new Error(`Colunas obrigatórias ausentes na aba BD. Disponíveis: ${headers.join(', ')}`)

  const data = rows.filter(r => { const v = g(r, iWaybill); return v && /^\d+$/.test(v) })
  if (!data.length) throw new Error('Nenhum registro de extravio encontrado na aba BD.')

  const data_ref = maxDate(data.map(r => toDate(r[iDate]))) || ''
  const total = data.length
  const valor_total = +data.reduce((s, r) => s + gn(r, iValor), 0).toFixed(2)

  const dsMap = new Map()
  data.forEach(r => {
    const resp = g(r, iResp).toUpperCase()
    if (!resp) return
    const supervisor = g(r, iSup).toUpperCase()
    const regional = g(r, iReg)
    const is_lost = /lost/i.test(g(r, iReason))
    const k = `${resp}|${supervisor}|${regional}`
    const e = dsMap.get(k) || { ds: resp, supervisor, regional, total: 0, valor_total: 0, total_lost: 0, total_damaged: 0 }
    e.total++; e.valor_total += gn(r, iValor)
    if (is_lost) e.total_lost++; else e.total_damaged++
    dsMap.set(k, e)
  })
  const por_ds = [...dsMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => b.total - a.total)

  const motMap = new Map()
  data.forEach(r => {
    const mot = g(r, iMotivo) || 'Não informado'
    const e = motMap.get(mot) || { motivo: mot, total: 0, valor_total: 0 }
    e.total++; e.valor_total += gn(r, iValor)
    motMap.set(mot, e)
  })
  const por_motivo = [...motMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => b.total - a.total)

  const semMap = new Map()
  data.forEach(r => {
    const week = g(r, iWeek)
    if (!week) return
    const mes = g(r, iMes)
    const k = `${week}|${mes}`
    const e = semMap.get(k) || { semana: week, mes, total: 0, valor_total: 0 }
    e.total++; e.valor_total += gn(r, iValor)
    semMap.set(k, e)
  })
  const por_semana = [...semMap.values()].map(e => ({ ...e, valor_total: +e.valor_total.toFixed(2) })).sort((a, b) => a.semana < b.semana ? -1 : 1)

  return { data_ref, total, valor_total, por_ds, por_motivo, por_semana }
}

// ── NA (有发未到) ──────────────────────────────────────────────

export async function processNA(file) {
  const buf = await file.arrayBuffer()
  const wb = readWb(new Uint8Array(buf))
  if (!wb.SheetNames.includes('Export'))
    throw new Error(`Aba 'Export' não encontrada. Abas: ${wb.SheetNames.join(', ')}`)

  const { headers, rows } = parseSheet(wb, 'Export')
  const iDs   = findIdx(headers, 'Destination Station')
  const iSup  = findIdx(headers, 'Supervisor')
  const iDate = findIdx(headers, '日期')
  const iSit  = findIdx(headers, 'Situation')
  const iProc = findIdx(headers, 'Process')

  if (iDs < 0)   throw new Error("Coluna 'Destination Station' não encontrada")
  if (iSup < 0)  throw new Error("Coluna 'Supervisor' não encontrada")
  if (iDate < 0) throw new Error("Coluna '日期' não encontrada")

  const SKIP = new Set(['nan', 'none', '', 'na', 'n/a'])
  let thresholdName = '大于10D'

  const processed = rows
    .filter(r => {
      const ds = g(r, iDs); const sup = g(r, iSup)
      return ds && sup && !SKIP.has(ds.toLowerCase()) && !SKIP.has(sup.toLowerCase())
    })
    .map(r => {
      const ds = g(r, iDs)
      const supervisor = g(r, iSup).toUpperCase()
      const rawDate = r[iDate]
      const dateStr = toDate(rawDate)
      const rawStr = rawDate != null ? String(rawDate).trim() : ''
      if (!dateStr && rawStr.includes('大于')) thresholdName = rawStr
      return {
        ds, supervisor,
        dateStr,
        is_thr: !dateStr,
        situation: iSit >= 0 ? g(r, iSit) : '',
        process: iProc >= 0 ? g(r, iProc) : '',
      }
    })

  const total = processed.length
  if (!total) throw new Error('Nenhum registro válido na aba Export.')

  const data_ref = maxDate(processed.map(r => r.dateStr)) || today()
  const total_offload = processed.filter(r => r.situation === 'Offloaded').length
  const total_arrive  = processed.filter(r => r.situation === 'Arrive').length
  const grd10d        = processed.filter(r => r.is_thr).length

  const dsMap = new Map()
  processed.forEach(r => {
    const k = `${r.supervisor}|${r.ds}`
    const e = dsMap.get(k) || { supervisor: r.supervisor, ds: r.ds, total: 0, grd10d: 0 }
    e.total++; if (r.is_thr) e.grd10d++
    dsMap.set(k, e)
  })
  const por_ds = [...dsMap.values()]

  const supMap = new Map()
  processed.forEach(r => {
    const e = supMap.get(r.supervisor) || { supervisor: r.supervisor, total: 0, grd10d: 0 }
    e.total++; if (r.is_thr) e.grd10d++
    supMap.set(r.supervisor, e)
  })
  const por_supervisor = [...supMap.values()]

  const tendMap = new Map()
  processed.filter(r => r.dateStr).forEach(r => {
    const k = `${r.supervisor}|${r.ds}|${r.dateStr}`
    const e = tendMap.get(k) || { supervisor: r.supervisor, ds: r.ds, data: r.dateStr, total: 0 }
    e.total++
    tendMap.set(k, e)
  })
  const tendencia = [...tendMap.values()]

  const procMap = new Map()
  processed.forEach(r => {
    if (!r.process) return
    const e = procMap.get(r.process) || { processo: r.process, total: 0 }
    e.total++
    procMap.set(r.process, e)
  })
  const por_processo = [...procMap.values()].sort((a, b) => b.total - a.total)

  return { data_ref, total, total_offload, total_arrive, grd10d, threshold_col: thresholdName, tendencia, por_supervisor, por_ds, por_processo }
}

// ── Triagem DC×DS ─────────────────────────────────────────────

const LS_COLS = ['Waybill No.', 'Destination Statio', 'Delivery Station', 'Consignee City', 'Scan Time']

function lc(v) { return v == null ? '' : String(v).trim().toUpperCase() }

function lerLoadingScan(buf) {
  const wb = readWb(new Uint8Array(buf))
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, cellDates: true })
  if (!raw.length) return []
  const headers = (raw[0] || []).map(h => h == null ? '' : String(h).trim())
  const idx = {}
  LS_COLS.forEach(col => { idx[col] = headers.indexOf(col) })
  return raw.slice(1).map(r => ({
    wb:    lc(r[idx['Waybill No.']]),
    dest:  lc(r[idx['Destination Statio']]),
    deliv: idx['Delivery Station'] >= 0 ? lc(r[idx['Delivery Station']]) : '',
    city:  idx['Consignee City']   >= 0 ? lc(r[idx['Consignee City']])   : '',
    time:  idx['Scan Time']        >= 0 ? r[idx['Scan Time']]            : null,
  })).filter(r => r.wb)
}

function lerArrival(buf) {
  const wb = readWb(new Uint8Array(buf))
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!raw.length) return new Set()
  const headers = (raw[0] || []).map(h => h == null ? '' : String(h).trim())
  const ARRIVAL_COLS = ['Waybill No.', 'Waybill Number', 'waybill_no', 'WaybillNo', 'Tracking No.', 'Tracking Number', '运单号', '单号']
  let col = ARRIVAL_COLS.map(c => headers.indexOf(c)).find(i => i >= 0) ?? -1
  if (col < 0) {
    const low = headers.map(h => h.toLowerCase())
    col = low.findIndex(h => h.includes('waybill') || h.includes('tracking') || h.includes('运单'))
  }
  if (col < 0) throw new Error(`Coluna de waybill não encontrada no Arrival. Disponíveis: ${headers.join(', ')}`)
  const waybills = new Set()
  raw.slice(1).forEach(r => { if (r[col]) waybills.add(lc(r[col])) })
  return waybills
}

function modeDate(rows) {
  const counts = {}
  rows.forEach(r => {
    const d = toDate(r.time)
    if (d) counts[d] = (counts[d] || 0) + 1
  })
  const entries = Object.entries(counts)
  if (!entries.length) return today()
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Processa arquivos LoadingScan + Arrival localmente.
 * @param {File[]} lsFiles   — arquivos LoadingScan
 * @param {File[]} arrFiles  — arquivos Arrival (opcional)
 * @param {Object} supMap    — { SIGLA: 'Região', ... } vindo do /api/triagem/supervisores
 */
export async function processTriagem(lsFiles, arrFiles = [], supMap = {}) {
  // Lê todos os arquivos em paralelo
  const [lsBuffers, arrBuffers] = await Promise.all([
    Promise.all(lsFiles.map(f => f.arrayBuffer())),
    Promise.all(arrFiles.map(f => f.arrayBuffer())),
  ])

  // Lê e concatena LoadingScans
  let rows = []
  for (const buf of lsBuffers) {
    try { rows = rows.concat(lerLoadingScan(buf)) } catch (_) { /* pula arquivo inválido */ }
  }
  if (!rows.length) throw new Error('Nenhum arquivo LoadingScan pôde ser lido.')

  // Deduplica por waybill
  const seen = new Set()
  rows = rows.filter(r => { if (seen.has(r.wb)) return false; seen.add(r.wb); return true })

  // Lê Arrival
  let arrivalSet = null
  if (arrBuffers.length) {
    arrivalSet = new Set()
    for (const buf of arrBuffers) {
      const s = lerArrival(buf)
      s.forEach(w => arrivalSet.add(w))
    }
  }
  const temArrival = arrivalSet !== null

  // Determina status de cada row
  rows.forEach(r => {
    if (!r.dest || !r.deliv) r.status = 'fora'
    else if (r.dest === r.deliv) r.status = 'ok'
    else r.status = 'nok'
    r.recebido = temArrival && arrivalSet.has(r.wb)
  })

  const data_ref = modeDate(rows)
  const total   = rows.length
  const qtd_ok  = rows.filter(r => r.status === 'ok').length
  const qtd_nok = rows.filter(r => r.status === 'nok').length
  const qtd_fora = rows.filter(r => r.status === 'fora').length
  const taxa = total ? +((qtd_ok / total * 100).toFixed(2)) : 0
  const qtd_recebidos = temArrival ? rows.filter(r => r.recebido).length : 0

  // ── Detalhes (apenas NOK + Fora) ──
  const detalhes = rows
    .filter(r => r.status !== 'ok')
    .map(r => ({
      waybill: r.wb, ds_destino: r.dest, ds_entrega: r.deliv,
      cidade: r.city, status: r.status, foi_recebido: r.recebido,
    }))

  // ── Por DS ──
  const dsMap = new Map()
  rows.forEach(r => {
    if (!r.dest) return
    const e = dsMap.get(r.dest) || { ds: r.dest, ok: 0, nok: 0, fora: 0, recebidos: 0, recebidos_nok: 0 }
    e[r.status]++
    if (r.recebido) { e.recebidos++; if (r.status === 'nok') e.recebidos_nok++ }
    dsMap.set(r.dest, e)
  })
  const por_ds = [...dsMap.values()].map(e => {
    const t = e.ok + e.nok + e.fora
    return { ...e, total: t, taxa: t ? +((e.ok / t * 100).toFixed(2)) : 0 }
  })

  // ── Top 5 (por nok) ──
  const top5 = por_ds.slice().sort((a, b) => b.nok - a.nok).slice(0, 5)
    .map(r => ({ ds: r.ds, nok: r.nok }))

  // ── Por Supervisor ──
  const supAgg = new Map()
  rows.forEach(r => {
    const sup = (r.dest && supMap[r.dest]) || 'Sem Região'
    const e = supAgg.get(sup) || { supervisor: sup, ok: 0, nok: 0, fora: 0 }
    e[r.status]++
    supAgg.set(sup, e)
  })
  const por_supervisor = [...supAgg.values()].map(e => {
    const t = e.ok + e.nok + e.fora
    return { ...e, total: t, taxa: t ? +((e.ok / t * 100).toFixed(2)) : 0 }
  })

  // ── Por Cidade ──
  const cidMap = new Map()
  rows.forEach(r => {
    if (!r.dest) return
    const city = r.city || 'Sem Cidade'
    const k = `${r.dest}|${city}`
    const e = cidMap.get(k) || { ds: r.dest, cidade: city, ok: 0, nok: 0 }
    if (r.status === 'ok') e.ok++
    else if (r.status === 'nok') e.nok++
    cidMap.set(k, e)
  })
  const por_cidade = [...cidMap.values()].map(e => {
    const t = e.ok + e.nok
    return { ...e, total: t, taxa: t ? +((e.ok / t * 100).toFixed(2)) : 0 }
  })

  return {
    data_ref, total, qtd_ok, qtd_erro: qtd_nok, qtd_fora,
    taxa, tem_arrival: temArrival, qtd_recebidos,
    por_ds, top5, por_supervisor, por_cidade, detalhes,
  }
}


// ── Reclamações ────────────────────────────────────────────────

function isoWeek(dateStr) {
  const d = new Date(dateStr)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7)
  const w1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getUTCDay() + 6) % 7) / 7)
}

export async function processReclamacoes(files, supervisorMap = {}) {
  // Aceita File único ou array de File
  const fileList = Array.isArray(files) ? files : [files]
  const buffers = await Promise.all(fileList.map(f => f.arrayBuffer()))

  // Lê e concatena todas as planilhas
  let headers = [], rows = []
  for (const buf of buffers) {
    const wb = readWb(new Uint8Array(buf))
    const parsed = parseSheet(wb, wb.SheetNames[0])
    if (!headers.length) headers = parsed.headers
    rows = rows.concat(parsed.rows)
  }

  const iSup  = findIdx(headers, 'SUPERVISOR')
  const iSta  = findIdx(headers, 'Inventory Station', 'inventory_station', 'Station')
  const iMot  = findIdx(headers, 'DA Name', 'da_name', 'Motorista', 'Driver Name')
  const iTime = findIdx(headers, 'Create Time')

  const validRows = rows.filter(r => r.some(c => c != null))

  const getSup = r => {
    if (iSup >= 0) return g(r, iSup)
    if (iSta >= 0 && Object.keys(supervisorMap).length) {
      return supervisorMap[g(r, iSta).toUpperCase()] || 'Sem Supervisor'
    }
    return 'Sem Supervisor'
  }

  const dates = iTime >= 0 ? validRows.map(r => toDate(r[iTime])).filter(Boolean) : []
  const data_ref = maxDate(dates) || today()

  let semana_ref = 0
  if (dates.length) {
    const wm = new Map()
    dates.forEach(d => { const w = isoWeek(d); wm.set(w, (wm.get(w) || 0) + 1) })
    semana_ref = [...wm.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0
  }

  const n_registros = validRows.length
  const supervisors = validRows.map(r => getSup(r))
  const n_sup = new Set(supervisors.filter(Boolean)).size
  const stations = iSta >= 0 ? validRows.map(r => g(r, iSta)).filter(Boolean) : []
  const n_sta = new Set(stations).size
  const motoristas = iMot >= 0 ? validRows.map(r => g(r, iMot)).filter(Boolean) : []
  const n_mot = motoristas.length

  const supAgg = new Map()
  validRows.forEach(r => {
    const sup = getSup(r)
    const e = supAgg.get(sup) || { supervisor: sup, dia_total: 0, mes_total: 0 }
    e.dia_total++; e.mes_total++
    supAgg.set(sup, e)
  })
  const por_supervisor = [...supAgg.values()].sort((a, b) => b.dia_total - a.dia_total)

  const staAgg = new Map()
  validRows.forEach(r => {
    if (iSta < 0) return
    const sta = g(r, iSta)
    if (!sta) return
    const e = staAgg.get(sta) || { station: sta, supervisor: '', dia_total: 0, mes_total: 0 }
    e.dia_total++; e.mes_total++
    e.supervisor = getSup(r) || e.supervisor
    staAgg.set(sta, e)
  })
  const por_station = [...staAgg.values()].sort((a, b) => b.dia_total - a.dia_total)

  const motAgg = new Map()
  validRows.forEach(r => {
    if (iMot < 0) return
    const mot = g(r, iMot)
    if (!mot) return
    const e = motAgg.get(mot) || { motorista: mot, id_motorista: mot, ds: '', supervisor: '', total: 0 }
    e.total++
    if (iSta >= 0) e.ds = g(r, iSta) || e.ds
    e.supervisor = getSup(r) || e.supervisor
    motAgg.set(mot, e)
  })
  const top5 = [...motAgg.values()].sort((a, b) => b.total - a.total).slice(0, 5)

  return { data_ref, n_registros, n_sup, n_sta, n_mot, semana_ref, por_supervisor, por_station, top5 }
}

// ── Backlog SLA ────────────────────────────────────────────────

const BL_FAIXAS = ['1-3', '3-5', '5-7', '7-10', '10-15', '15-20', 'Backlog >20']
const BL_7D = new Set(['7-10', '10-15', '15-20', 'Backlog >20'])

export async function processBacklog(file) {
  const buf = await file.arrayBuffer()
  const wb = readWb(new Uint8Array(buf))

  const detAba = wb.SheetNames.find(a => a.toLowerCase().replace(/[ _]/g, '_') === 'backlog_details')
  if (!detAba) throw new Error(`Aba 'Backlog_Details' não encontrada. Abas: ${wb.SheetNames.join(', ')}`)
  const resAba = wb.SheetNames.find(a => a.toLowerCase().replace(/[_ ]/g, '') === 'resume') || null

  const { headers: dH, rows: dRows } = parseSheet(wb, detAba)
  const iWaybill = findIdx(dH, 'waybillNo')
  const iRange   = findIdx(dH, 'range_backlog')
  const iProcess = findIdx(dH, 'process')
  const iDs      = findIdx(dH, 'lastScanSite')
  const iRegiao  = findIdx(dH, 'actual_region')
  const iMotivo  = findIdx(dH, 'lastScanStatus')
  const iEstagio = findIdx(dH, 'stageStatus')
  const iSup     = findIdx(dH, 'CARGOS.SUPERVISOR', 'supervisor', 'Supervisor')
  const iTime    = findIdx(dH, 'lastScanTime')

  if (iWaybill < 0 || iRange < 0 || iProcess < 0)
    throw new Error('Colunas obrigatórias ausentes: waybillNo, range_backlog, process')

  // Extract data_ref from lastScanTime
  let data_ref = today()
  if (iTime >= 0) {
    const timeDates = dRows.map(r => {
      const v = r[iTime]
      if (v == null) return null
      if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
      if (typeof v === 'number') {
        const ms = (v - 25569) * 86400000
        const d = new Date(ms)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
      }
      return toDate(v)
    }).filter(Boolean)
    data_ref = maxDate(timeDates) || today()
  }

  const parsed = dRows.map(r => ({
    ds:        g(r, iDs).toUpperCase(),
    regiao:    iRegiao  >= 0 ? g(r, iRegiao)  : '',
    motivo:    iMotivo  >= 0 ? (g(r, iMotivo) || 'Outros') : 'Outros',
    estagio:   iEstagio >= 0 ? g(r, iEstagio) : '',
    supervisor: iSup    >= 0 ? (g(r, iSup).toUpperCase() || 'Sem Supervisor') : 'Sem Supervisor',
    range_b:   g(r, iRange) || '1-3',
    process:   g(r, iProcess),
  })).filter(r => r.ds)

  // Parse resume sheet for orders
  const resOrders = {}
  if (resAba) {
    const { headers: rH, rows: rRows } = parseSheet(wb, resAba)
    const riDs  = findIdx(rH, 'lastScanSite')
    const riSup = findIdx(rH, 'CARGOS.SUPERVISOR', 'supervisor')
    const riOrd = findIdx(rH, 'orders')
    const riPrc = findIdx(rH, 'process')
    if (riOrd >= 0) {
      rRows.forEach(r => {
        const ds  = riDs  >= 0 ? g(r, riDs).toUpperCase()  : ''
        const sup = riSup >= 0 ? g(r, riSup).toUpperCase() : ''
        const prc = riPrc >= 0 ? g(r, riPrc) : ''
        const ord = gn(r, riOrd)
        if (ds)  resOrders[`ds|${ds}|${prc}`]  = (resOrders[`ds|${ds}|${prc}`]  || 0) + ord
        if (sup) resOrders[`sup|${sup}|${prc}`] = (resOrders[`sup|${sup}|${prc}`] || 0) + ord
      })
    }
  }

  const getOrders = (type, val, prc_filter) => {
    const key = `${type}|${val}|${prc_filter}`
    return resOrders[key] || 0
  }

  function faixaRow(group, ordersCount) {
    const faixas = Object.fromEntries(BL_FAIXAS.map(f => [f, group.filter(r => r.range_b === f).length]))
    const total_7d = BL_FAIXAS.filter(f => BL_7D.has(f)).reduce((s, f) => s + faixas[f], 0)
    const backlog = group.length
    const orders = ordersCount || backlog
    return { orders, backlog, pct_backlog: orders ? +(backlog / orders * 100).toFixed(1) : 100, faixas, total_7d }
  }

  const dc = parsed.filter(r => ['DC-LH', 'DC'].includes(r.process))
  const ds = parsed.filter(r => r.process === 'DS')

  const por_rdc = [...new Set(dc.map(r => r.ds))].sort().map(nome => {
    const grp = dc.filter(r => r.ds === nome)
    const ord = getOrders('ds', nome, 'DC') || getOrders('ds', nome, 'DC-LH')
    return { nome, regiao: mode(grp.map(r => r.regiao)), ...faixaRow(grp, ord) }
  })

  const por_supervisor = [...new Set(ds.map(r => r.supervisor))].sort().map(nome => {
    const grp = ds.filter(r => r.supervisor === nome)
    return { nome, ...faixaRow(grp, getOrders('sup', nome, 'DS')) }
  })

  let por_ds = [...new Set(ds.map(r => r.ds))].sort().map(nome => {
    const grp = ds.filter(r => r.ds === nome)
    return { nome, supervisor: mode(grp.map(r => r.supervisor)), ...faixaRow(grp, getOrders('ds', nome, 'DS')) }
  })
  por_ds.sort((a, b) => b.total_7d - a.total_7d)
  por_ds.forEach((r, i) => r.prioridade = i + 1)

  const por_motivo = [...new Set(parsed.map(r => r.motivo))].sort().map(nome => {
    const grp = parsed.filter(r => r.motivo === nome)
    return { nome, ...faixaRow(grp, grp.length) }
  }).sort((a, b) => b.backlog - a.backlog)

  const total = parsed.length
  const kpis = {
    data_ref,
    total,
    na_ds:       parsed.filter(r => r.estagio === 'Delivery').length,
    em_transito: parsed.filter(r => r.estagio === 'In Transit').length,
    total_7d:    por_ds.reduce((s, r) => s + r.total_7d, 0),
    pct_7d:      total ? +(por_ds.reduce((s, r) => s + r.total_7d, 0) / total * 100).toFixed(1) : 0,
    por_faixa:   Object.fromEntries(BL_FAIXAS.map(f => [f, parsed.filter(r => r.range_b === f).length])),
  }

  return { kpis, por_rdc, por_supervisor, por_ds, por_motivo }
}

// ── Not Arrived com Movimentação ──────────────────────────────

const NA2_OPS = {
  "到件扫描": "Chegada", "发件扫描": "Saída", "集包扫描": "Consolidação",
  "装车扫描": "Carregamento", "签收录入": "Entregue", "派件扫描": "Saída p/ Entrega",
  "分配派件员扫描": "Atribuição Entregador", "归班反馈扫描": "Retorno ao Hub",
  "开始退件": "Devolução", "异常关闭": "Encerr. por Exceção", "揽收扫描": "Coleta",
  "派单扫描": "Ordem de Entrega", "留仓扫描": "Armazenagem", "退件到件扫描": "Chegada Devolução",
}
const NA2_REGIOES = {
  CDC: "CDC", Midwest: "Centro-Oeste", North: "Norte", Northeast: "Nordeste",
  RETURN: "Retorno", South: "Sul", Southeast: "Sudeste", southeast: "Sudeste",
  "São Paulo": "São Paulo", "Sao Paulo": "São Paulo",
}

function normRegiao(s) {
  if (!s) return 'Outros'
  return NA2_REGIOES[s.trim()] || s.trim() || 'Outros'
}

function parseNA2Sheet({ headers, rows }) {
  const iWaybill  = findIdx(headers, 'waybill_no', 'WaybillNo', 'Waybill No', 'waybillno')
  const iOcName   = findIdx(headers, 'oc_name')
  const iOcCode   = findIdx(headers, 'oc_code')
  const iTipo     = findIdx(headers, '站点类型')
  const iRegiao   = findIdx(headers, '区域')
  const iOperate  = findIdx(headers, 'last_operate')
  const iDate     = findIdx(headers, '日期')
  const iSupervisor = findIdx(headers, 'Supervisor', 'supervisor')

  return rows.map(r => {
    const op_orig = g(r, iOperate)
    return {
      waybill:    g(r, iWaybill),
      oc_name:    g(r, iOcName),
      oc_code:    g(r, iOcCode),
      tipo:       g(r, iTipo).toUpperCase(),
      regiao:     normRegiao(g(r, iRegiao)),
      op_orig,
      operacao:   NA2_OPS[op_orig] || op_orig,
      date:       toDate(r[iDate]),
      supervisor: iSupervisor >= 0 ? g(r, iSupervisor) : '',
    }
  })
}

export async function processNotArrived(file) {
  const buf = await file.arrayBuffer()
  const wb = readWb(new Uint8Array(buf))
  if (!wb.SheetNames.includes('数据源'))  throw new Error("Aba '数据源' (DC) não encontrada.")
  if (!wb.SheetNames.includes('Planilha1')) throw new Error("Aba 'Planilha1' (DS) não encontrada.")

  const dcRows = parseNA2Sheet(parseSheet(wb, '数据源'))
  const dsRows = parseNA2Sheet(parseSheet(wb, 'Planilha1'))

  // Build supervisor map from 'DS' sheet if exists
  const supMap = {}
  if (wb.SheetNames.includes('DS')) {
    const { headers, rows } = parseSheet(wb, 'DS')
    const iSigla = findIdx(headers, 'SIGLA')
    const iSup   = findIdx(headers, 'SUPERVISOR')
    if (iSigla >= 0 && iSup >= 0) {
      rows.forEach(r => {
        const sigla = g(r, iSigla).toUpperCase()
        const sup   = g(r, iSup).toUpperCase()
        if (sigla && sup) supMap[sigla] = sup
      })
    }
  }

  let combined = [...dcRows, ...dsRows].filter(r => ['São Paulo', 'CDC'].includes(r.regiao))
  if (!combined.length) throw new Error('Nenhum registro de São Paulo encontrado no arquivo.')

  combined.forEach(r => {
    if (!r.supervisor) r.supervisor = supMap[r.oc_name?.toUpperCase()] || 'Sem Supervisor'
  })

  const data_ref = maxDate(combined.map(r => r.date)) || today()
  const total          = combined.length
  const total_dc       = combined.filter(r => r.tipo === 'DC').length
  const total_ds       = combined.filter(r => r.tipo === 'DS').length
  const total_entregues = combined.filter(r => r.operacao === 'Entregue').length
  const pct_entregues  = total ? +((total_entregues / total * 100).toFixed(2)) : 0

  const estMap = new Map()
  combined.forEach(r => {
    const k = `${r.oc_name}|${r.oc_code}|${r.tipo}|${r.regiao}|${r.supervisor}`
    const e = estMap.get(k) || { oc_name: r.oc_name, oc_code: r.oc_code, tipo: r.tipo, regiao: r.regiao, supervisor: r.supervisor, total: 0, entregues: 0 }
    e.total++; if (r.operacao === 'Entregue') e.entregues++
    estMap.set(k, e)
  })
  const por_estacao = [...estMap.values()]

  const regMap = new Map()
  combined.forEach(r => {
    const k = `${r.regiao}|${r.tipo}`
    const e = regMap.get(k) || { regiao: r.regiao, tipo: r.tipo, total: 0 }
    e.total++
    regMap.set(k, e)
  })
  const por_regiao = [...regMap.values()]

  const opMap = new Map()
  combined.forEach(r => {
    const op = r.operacao || r.op_orig
    const e = opMap.get(op) || { operacao: op, total: 0 }
    e.total++
    opMap.set(op, e)
  })
  const por_operacao = [...opMap.values()].sort((a, b) => b.total - a.total)

  const supGrp = new Map()
  combined.forEach(r => {
    const e = supGrp.get(r.supervisor) || { supervisor: r.supervisor, total: 0, total_dc: 0, total_ds: 0, entregues: 0 }
    e.total++
    if (r.tipo === 'DC') e.total_dc++
    if (r.tipo === 'DS') e.total_ds++
    if (r.operacao === 'Entregue') e.entregues++
    supGrp.set(r.supervisor, e)
  })
  const por_supervisor = [...supGrp.values()].sort((a, b) => b.total - a.total)

  // tendencia from 汇总 sheet
  const tendencia = []
  if (wb.SheetNames.includes('汇总')) {
    try {
      const arr = XLSX.utils.sheet_to_json(wb.Sheets['汇总'], { header: 1, defval: null })
      if (arr.length >= 3) {
        const dateMap = {}
        for (let col = 2; col < (arr[1] || []).length; col++) {
          const d = toDate(arr[1][col])
          if (d) dateMap[col] = d
        }
        const SKIP = new Set(['合计', 'NAN', '', 'NONE', '区域'])
        for (let row = 2; row < Math.min(16, arr.length); row++) {
          const sv = arr[row][0]
          if (!sv) continue
          const sup = String(sv).trim().toUpperCase()
          if (SKIP.has(sup)) continue
          for (const [col, dateStr] of Object.entries(dateMap)) {
            const cell = arr[row][col]
            if (cell != null && typeof cell === 'number')
              tendencia.push({ supervisor: sup, data: dateStr, total: cell })
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  return { data_ref, total, total_dc, total_ds, total_entregues, pct_entregues, por_estacao, por_regiao, por_operacao, por_supervisor, tendencia }
}

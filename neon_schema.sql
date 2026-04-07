-- =============================================================================
-- iMile Dashboard — Schema PostgreSQL para Neon
-- Gerado em 2026-04-07
-- =============================================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  nome VARCHAR(255),
  role VARCHAR(50) DEFAULT 'viewer',
  bases TEXT[],
  paginas TEXT[],
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  acao VARCHAR(255),
  alvo VARCHAR(255),
  detalhe JSONB,
  email VARCHAR(255),
  user_id UUID,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solicitacoes_acesso (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(255),
  email VARCHAR(255),
  motivo TEXT,
  status VARCHAR(50) DEFAULT 'pendente',
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_supervisores (
  id BIGSERIAL PRIMARY KEY,
  sigla VARCHAR(100) UNIQUE NOT NULL,
  region VARCHAR(255),
  atualizado_por VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS config_metas (
  id BIGSERIAL PRIMARY KEY,
  ds VARCHAR(100) UNIQUE NOT NULL,
  meta NUMERIC(5,4),
  atualizado_por VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS motoristas_status (
  id BIGSERIAL PRIMARY KEY,
  id_motorista VARCHAR(255) UNIQUE NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================== EXPEDIÇÃO DIÁRIA (Dashboard) ==========================

CREATE TABLE IF NOT EXISTS expedicao_diaria (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  scan_station VARCHAR(255) NOT NULL,
  region VARCHAR(255),
  recebido INTEGER DEFAULT 0,
  expedido INTEGER DEFAULT 0,
  entregas INTEGER DEFAULT 0,
  taxa_exp NUMERIC(10,6) DEFAULT 0,
  taxa_ent NUMERIC(10,6) DEFAULT 0,
  meta NUMERIC(5,4) DEFAULT 0.5,
  atingiu_meta BOOLEAN DEFAULT FALSE,
  processado_por VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(data_ref, scan_station)
);

CREATE TABLE IF NOT EXISTS expedicao_cidades (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  scan_station VARCHAR(255) NOT NULL,
  destination_city VARCHAR(255) NOT NULL,
  recebido INTEGER DEFAULT 0,
  expedido INTEGER DEFAULT 0,
  entregas INTEGER DEFAULT 0,
  taxa_exp NUMERIC(10,6) DEFAULT 0,
  taxa_ent NUMERIC(10,6) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(data_ref, scan_station, destination_city)
);

-- ======================== MONITORAMENTO DIÁRIO ===============================

CREATE TABLE IF NOT EXISTS monitoramento_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total_ds INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitoramento_diario (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES monitoramento_uploads(id) ON DELETE CASCADE,
  ds VARCHAR(255) NOT NULL,
  supervisor VARCHAR(255),
  regiao VARCHAR(255),
  rdc_ds INTEGER DEFAULT 0,
  estoque_ds INTEGER DEFAULT 0,
  estoque_motorista INTEGER DEFAULT 0,
  estoque_total INTEGER DEFAULT 0,
  estoque_7d INTEGER DEFAULT 0,
  recebimento INTEGER DEFAULT 0,
  volume_total INTEGER DEFAULT 0,
  pendencia_scan INTEGER DEFAULT 0,
  volume_saida INTEGER DEFAULT 0,
  taxa_expedicao NUMERIC(10,6) DEFAULT 0,
  qtd_motoristas INTEGER DEFAULT 0,
  eficiencia_pessoal NUMERIC(10,2) DEFAULT 0,
  entregue INTEGER DEFAULT 0,
  eficiencia_assinatura NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== EXTRAVIOS ==========================================

CREATE TABLE IF NOT EXISTS extravios_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extravios_por_ds (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES extravios_uploads(id) ON DELETE CASCADE,
  ds VARCHAR(255),
  supervisor VARCHAR(255),
  regional VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  total_lost INTEGER DEFAULT 0,
  total_damaged INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extravios_por_motivo (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES extravios_uploads(id) ON DELETE CASCADE,
  motivo VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS extravios_por_semana (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES extravios_uploads(id) ON DELETE CASCADE,
  semana VARCHAR(50),
  mes VARCHAR(50),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== NOT ARRIVED (有发未到) ============================

CREATE TABLE IF NOT EXISTS na_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  total_offload INTEGER DEFAULT 0,
  total_arrive INTEGER DEFAULT 0,
  grd10d INTEGER DEFAULT 0,
  threshold_col VARCHAR(100),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS na_por_supervisor (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES na_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  total INTEGER DEFAULT 0,
  grd10d INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS na_por_ds (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES na_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  ds VARCHAR(255),
  total INTEGER DEFAULT 0,
  grd10d INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS na_por_processo (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES na_uploads(id) ON DELETE CASCADE,
  processo VARCHAR(255),
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS na_tendencia (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES na_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  ds VARCHAR(255),
  data DATE,
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== NOT ARRIVED COM MOVIMENTAÇÃO ======================

CREATE TABLE IF NOT EXISTS not_arrived_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  total_dc INTEGER DEFAULT 0,
  total_ds INTEGER DEFAULT 0,
  total_entregues INTEGER DEFAULT 0,
  pct_entregues NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS not_arrived_por_estacao (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES not_arrived_uploads(id) ON DELETE CASCADE,
  oc_name VARCHAR(255),
  oc_code VARCHAR(255),
  tipo VARCHAR(50),
  regiao VARCHAR(255),
  supervisor VARCHAR(255),
  total INTEGER DEFAULT 0,
  entregues INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS not_arrived_por_regiao (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES not_arrived_uploads(id) ON DELETE CASCADE,
  regiao VARCHAR(255),
  tipo VARCHAR(50),
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS not_arrived_por_operacao (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES not_arrived_uploads(id) ON DELETE CASCADE,
  operacao VARCHAR(255),
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS not_arrived_por_supervisor (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES not_arrived_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  total INTEGER DEFAULT 0,
  total_dc INTEGER DEFAULT 0,
  total_ds INTEGER DEFAULT 0,
  entregues INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS not_arrived_tendencia (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES not_arrived_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  data DATE,
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== NO TRACKING (断更) ==================================

CREATE TABLE IF NOT EXISTS notracking_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  total_7d_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notracking_por_ds (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES notracking_uploads(id) ON DELETE CASCADE,
  station VARCHAR(255),
  supervisor VARCHAR(255),
  regional VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  total_7d_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notracking_por_sup (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES notracking_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  regional VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  total_7d_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notracking_por_status (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES notracking_uploads(id) ON DELETE CASCADE,
  status VARCHAR(255),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notracking_por_faixa (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES notracking_uploads(id) ON DELETE CASCADE,
  faixa VARCHAR(50),
  total INTEGER DEFAULT 0,
  valor_total NUMERIC(15,2) DEFAULT 0,
  pct NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== RECLAMAÇÕES ========================================

CREATE TABLE IF NOT EXISTS reclamacoes_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  n_registros INTEGER DEFAULT 0,
  n_sup INTEGER DEFAULT 0,
  n_sta INTEGER DEFAULT 0,
  n_mot INTEGER DEFAULT 0,
  semana_ref INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reclamacoes_por_supervisor (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES reclamacoes_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  dia_total INTEGER DEFAULT 0,
  mes_total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reclamacoes_por_station (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES reclamacoes_uploads(id) ON DELETE CASCADE,
  station VARCHAR(255),
  supervisor VARCHAR(255),
  dia_total INTEGER DEFAULT 0,
  mes_total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reclamacoes_top5 (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES reclamacoes_uploads(id) ON DELETE CASCADE,
  motorista VARCHAR(255),
  id_motorista VARCHAR(255),
  ds VARCHAR(255),
  supervisor VARCHAR(255),
  total INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== TRIAGEM ============================================

CREATE TABLE IF NOT EXISTS triagem_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  qtd_ok INTEGER DEFAULT 0,
  qtd_erro INTEGER DEFAULT 0,
  taxa NUMERIC(10,2) DEFAULT 0,
  tem_arrival BOOLEAN DEFAULT FALSE,
  qtd_recebidos INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagem_por_ds (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES triagem_uploads(id) ON DELETE CASCADE,
  ds VARCHAR(255),
  total INTEGER DEFAULT 0,
  ok INTEGER DEFAULT 0,
  nok INTEGER DEFAULT 0,
  fora INTEGER DEFAULT 0,
  taxa NUMERIC(10,2) DEFAULT 0,
  recebidos INTEGER DEFAULT 0,
  recebidos_nok INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagem_top5 (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES triagem_uploads(id) ON DELETE CASCADE,
  ds VARCHAR(255),
  total_erros INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagem_por_supervisor (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES triagem_uploads(id) ON DELETE CASCADE,
  supervisor VARCHAR(255),
  total INTEGER DEFAULT 0,
  ok INTEGER DEFAULT 0,
  nok INTEGER DEFAULT 0,
  fora INTEGER DEFAULT 0,
  taxa NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagem_por_cidade (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES triagem_uploads(id) ON DELETE CASCADE,
  ds VARCHAR(255),
  cidade VARCHAR(255),
  ok INTEGER DEFAULT 0,
  nok INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  taxa NUMERIC(10,2) DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS triagem_detalhes (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES triagem_uploads(id) ON DELETE CASCADE,
  waybill VARCHAR(255),
  ds_destino VARCHAR(255),
  ds_entrega VARCHAR(255),
  cidade VARCHAR(255),
  status VARCHAR(50),
  foi_recebido BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ======================== BACKLOG SLA ========================================

CREATE TABLE IF NOT EXISTS backlog_uploads (
  id BIGSERIAL PRIMARY KEY,
  data_ref DATE NOT NULL,
  criado_por VARCHAR(255),
  total INTEGER DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  na_ds INTEGER DEFAULT 0,
  em_transito INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_detalhes (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  waybill VARCHAR(255),
  cliente VARCHAR(255),
  supervisor VARCHAR(255),
  ds VARCHAR(255),
  process VARCHAR(50),
  range_backlog VARCHAR(50),
  motivo VARCHAR(255),
  estagio VARCHAR(100),
  regiao VARCHAR(255),
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_por_cliente (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  cliente VARCHAR(255),
  backlog INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  pct_backlog NUMERIC(10,2) DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  f_1_3 INTEGER DEFAULT 0,
  f_3_5 INTEGER DEFAULT 0,
  f_5_7 INTEGER DEFAULT 0,
  f_7_10 INTEGER DEFAULT 0,
  f_10_15 INTEGER DEFAULT 0,
  f_15_20 INTEGER DEFAULT 0,
  f_20_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_por_ds (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  supervisor VARCHAR(255),
  backlog INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  pct_backlog NUMERIC(10,2) DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  prioridade INTEGER,
  f_1_3 INTEGER DEFAULT 0,
  f_3_5 INTEGER DEFAULT 0,
  f_5_7 INTEGER DEFAULT 0,
  f_7_10 INTEGER DEFAULT 0,
  f_10_15 INTEGER DEFAULT 0,
  f_15_20 INTEGER DEFAULT 0,
  f_20_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_por_supervisor (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  backlog INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  pct_backlog NUMERIC(10,2) DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  f_1_3 INTEGER DEFAULT 0,
  f_3_5 INTEGER DEFAULT 0,
  f_5_7 INTEGER DEFAULT 0,
  f_7_10 INTEGER DEFAULT 0,
  f_10_15 INTEGER DEFAULT 0,
  f_15_20 INTEGER DEFAULT 0,
  f_20_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_por_rdc (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  regiao VARCHAR(255),
  backlog INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  pct_backlog NUMERIC(10,2) DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  f_1_3 INTEGER DEFAULT 0,
  f_3_5 INTEGER DEFAULT 0,
  f_5_7 INTEGER DEFAULT 0,
  f_7_10 INTEGER DEFAULT 0,
  f_10_15 INTEGER DEFAULT 0,
  f_15_20 INTEGER DEFAULT 0,
  f_20_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backlog_por_motivo (
  id BIGSERIAL PRIMARY KEY,
  upload_id BIGINT REFERENCES backlog_uploads(id) ON DELETE CASCADE,
  nome VARCHAR(255),
  backlog INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  pct_backlog NUMERIC(10,2) DEFAULT 0,
  total_7d INTEGER DEFAULT 0,
  f_1_3 INTEGER DEFAULT 0,
  f_3_5 INTEGER DEFAULT 0,
  f_5_7 INTEGER DEFAULT 0,
  f_7_10 INTEGER DEFAULT 0,
  f_10_15 INTEGER DEFAULT 0,
  f_15_20 INTEGER DEFAULT 0,
  f_20_mais INTEGER DEFAULT 0,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================== INDICES ========================================

CREATE INDEX idx_expedicao_diaria_data_ref ON expedicao_diaria(data_ref);
CREATE INDEX idx_expedicao_cidades_data_ref ON expedicao_cidades(data_ref);
CREATE INDEX idx_monitoramento_diario_upload_id ON monitoramento_diario(upload_id);
CREATE INDEX idx_monitoramento_diario_ds ON monitoramento_diario(ds);
CREATE INDEX idx_extravios_por_ds_upload_id ON extravios_por_ds(upload_id);
CREATE INDEX idx_extravios_por_motivo_upload_id ON extravios_por_motivo(upload_id);
CREATE INDEX idx_extravios_por_semana_upload_id ON extravios_por_semana(upload_id);
CREATE INDEX idx_na_por_supervisor_upload_id ON na_por_supervisor(upload_id);
CREATE INDEX idx_na_por_ds_upload_id ON na_por_ds(upload_id);
CREATE INDEX idx_na_por_processo_upload_id ON na_por_processo(upload_id);
CREATE INDEX idx_na_tendencia_upload_id ON na_tendencia(upload_id);
CREATE INDEX idx_na_tendencia_data ON na_tendencia(data);
CREATE INDEX idx_not_arrived_por_estacao_upload_id ON not_arrived_por_estacao(upload_id);
CREATE INDEX idx_not_arrived_por_regiao_upload_id ON not_arrived_por_regiao(upload_id);
CREATE INDEX idx_not_arrived_por_operacao_upload_id ON not_arrived_por_operacao(upload_id);
CREATE INDEX idx_not_arrived_por_supervisor_upload_id ON not_arrived_por_supervisor(upload_id);
CREATE INDEX idx_not_arrived_tendencia_upload_id ON not_arrived_tendencia(upload_id);
CREATE INDEX idx_notracking_por_ds_upload_id ON notracking_por_ds(upload_id);
CREATE INDEX idx_notracking_por_sup_upload_id ON notracking_por_sup(upload_id);
CREATE INDEX idx_notracking_por_status_upload_id ON notracking_por_status(upload_id);
CREATE INDEX idx_notracking_por_faixa_upload_id ON notracking_por_faixa(upload_id);
CREATE INDEX idx_reclamacoes_por_supervisor_upload_id ON reclamacoes_por_supervisor(upload_id);
CREATE INDEX idx_reclamacoes_por_station_upload_id ON reclamacoes_por_station(upload_id);
CREATE INDEX idx_reclamacoes_top5_upload_id ON reclamacoes_top5(upload_id);
CREATE INDEX idx_triagem_por_ds_upload_id ON triagem_por_ds(upload_id);
CREATE INDEX idx_triagem_top5_upload_id ON triagem_top5(upload_id);
CREATE INDEX idx_triagem_por_supervisor_upload_id ON triagem_por_supervisor(upload_id);
CREATE INDEX idx_triagem_por_cidade_upload_id ON triagem_por_cidade(upload_id);
CREATE INDEX idx_triagem_detalhes_upload_id ON triagem_detalhes(upload_id);
CREATE INDEX idx_backlog_detalhes_upload_id ON backlog_detalhes(upload_id);
CREATE INDEX idx_backlog_por_cliente_upload_id ON backlog_por_cliente(upload_id);
CREATE INDEX idx_backlog_por_ds_upload_id ON backlog_por_ds(upload_id);
CREATE INDEX idx_backlog_por_supervisor_upload_id ON backlog_por_supervisor(upload_id);
CREATE INDEX idx_backlog_por_rdc_upload_id ON backlog_por_rdc(upload_id);
CREATE INDEX idx_backlog_por_motivo_upload_id ON backlog_por_motivo(upload_id);
CREATE INDEX idx_audit_log_criado_em ON audit_log(criado_em);
CREATE INDEX idx_usuarios_email ON usuarios(email);

-- ── Contestações de Descontos Logísticos ─────────────────────
CREATE TABLE IF NOT EXISTS contestacoes (
    id                SERIAL PRIMARY KEY,
    data_contestacao  DATE         NOT NULL,
    quem_solicitou    TEXT         DEFAULT '',
    ds                TEXT         NOT NULL,
    waybill           TEXT         NOT NULL,
    motivo_desconto   TEXT         NOT NULL,
    faturamento_b64   TEXT,
    faturamento_nome  TEXT,
    valor_desconto    NUMERIC(10,2),
    status_analise    TEXT         NOT NULL DEFAULT 'Pendente',
    observacao        TEXT         DEFAULT '',
    evidencia_b64     TEXT,
    evidencia_nome    TEXT,
    previsao          DATE,
    criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contestacoes_waybill ON contestacoes (UPPER(waybill));
CREATE INDEX IF NOT EXISTS idx_contestacoes_status  ON contestacoes (status_analise);

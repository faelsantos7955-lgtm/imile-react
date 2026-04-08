-- migration_fix.sql — Colunas faltantes identificadas na auditoria
-- Execute este script no Neon SQL Editor (uma vez)

-- ── usuarios: colunas usadas no código mas ausentes no schema ─
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS acoes TEXT[] DEFAULT '{}';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_por VARCHAR(255);

-- ── config_metas: colunas usadas no admin de metas ────────────
ALTER TABLE config_metas ADD COLUMN IF NOT EXISTS meta_expedicao NUMERIC(5,4) DEFAULT 0.9;
ALTER TABLE config_metas ADD COLUMN IF NOT EXISTS meta_entrega NUMERIC(5,4) DEFAULT 0.9;
ALTER TABLE config_metas ADD COLUMN IF NOT EXISTS regiao VARCHAR(255) DEFAULT '';

-- ── motoristas_status: colunas usadas no upsert ───────────────
ALTER TABLE motoristas_status ADD COLUMN IF NOT EXISTS nome_motorista VARCHAR(255) DEFAULT '';
ALTER TABLE motoristas_status ADD COLUMN IF NOT EXISTS motivo TEXT DEFAULT '';
ALTER TABLE motoristas_status ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE motoristas_status ADD COLUMN IF NOT EXISTS atualizado_por VARCHAR(255);

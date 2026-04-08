-- Tabela para tokens de definição de senha (enviados por e-mail ao aprovar usuário)
CREATE TABLE IF NOT EXISTS password_tokens (
    token       TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMP NOT NULL,
    usado       BOOLEAN NOT NULL DEFAULT false,
    criado_em   TIMESTAMP NOT NULL DEFAULT NOW()
);

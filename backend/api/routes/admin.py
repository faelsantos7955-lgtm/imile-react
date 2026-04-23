"""
api/routes/admin.py — Rotas administrativas
"""
import io
import uuid
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Request
from pydantic import BaseModel, field_validator
from typing import Literal
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, require_admin, audit_log
from api.email_utils import email_boas_vindas
from api.limiter import limiter
import pandas as pd

PAGINAS_VALIDAS = {'dashboard','historico','comparativos','triagem','reclamacoes','backlog','monitoramento','admin'}
ACOES_VALIDAS   = {'excel','bloquear_motorista','aprovar_acesso'}

router = APIRouter()


# ── Usuários ──────────────────────────────────────────────────
@router.get("/usuarios")
def listar_usuarios(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM usuarios ORDER BY nome")).mappings().all()
    return [dict(r) for r in rows]


class PermissoesRequest(BaseModel):
    bases: list = []
    paginas: list = []
    acoes: list = []
    role: Literal["viewer", "supervisor", "admin"] = "viewer"
    ativo: bool = True

    @field_validator("paginas")
    @classmethod
    def validar_paginas(cls, v):
        invalidas = set(v) - PAGINAS_VALIDAS
        if invalidas:
            raise ValueError(f"Páginas inválidas: {invalidas}")
        return v

    @field_validator("acoes")
    @classmethod
    def validar_acoes(cls, v):
        invalidas = set(v) - ACOES_VALIDAS
        if invalidas:
            raise ValueError(f"Ações inválidas: {invalidas}")
        return v


@router.put("/usuarios/{user_id}")
def atualizar_usuario(user_id: str, req: PermissoesRequest, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    from datetime import datetime
    result = db.execute(
        text("""
            UPDATE usuarios
            SET bases = :bases, paginas = :paginas, acoes = :acoes,
                role = :role, ativo = :ativo, atualizado_por = :atualizado_por,
                atualizado_em = :atualizado_em
            WHERE id = :id
        """),
        {
            "bases": req.bases,
            "paginas": req.paginas,
            "acoes": req.acoes,
            "role": req.role,
            "ativo": req.ativo,
            "atualizado_por": user["email"],
            "atualizado_em": datetime.utcnow().isoformat(),
            "id": user_id,
        }
    )
    if result.rowcount == 0:
        raise HTTPException(404, "Usuário não encontrado")
    db.commit()
    audit_log("permissoes_atualizadas", f"usuario:{user_id}",
              {"role": req.role, "ativo": req.ativo, "paginas": req.paginas}, user)
    return {"ok": True}


# ── Solicitações de Acesso ────────────────────────────────────
@router.get("/solicitacoes")
def listar_solicitacoes(status: str = "pendente", user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT * FROM solicitacoes_acesso WHERE status = :status ORDER BY criado_em DESC"),
        {"status": status}
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/solicitacoes/{sol_id}/aprovar")
def aprovar(sol_id: int, background_tasks: BackgroundTasks, role: str = "viewer", user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT * FROM solicitacoes_acesso WHERE id = :id"),
        {"id": sol_id}
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Solicitação não encontrada")

    s = dict(row)
    db.execute(
        text("UPDATE solicitacoes_acesso SET status = 'aprovado' WHERE id = :id"),
        {"id": sol_id}
    )
    db.execute(
        text("""
            INSERT INTO usuarios (id, email, nome, role, bases, paginas, ativo)
            VALUES (:id, :email, :nome, :role, :bases, :paginas, true)
            ON CONFLICT (email) DO UPDATE
            SET nome = EXCLUDED.nome, role = EXCLUDED.role, ativo = EXCLUDED.ativo
        """),
        {"id": str(uuid.uuid4()), "email": s["email"], "nome": s["nome"], "role": role, "bases": [], "paginas": []}
    )

    db.commit()

    # Tenta gerar token e enviar email — falha aqui não cancela a aprovação
    email_enviado = False
    try:
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=48)
        db.execute(
            text("""
                INSERT INTO password_tokens (token, email, expires_at, usado)
                VALUES (:token, :email, :expires_at, false)
                ON CONFLICT (email) DO UPDATE
                SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, usado = false
            """),
            {"token": token, "email": s["email"], "expires_at": expires_at}
        )
        db.commit()
        background_tasks.add_task(email_boas_vindas, s["nome"], s["email"], token)
        email_enviado = True
    except Exception as e:
        print(f"[aprovar] Erro ao gerar token: {e}")

    audit_log("solicitacao_aprovada", f"solicitacao:{sol_id}",
              {"email": s["email"], "role": role}, user)
    return {"ok": True, "email_enviado": email_enviado}


@router.post("/usuarios/{user_id}/reenviar-convite")
def reenviar_convite(user_id: str, background_tasks: BackgroundTasks, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT email, nome FROM usuarios WHERE id = :id"),
        {"id": user_id}
    ).mappings().first()
    if not row:
        raise HTTPException(404, "Usuário não encontrado")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=48)
    db.execute(
        text("""
            INSERT INTO password_tokens (token, email, expires_at, usado)
            VALUES (:token, :email, :expires_at, false)
            ON CONFLICT (email) DO UPDATE
            SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at, usado = false
        """),
        {"token": token, "email": row["email"], "expires_at": expires_at}
    )
    db.commit()
    background_tasks.add_task(email_boas_vindas, row["nome"], row["email"], token)
    return {"ok": True}


@router.post("/solicitacoes/{sol_id}/rejeitar")
def rejeitar(sol_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(
        text("UPDATE solicitacoes_acesso SET status = 'rejeitado' WHERE id = :id"),
        {"id": sol_id}
    )
    db.commit()
    audit_log("solicitacao_rejeitada", f"solicitacao:{sol_id}", {}, user)
    return {"ok": True}


# ── Audit Log ─────────────────────────────────────────────────
@router.get("/audit-log")
def listar_audit_log(
    limit: int = 50,
    offset: int = 0,
    acao: str = "",
    email: str = "",
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    conditions = []
    params: dict = {"limit": limit, "offset": offset}
    if acao:
        conditions.append("acao = :acao")
        params["acao"] = acao
    if email:
        conditions.append("email ILIKE :email")
        params["email"] = f"%{email}%"

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    rows = db.execute(
        text(f"SELECT * FROM audit_log {where} ORDER BY criado_em DESC LIMIT :limit OFFSET :offset"),
        params
    ).mappings().all()
    return [dict(r) for r in rows]


# ── Motoristas ────────────────────────────────────────────────
class MotoristaRequest(BaseModel):
    id_motorista: str
    nome_motorista: str = ""
    ativo: bool = True
    motivo: str = ""


@router.post("/motoristas")
def upsert_motorista(req: MotoristaRequest, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    from datetime import datetime
    db.execute(
        text("""
            INSERT INTO motoristas_status (id_motorista, nome_motorista, ativo, motivo, atualizado_em, atualizado_por)
            VALUES (:id_motorista, :nome_motorista, :ativo, :motivo, :atualizado_em, :atualizado_por)
            ON CONFLICT (id_motorista) DO UPDATE
            SET nome_motorista = EXCLUDED.nome_motorista,
                ativo = EXCLUDED.ativo,
                motivo = EXCLUDED.motivo,
                atualizado_em = EXCLUDED.atualizado_em,
                atualizado_por = EXCLUDED.atualizado_por
        """),
        {
            "id_motorista":   req.id_motorista,
            "nome_motorista": req.nome_motorista,
            "ativo":          req.ativo,
            "motivo":         req.motivo,
            "atualizado_em":  datetime.utcnow().isoformat(),
            "atualizado_por": user["email"],
        }
    )
    db.commit()
    return {"ok": True}


# ── Metas por DS ──────────────────────────────────────────────
class MetaDS(BaseModel):
    ds: str
    meta_expedicao: float = 0.9
    meta_entrega: float = 0.9
    regiao: str = ""


@router.get("/metas")
def listar_metas(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM config_metas ORDER BY ds")).mappings().all()
    return [dict(r) for r in rows]


@router.put("/metas")
def upsert_metas(metas: list[MetaDS], user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    from datetime import datetime
    rows = [
        {
            "ds":              m.ds.strip().upper(),
            "meta_expedicao":  round(m.meta_expedicao, 4),
            "meta_entrega":    round(m.meta_entrega, 4),
            "regiao":          m.regiao.strip(),
            "atualizado_em":   datetime.utcnow().isoformat(),
            "atualizado_por":  user["email"],
        }
        for m in metas
        if m.ds.strip()
    ]
    if rows:
        db.execute(
            text("""
                INSERT INTO config_metas (ds, meta_expedicao, meta_entrega, regiao, atualizado_em, atualizado_por)
                VALUES (:ds, :meta_expedicao, :meta_entrega, :regiao, :atualizado_em, :atualizado_por)
                ON CONFLICT (ds) DO UPDATE
                SET meta_expedicao = EXCLUDED.meta_expedicao,
                    meta_entrega = EXCLUDED.meta_entrega,
                    regiao = EXCLUDED.regiao,
                    atualizado_em = EXCLUDED.atualizado_em,
                    atualizado_por = EXCLUDED.atualizado_por
            """),
            rows
        )
        db.commit()
    return {"ok": True, "saved": len(rows)}


@router.delete("/metas/{ds}")
def deletar_meta(ds: str, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    db.execute(
        text("DELETE FROM config_metas WHERE ds = :ds"),
        {"ds": ds.strip().upper()}
    )
    db.commit()
    return {"ok": True}


# ── Supervisores ──────────────────────────────────────────────

@router.get("/supervisores")
def listar_supervisores(user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT sigla, region, atualizado_por FROM config_supervisores ORDER BY sigla")
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/supervisores/upload")
@limiter.limit("10/minute")
async def upload_supervisores(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    conteudo = await file.read()
    if len(conteudo) > 10 * 1024 * 1024:
        raise HTTPException(400, "Arquivo muito grande (máx 10 MB).")
    try:
        xl = pd.ExcelFile(io.BytesIO(conteudo))
    except Exception:
        raise HTTPException(400, "Arquivo inválido. Envie um .xlsx.")

    aba = next((s for s in xl.sheet_names if 'BASE ATUAL' in s.upper() or 'ATUALIZADO' in s.upper()), xl.sheet_names[0])
    df = xl.parse(aba)
    df.columns = df.columns.str.strip()

    col_sigla = next((c for c in df.columns if str(c).strip().upper() in ('SIGLA', 'DS', 'DS SIGLA')), None)
    col_sup   = next((c for c in df.columns if 'SUPERVISOR' in str(c).strip().upper()), None)

    if not col_sigla or not col_sup:
        raise HTTPException(400, f"Colunas SIGLA e SUPERVISOR não encontradas. Encontradas: {list(df.columns)}")

    df = df[[col_sigla, col_sup]].copy()
    df.columns = ['sigla', 'supervisor']
    df = df.dropna(subset=['sigla', 'supervisor'])
    df['sigla']      = df['sigla'].astype(str).str.strip().str.upper()
    df['supervisor'] = df['supervisor'].astype(str).str.strip().str.upper()
    df = df[df['sigla'].str.startswith('DS') | df['sigla'].str.startswith('DC')]
    df = df[df['sigla'].str.len() >= 4]

    if df.empty:
        raise HTTPException(400, "Nenhuma DS válida encontrada no arquivo.")

    rows = [
        {"sigla": r.sigla, "region": r.supervisor, "atualizado_por": user["email"]}
        for r in df.itertuples()
    ]

    db.execute(
        text("""
            INSERT INTO config_supervisores (sigla, region, atualizado_por)
            VALUES (:sigla, :region, :atualizado_por)
            ON CONFLICT (sigla) DO UPDATE
            SET region = EXCLUDED.region,
                atualizado_por = EXCLUDED.atualizado_por
        """),
        rows
    )
    db.commit()
    audit_log("supervisores_atualizados", "config_supervisores", {"total": len(rows), "aba": aba}, user)
    return {"ok": True, "total": len(rows), "aba": aba}

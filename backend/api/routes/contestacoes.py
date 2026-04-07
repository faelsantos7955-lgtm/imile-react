"""
api/routes/contestacoes.py — Controle de Contestações de Descontos Logísticos
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from datetime import date

from api.deps import get_db, get_current_user, require_admin

router = APIRouter()

MOTIVOS = ["Extravio", "Avaria", "Desconto Indevido", "Outros"]
STATUS_OPTIONS = ["Pendente", "Em Andamento", "Enviado ao Financeiro", "Aprovado", "Reprovado"]

MAX_B64_LEN = 8_000_000  # ~6 MB de arquivo


class ContestacaoCreate(BaseModel):
    data_contestacao: date
    quem_solicitou: Optional[str] = ""
    ds: str
    waybill: str
    motivo_desconto: str
    faturamento_b64: Optional[str] = None
    faturamento_nome: Optional[str] = None
    valor_desconto: Optional[float] = None
    observacao: Optional[str] = ""
    evidencia_b64: Optional[str] = None
    evidencia_nome: Optional[str] = None
    previsao: Optional[date] = None


class StatusUpdate(BaseModel):
    status_analise: str
    observacao: Optional[str] = None
    previsao: Optional[date] = None


# ── Consulta pública por waybill (sem autenticação) ───────────
@router.get("/consulta/{waybill}")
def consulta_publica(waybill: str, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT waybill, motivo_desconto, valor_desconto, ds,
               status_analise, observacao, previsao, data_contestacao
        FROM contestacoes
        WHERE UPPER(waybill) = UPPER(:waybill)
        ORDER BY criado_em DESC
    """), {"waybill": waybill.strip()}).mappings().all()
    return [dict(r) for r in rows]


# ── Listagem (requer login) ───────────────────────────────────
@router.get("")
def listar(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    rows = db.execute(text("""
        SELECT id, data_contestacao, quem_solicitou, ds, waybill,
               motivo_desconto, faturamento_nome, valor_desconto,
               status_analise, observacao, evidencia_nome, previsao,
               criado_em, atualizado_em
        FROM contestacoes
        ORDER BY criado_em DESC
    """)).mappings().all()
    return [dict(r) for r in rows]


# ── Criação (pública — sem autenticação) ─────────────────────
@router.post("")
def criar(body: ContestacaoCreate, db: Session = Depends(get_db)):
    if body.motivo_desconto not in MOTIVOS:
        raise HTTPException(400, f"Motivo inválido. Opções: {', '.join(MOTIVOS)}")
    if body.faturamento_b64 and len(body.faturamento_b64) > MAX_B64_LEN:
        raise HTTPException(400, "Faturamento excede o limite de 6 MB")
    if body.evidencia_b64 and len(body.evidencia_b64) > MAX_B64_LEN:
        raise HTTPException(400, "Evidência excede o limite de 6 MB")

    db.execute(text("""
        INSERT INTO contestacoes (
            data_contestacao, quem_solicitou, ds, waybill, motivo_desconto,
            faturamento_b64, faturamento_nome, valor_desconto,
            status_analise, observacao, evidencia_b64, evidencia_nome, previsao
        ) VALUES (
            :data_contestacao, :quem_solicitou, :ds, :waybill, :motivo_desconto,
            :faturamento_b64, :faturamento_nome, :valor_desconto,
            'Pendente', :observacao, :evidencia_b64, :evidencia_nome, :previsao
        )
    """), {
        "data_contestacao": body.data_contestacao,
        "quem_solicitou":   body.quem_solicitou or "",
        "ds":               body.ds,
        "waybill":          body.waybill.strip(),
        "motivo_desconto":  body.motivo_desconto,
        "faturamento_b64":  body.faturamento_b64,
        "faturamento_nome": body.faturamento_nome,
        "valor_desconto":   body.valor_desconto,
        "observacao":       body.observacao or "",
        "evidencia_b64":    body.evidencia_b64,
        "evidencia_nome":   body.evidencia_nome,
        "previsao":         body.previsao,
    })
    db.commit()
    return {"ok": True}


# ── Atualizar status / obs / previsão ─────────────────────────
@router.patch("/{id}/status")
def atualizar_status(
    id: int, body: StatusUpdate,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user)
):
    if body.status_analise not in STATUS_OPTIONS:
        raise HTTPException(400, f"Status inválido. Opções: {', '.join(STATUS_OPTIONS)}")

    params = {"id": id, "status_analise": body.status_analise,
              "observacao": body.observacao, "previsao": body.previsao}

    result = db.execute(text("""
        UPDATE contestacoes SET
            status_analise = :status_analise,
            observacao     = CASE WHEN :observacao IS NOT NULL THEN :observacao ELSE observacao END,
            previsao       = CASE WHEN :previsao   IS NOT NULL THEN :previsao   ELSE previsao   END,
            atualizado_em  = NOW()
        WHERE id = :id
    """), params)
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Contestação não encontrada")
    return {"ok": True}


# ── Baixar arquivo (faturamento ou evidência) ─────────────────
@router.get("/{id}/arquivo/{tipo}")
def baixar_arquivo(
    id: int, tipo: str,
    db: Session = Depends(get_db), user: dict = Depends(get_current_user)
):
    if tipo not in ("faturamento", "evidencia"):
        raise HTTPException(400, "Tipo inválido")

    row = db.execute(
        text(f"SELECT {tipo}_b64, {tipo}_nome FROM contestacoes WHERE id = :id"),
        {"id": id}
    ).mappings().first()

    if not row or not row[f"{tipo}_b64"]:
        raise HTTPException(404, "Arquivo não encontrado")

    return {"b64": row[f"{tipo}_b64"], "nome": row[f"{tipo}_nome"]}


# ── Deletar (admin only) ──────────────────────────────────────
@router.delete("/{id}")
def deletar(id: int, db: Session = Depends(get_db), user: dict = Depends(require_admin)):
    result = db.execute(text("DELETE FROM contestacoes WHERE id = :id"), {"id": id})
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Contestação não encontrada")
    return {"ok": True}

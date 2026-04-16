"""
api/routes/whatsapp.py — CRM de pós-entrega via WhatsApp
Campanhas de disparo + gestão de respostas
"""
import io
import logging
import threading
import time
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from api.deps import get_db, get_current_user
from api.upload_utils import validar_arquivo
from api.whatsapp_sender import enviar_mensagem, enviar_texto

log = logging.getLogger("whatsapp")
router = APIRouter()


# ── Schema (idempotente) ──────────────────────────────────────

def _ensure_schema(db: Session):
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS whatsapp_campanhas (
            id          SERIAL PRIMARY KEY,
            nome        VARCHAR(255),
            criado_por  VARCHAR(255),
            criado_em   TIMESTAMP DEFAULT NOW(),
            total       INTEGER DEFAULT 0,
            enviados    INTEGER DEFAULT 0,
            confirmados INTEGER DEFAULT 0,
            nao_recebidos INTEGER DEFAULT 0,
            pendentes   INTEGER DEFAULT 0,
            status      VARCHAR(50) DEFAULT 'pendente'
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS whatsapp_contatos (
            id              SERIAL PRIMARY KEY,
            campanha_id     INTEGER REFERENCES whatsapp_campanhas(id) ON DELETE CASCADE,
            nome            VARCHAR(255),
            telefone        VARCHAR(30),
            rastreio        VARCHAR(100),
            empresa         VARCHAR(100),
            uf              VARCHAR(10),
            data_envio_prev VARCHAR(20),
            status          VARCHAR(50) DEFAULT 'pendente',
            message_id      VARCHAR(255),
            enviado_em      TIMESTAMP,
            respondido_em   TIMESTAMP,
            observacao      TEXT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
            id          SERIAL PRIMARY KEY,
            contato_id  INTEGER REFERENCES whatsapp_contatos(id) ON DELETE CASCADE,
            direcao     VARCHAR(10),
            conteudo    TEXT,
            criado_em   TIMESTAMP DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_wpp_contatos_campanha ON whatsapp_contatos(campanha_id)",
        "CREATE INDEX IF NOT EXISTS idx_wpp_contatos_status   ON whatsapp_contatos(status)",
        "CREATE INDEX IF NOT EXISTS idx_wpp_contatos_telefone ON whatsapp_contatos(telefone)",
        "CREATE INDEX IF NOT EXISTS idx_wpp_mensagens_contato ON whatsapp_mensagens(contato_id)",
    ]
    for s in stmts:
        try:
            db.execute(text(s))
            db.commit()
        except Exception:
            db.rollback()


# ── Helpers ───────────────────────────────────────────────────

def _norm_col(cols: list, *candidates) -> Optional[str]:
    lower = {c.lower().strip(): c for c in cols}
    for cand in candidates:
        if cand in cols:
            return cand
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None


def _parse_planilha(buf: bytes) -> list[dict]:
    df = pd.read_excel(io.BytesIO(buf), dtype=str)
    df.columns = df.columns.str.strip()
    cols = list(df.columns)

    c_nome     = _norm_col(cols, 'Nome do Comprador', 'Nome', 'nome')
    c_tel      = _norm_col(cols, 'Telefone do Comprador', 'Telefone', 'telefone', 'Celular')
    c_rastreio = _norm_col(cols, 'Numero de Rastreio (BR)', 'Rastreio', 'rastreio', 'Waybill')
    c_empresa  = _norm_col(cols, 'Empresa', 'Plataforma', 'empresa', 'plataforma')
    c_uf       = _norm_col(cols, 'UF', 'Estado', 'uf')
    c_data     = _norm_col(cols, 'Data de Envio da acareacao', 'Data', 'data')

    if not c_tel:
        raise HTTPException(400, f"Coluna de telefone não encontrada. Colunas: {cols}")
    if not c_rastreio:
        raise HTTPException(400, f"Coluna de rastreio não encontrada. Colunas: {cols}")

    contatos = []
    for _, row in df.iterrows():
        tel = str(row[c_tel]).strip() if c_tel else ""
        if not tel or tel.lower() in ("nan", "none", ""):
            continue
        contatos.append({
            "nome":            str(row[c_nome]).strip()    if c_nome    else "",
            "telefone":        tel,
            "rastreio":        str(row[c_rastreio]).strip() if c_rastreio else "",
            "empresa":         str(row[c_empresa]).strip() if c_empresa  else "",
            "uf":              str(row[c_uf]).strip()      if c_uf      else "",
            "data_envio_prev": str(row[c_data]).strip()    if c_data    else "",
        })
    return contatos


def _disparar_campanha(campanha_id: int, intervalo: float = 1.0):
    """Roda em background — envia mensagens com intervalo entre cada uma."""
    from api.deps import _engine
    from sqlalchemy.orm import sessionmaker
    db = sessionmaker(bind=_engine(), autocommit=False, autoflush=False)()
    try:
        contatos = db.execute(
            text("SELECT id, nome, telefone, rastreio, empresa FROM whatsapp_contatos WHERE campanha_id = :cid AND status = 'pendente'"),
            {"cid": campanha_id}
        ).mappings().all()

        for c in contatos:
            resultado = enviar_mensagem(c["telefone"], c["nome"], c["rastreio"], c["empresa"])
            novo_status = "enviado" if resultado["status"] in ("enviado", "simulado") else "erro"
            db.execute(
                text("UPDATE whatsapp_contatos SET status = :s, message_id = :mid, enviado_em = NOW() WHERE id = :id"),
                {"s": novo_status, "mid": resultado.get("message_id", ""), "id": c["id"]}
            )
            db.execute(
                text("INSERT INTO whatsapp_mensagens (contato_id, direcao, conteudo) VALUES (:cid, 'enviado', :txt)"),
                {"cid": c["id"], "txt": f"Confirmação de entrega enviada. Rastreio: {c['rastreio']}"}
            )
            db.commit()
            time.sleep(intervalo)

        # Atualiza contadores da campanha
        db.execute(text("""
            UPDATE whatsapp_campanhas SET
                enviados    = (SELECT COUNT(*) FROM whatsapp_contatos WHERE campanha_id = :cid AND status != 'pendente'),
                pendentes   = (SELECT COUNT(*) FROM whatsapp_contatos WHERE campanha_id = :cid AND status = 'pendente'),
                confirmados = (SELECT COUNT(*) FROM whatsapp_contatos WHERE campanha_id = :cid AND status = 'confirmado'),
                nao_recebidos = (SELECT COUNT(*) FROM whatsapp_contatos WHERE campanha_id = :cid AND status = 'nao_recebeu'),
                status      = 'concluido'
            WHERE id = :cid
        """), {"cid": campanha_id})
        db.commit()
        log.info("Campanha %d concluída", campanha_id)
    except Exception as e:
        log.error("Erro ao disparar campanha %d: %s", campanha_id, e)
        db.rollback()
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/contatos")
def listar_contatos_chat(
    campanha_id: int = 0,
    status: str = "",
    busca: str = "",
    page: int = 0,
    limit: int = 60,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lista contatos com última mensagem — para a view de chat."""
    _ensure_schema(db)
    where = "1=1"
    params: dict = {"limit": limit, "offset": page * limit}

    if campanha_id:
        where += " AND c.campanha_id = :cid"
        params["cid"] = campanha_id
    if status:
        where += " AND c.status = :status"
        params["status"] = status
    if busca:
        where += " AND (c.nome ILIKE :busca OR c.telefone LIKE :busca2 OR c.rastreio LIKE :busca3)"
        params["busca"]  = f"%{busca}%"
        params["busca2"] = f"%{busca}%"
        params["busca3"] = f"%{busca}%"

    rows = db.execute(text(f"""
        SELECT c.*,
               m.conteudo  AS ultima_mensagem,
               m.direcao   AS ultima_direcao,
               m.criado_em AS ultima_mensagem_em
        FROM whatsapp_contatos c
        LEFT JOIN LATERAL (
            SELECT conteudo, direcao, criado_em
            FROM   whatsapp_mensagens
            WHERE  contato_id = c.id
            ORDER  BY criado_em DESC
            LIMIT  1
        ) m ON true
        WHERE {where}
        ORDER BY COALESCE(m.criado_em, c.enviado_em, c.id::text::timestamp) DESC
        LIMIT :limit OFFSET :offset
    """), params).mappings().all()

    return [dict(r) for r in rows]


@router.get("/campanhas")
def listar_campanhas(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    _ensure_schema(db)
    rows = db.execute(
        text("SELECT * FROM whatsapp_campanhas ORDER BY criado_em DESC LIMIT 50")
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/campanhas")
async def criar_campanha(
    request: Request,
    nome: str = Form(...),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_schema(db)
    buf = await validar_arquivo(file, max_mb=20)
    contatos = _parse_planilha(buf)
    if not contatos:
        raise HTTPException(400, "Nenhum contato válido encontrado na planilha.")

    row = db.execute(
        text("INSERT INTO whatsapp_campanhas (nome, criado_por, total, pendentes, status) VALUES (:nome, :cp, :total, :total, 'pendente') RETURNING id"),
        {"nome": nome, "cp": user["email"], "total": len(contatos)}
    ).mappings().first()
    cid = row["id"]
    db.commit()

    BATCH = 500
    for i in range(0, len(contatos), BATCH):
        db.execute(
            text("INSERT INTO whatsapp_contatos (campanha_id, nome, telefone, rastreio, empresa, uf, data_envio_prev) VALUES (:cid, :nome, :telefone, :rastreio, :empresa, :uf, :data)"),
            [{"cid": cid, **c, "data": c["data_envio_prev"]} for c in contatos[i:i+BATCH]]
        )
    db.commit()

    return {"campanha_id": cid, "total": len(contatos)}


@router.get("/campanhas/{cid}")
def detalhe_campanha(
    cid: int,
    status: str = "",
    page: int = 0,
    limit: int = 50,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    camp = db.execute(text("SELECT * FROM whatsapp_campanhas WHERE id = :id"), {"id": cid}).mappings().first()
    if not camp:
        raise HTTPException(404, "Campanha não encontrada.")

    where = "campanha_id = :cid"
    params: dict = {"cid": cid, "limit": limit, "offset": page * limit}
    if status:
        where += " AND status = :status"
        params["status"] = status

    contatos = db.execute(
        text(f"SELECT * FROM whatsapp_contatos WHERE {where} ORDER BY id LIMIT :limit OFFSET :offset"),
        params
    ).mappings().all()

    return {"campanha": dict(camp), "contatos": [dict(r) for r in contatos]}


@router.post("/campanhas/{cid}/disparar")
def disparar_campanha(
    cid: int,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    camp = db.execute(text("SELECT * FROM whatsapp_campanhas WHERE id = :id"), {"id": cid}).mappings().first()
    if not camp:
        raise HTTPException(404, "Campanha não encontrada.")
    if camp["status"] == "disparando":
        raise HTTPException(400, "Campanha já está sendo disparada.")

    db.execute(text("UPDATE whatsapp_campanhas SET status = 'disparando' WHERE id = :id"), {"id": cid})
    db.commit()

    background_tasks.add_task(_disparar_campanha, cid)
    return {"ok": True, "mensagem": "Disparo iniciado em background."}


@router.get("/contatos/{cid}/mensagens")
def mensagens_contato(cid: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    contato = db.execute(text("SELECT * FROM whatsapp_contatos WHERE id = :id"), {"id": cid}).mappings().first()
    if not contato:
        raise HTTPException(404, "Contato não encontrado.")
    msgs = db.execute(
        text("SELECT * FROM whatsapp_mensagens WHERE contato_id = :cid ORDER BY criado_em"),
        {"cid": cid}
    ).mappings().all()
    return {"contato": dict(contato), "mensagens": [dict(m) for m in msgs]}


class EnviarTextoPayload(BaseModel):
    texto: str


@router.post("/contatos/{cid}/enviar")
def enviar_mensagem_manual(cid: int, payload: EnviarTextoPayload, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    contato = db.execute(text("SELECT * FROM whatsapp_contatos WHERE id = :id"), {"id": cid}).mappings().first()
    if not contato:
        raise HTTPException(404, "Contato não encontrado.")
    if not payload.texto.strip():
        raise HTTPException(400, "Mensagem vazia.")

    db.execute(
        text("INSERT INTO whatsapp_mensagens (contato_id, direcao, conteudo) VALUES (:cid, 'enviado', :txt)"),
        {"cid": cid, "txt": payload.texto.strip()}
    )

    resultado = enviar_texto(contato["telefone"], payload.texto.strip())

    if resultado["status"] in ("enviado", "simulado") and contato["status"] == "pendente":
        db.execute(
            text("UPDATE whatsapp_contatos SET status = 'em_atendimento' WHERE id = :id"),
            {"id": cid}
        )

    db.commit()
    return {"ok": True, "status": resultado["status"]}


class AtualizarStatusPayload(BaseModel):
    status: str
    observacao: str = ""


@router.put("/contatos/{cid}/status")
def atualizar_status(cid: int, payload: AtualizarStatusPayload, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    STATUS_VALIDOS = {"pendente", "enviado", "confirmado", "nao_recebeu", "em_atendimento", "encerrado"}
    if payload.status not in STATUS_VALIDOS:
        raise HTTPException(400, f"Status inválido. Use: {STATUS_VALIDOS}")
    db.execute(
        text("UPDATE whatsapp_contatos SET status = :s, observacao = :obs, respondido_em = NOW() WHERE id = :id"),
        {"s": payload.status, "obs": payload.observacao, "id": cid}
    )
    db.commit()
    return {"ok": True}


@router.delete("/campanhas/{cid}")
def deletar_campanha(cid: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(text("DELETE FROM whatsapp_campanhas WHERE id = :id"), {"id": cid})
    db.commit()
    return {"ok": True}


# ── Webhook Meta API ──────────────────────────────────────────

VERIFY_TOKEN = "imile_whatsapp_webhook"


@router.get("/webhook")
def webhook_verificar(request: Request):
    """Meta API envia GET para verificar o webhook na configuração."""
    params = dict(request.query_params)
    if params.get("hub.verify_token") == VERIFY_TOKEN and params.get("hub.challenge"):
        return int(params["hub.challenge"])
    raise HTTPException(403, "Token inválido.")


@router.post("/webhook")
async def webhook_receber(request: Request, db: Session = Depends(get_db)):
    """Recebe mensagens de resposta dos clientes via Meta API."""
    try:
        body = await request.json()
        for entry in body.get("entry", []):
            for change in entry.get("changes", []):
                val = change.get("value", {})
                for msg in val.get("messages", []):
                    telefone = msg.get("from", "")
                    texto = msg.get("text", {}).get("body", "").strip().upper()
                    msg_id = msg.get("id", "")

                    contato = db.execute(
                        text("SELECT id FROM whatsapp_contatos WHERE telefone LIKE :tel ORDER BY id DESC LIMIT 1"),
                        {"tel": f"%{telefone[-8:]}"}
                    ).mappings().first()

                    if not contato:
                        continue

                    cid = contato["id"]
                    db.execute(
                        text("INSERT INTO whatsapp_mensagens (contato_id, direcao, conteudo) VALUES (:cid, 'recebido', :txt)"),
                        {"cid": cid, "txt": texto}
                    )

                    if texto in ("SIM", "S", "RECEBI", "OK", "CONFIRMADO"):
                        novo_status = "confirmado"
                    elif texto in ("NÃO", "NAO", "NÃO RECEBI", "NAO RECEBI", "NÃO RECEBI", "N"):
                        novo_status = "nao_recebeu"
                    else:
                        novo_status = "em_atendimento"

                    db.execute(
                        text("UPDATE whatsapp_contatos SET status = :s, respondido_em = NOW() WHERE id = :id"),
                        {"s": novo_status, "id": cid}
                    )
                    db.commit()
    except Exception as e:
        log.error("Webhook erro: %s", e)
    return {"status": "ok"}

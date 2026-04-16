"""
api/whatsapp_sender.py — Abstração de envio WhatsApp.
Hoje é um placeholder. Quando a Meta API estiver configurada,
basta implementar a função `enviar_mensagem` abaixo.

Variáveis de ambiente necessárias (Railway):
  WHATSAPP_TOKEN        — Bearer token da Meta API
  WHATSAPP_PHONE_ID     — Phone Number ID do Meta Business
"""
import os
import logging
import httpx

log = logging.getLogger("whatsapp")

TOKEN    = os.getenv("WHATSAPP_TOKEN", "")
PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
API_URL  = f"https://graph.facebook.com/v19.0/{PHONE_ID}/messages"


def _formatar_telefone(telefone: str) -> str:
    """Normaliza para formato internacional: 5511999999999"""
    digits = "".join(c for c in str(telefone) if c.isdigit())
    if digits.startswith("55") and len(digits) >= 12:
        return digits
    if len(digits) == 11:
        return f"55{digits}"
    if len(digits) == 10:
        return f"55{digits}"
    return digits


def enviar_texto(telefone: str, texto: str) -> dict:
    """Envia mensagem de texto livre (resposta manual dentro da janela de 24h)."""
    numero = _formatar_telefone(telefone)

    if not TOKEN or not PHONE_ID:
        log.info("WhatsApp TEXTO SIMULADO → %s | %s", numero, texto[:40])
        return {"status": "simulado", "message_id": f"sim_{numero[-4:]}"}

    payload = {
        "messaging_product": "whatsapp",
        "to": numero,
        "type": "text",
        "text": {"body": texto},
    }

    try:
        r = httpx.post(
            API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200:
            msg_id = data.get("messages", [{}])[0].get("id", "")
            log.info("WhatsApp texto enviado → %s | msg_id=%s", numero, msg_id)
            return {"status": "enviado", "message_id": msg_id}
        else:
            log.warning("WhatsApp texto erro %s → %s", r.status_code, data)
            return {"status": "erro", "message_id": "", "detalhe": str(data)}
    except Exception as e:
        log.error("WhatsApp texto falhou → %s: %s", numero, e)
        return {"status": "erro", "message_id": "", "detalhe": str(e)}


def enviar_mensagem(telefone: str, nome: str, rastreio: str, empresa: str) -> dict:
    """
    Envia mensagem de confirmação de entrega via WhatsApp.
    Retorna dict com status e message_id.
    """
    numero = _formatar_telefone(telefone)

    if not TOKEN or not PHONE_ID:
        log.info("WhatsApp SIMULADO → %s | %s | %s", numero, rastreio, empresa)
        return {"status": "simulado", "message_id": f"sim_{numero[-4:]}"}

    payload = {
        "messaging_product": "whatsapp",
        "to": numero,
        "type": "template",
        "template": {
            "name": "confirmacao_entrega",
            "language": {"code": "pt_BR"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": nome},
                        {"type": "text", "text": rastreio},
                        {"type": "text", "text": empresa},
                    ],
                }
            ],
        },
    }

    try:
        r = httpx.post(
            API_URL,
            json=payload,
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=15,
        )
        data = r.json()
        if r.status_code == 200:
            msg_id = data.get("messages", [{}])[0].get("id", "")
            log.info("WhatsApp enviado → %s | msg_id=%s", numero, msg_id)
            return {"status": "enviado", "message_id": msg_id}
        else:
            log.warning("WhatsApp erro %s → %s", r.status_code, data)
            return {"status": "erro", "message_id": "", "detalhe": str(data)}
    except Exception as e:
        log.error("WhatsApp falhou → %s: %s", numero, e)
        return {"status": "erro", "message_id": "", "detalhe": str(e)}

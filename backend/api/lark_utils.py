"""
api/lark_utils.py — Notificações para o Lark/Feishu via Custom Bot webhook.
A URL do webhook é lida da variável de ambiente LARK_WEBHOOK_URL.
O envio é feito em background (não bloqueia a resposta ao cliente).
"""
import os
import logging
import threading
import httpx

log = logging.getLogger("lark")

WEBHOOK_URL = os.getenv("LARK_WEBHOOK_URL", "")


def _post(payload: dict) -> None:
    """Envia o payload pro webhook em thread separada (fire-and-forget)."""
    if not WEBHOOK_URL:
        return
    try:
        r = httpx.post(WEBHOOK_URL, json=payload, timeout=10)
        if r.status_code != 200:
            log.warning("Lark webhook retornou %s: %s", r.status_code, r.text[:200])
    except Exception as e:
        log.warning("Falha ao enviar notificação Lark: %s", e)


def _send_async(payload: dict) -> None:
    threading.Thread(target=_post, args=(payload,), daemon=True).start()


def _fmt(n) -> str:
    try:
        return f"{int(n):,}".replace(",", ".")
    except Exception:
        return str(n)


# ── Mensagens ────────────────────────────────────────────────────

def notify_triagem(resultado: dict, user_email: str) -> None:
    """Notifica o resultado de um upload de triagem."""
    top3 = resultado.get("top5", [])[:3]
    top3_linhas = "\n".join(
        f"   {i+1}. {r.get('ds', r.get('ds_destino', '?'))} — {_fmt(r.get('nok', r.get('total_erros', 0)))} erros"
        for i, r in enumerate(top3)
    )

    taxa = resultado.get("taxa", 0)
    emoji_taxa = "🟢" if taxa >= 90 else "🟡" if taxa >= 80 else "🔴"

    linhas = [
        f"📊 *Triagem DC×DS — {resultado.get('data_ref', '?')}*",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        f"📦 Total expedido: {_fmt(resultado.get('total', 0))}",
        f"✅ OK: {_fmt(resultado.get('qtd_ok', 0))}",
        f"🔴 NOK: {_fmt(resultado.get('qtd_erro', 0))}",
        f"⚠️  Fora do mapa: {_fmt(resultado.get('qtd_fora', 0))}",
        f"{emoji_taxa} Taxa: {taxa:.1f}%",
    ]

    if resultado.get("tem_arrival"):
        linhas.append(f"📬 Recebidos confirmados: {_fmt(resultado.get('qtd_recebidos', 0))}")

    if top3_linhas:
        linhas += ["", "🚨 Top DS com mais erros:", top3_linhas]

    linhas += ["", f"👤 {user_email}"]

    _send_async({"msg_type": "text", "content": {"text": "\n".join(linhas)}})


def notify_reclamacoes(resultado: dict, user_email: str) -> None:
    """Notifica o resultado de um upload de reclamações."""
    top3 = resultado.get("top5", [])[:3]
    top3_linhas = "\n".join(
        f"   {i+1}. {r.get('motorista', '?')} — {_fmt(r.get('total', 0))} reclamações"
        for i, r in enumerate(top3)
    )

    linhas = [
        f"📋 *Reclamações — {resultado.get('data_ref', '?')}*",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        f"📦 Total registros: {_fmt(resultado.get('n_registros', 0))}",
        f"👥 Supervisores: {resultado.get('n_sup', 0)}",
        f"🏢 Stations: {resultado.get('n_sta', 0)}",
        f"🚗 Motoristas: {resultado.get('n_mot', 0)}",
    ]

    if top3_linhas:
        linhas += ["", "🚨 Top motoristas:", top3_linhas]

    linhas += ["", f"👤 {user_email}"]

    _send_async({"msg_type": "text", "content": {"text": "\n".join(linhas)}})


def notify_upload_generico(tipo: str, data_ref: str, n_registros: int, user_email: str) -> None:
    """Notificação genérica para outros tipos de upload (dashboard, backlog, etc.)."""
    linhas = [
        f"📤 *Upload — {tipo}*",
        "━━━━━━━━━━━━━━━━━━━━━━━━",
        f"📅 Data referência: {data_ref}",
        f"📦 Registros: {_fmt(n_registros)}",
        f"👤 {user_email}",
    ]
    _send_async({"msg_type": "text", "content": {"text": "\n".join(linhas)}})

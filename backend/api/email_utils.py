"""
api/email_utils.py — Envio de e-mails via Brevo (HTTP API)
"""
import os
import urllib.request
import urllib.error
import json
import logging

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str) -> bool:
    api_key = os.getenv("BREVO_API_KEY", "")
    if not api_key:
        logger.error("[email] BREVO_API_KEY não configurado — e-mail não enviado")
        return False

    from_email = os.getenv("BREVO_FROM_EMAIL", "noreply@imile.me")
    from_name  = os.getenv("BREVO_FROM_NAME",  "iMile Dashboard")

    payload = json.dumps({
        "sender":      {"name": from_name, "email": from_email},
        "to":          [{"email": to}],
        "subject":     subject,
        "htmlContent": html,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={
            "api-key":      api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            logger.info(f"[email] Enviado para {to} (status {resp.status}) — {body}")
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        logger.error(f"[email] Erro HTTP ao enviar para {to}: {e.code} — {body}")
        return False
    except Exception as e:
        logger.error(f"[email] Erro ao enviar para {to}: {e}")
        return False


def email_boas_vindas(nome: str, email: str, token: str) -> bool:
    app_url = os.getenv("APP_URL", "https://imile-react.vercel.app")
    link = f"{app_url}/definir-senha?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#f8fafc;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#0a1628;color:#fff;font-weight:900;font-size:22px;padding:10px 20px;border-radius:10px;letter-spacing:1px;">
          iMile
        </div>
      </div>
      <h2 style="color:#1e293b;font-size:20px;margin-bottom:8px;">Seu acesso foi aprovado!</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;">
        Olá, <strong>{nome}</strong>! Sua solicitação de acesso ao <strong>iMile Dashboard</strong> foi aprovada.
      </p>
      <p style="color:#475569;font-size:14px;line-height:1.6;">
        Clique no botão abaixo para cadastrar sua senha e ativar sua conta:
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="{link}"
           style="background:#0a1628;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:bold;display:inline-block;">
          Cadastrar minha senha
        </a>
      </div>
      <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px;">
        Este link expira em <strong>48 horas</strong>. Se você não solicitou acesso, ignore este e-mail.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
      <p style="color:#cbd5e1;font-size:11px;text-align:center;">iMile Dashboard — Uso interno</p>
    </div>
    """
    return send_email(email, "Seu acesso ao iMile Dashboard foi aprovado", html)

"""
keepalive/main.py — Pinga o backend para evitar cold start no Railway.
Executado pelo Railway Cron a cada 10 minutos.
"""
import os
import sys
import time
import requests

URL     = os.getenv("PING_URL", "https://imile-react-production.up.railway.app/api/health")
TIMEOUT = int(os.getenv("PING_TIMEOUT", "90"))   # cold start pode levar >30s
RETRIES = int(os.getenv("PING_RETRIES", "3"))
DELAY   = int(os.getenv("PING_DELAY",   "15"))   # segundos entre tentativas

for attempt in range(1, RETRIES + 1):
    try:
        r = requests.get(URL, timeout=TIMEOUT)
        print(f"OK — {URL} respondeu {r.status_code} (tentativa {attempt})")
        sys.exit(0)
    except Exception as e:
        print(f"TENTATIVA {attempt}/{RETRIES} falhou — {e}")
        if attempt < RETRIES:
            time.sleep(DELAY)

print(f"ERRO — {URL} não respondeu após {RETRIES} tentativas")
sys.exit(1)

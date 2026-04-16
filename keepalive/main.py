"""
keepalive/main.py — Pinga o backend para evitar cold start no Railway.
Executado pelo Railway Cron a cada 10 minutos.
"""
import os
import sys
import requests

URL = os.getenv("PING_URL", "https://imile-react-production.up.railway.app/api/health")

try:
    r = requests.get(URL, timeout=30)
    print(f"OK — {URL} respondeu {r.status_code}")
    sys.exit(0)
except Exception as e:
    print(f"ERRO — {URL} não respondeu: {e}")
    sys.exit(1)

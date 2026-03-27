"""
Testes de integração leve — endpoints que não requerem banco.
"""
import os
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_KEY", "fake-key")
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from fastapi.testclient import TestClient
from api.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_health_ok():
    """GET /api/health deve retornar 200."""
    resp = client.get("/api/health")
    assert resp.status_code == 200


def test_login_sem_body_retorna_422():
    """POST /api/auth/login sem body deve retornar 422 (validation error)."""
    resp = client.post("/api/auth/login", json={})
    assert resp.status_code == 422


def test_rota_protegida_sem_token_retorna_401():
    """GET /api/admin/usuarios sem token deve retornar 401."""
    resp = client.get("/api/admin/usuarios")
    assert resp.status_code == 401


def test_upload_sem_token_retorna_401():
    """POST /api/backlog/processar sem token deve retornar 401 (auth antes do arquivo)."""
    resp = client.post("/api/backlog/processar")
    assert resp.status_code == 401

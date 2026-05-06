"""
conftest.py — variáveis de ambiente mínimas para os testes carregarem `api.*`.

Setado antes de qualquer import de módulos do backend para que `api.deps`
não falhe no boot por SECRET_KEY/DATABASE_URL ausentes.
"""
import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-with-at-least-32-characters-xx")
os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/test")

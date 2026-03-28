"""
api/routes/excel.py — Agrega todos os routers de geração de Excel
"""
from fastapi import APIRouter
from api.routes.excel_dashboard import router as r_dashboard
from api.routes.excel_reclamacoes import router as r_reclamacoes
from api.routes.excel_triagem import router as r_triagem
from api.routes.excel_historico import router as r_historico
from api.routes.excel_na import router as r_na

router = APIRouter()
router.include_router(r_dashboard)
router.include_router(r_reclamacoes)
router.include_router(r_triagem)
router.include_router(r_historico)
router.include_router(r_na)

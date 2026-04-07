"""
FastAPI Backend — iMile Dashboard
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

load_dotenv()

from api.limiter import limiter
from api.routes import auth, dashboard, historico, reclamacoes, triagem, admin, excel, backlog, monitoramento
from api.routes.contestacoes import router as contestacoes_router
from api.routes.correlacao import router as correlacao_router
from api.routes.extravios import router as extravios_router
from api.routes.extravios_upload import router as extravios_upload_router
from api.routes.notracking import router as notracking_router
from api.routes.notracking_upload import router as notracking_upload_router
from api.routes.reclamacoes_upload_route import router as reclamacoes_upload_router
from api.routes.dashboard_upload import router as dashboard_upload_router
from api.routes.triagem_upload import router as triagem_upload_router
from api.routes.not_arrived import router as not_arrived_router
from api.routes.not_arrived_upload import router as not_arrived_upload_router
from api.routes.na import router as na_router
from api.routes.na_upload import router as na_upload_router

app = FastAPI(title="iMile Dashboard API", version="1.0.0", docs_url="/docs")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_default_origins = "https://imile-react.vercel.app,http://localhost:5173,http://localhost:5174"
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,                 prefix="/api/auth",          tags=["Auth"])
app.include_router(dashboard.router,            prefix="/api/dashboard",     tags=["Dashboard"])
app.include_router(historico.router,            prefix="/api/historico",     tags=["Histórico"])
app.include_router(reclamacoes.router,          prefix="/api/reclamacoes",   tags=["Reclamações"])
app.include_router(reclamacoes_upload_router,   prefix="/api/reclamacoes",   tags=["Reclamações"])  # POST /processar
app.include_router(dashboard_upload_router,     prefix="/api/dashboard",     tags=["Dashboard"])    # POST /upload
app.include_router(triagem.router,              prefix="/api/triagem",       tags=["Triagem"])
app.include_router(triagem_upload_router,       prefix="/api/triagem",       tags=["Triagem"])   # POST /processar
app.include_router(admin.router,                prefix="/api/admin",         tags=["Admin"])
app.include_router(excel.router,                prefix="/api/excel",         tags=["Excel"])
app.include_router(backlog.router,              prefix="/api/backlog",       tags=["Backlog"])
app.include_router(monitoramento.router,        prefix="/api/monitoramento", tags=["Monitoramento"])
app.include_router(contestacoes_router,         prefix="/api/contestacoes",  tags=["Contestações"])
app.include_router(not_arrived_router,          prefix="/api/not-arrived",   tags=["Not Arrived"])
app.include_router(not_arrived_upload_router,   prefix="/api/not-arrived",   tags=["Not Arrived"])  # POST /processar
app.include_router(na_router,                   prefix="/api/na",            tags=["NA"])
app.include_router(na_upload_router,            prefix="/api/na",            tags=["NA"])            # POST /processar
app.include_router(correlacao_router,           prefix="/api/correlacao",    tags=["Correlação"])
app.include_router(extravios_router,            prefix="/api/extravios",     tags=["Extravios"])
app.include_router(extravios_upload_router,     prefix="/api/extravios",     tags=["Extravios"])
app.include_router(notracking_router,           prefix="/api/notracking",    tags=["No Tracking"])
app.include_router(notracking_upload_router,    prefix="/api/notracking",    tags=["No Tracking"])

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

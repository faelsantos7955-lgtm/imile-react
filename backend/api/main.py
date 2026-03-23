"""
FastAPI Backend — iMile Dashboard
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from api.routes import auth, dashboard, historico, reclamacoes, triagem, admin, excel, backlog, monitoramento

app = FastAPI(title="iMile Dashboard API", version="1.0.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://imile-react.vercel.app",
        "https://imile-react-9sbshgee3-faelsantos7955-lgtms-projects.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,             prefix="/api/auth",             tags=["Auth"])
app.include_router(dashboard.router,        prefix="/api/dashboard",        tags=["Dashboard"])
app.include_router(historico.router,         prefix="/api/historico",        tags=["Histórico"])
app.include_router(reclamacoes.router,      prefix="/api/reclamacoes",      tags=["Reclamações"])
app.include_router(triagem.router,          prefix="/api/triagem",          tags=["Triagem"])
app.include_router(admin.router,            prefix="/api/admin",            tags=["Admin"])
app.include_router(excel.router,            prefix="/api/excel",            tags=["Excel"])
app.include_router(backlog.router,          prefix="/api/backlog",          tags=["Backlog"])
app.include_router(monitoramento.router,    prefix="/api/monitoramento",    tags=["Monitoramento"])

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

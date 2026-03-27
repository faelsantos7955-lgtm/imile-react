# iMile Dashboard — Contexto do Projeto

## O que é
Dashboard interno da iMile com React (frontend) + FastAPI (backend).
Deploy: frontend no Vercel (`imile-react.vercel.app`), backend no Railway.

## Stack
- **Frontend:** React + Vite, React Query, páginas em `frontend/src/pages/`
- **Backend:** FastAPI, Python, banco PostgreSQL (via Railway)
- **Auth:** JWT (login via `/api/auth`)
- **Rate limiting:** SlowAPI

## Estrutura Backend
```
backend/api/
  main.py          — app FastAPI, CORS, routers registrados
  deps.py          — dependências (get_db, get_current_user, etc.)
  limiter.py       — rate limiter SlowAPI
  upload_utils.py  — utilitários de upload de arquivos
  routes/
    auth.py
    dashboard.py + dashboard_upload.py   — upload de Excel do dashboard
    historico.py
    reclamacoes.py + reclamacoes_upload_route.py
    triagem.py + triagem_upload.py       — triagem vetorizada
    admin.py                             — endpoints protegidos por admin
    backlog.py
    monitoramento.py
    excel.py
backend/modulos/
  reclamacoes.py   — lógica de processamento de reclamações
```

## Estrutura Frontend
```
frontend/src/
  pages/
    Login.jsx
    Admin.jsx        — painel admin (upload, exclusão de dados)
    Analise.jsx
    Backlog.jsx
    Monitoramento.jsx
    Operacional.jsx
    Reclamacoes.jsx
    Triagem.jsx
  components/
    Layout.jsx
    Heatmap.jsx
    ErrorBoundary.jsx
    ui.jsx
  lib/             — helpers/utils
```

## Funcionalidades implementadas
- Login com JWT
- Dashboard com filtro por cliente
- Upload de Excel via painel web (dashboard, reclamações, triagem)
- Triagem vetorizada
- Exclusão de uploads pela UI
- Backlog por cliente pré-agregado no banco
- Monitoramento
- Painel Admin com controle de acesso (verificação de admin nos endpoints DELETE)
- Rate limiting nas rotas de upload
- CORS configurado via variável de ambiente `ALLOWED_ORIGINS`

## Variáveis de ambiente relevantes (backend)
- `ALLOWED_ORIGINS` — origens permitidas no CORS (separadas por vírgula)
- `DATABASE_URL` — connection string PostgreSQL
- `SECRET_KEY` — chave JWT

## Endpoints principais
- `GET /api/health` — health check
- `POST /api/auth/login`
- `POST /api/dashboard/upload`
- `POST /api/reclamacoes/processar`
- `POST /api/triagem/processar`
- `DELETE /api/admin/*` — requer admin

## Histórico recente (commits)
- Verificação de admin corrigida nos endpoints DELETE
- Captura de erros de DB no triagem_upload (evita 500 sem CORS)
- Coluna `config_supervisores` corrigida de `supervisor` para `region`
- Exclusão de uploads pela UI + triagem vetorizada + endpoints DELETE
- Upload via painel web + React Query + rate limiting + validação
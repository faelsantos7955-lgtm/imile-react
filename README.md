# Logistics Operations Dashboard

A full-stack internal operations portal built for a last-mile logistics company, enabling real-time monitoring of deliveries, complaints, sorting, and field supervisor performance across 100+ distribution stations.

**Live demo:** [imile-react.vercel.app](https://imile-react.vercel.app)

---

## Tech Stack

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat&logo=react&logoColor=white&labelColor=20232a)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Frontend-000000?style=flat&logo=vercel)
![Railway](https://img.shields.io/badge/Railway-Backend-0B0D0E?style=flat&logo=railway)

---

## Features

### Operations Dashboard
- Real-time KPIs: expedition rate, successful deliveries, SLA compliance, and backlog
- Interactive charts (Recharts) with gradient fills, dark tooltips, and animated entries
- Filter by client and date range
- Historical trend analysis with period comparison

### DC × DS Sorting (Triagem)
- Upload LoadingScan and Arrival Excel reports (multi-file, drag-and-drop)
- Client-side processing via SheetJS — no file sent to server for files under 20 MB
- Automatic cross-reference between distribution center and delivery stations
- Identifies missing, extra, and misrouted packages per supervisor region
- Server-side fallback for large files with background job polling

### Complaints Tracking (Reclamações)
- Upload fake delivery complaint reports (multi-sheet Excel support)
- Automatic column detection with fuzzy matching across Portuguese/English/Chinese column names
- Top 5 offender ranking with supervisor attribution
- Week-over-week trend charts per courier
- Admin can block couriers from the ranking (replaced by next in queue)

### No Tracking Monitor (断更)
- Tracks packages with no scan updates, segmented by aging brackets
- Filters to São Paulo stations automatically from national reports
- Aging distribution chart (color-coded from green → dark red)
- Last-status breakdown and per-DS detail table with value-at-risk

### Backlog SLA
- Pre-aggregated backlog data per client
- SLA breach identification and trend visualization

### Admin Panel
- Role-based access control (viewer / supervisor / admin)
- Per-user page and action permissions
- Invite system with email welcome flow
- Supervisor × DS mapping management (Excel upload)
- Audit log for all admin actions
- Bulk data upload (carga em lote)
- Notification integrations (Lark/Feishu webhooks)

---

## Screenshots

| Dashboard | Sorting (Triagem) |
|-----------|------------------|
| ![Dashboard](docs/dashboard.png) | ![Triagem](docs/triagem.png) |

| Complaints (Reclamações) | No Tracking |
|--------------------------|-------------|
| ![Reclamacoes](docs/reclamacoes.png) | ![NoTracking](docs/notracking.png) |

---

## Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│        React + Vite          │      │         FastAPI              │
│        (Vercel)              │ ───► │         (Railway)            │
│                              │      │                              │
│  React Query (data fetching) │      │  JWT Auth (python-jose)      │
│  Recharts (visualizations)  │      │  SlowAPI (rate limiting)     │
│  SheetJS (local Excel parse) │      │  SQLAlchemy (ORM)            │
│  TailwindCSS (styling)       │      │  Pandas (data processing)    │
└─────────────────────────────┘      │  Pydantic (validation)       │
                                      └──────────────┬───────────────┘
                                                     │
                                      ┌──────────────▼───────────────┐
                                      │       PostgreSQL              │
                                      │       (Railway)               │
                                      └──────────────────────────────┘
```

### Key Design Decisions

**Client-side Excel processing** — Files under 20 MB are parsed entirely in the browser using SheetJS and processed locally before sending only the aggregated result to the API. This reduces server load, avoids timeout issues on cold starts, and gives instant feedback to the user.

**Multi-sheet detection** — Both frontend and backend iterate all Excel sheets, filtering valid ones by column heuristics (fuzzy matching against Portuguese/English/Chinese column name aliases). This handles inconsistent exports from different source systems.

**Fuzzy supervisor mapping** — Station codes are normalized (strip hyphens, spaces, underscores, uppercase) before lookup, so `SP-GRU`, `SPGRU`, and `SP GRU` all resolve to the same supervisor region.

**Role-based permissions** — Each user has a granular permission set stored as JSON arrays in PostgreSQL: which pages they can access and which actions they can perform. Checked both client-side (route guards) and server-side (FastAPI dependencies).

---

## Project Structure

```
├── backend/
│   ├── api/
│   │   ├── main.py                  # FastAPI app, CORS, router registration
│   │   ├── deps.py                  # Auth + DB dependencies
│   │   ├── limiter.py               # SlowAPI rate limiting
│   │   ├── upload_utils.py          # File validation helpers
│   │   ├── lark_utils.py            # Lark/Feishu webhook notifications
│   │   └── routes/
│   │       ├── auth.py
│   │       ├── dashboard.py + dashboard_upload.py
│   │       ├── reclamacoes.py + reclamacoes_upload_route.py
│   │       ├── triagem.py + triagem_upload.py
│   │       ├── notracking.py + notracking_upload.py
│   │       ├── backlog.py
│   │       ├── historico.py
│   │       ├── admin.py
│   │       ├── excel.py             # Excel report generation
│   │       └── monitoramento.py
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Triagem.jsx
        │   ├── Reclamacoes.jsx
        │   ├── NoTracking.jsx
        │   ├── Backlog.jsx
        │   ├── Admin.jsx
        │   └── ...
        ├── components/
        │   ├── Layout.jsx
        │   └── ui.jsx               # KpiCard, Card, toast, chartTheme, etc.
        └── lib/
            ├── api.js               # Axios instance
            ├── AuthContext.jsx
            ├── processarLocal.js    # Client-side Excel processing
            └── validarArquivo.js
```

---

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in DATABASE_URL, SECRET_KEY, ALLOWED_ORIGINS

uvicorn api.main:app --reload --port 8000
# Swagger UI → http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Vite proxies `/api/*` to `localhost:8000` automatically in dev mode.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SECRET_KEY` | JWT signing secret |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |

---

## Author

Built and maintained as a solo full-stack project — from database schema design to UI/UX, API architecture, and deployment pipeline.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-raffafernandess-0A66C2?style=flat&logo=linkedin)](https://www.linkedin.com/in/raffafernandess/)

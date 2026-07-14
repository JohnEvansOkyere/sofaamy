# Sofaamy Business Management System

Tailored glass & aluminium fabrication management system for **Sofaamy Co. Ltd** (Accra, Ghana), built by **Veloxa Technology Ltd**.

See `../docs/PROJECT_OUTLINE.md` for scope/strategy and `../CLAUDE.md` for conventions.

## What's built (demo prototype)

- **Full dashboard UI** — all modules navigable and populated with realistic Ghana/GHS data.
- **Design Configurator** (the heart) — fully interactive: pick a product, drag dimensions, choose panels / opening / glass / finish, watch the GHS quote + bill of materials update live, and generate/send the quote.
- **FastAPI + SQLite backend** — real database, seeded, with pricing + data endpoints.

Modules: Dashboard · **Configurator** · CRM & Leads · Quotations · Surveys · Production Pipeline · Inventory · Dispatch & Install · Quality Control · Reports · Settings.

## Run it

**Frontend** (the demo — works standalone):
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

**Backend** (optional — proves the real DB):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

## Structure

```
frontend/   React + Vite, react-konva configurator, curated CSS design system
backend/    FastAPI + SQLite (SQLAlchemy), GHS pricing engine
docs/       ERD, API contracts, demo script (planned)
infra/      Vercel / Railway deploy config (planned)
```

## Status

Phase 0 (demo-to-win) built and verified. Wiring the frontend to the backend API and Phase 1 hardening are next — see `../docs/CHECKLIST.md`.

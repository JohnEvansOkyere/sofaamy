# Sofaamy Co. Ltd — Business Management System

Engagement workspace for the tailored Business Management System **Veloxa Technology Ltd** is building for **Sofaamy Co. Ltd** (Accra, Ghana — glass & aluminium fabrication).

This is a competitive bid against **EvA Cloud** (off-the-shelf Indian fenestration ERP). Full scope and win strategy: [`docs/PROJECT_OUTLINE.md`](docs/PROJECT_OUTLINE.md).

## Directory map

```
SOFAAMY/
├── README.md                  ← you are here (overview + map)
├── CLAUDE.md                  ← build conventions & behavioral rules
├── MEMORY.md                  ← decision log (read first each session)
│
├── docs/                      ← all documentation
│   ├── PROJECT_OUTLINE.md     ← scope + win strategy
│   ├── CHECKLIST.md           ← master task/blocking-input tracker
│   └── reference/             ← client-facing originals (proposals, pricing, blueprint, requirements)
│       └── source/            ← editable .docx sources
│
├── frontend/                  ← THE product — React + Vite PWA
├── backend/                   ← THE product — FastAPI
├── infra/                     ← deploy config
│
├── prototypes/                ← pre-build assets
│   ├── configurator/          ← working react-konva configurator demo (GHS pricing) — seed for the product
│   └── static-demo/           ← early static HTML demo
│
└── archive/                   ← superseded files (old proposal PDFs, zips) — pending deletion decision
```

## Where to start

- **Scope & strategy** → `docs/PROJECT_OUTLINE.md`
- **What's outstanding** → `docs/CHECKLIST.md`
- **How to build here** → `CLAUDE.md`
- **Decisions made** → `MEMORY.md`

Status: **Phase 0 prototype built and demo-ready** — three-category Design Configurator (Frame / Frameless / Curtain Wall) with live GHS pricing, cutting optimization, and SmartGlazier-style fabrication drawings (glass order, hardware list, installation sheet) generated parametrically from a hardware prep library. See `MEMORY.md` for the decision log and `backend/README.md` to run it.


• Backend:

  cd backend
  .venv/bin/uvicorn app.main:app --reload

  Frontend — open a second terminal:

  cd frontend
  npm run dev

## Deploy (Vercel — both services)

`vercel.json` defines two Vercel services: `frontend` (Vite, serves `/`) and
`backend` (FastAPI, serves `/api/*`). Import the GitHub repo into a Vercel
project and it deploys both under one domain — the frontend calls the API
same-origin, no `VITE_API_URL` needed.

Environment variables to set in Vercel:

- `SOFAAMY_DATABASE_URL` — Supabase Postgres URL. Without it the backend
  falls back to an **ephemeral** SQLite in `/tmp` (data resets on cold start).
- Uploaded drawings land in `/tmp` on Vercel (ephemeral) until moved to
  Supabase Storage; override the path with `SOFAAMY_UPLOAD_DIR` if needed.

After pointing at Supabase for the first time, run the schema/seed once:
`SOFAAMY_DATABASE_URL=... python backend/seed.py` (WARNING: seed.py drops all
tables first — never run it against a database with real data).


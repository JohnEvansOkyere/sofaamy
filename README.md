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
├── sofaamy-bms/               ← THE product (monorepo: frontend, backend, docs, infra)
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

Status: **Phase 0 prototype built and demo-ready** — three-category Design Configurator (Frame / Frameless / Curtain Wall) with live GHS pricing, cutting optimization, and SmartGlazier-style fabrication drawings (glass order, hardware list, installation sheet) generated parametrically from a hardware prep library. See `MEMORY.md` for the decision log and `sofaamy-bms/README.md` to run it.


• Backend:

  cd sofaamy-bms/backend
  .venv/bin/uvicorn app.main:app --reload

  Frontend — open a second terminal:

  cd sofaamy-bms/frontend
  npm run dev


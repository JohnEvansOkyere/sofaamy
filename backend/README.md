# Sofaamy Cloud — Backend API

FastAPI + SQLite. Mirrors the PostgreSQL schema from the Architecture Blueprint;
SQLite keeps the demo self-contained (no server to provision).

## Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                       # creates & seeds sofaamy.db
uvicorn app.main:app --reload        # http://localhost:8000
```

Interactive API docs: http://localhost:8000/docs

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/clients`   | list clients |
| GET  | `/api/materials` | inventory / stock |
| GET  | `/api/jobs`      | production jobs |
| GET  | `/api/quotes`    | quotations |
| POST | `/api/price`     | live GHS pricing (configurator) |
| POST | `/api/quotes`    | save a quote from a configurator design |
| GET  | `/api/dashboard` | headline counts |
| GET  | `/api/projects/{id}/workflow` | complete technical workflow record |
| GET  | `/api/quotes/{quote_number}/pdf` | download any customer quotation |
| POST | `/api/projects/{id}/extractions` | create a manual/hybrid extraction revision |
| POST | `/api/projects/{id}/extractions/from-design` | generate a provisional extraction |
| POST | `/api/projects/{id}/quotes/from-extraction` | prepare a draft quote from an approved extraction |
| POST | `/api/projects/{id}/drawing-tasks` | hand drawing work to Configurator or AutoCAD |
| POST | `/api/drawing-tasks/{id}/revisions` | submit a drawing revision |
| PUT  | `/api/drawing-revisions/{id}/files/{kind}` | attach DWG/PDF/production output |
| POST | `/api/drawing-revisions/{id}/approve` | approve one technical revision |
| POST | `/api/projects/{id}/production-releases` | release the approved pack to factory |

## Notes

- `sofaamy.db` is created locally and git-ignored.
- `SOFAAMY_DATABASE_URL` may point tests or isolated tooling at a different
  SQLite database; normal local startup continues to use `./sofaamy.db`.
- Drawing files are stored under `uploads/drawings/` for the local build.
- The technical workflow, quotations, production, inventory, and reporting
  actions use this API. Start the backend before testing those live flows.
- The latest approved extraction is the current material/commercial source.
  Quotations, drawing tasks, releases, and stock issues are revision-checked
  against it; approved drawing files cannot be changed in place.
- Importing `app.main` applies the existing additive SQLite startup migration.
  Review and back up a valued local `sofaamy.db` before the first restart after
  a schema change. `seed.py` remains destructive and is never required for an
  additive upgrade.

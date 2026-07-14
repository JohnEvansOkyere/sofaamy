# Sofaamy Cloud — Backend API

FastAPI + SQLite. Mirrors the PostgreSQL schema from the Architecture Blueprint;
SQLite keeps the demo self-contained (no server to provision).

## Run

```bash
cd sofaamy-bms/backend
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

## Notes

- `sofaamy.db` is created locally and git-ignored.
- The frontend runs standalone on seed data; wiring it to this API is the next step (see `docs/CHECKLIST.md`).

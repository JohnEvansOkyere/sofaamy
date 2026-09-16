#!/usr/bin/env bash
# Run Sofaamy locally against the checked-in local SQLite database.
# This intentionally overrides backend/.env's Supabase URL for this process only.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir/backend"

export SOFAAMY_DATABASE_URL="sqlite:///./sofaamy.db"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

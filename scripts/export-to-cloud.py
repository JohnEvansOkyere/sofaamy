#!/usr/bin/env python3
"""One-time export: local SQLite -> Supabase cloud Postgres.

Copies every row from backend/sofaamy.db into the Supabase database
configured in backend/.env (SOFAAMY_DATABASE_URL), preserving IDs and
foreign-key relationships. Safe to re-run: skips tables already populated.

Run from the repo root:
    python scripts/export-to-cloud.py
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"

load_dotenv(BACKEND / ".env")  # loads SOFAAMY_DATABASE_URL (Supabase)
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app import models  # noqa: F401  (registers all tables on Base)

SRC_URL = os.environ.get("SOURCE_DB_URL", f"sqlite:///{BACKEND / 'sofaamy.db'}")
DST_URL = os.environ["SOFAAMY_DATABASE_URL"]

# Dependency-safe insert order (parents before children).
TABLE_ORDER = [
    "users",
    "clients",
    "materials",
    "projects",        # -> clients
    "jobs",            # -> clients, projects
    "leads",           # -> clients, projects
    "designs",         # -> projects, jobs
    "technical_extractions",  # -> projects, designs
    "quotes",          # -> jobs, projects, designs, technical_extractions
    "stock_moves",     # -> materials, technical_extractions
    "payments",        # -> jobs
    "events",          # -> jobs
    "qc_checks",       # -> jobs
    "extraction_items",  # -> technical_extractions
    "drawing_tasks",   # -> projects, designs, technical_extractions, quotes
    "drawing_revisions",  # -> drawing_tasks
    "drawing_files",   # -> drawing_revisions
    "production_releases",  # -> projects, designs, technical_extractions, quotes, drawing_revisions
    "workflow_events",    # -> projects
]


def truncate(s, n=500):
    s = str(s)
    return s if len(s) <= n else s[:n] + "..."


def main():
    src_engine = create_engine(SRC_URL, connect_args={"check_same_thread": False})
    dst_engine = create_engine(DST_URL, pool_pre_ping=True)
    src = sessionmaker(bind=src_engine)()
    dst = sessionmaker(bind=dst_engine)()

    print(f"Source: {SRC_URL}")
    print(f"Target: {DST_URL.split('@')[-1]}\n")

    # Create any missing tables on the cloud DB (no-op on existing ones).
    Base.metadata.create_all(bind=dst_engine)
    print("Schema ensured on target (create_all).\n")

    total = 0
    for table_name in TABLE_ORDER:
        table = Base.metadata.tables[table_name]
        src_rows = src.execute(text(f'SELECT * FROM "{table_name}"')).mappings().all()
        col_names = list(table.columns.keys())
        existing = dst.execute(text(f'SELECT id FROM "{table_name}"')).scalars().all() if len(src_rows) else []
        existing_set = set(existing)
        new_rows = [r for r in src_rows if r["id"] not in existing_set]
        if not new_rows:
            print(f"{table_name:22s} {len(src_rows):4d} rows -> 0 inserted (already present or empty)")
            continue
        # Explicit ids: preserve FK references and keep idempotent re-runs stable.
        stmt = table.insert().values([{c: r[c] for c in col_names} for r in new_rows])
        dst.execute(stmt)
        # Bump the id sequence so future app inserts don't collide.
        dst.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
            f"COALESCE(MAX(id), 1)) FROM {table_name}"
        ))
        total += len(new_rows)
        print(f"{table_name:22s} {len(src_rows):4d} source rows -> {len(new_rows):4d} inserted")

    dst.commit()
    print(f"\nDone. {total} rows copied to the cloud database.")


if __name__ == "__main__":
    main()
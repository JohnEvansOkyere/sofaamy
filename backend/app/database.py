"""SQLite database setup (SQLAlchemy 2.0)."""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# Default: SQLite file next to the backend package. Set SOFAAMY_DATABASE_URL
# to a postgresql:// URL (e.g. Supabase) for cloud deployment.
# On Vercel the filesystem is read-only except /tmp, so the SQLite fallback
# lives there (ephemeral — real deployments must set SOFAAMY_DATABASE_URL).
_default_sqlite = ("sqlite:////tmp/sofaamy.db" if os.environ.get("VERCEL")
                   else "sqlite:///./sofaamy.db")
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "SOFAAMY_DATABASE_URL", _default_sqlite)
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    # Supabase/Heroku-style URLs; SQLAlchemy needs the postgresql:// scheme
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace(
        "postgres://", "postgresql://", 1)

_is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},  # needed for SQLite + FastAPI
    pool_pre_ping=not _is_sqlite,  # drop stale cloud connections
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

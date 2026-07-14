"""ORM models — the core of the Sofaamy schema (SQLite for the demo,
mirrors the PostgreSQL design in the Architecture Blueprint)."""
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(40))   # rep|supervisor|accounts|procurement|factory|qa|management
    phone: Mapped[str] = mapped_column(String(40), default="")


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    contact: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    location: Mapped[str] = mapped_column(String(160), default="")
    type: Mapped[str] = mapped_column(String(20), default="company")
    jobs = relationship("Job", back_populates="client")


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40))
    unit: Mapped[str] = mapped_column(String(12))
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)  # GHS
    stock: Mapped[float] = mapped_column(Float, default=0.0)
    reorder_level: Mapped[float] = mapped_column(Float, default=0.0)


class Job(Base):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_number: Mapped[str] = mapped_column(String(30), unique=True)  # SOF-YYYY-NNN
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    product: Mapped[str] = mapped_column(String(120))
    stage: Mapped[str] = mapped_column(String(30), default="cutting")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    paid: Mapped[str] = mapped_column(String(10), default="50%")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="jobs")
    quotes = relationship("Quote", back_populates="job")


class DesignRecord(Base):
    """A saved configurator design — full JSON so it can be reopened,
    duplicated and re-used (EvA's saved templates)."""
    __tablename__ = "designs"
    id: Mapped[int] = mapped_column(primary_key=True)
    ref: Mapped[str] = mapped_column(String(60), default="")
    name: Mapped[str] = mapped_column(String(160))
    client_name: Mapped[str] = mapped_column(String(160), default="")
    qty: Mapped[int] = mapped_column(Integer, default=1)
    location: Mapped[str] = mapped_column(String(200), default="")
    total: Mapped[float] = mapped_column(Float, default=0.0)  # GHS grand total
    design_json: Mapped[str] = mapped_column(Text)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Quote(Base):
    __tablename__ = "quotes"
    id: Mapped[int] = mapped_column(primary_key=True)
    quote_number: Mapped[str] = mapped_column(String(30), unique=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    client_name: Mapped[str] = mapped_column(String(160))
    product: Mapped[str] = mapped_column(String(160))
    # design config (from the configurator)
    width_mm: Mapped[int] = mapped_column(Integer, default=0)
    height_mm: Mapped[int] = mapped_column(Integer, default=0)
    panels: Mapped[int] = mapped_column(Integer, default=1)
    opening: Mapped[str] = mapped_column(String(30), default="fixed")
    glass: Mapped[str] = mapped_column(String(30), default="clear")
    total: Mapped[float] = mapped_column(Float, default=0.0)  # GHS
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    job = relationship("Job", back_populates="quotes")

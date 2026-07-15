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
    stage: Mapped[str] = mapped_column(String(30), default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    paid: Mapped[str] = mapped_column(String(10), default="0%")
    value: Mapped[float] = mapped_column(Float, default=0.0)   # GHS contract value
    driver: Mapped[str] = mapped_column(String(80), default="")
    vehicle: Mapped[str] = mapped_column(String(40), default="")
    dn_number: Mapped[str] = mapped_column(String(30), default="")  # delivery note
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    client = relationship("Client", back_populates="jobs")
    quotes = relationship("Quote", back_populates="job")


class Payment(Base):
    """A payment received against a job — deposit / balance / other.
    The 50% deposit gate reads from here."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    kind: Mapped[str] = mapped_column(String(20), default="deposit")   # deposit|balance|other
    method: Mapped[str] = mapped_column(String(20), default="momo")    # momo|bank|cash|cheque
    amount: Mapped[float] = mapped_column(Float, default=0.0)          # GHS
    ref: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Event(Base):
    """Activity log — every state change in the system, shown on the
    dashboard feed and each job's timeline."""
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"), nullable=True)
    who: Mapped[str] = mapped_column(String(80), default="System")
    kind: Mapped[str] = mapped_column(String(20), default="system")  # stage|payment|qc|dispatch|quote|stock|system
    note: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class QcCheck(Base):
    """Quality inspection at the QA stage — pass advances, rework holds."""
    __tablename__ = "qc_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    result: Mapped[str] = mapped_column(String(10))                  # pass|rework
    score: Mapped[int] = mapped_column(Integer, default=100)
    notes: Mapped[str] = mapped_column(String(300), default="")
    checklist: Mapped[str] = mapped_column(Text, default="[]")       # JSON list of {item, ok}
    inspector: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StockMove(Base):
    """Inventory movement — negative = issued to a job, positive = received."""
    __tablename__ = "stock_moves"
    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    delta: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(120), default="")
    job_number: Mapped[str] = mapped_column(String(30), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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

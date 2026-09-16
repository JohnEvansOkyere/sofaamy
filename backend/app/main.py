"""Fabra API — FastAPI + SQLAlchemy (SQLite or PostgreSQL).

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select, func

import hashlib
import hmac
import json
import os

from .database import Base, engine, get_db, SessionLocal
from . import models, schemas, lifecycle as lc
from .pricing import (
    calc_quote, calc_any_quote, extract_pieces_any, frameless_breakdown,
    LABOUR_PER_M2, MARGIN_PCT,
)
from .optimizer import optimize
from .pdf import quote_pdf, project_quote_summary_pdf
from .reports import (boq_pdf, cutting_list_pdf, work_order_pdf,
                      glass_order_pdf, hardware_list_pdf, fl_work_order_pdf,
                      installation_sheet_pdf, delivery_note_pdf,
                      project_summary_pdf, project_material_boq_pdf,
                      project_cutting_list_pdf,
                      elevation_pdf, price_breakdown_pdf)

Base.metadata.create_all(bind=engine)


def _auto_migrate_postgres():
    """Additive Postgres migration for columns added after their table already
    existed live (e.g. Supabase). create_all only creates missing tables, not
    missing columns on tables that already exist, so a column added to a model
    after that table was first deployed needs this — same idea as the SQLite
    path below, using Postgres's native IF NOT EXISTS instead of a PRAGMA
    existence check. Kept separate from the SQLite `wanted` dict below because
    some of its DDL (e.g. DATETIME) is SQLite-specific and was never meant to
    run against Postgres."""
    from sqlalchemy import text
    wanted = {
        "technical_extractions": [("design_id", "INTEGER")],
        "drawing_tasks": [("design_id", "INTEGER")],
        "production_releases": [("design_id", "INTEGER")],
        "quotes": [
            ("extra_extraction_ids", "TEXT DEFAULT '[]'"),
            ("pricing_mode", "TEXT DEFAULT 'auto'"),
        ],
        "projects": [
            ("released_to_qc_at", "TIMESTAMP"),
            ("released_to_qc_by", "TEXT DEFAULT ''"),
            ("released_to_technical_at", "TIMESTAMP"),
            ("released_to_technical_by", "TEXT DEFAULT ''"),
        ],
    }
    with engine.begin() as conn:
        for table, cols in wanted.items():
            for name, ddl in cols:
                conn.execute(text(
                    f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl}"))


def _auto_migrate():
    """Additive SQLite migration: create_all makes new TABLES but not new
    COLUMNS — add any the models gained, so existing databases keep working."""
    if engine.dialect.name != "sqlite":
        if engine.dialect.name == "postgresql":
            _auto_migrate_postgres()
        return  # PRAGMA is SQLite-only; Postgres handled above
    from sqlalchemy import text
    wanted = {
        "jobs": [("value", "FLOAT DEFAULT 0"), ("driver", "TEXT DEFAULT ''"),
                 ("vehicle", "TEXT DEFAULT ''"), ("dn_number", "TEXT DEFAULT ''"),
                 ("delivered_at", "DATETIME"), ("deposit_percent", "FLOAT DEFAULT 80"),
                 ("project_id", "INTEGER")],
        "quotes": [("deposit_percent", "FLOAT DEFAULT 80"), ("project_id", "INTEGER"),
                    ("design_id", "INTEGER"), ("extraction_id", "INTEGER"),
                    ("extra_extraction_ids", "TEXT DEFAULT '[]'"),
                    ("pricing_mode", "TEXT DEFAULT 'auto'")],
        "designs": [("project_id", "INTEGER")],
        "stock_moves": [
            ("extraction_id", "INTEGER"),
            ("extraction_revision", "INTEGER"),
        ],
        "drawing_files": [("checksum_sha256", "TEXT DEFAULT ''")],
        "technical_extractions": [("design_id", "INTEGER")],
        "drawing_tasks": [("design_id", "INTEGER")],
        "production_releases": [
            ("release_number", "TEXT DEFAULT ''"),
            ("status", "TEXT DEFAULT 'current'"),
            ("design_id", "INTEGER"),
            ("extraction_id", "INTEGER"),
            ("extraction_revision", "INTEGER"),
            ("quote_id", "INTEGER"),
            ("quotation_number", "TEXT DEFAULT ''"),
            ("drawing_revision_number", "INTEGER"),
            ("file_manifest", "TEXT DEFAULT '[]'"),
        ],
        "projects": [
            ("product_family", "TEXT DEFAULT 'frame'"),
            ("product_system", "TEXT DEFAULT ''"),
            ("workflow_status", "TEXT DEFAULT 'measurement_received'"),
            ("extraction_method", "TEXT DEFAULT 'manual'"),
            ("drawing_method", "TEXT DEFAULT 'configurator'"),
            ("drawing_release_percent", "FLOAT DEFAULT 80"),
            ("released_at", "DATETIME"),
            ("released_to_qc_at", "DATETIME"),
            ("released_to_qc_by", "TEXT DEFAULT ''"),
            ("released_to_technical_at", "DATETIME"),
            ("released_to_technical_by", "TEXT DEFAULT ''"),
        ],
    }
    with engine.begin() as conn:
        for table, cols in wanted.items():
            have = {r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))}
            for name, ddl in cols:
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


_auto_migrate()
with SessionLocal() as _db:
    lc.ensure_engine_materials(_db)

app = FastAPI(title="Fabra API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Quote-Number"],
)

# Serverless (Vercel) has a read-only filesystem — only /tmp is writable there,
# so uploaded drawings are ephemeral until moved to Supabase Storage.
DRAWING_STORAGE = Path(os.environ.get(
    "SOFAAMY_UPLOAD_DIR",
    "/tmp/sofaamy-uploads/drawings" if os.environ.get("VERCEL")
    else str(Path(__file__).resolve().parent.parent / "uploads" / "drawings")))
DRAWING_STORAGE.mkdir(parents=True, exist_ok=True)

PRODUCT_FAMILIES = {"frame", "frameless", "balustrade", "other"}
EXTRACTION_METHODS = {"manual", "generated", "hybrid"}
DRAWING_METHODS = {"configurator", "autocad"}
RECIPE_STATUSES = {"manual", "provisional", "approved"}
WORKFLOW_STATUSES = [
    "measurement_received",
    "extraction_in_progress",
    "extraction_ready",
    "quote_in_preparation",
    "quote_sent",
    "awaiting_payment",
    "drawing_authorized",
    "drawing_in_progress",
    "drawing_under_review",
    "client_overview_sent",
    "drawing_approved",
    "production_pack_ready",
    "released_to_factory",
]
WORKFLOW_LABELS = {
    key: label for key, label in (
        ("measurement_received", "Measurement received"),
        ("survey_scheduled", "Site survey scheduled"),
        ("extraction_in_progress", "Extraction in progress"),
        ("extraction_ready", "Extraction ready for quote"),
        ("quote_in_preparation", "Quote in preparation"),
        ("quote_sent", "Quote sent"),
        ("awaiting_payment", "Awaiting payment"),
        ("drawing_authorized", "Paid — drawing authorized"),
        ("drawing_in_progress", "Drawing in progress"),
        ("drawing_under_review", "Drawing under review"),
        ("client_overview_sent", "Client overview sent"),
        ("drawing_approved", "Drawing approved"),
        ("production_pack_ready", "Production pack ready"),
        ("released_to_factory", "Released to factory"),
    )
}


@app.get("/")
def root():
    return {"service": "Fabra API", "status": "ok", "db": engine.dialect.name}


@app.get("/api/clients")
def list_clients(db: Session = Depends(get_db)):
    out = []
    for c in db.scalars(select(models.Client)).all():
        jobs = c.jobs or []
        out.append({"id": c.id, "name": c.name, "contact": c.contact,
                    "phone": c.phone, "location": c.location, "type": c.type,
                    "jobs": len(jobs), "value": round(sum(j.value for j in jobs), 2)})
    return out


@app.post("/api/clients")
def create_client(c: schemas.ClientIn, db: Session = Depends(get_db)):
    client = models.Client(name=c.name, contact=c.contact, phone=c.phone,
                           location=c.location, type=c.type)
    db.add(client)
    lc.log(db, "system", f"added client {c.name}", who="Kwame Mensah")
    db.commit(); db.refresh(client)
    return {"id": client.id, "name": client.name}


@app.get("/api/clients/{client_id}")
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = db.get(models.Client, client_id)
    if client is None:
        raise HTTPException(404, "Client not found")
    leads = db.scalars(select(models.Lead).where(models.Lead.client_id == client_id)
                        .order_by(models.Lead.created_at.desc())).all()
    jobs = client.jobs or []
    won = sum(1 for lead in leads if lead.stage == "won")
    lost = sum(1 for lead in leads if lead.stage == "lost")
    closed = won + lost
    return {
        "id": client.id, "name": client.name, "contact": client.contact,
        "phone": client.phone, "location": client.location, "type": client.type,
        "jobs": len(jobs), "value": round(sum(job.value for job in jobs), 2),
        "win_rate": round(won / closed * 100, 1) if closed else None,
        "won": won, "lost": lost,
        "leads": [{
            "id": lead.id, "lead_number": lead.lead_number, "name": lead.name,
            "stage": lead.stage, "estimated_value": lead.estimated_value,
            "created_at": lead.created_at.isoformat() if lead.created_at else None,
            "project_id": lead.project_id,
        } for lead in leads],
    }


def _workflow_log(db: Session, project: models.Project, kind: str, note: str,
                  who: str = "System") -> models.WorkflowEvent:
    event = models.WorkflowEvent(
        project_id=project.id, kind=kind, note=note, who=who)
    db.add(event)
    return event


_PM_PREFIX = "PM:"
_TASK_STATUSES = {"todo", "in_progress", "blocked", "done"}
_PROJECT_PRIORITIES = {"normal", "high", "urgent"}
_SURVEY_STATUSES = {"scheduled", "in_progress", "completed", "cancelled"}


def _pm_note(payload: dict) -> str:
    note = _PM_PREFIX + json.dumps(payload, separators=(",", ":"), ensure_ascii=True)
    if len(note) > 400:
        raise HTTPException(400, "Project-management note is too long")
    return note


def _pm_payload(note: str) -> dict | None:
    if not str(note or "").startswith(_PM_PREFIX):
        return None
    try:
        return json.loads(note[len(_PM_PREFIX):])
    except (TypeError, ValueError):
        return None


def _valid_date(value: str, field: str) -> str:
    value = str(value or "").strip()
    if not value:
        return ""
    try:
        datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, f"{field} must be YYYY-MM-DD") from exc
    return value[:10]


def _valid_datetime(value: str, field: str) -> str:
    value = str(value or "").strip()
    if not value:
        raise HTTPException(400, f"{field} is required")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            400, f"{field} must be a valid local date and time") from exc
    return parsed.replace(tzinfo=None, second=0, microsecond=0).isoformat(
        timespec="minutes")


def _project_management_payload(project: models.Project) -> dict:
    assignment = {
        "owner": "", "team": "", "planned_start": "", "due_date": "",
        "priority": "normal", "updated_at": None, "updated_by": "",
        "board_stage": "", "board_stage_base": "",
    }
    tasks: dict[int, dict] = {}
    events = sorted(project.workflow_events or [], key=lambda row: (row.created_at, row.id))
    for event in events:
        payload = _pm_payload(event.note)
        if not payload:
            continue
        if event.kind == "project_assignment":
            assignment.update({
                key: payload.get(key, assignment[key])
                for key in ("owner", "team", "planned_start", "due_date", "priority")
            })
            assignment.update({
                "updated_at": event.created_at.isoformat() if event.created_at else None,
                "updated_by": event.who,
            })
        elif event.kind == "board_position":
            assignment["board_stage"] = payload.get("stage", "")
            assignment["board_stage_base"] = payload.get("base_stage", "")
        elif event.kind == "project_task":
            tasks[event.id] = {
                "id": event.id,
                "department": payload.get("department", "General"),
                "title": payload.get("title", "Project task"),
                "assignee": payload.get("assignee", ""),
                "due_date": payload.get("due_date", ""),
                "status": payload.get("status", "todo"),
                "notes": payload.get("notes", ""),
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "created_by": event.who,
                "updated_at": event.created_at.isoformat() if event.created_at else None,
            }
        elif event.kind == "project_task_update":
            task = tasks.get(int(payload.get("task_id") or 0))
            if task:
                task.update({key: value for key, value in payload.items()
                             if key in ("status", "assignee", "due_date", "notes")
                             and value is not None})
                task["updated_at"] = event.created_at.isoformat() if event.created_at else None
    today = datetime.now().date()
    for task in tasks.values():
        try:
            due = datetime.fromisoformat(task["due_date"]).date() if task["due_date"] else None
        except ValueError:
            due = None
        task["overdue"] = bool(due and due < today and task["status"] != "done")
    open_tasks = [task for task in tasks.values() if task["status"] != "done"]
    return {
        **assignment,
        "tasks": sorted(tasks.values(), key=lambda task: (
            task["status"] == "done", task["due_date"] or "9999-12-31", task["id"])),
        "open_task_count": len(open_tasks),
        "overdue_task_count": sum(1 for task in open_tasks if task["overdue"]),
    }


def _project_surveys(project: models.Project) -> list[dict]:
    surveys: dict[int, dict] = {}
    events = sorted(
        project.workflow_events or [], key=lambda row: (row.created_at, row.id))
    for event in events:
        payload = _pm_payload(event.note)
        if not payload:
            continue
        if event.kind == "site_survey":
            surveys[event.id] = {
                "id": event.id,
                "survey_number": f"SV-{event.id:04d}",
                "project_id": project.id,
                "project_number": project.project_number,
                "project_name": project.name,
                "client_name": project.client.name if project.client else "Walk-in Client",
                "site": project.location,
                "assigned_to": payload.get("assigned_to", ""),
                "scheduled_for": payload.get("scheduled_for", ""),
                "units": int(payload.get("units") or 0),
                "notes": payload.get("notes", ""),
                "status": payload.get("status", "scheduled"),
                "variance": payload.get("variance", ""),
                "created_at": event.created_at.isoformat() if event.created_at else None,
                "created_by": event.who,
                "updated_at": event.created_at.isoformat() if event.created_at else None,
                "updated_by": event.who,
                "completed_at": None,
            }
        elif event.kind == "site_survey_update":
            survey = surveys.get(int(payload.get("survey_id") or 0))
            if survey:
                survey.update({
                    key: value for key, value in payload.items()
                    if key in {
                        "status", "assigned_to", "scheduled_for", "units",
                        "notes", "variance", "completed_at",
                    } and value is not None
                })
                survey["updated_at"] = (
                    event.created_at.isoformat() if event.created_at else None)
                survey["updated_by"] = event.who
    now = datetime.now()
    for survey in surveys.values():
        try:
            scheduled = datetime.fromisoformat(survey["scheduled_for"])
        except (TypeError, ValueError):
            scheduled = None
        survey["overdue"] = bool(
            scheduled and scheduled < now
            and survey["status"] not in {"completed", "cancelled"})
    return sorted(surveys.values(), key=lambda row: (
        row["status"] in {"completed", "cancelled"},
        row["scheduled_for"] or "9999-12-31T23:59", row["id"]))


def _workflow_event_note(event: models.WorkflowEvent) -> str:
    payload = _pm_payload(event.note)
    if not payload:
        return event.note
    if event.kind == "project_assignment":
        owner = payload.get("owner") or payload.get("team") or "unassigned"
        due = f" due {payload['due_date']}" if payload.get("due_date") else ""
        return f"assigned project to {owner}{due}"
    if event.kind == "project_task":
        return f"created {payload.get('department', 'project')} task: {payload.get('title', 'task')}"
    if event.kind == "project_task_update":
        return f"updated task #{payload.get('task_id')} to {payload.get('status', 'updated')}"
    if event.kind == "site_survey":
        return (
            f"scheduled site survey for {payload.get('scheduled_for', 'unscheduled')}"
            f" with {payload.get('assigned_to', 'unassigned')}")
    if event.kind == "site_survey_update":
        return (
            f"updated survey #{payload.get('survey_id')} to "
            f"{payload.get('status', 'updated')}")
    if event.kind == "preproduction_qc":
        result = payload.get("result", payload.get("r", "hold"))
        return (
            "approved the pre-production QC gate"
            if result == "approved"
            else "placed the project on pre-production QC hold")
    return "updated project management"


def _project_contract_value(project: models.Project) -> float:
    """The one contract figure Accounts bills against for this project.

    Same number as the combined client PROJECT QUOTATION total. Falls back to
    the sum of job values only for a project with no saved design items at
    all (an extraction-only project the Configurator quote never covers) so
    that case doesn't silently report a zero contract.
    """
    if project.items:
        return _project_client_quote_totals(project)["client_grand_total"]
    return sum(float(job.value or 0) for job in (project.jobs or []))


def _project_deposit_percent(project: models.Project) -> float:
    return max(0, min(100, float(
        project.drawing_release_percent
        if project.drawing_release_percent is not None else 80)))


def _payment_authorization(db: Session, project: models.Project) -> dict:
    """Return the project's drawing-payment gate against ONE combined contract.

    What unlocks drawing work — and what a payment's outstanding balance is
    capped at — is the same combined total shown on the client's project
    quotation, not each job's own individually-priced value. Production
    stages still track each item's own job separately; only billing and this
    gate are project-wide.
    """
    jobs = list(project.jobs or [])
    accepted_quotes = [q for q in (project.quotes or [])
                       if q.status in ("Accepted", "Approved")]
    contract = _project_contract_value(project)
    paid = sum(lc.paid_amount(db, job) for job in jobs)
    threshold = _project_deposit_percent(project)
    required = contract * threshold / 100
    authorized = bool(jobs) and paid + 0.5 >= required
    return {
        "authorized": authorized,
        "accepted_quote_count": len(accepted_quotes),
        "job_count": len(jobs),
        "contract_value": round(contract, 2),
        "required_amount": round(required, 2),
        "paid_amount": round(paid, 2),
        "outstanding": round(max(required - paid, 0), 2),
        "reason": (
            "" if authorized
            else "An accepted quotation must open a project job before drawing can begin."
            if not jobs
            else f"GHS {round(required - paid, 2):,.2f} still required against the project's combined contract."
        ),
    }


def _project_schedule_authorization(
        db: Session, project: models.Project) -> dict:
    """Whether commercial dates may be committed to a project.

    A quotation is an offer, not a production promise. Project dates are only
    meaningful once the customer has accepted and Accounts has cleared the
    configured payment gate.
    """
    payment = _payment_authorization(db, project)
    client_accepted = payment["accepted_quote_count"] > 0
    authorized = client_accepted and payment["authorized"]
    return {
        "authorized": authorized,
        "reason": (
            "" if authorized else
            "Client acceptance is required before setting the project schedule."
            if not client_accepted else
            "Required payment must be cleared before setting the project schedule."
        ),
    }


def _file_payload(file: models.DrawingFile) -> dict:
    return {
        "id": file.id,
        "kind": file.kind,
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": file.size_bytes,
        "checksum_sha256": file.checksum_sha256,
        "download_url": f"/api/drawing-files/{file.id}",
        "created_at": file.created_at.isoformat() if file.created_at else None,
    }


def _design_category(record: models.DesignRecord) -> str:
    try:
        return json.loads(record.design_json).get("category", "frame")
    except (TypeError, ValueError, AttributeError):
        return "frame"


def _design_system(record: models.DesignRecord) -> str:
    try:
        return json.loads(record.design_json).get("system", "")
    except (TypeError, ValueError, AttributeError):
        return ""


def _extraction_payload(extraction: models.TechnicalExtraction) -> dict:
    items = sorted(extraction.items or [], key=lambda row: row.id)
    return {
        "id": extraction.id,
        "design_id": extraction.design_id,
        "revision": extraction.revision,
        "method": extraction.method,
        "recipe_status": extraction.recipe_status,
        "status": extraction.status,
        "notes": extraction.notes,
        "created_by": extraction.created_by,
        "approved_by": extraction.approved_by,
        "approved_at": (
            extraction.approved_at.isoformat() if extraction.approved_at else None),
        "created_at": (
            extraction.created_at.isoformat() if extraction.created_at else None),
        "subtotal": round(sum(row.quantity * row.unit_price for row in items), 2),
        "items": [{
            "id": row.id,
            "code": row.code,
            "material": row.material,
            "category": row.category,
            "quantity": row.quantity,
            "unit": row.unit,
            "unit_price": row.unit_price,
            "source": row.source,
            "notes": row.notes,
            "line_total": round(row.quantity * row.unit_price, 2),
        } for row in items],
    }


QUOTE_SNAPSHOT_KIND = "commercial_quote_v1"


def _quote_snapshot(quote: models.Quote) -> dict | None:
    """Read an immutable commercial snapshot stored with an itemised quote.

    DesignRecord already provides the application's durable JSON-record path.
    Commercial snapshots use that path without joining the configurator's
    saved-project item collection, so this separation needs no database
    migration and never rewrites the approved technical extraction.
    """
    if quote.design is None:
        return None
    try:
        raw = json.loads(quote.design.design_json)
    except (TypeError, ValueError):
        return None
    if raw.get("record_kind") != QUOTE_SNAPSHOT_KIND:
        return None
    snapshot = raw.get("commercial")
    return snapshot if isinstance(snapshot, dict) else None


def _build_commercial_snapshot(
        extractions: list[models.TechnicalExtraction],
        req: schemas.ExtractionQuoteIn,
) -> dict:
    """Build one commercial snapshot from one or several approved extractions.

    Several extractions arrive when a project has multiple items (e.g. a
    window and a door) and their approved material take-offs are combined
    into a single client quote. `ExtractionItem.id` is unique across every
    extraction, so merging their items into one lookup is collision-free.
    """
    primary = extractions[0]
    source_items = {
        row.id: row for extraction in extractions for row in extraction.items or []}
    lines = []
    for requested in req.lines:
        if requested.unit_price < 0:
            raise HTTPException(400, "Selling rates cannot be negative")
        if requested.extraction_item_id is not None:
            source = source_items.get(requested.extraction_item_id)
            if source is None:
                raise HTTPException(
                    400, "A quotation line is not part of this extraction")
            line = {
                "extraction_item_id": source.id,
                "code": source.code,
                "description": source.material,
                "quantity": float(source.quantity),
                "unit": source.unit,
                "unit_price": float(requested.unit_price),
                "kind": "material",
            }
        else:
            if not requested.description.strip():
                raise HTTPException(400, "Commercial line description is required")
            if requested.quantity <= 0:
                raise HTTPException(400, "Commercial line quantity must be positive")
            line = {
                "extraction_item_id": None,
                "code": requested.code.strip(),
                "description": requested.description.strip(),
                "quantity": float(requested.quantity),
                "unit": requested.unit.strip() or "item",
                "unit_price": float(requested.unit_price),
                "kind": "addition",
            }
        line["total"] = round(line["quantity"] * line["unit_price"], 2)
        lines.append(line)

    # Backward compatibility for earlier technical-workflow clients. New
    # quotations always send itemised lines from the quotation desk.
    if not lines and req.client_total is not None:
        if req.client_total <= 0:
            raise HTTPException(400, "Client quotation total must be positive")
        lines = [{
            "extraction_item_id": None,
            "code": "",
            "description": req.product.strip(),
            "quantity": 1.0,
            "unit": "project",
            "unit_price": float(req.client_total),
            "total": round(float(req.client_total), 2),
            "kind": "legacy",
        }]
        discount_percent = getf_nhis_percent = vat_percent = 0.0
    else:
        if not lines:
            raise HTTPException(400, "Add at least one quotation line")
        discount_percent = float(req.discount_percent)
        getf_nhis_percent = float(req.getf_nhis_percent)
        vat_percent = float(req.vat_percent)

    service_charge_percent = float(
        req.service_charge_percent
        if req.service_charge_percent is not None
        else (req.installation_percent or 0))
    for label, value in (
        ("service_charge_percent", service_charge_percent),
        ("discount_percent", discount_percent),
        ("getf_nhis_percent", getf_nhis_percent),
        ("vat_percent", vat_percent),
        ("deposit_percent", req.deposit_percent),
    ):
        if not 0 <= value <= 100:
            raise HTTPException(400, f"{label} must be 0-100")
    if not 1 <= req.valid_days <= 90:
        raise HTTPException(400, "valid_days must be 1-90")

    priced_lines = round(sum(line["total"] for line in lines), 2)
    priced_technical_materials = round(sum(
        line["total"] for line in lines
        if line.get("extraction_item_id") is not None), 2)
    service_charge_amount = round(
        priced_technical_materials * service_charge_percent / 100, 2)
    subtotal = round(priced_lines + service_charge_amount, 2)
    discount_amount = round(subtotal * discount_percent / 100, 2)
    client_net = round(subtotal - discount_amount, 2)
    getf_nhis = round(client_net * getf_nhis_percent / 100, 2)
    vat = round(client_net * vat_percent / 100, 2)
    grand_total = round(client_net + getf_nhis + vat, 2)
    internal_floor = round(sum(
        item.quantity * item.unit_price
        for extraction in extractions for item in extraction.items or []), 2)
    if internal_floor > 0 and client_net + 0.01 < internal_floor:
        raise HTTPException(
            422,
            "Client net is below the approved extracted material cost. "
            "Review the selling rates or discount.")
    return {
        "version": 1,
        "extraction_id": primary.id,
        "extraction_revision": primary.revision,
        "extraction_ids": [row.id for row in extractions],
        "extraction_revisions": [row.revision for row in extractions],
        "product": req.product.strip(),
        "client_phone": req.client_phone.strip(),
        "client_email": req.client_email.strip(),
        "notes": req.notes.strip(),
        "valid_days": int(req.valid_days),
        "deposit_percent": float(req.deposit_percent),
        "service_charge_percent": service_charge_percent,
        "service_charge_amount": service_charge_amount,
        "priced_lines": priced_lines,
        "priced_technical_materials": priced_technical_materials,
        "discount_percent": discount_percent,
        "getf_nhis_percent": getf_nhis_percent,
        "vat_percent": vat_percent,
        "client_subtotal": subtotal,
        "discount_amount": discount_amount,
        "client_net": client_net,
        "getf_nhis": getf_nhis,
        "vat": vat,
        "grand_total": grand_total,
        "internal_floor": internal_floor,
        "floor_gap": round(client_net - internal_floor, 2),
        "lines": lines,
    }


def _latest_approved_extraction(
        project: models.Project | None,
        design_id: int | None = None) -> models.TechnicalExtraction | None:
    """The current approved material take-off for one item's chain.

    `design_id=None` selects the legacy/whole-project chain (extractions made
    before per-item scoping, or a single-item project that never set one) —
    this keeps every existing single-item project working unchanged. Passing
    a specific item's `design_id` isolates that item's own chain so approving
    it never touches a sibling item's extraction in the same project.
    """
    if project is None:
        return None
    return next((
        row for row in sorted(
            project.extractions or [],
            key=lambda value: value.revision, reverse=True)
        if row.status == "approved" and row.design_id == design_id), None)


def _quote_extraction_ids(quote: models.Quote) -> list[int]:
    """All extraction ids bundled into a quote (primary + combined items)."""
    ids = []
    if quote.extraction_id is not None:
        ids.append(quote.extraction_id)
    try:
        extra = json.loads(quote.extra_extraction_ids or "[]")
    except (TypeError, ValueError):
        extra = []
    ids.extend(int(value) for value in extra if int(value) not in ids)
    return ids


def _current_commercial_quote(
        project: models.Project,
        extraction: models.TechnicalExtraction | None
) -> models.Quote | None:
    if extraction is None:
        return None
    return next((
        quote for quote in sorted(
            project.quotes or [],
            key=lambda row: row.created_at, reverse=True)
        if extraction.id in _quote_extraction_ids(quote)
        and quote.status in ("Accepted", "Approved")
    ), None)


def _result_with_approved_extraction(
        result: dict,
        extraction: models.TechnicalExtraction | None,
        commercial: dict | None = None,
) -> dict:
    """Replace generated material/cost rows with the approved take-off.

    Geometry outputs remain generated from the design. Material, unit-price
    and internal cost reports use the approved extraction revision.
    """
    if extraction is None:
        return result
    out = dict(result)
    commercial_prices = {
        int(line["extraction_item_id"]): float(line.get("unit_price", 0) or 0)
        for line in (commercial or {}).get("lines", [])
        if line.get("extraction_item_id") is not None
    }
    rows = [{
        "description": item.material,
        "code": item.code,
        "category": item.category,
        "quantity": item.quantity,
        "unit": item.unit,
        "unit_price": commercial_prices.get(item.id, item.unit_price),
        "total": round(
            item.quantity * commercial_prices.get(item.id, item.unit_price), 2),
        "source": item.source,
        "notes": item.notes,
    } for item in sorted(extraction.items or [], key=lambda row: row.id)]
    material_total = round(sum(row["total"] for row in rows), 2)
    qty = max(1, int(out.get("qty") or 1))
    labour_total = float(out.get("labour_cost_per_unit", 0) or 0) * qty
    service_charge_percent = (
        float(commercial.get(
            "service_charge_percent",
            commercial.get("installation_percent", 0)) or 0)
        if commercial is not None
        else float(out.get("service_charge_percent", 0) or 0))
    service_charge_total = (
        float(commercial.get(
            "service_charge_amount",
            commercial.get("installation_amount", 0)) or 0)
        if commercial is not None
        else round(material_total * service_charge_percent / 100, 2))
    internal_floor = round(
        material_total + labour_total + service_charge_total, 2)
    client_net = out.get("client_net")
    out.update({
        "approved_extraction": True,
        "approved_extraction_id": extraction.id,
        "approved_extraction_revision": extraction.revision,
        "approved_extraction_method": extraction.method,
        "approved_extraction_rows": rows,
        "material_rows": rows,
        "material_cost": material_total,
        "material_cost_per_unit": round(material_total / qty, 2),
        "service_charge_percent": service_charge_percent,
        "service_charge_amount": service_charge_total,
        "service_charge_per_unit": round(service_charge_total / qty, 2),
        "total_material_cost": internal_floor,
        "internal_floor": internal_floor,
        "internal_floor_per_unit": round(internal_floor / qty, 2),
        "cost_floor_source": (
            f"approved extraction E{extraction.revision} "
            f"({extraction.method})"),
    })
    if client_net is not None:
        out["floor_gap"] = round(float(client_net) - internal_floor, 2)
        out["floor_status"] = (
            "OK" if float(client_net) + 0.01 >= internal_floor
            else "BELOW FLOOR")
    return out


def _procurement_payload(
        db: Session,
        extraction: models.TechnicalExtraction | None) -> dict:
    if extraction is None:
        return {
            "extraction_id": None,
            "extraction_revision": None,
            "rows": [],
            "shortage_count": 0,
            "ready": False,
        }
    rows = []
    non_stock_categories = {"service", "labour", "installation", "tax", "fee"}
    for item in sorted(extraction.items or [], key=lambda row: row.id):
        if item.category.strip().lower() in non_stock_categories:
            continue
        material = db.scalar(select(models.Material).where(
            models.Material.code == item.code.strip())) if item.code.strip() else None
        unit_matches = bool(
            material
            and lc.normalize_unit(item.unit) == lc.normalize_unit(material.unit))
        available = float(material.stock) if material and unit_matches else 0.0
        shortfall = max(float(item.quantity) - available, 0.0)
        if not item.code.strip():
            status = "missing_code"
        elif material is None:
            status = "not_in_inventory"
        elif not unit_matches:
            status = "unit_mismatch"
        elif shortfall > 0:
            status = "purchase_required"
        else:
            status = "available"
        rows.append({
            "item_id": item.id,
            "code": item.code,
            "material": item.material,
            "category": item.category,
            "required": item.quantity,
            "unit": item.unit,
            "available": round(available, 3),
            "shortfall": round(shortfall, 3),
            "status": status,
        })
    return {
        "extraction_id": extraction.id,
        "extraction_revision": extraction.revision,
        "rows": rows,
        "shortage_count": sum(
            row["status"] != "available" for row in rows),
        "ready": bool(rows) and all(
            row["status"] == "available" for row in rows),
    }


def _drawing_task_for_chain(
        project: models.Project,
        design_id: int | None,
        extraction: models.TechnicalExtraction | None,
        quote: models.Quote | None) -> models.DrawingTask | None:
    """The drawing task (any method) open on one item's current
    extraction/quote chain, if any. Shared by the approved-drawing lookup and
    the pre-production QC gate's readiness check.
    """
    if extraction is None or quote is None:
        return None
    return next((
        row for row in sorted(
            project.drawing_tasks or [],
            key=lambda value: value.created_at, reverse=True)
        if row.design_id == design_id
        and row.extraction_id == extraction.id
        and row.quote_id == quote.id
    ), None)


def _current_approved_drawing(
        project: models.Project,
        design_id: int | None,
        extraction: models.TechnicalExtraction | None,
        quote: models.Quote | None) -> models.DrawingRevision | None:
    """The approved drawing on one item's current extraction/quote chain."""
    task = _drawing_task_for_chain(project, design_id, extraction, quote)
    if task is None:
        return None
    return next((
        revision for revision in sorted(
            task.revisions or [], key=lambda value: value.revision, reverse=True)
        if revision.status == "approved"
    ), None)


def _drawing_not_required(
        project: models.Project,
        design_id: int | None,
        extraction: models.TechnicalExtraction | None,
        quote: models.Quote | None) -> bool:
    """Whether Technical has explicitly declared no drawing is needed for
    this item on its current extraction/quote chain."""
    task = _drawing_task_for_chain(project, design_id, extraction, quote)
    return task is not None and task.status == "not_required"


def _qc_item_scopes(
        project: models.Project,
) -> list[tuple[int | None, models.DesignRecord | None]]:
    """The (extraction-chain design_id, item record) pairs QC checks for
    this project — one per saved item, scoped the same way extraction/
    drawing/procurement chains are scoped elsewhere. Shared by the QC gate
    itself and anything that needs to match its exact per-item scoping
    (e.g. auto-generating a missing extraction for an item QC will check).
    """
    records = sorted(project.items or [], key=lambda row: row.created_at)
    has_ungrouped_chain = any(
        row.design_id is None for row in (
            list(project.extractions or [])
            + list(project.drawing_tasks or [])))
    has_item_scoped_chain = any(
        row.design_id is not None for row in (
            list(project.extractions or [])
            + list(project.drawing_tasks or [])))
    # Older single-item projects used a project-wide (design_id=None) chain.
    # Treat that as the one item's chain until an operator explicitly scopes
    # it, without asking QA/QC to approve the same physical item twice.
    if len(records) == 1 and has_ungrouped_chain and not has_item_scoped_chain:
        scopes = [(None, records[0])]
    else:
        scopes = [(record.id, record) for record in records]
    if has_ungrouped_chain and not (
            len(records) == 1 and not has_item_scoped_chain):
        scopes.append((None, None))
    return scopes


def _qc_readiness(project: models.Project) -> dict:
    """Whether every real item in the project is ready for Technical to
    submit to QC — each item needs either an approved drawing or an
    explicit not-required declaration. Shared by `submit_project_to_qc`,
    `_technical_workflow_payload`'s `qc_submission` block and the drawings
    queue.
    """
    items = []
    not_ready = []
    for design_id, record in _qc_item_scopes(project):
        if record is None:
            continue
        label = record.ref or record.name or f"Item {record.id}"
        extraction = _latest_approved_extraction(project, design_id)
        quote = _current_commercial_quote(project, extraction)
        drawing = _current_approved_drawing(project, design_id, extraction, quote)
        if drawing is not None:
            status = "approved"
        elif _drawing_not_required(project, design_id, extraction, quote):
            status = "not_required"
        else:
            status = "pending"
            not_ready.append(label)
        items.append({"design_id": design_id, "label": label, "status": status})
    return {"ready": not not_ready, "items": items, "not_ready_items": not_ready}


def _drawing_queue_payload(project: models.Project) -> dict:
    """One row of the cross-project drawings queue — every project Accounts
    has released to Technical, with per-item drawing readiness."""
    readiness = _qc_readiness(project)
    return {
        "project_id": project.id,
        "project_number": project.project_number,
        "project_name": project.name,
        "client_name": project.client.name if project.client else "Walk-in Client",
        "released_to_technical_at": (
            project.released_to_technical_at.isoformat()
            if project.released_to_technical_at else None),
        "released_to_technical_by": project.released_to_technical_by,
        "released_to_qc_at": (
            project.released_to_qc_at.isoformat()
            if project.released_to_qc_at else None),
        "released_to_qc_by": project.released_to_qc_by,
        "ready_for_qc": readiness["ready"],
        "items": readiness["items"],
        "not_ready_items": readiness["not_ready_items"],
    }


def _preproduction_qc_payload(db: Session, project: models.Project) -> dict:
    """Resolve the project-wide QC gate against its exact current inputs.

    Approval is deliberately tied to a hash of the saved design, approved
    extraction, accepted quotation, approved drawing and live procurement
    quantities for every project item. If any of those inputs changes, the
    old approval remains in the audit history but can no longer release work.
    """
    scopes = _qc_item_scopes(project)

    issues = []
    snapshot_items = []
    item_rows = []
    if not scopes:
        issues.append("No measured project items are available for checking")
    if project.released_to_qc_at is None:
        issues.append("Technical must submit the project to QC")

    for design_id, record in scopes:
        label = (
            record.ref or record.name or f"Item {record.id}"
            if record is not None else "Ungrouped project item")
        extraction = _latest_approved_extraction(project, design_id)
        quote = _current_commercial_quote(project, extraction)
        drawing = _current_approved_drawing(
            project, design_id, extraction, quote)
        procurement = _procurement_payload(db, extraction)
        # Extraction/quote/procurement are shown to QC below for judgment,
        # not required to reach QC — Accounts releasing the project is what
        # puts it in front of QC (see `issues` above). The drawing pack IS
        # required to *approve*, since QC approval releases it straight to
        # the factory floor (see `_release_project_to_factory`): an item
        # with no drawing yet will be auto-confirmed from its saved design
        # at release time, but a drawing genuinely in progress must not be
        # silently bypassed.
        if drawing is None and record is not None:
            if extraction is None or quote is None:
                issues.append(
                    f"{label} needs an approved extraction and accepted "
                    "quotation before QC can release it")
            else:
                pending_task = _drawing_task_for_chain(
                    project, design_id, extraction, quote)
                if pending_task and pending_task.revisions:
                    issues.append(
                        f"{label}'s drawing pack (client overview + factory "
                        "breakdown files) is not complete yet")

        snapshot_row = {
            "design_id": design_id,
            "record_id": record.id if record is not None else None,
            "design_hash": (
                hashlib.sha256(record.design_json.encode("utf-8")).hexdigest()
                if record is not None else None),
            "qty": int(record.qty or 1) if record is not None else None,
            "extraction_id": extraction.id if extraction else None,
            "extraction_revision": extraction.revision if extraction else None,
            "quote_id": quote.id if quote else None,
            "drawing_revision_id": drawing.id if drawing else None,
            "drawing_revision": drawing.revision if drawing else None,
            "procurement": [{
                "code": row["code"],
                "required": row["required"],
                "unit": row["unit"],
                "available": row["available"],
                "status": row["status"],
            } for row in procurement["rows"]],
        }
        snapshot_items.append(snapshot_row)
        item_rows.append({
            "design_id": design_id,
            "label": label,
            "extraction_revision": extraction.revision if extraction else None,
            "quote_number": quote.quote_number if quote else None,
            "drawing_revision": drawing.revision if drawing else None,
            "procurement_ready": procurement["ready"],
            "procurement_shortages": procurement["shortage_count"],
        })

    snapshot_hash = hashlib.sha256(json.dumps(
        {"project_id": project.id, "items": snapshot_items},
        sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    latest_event = next((
        event for event in sorted(
            project.workflow_events or [],
            key=lambda row: (row.created_at, row.id), reverse=True)
        if event.kind == "preproduction_qc" and _pm_payload(event.note)
    ), None)
    stored = _pm_payload(latest_event.note) if latest_event else None
    current = bool(stored and stored.get("snapshot", stored.get("s")) == snapshot_hash)
    result = stored.get("result", stored.get("r")) if stored else None
    approved = bool(current and result == "approved" and not issues)
    if approved:
        status = "approved"
    elif current and result == "hold":
        status = "hold"
    elif stored:
        status = "stale"
    elif issues:
        status = "not_ready"
    else:
        status = "ready_for_check"
    checks = stored.get("checks", stored.get("c", {})) if stored else {}
    latest_check = ({
        "id": latest_event.id,
        "result": result,
        "current": current,
        "inspector": stored.get("inspector", stored.get("i", latest_event.who)),
        "notes": stored.get("notes", stored.get("n", "")),
        "checked_at": (
            latest_event.created_at.isoformat()
            if latest_event.created_at else None),
        "checklist": {
            "measurements_verified": bool(checks.get("m")),
            "materials_verified": bool(checks.get("mat")),
            "quantities_verified": bool(checks.get("qty")),
            "drawings_verified": bool(checks.get("drw")),
            "procurement_verified": bool(checks.get("proc")),
        },
    } if latest_event else None)
    return {
        "project_id": project.id,
        "project_number": project.project_number,
        "project_name": project.name,
        "client_name": project.client.name if project.client else "Walk-in Client",
        "site": project.location,
        "status": status,
        "ready": not issues,
        "approved": approved,
        "snapshot_hash": snapshot_hash,
        "item_count": len(scopes),
        "items": item_rows,
        "issues": issues,
        "latest_check": latest_check,
    }


def _drawing_task_payload(
        task: models.DrawingTask,
        current_extraction_id: int | None = None,
        current_quote_id: int | None = None) -> dict:
    revisions = sorted(task.revisions or [], key=lambda row: row.revision)
    basis_current = (
        task.extraction_id is not None
        and task.extraction_id == current_extraction_id
        and task.quote_id is not None
        and task.quote_id == current_quote_id
    )
    return {
        "id": task.id,
        "design_id": task.design_id,
        "method": task.method,
        "status": task.status,
        "extraction_id": task.extraction_id,
        "quote_id": task.quote_id,
        "quote_number": next((
            row.quote_number for row in task.project.quotes or []
            if row.id == task.quote_id), None),
        "basis_status": "current" if basis_current else "stale",
        "assigned_to": task.assigned_to,
        "brief": task.brief,
        "created_by": task.created_by,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "revisions": [{
            "id": revision.id,
            "revision": revision.revision,
            "status": revision.status,
            "notes": revision.notes,
            "submitted_by": revision.submitted_by,
            "approved_by": revision.approved_by,
            "approved_at": (
                revision.approved_at.isoformat()
                if revision.approved_at else None),
            "created_at": (
                revision.created_at.isoformat()
                if revision.created_at else None),
            "files": [_file_payload(file) for file in sorted(
                revision.files or [], key=lambda row: row.created_at)],
        } for revision in revisions],
    }


def _project_workspace_payload(
        db: Session,
        project: models.Project,
        payment: dict) -> dict:
    """Management view of one project using the existing workflow records.

    Commercial/payment values stay project-wide. Extraction, drawing and
    release status is resolved independently for every saved design item.
    """
    now = datetime.utcnow()
    management = _project_management_payload(project)
    schedule = _project_schedule_authorization(db, project)
    surveys = _project_surveys(project)
    preproduction_qc = _preproduction_qc_payload(db, project)
    records = sorted(project.items or [], key=lambda row: row.created_at)
    jobs = sorted(project.jobs or [], key=lambda row: row.created_at)
    job_ids = [job.id for job in jobs]
    job_by_id = {job.id: job for job in jobs}
    job_events = (
        db.scalars(select(models.Event).where(
            models.Event.job_id.in_(job_ids))).all()
        if job_ids else [])
    qc_checks = (
        db.scalars(select(models.QcCheck).where(
            models.QcCheck.job_id.in_(job_ids))).all()
        if job_ids else [])
    latest_qc = {}
    for check in sorted(qc_checks, key=lambda row: row.created_at):
        latest_qc[check.job_id] = check

    drawing_tasks = sorted(
        project.drawing_tasks or [], key=lambda row: row.created_at,
        reverse=True)
    releases = sorted(
        project.production_releases or [], key=lambda row: row.created_at,
        reverse=True)

    item_rows = []
    current_drawing_revision_ids = set()
    for record in records:
        extraction = _latest_approved_extraction(project, record.id)
        quote = _current_commercial_quote(project, extraction)
        task = next((row for row in drawing_tasks
                     if row.design_id == record.id
                     and extraction is not None
                     and row.extraction_id == extraction.id
                     and quote is not None
                     and row.quote_id == quote.id), None)
        approved_revision = next((
            revision for revision in sorted(
                task.revisions or [], key=lambda row: row.revision,
                reverse=True)
            if revision.status == "approved"), None) if task else None
        release = next((row for row in releases
                        if row.design_id == record.id
                        and row.status == "current"
                        and extraction is not None
                        and row.extraction_id == extraction.id
                        and quote is not None
                        and row.quote_id == quote.id
                        and approved_revision is not None
                        and row.drawing_revision_id == approved_revision.id), None)
        if approved_revision is not None:
            current_drawing_revision_ids.add(approved_revision.id)
        procurement = _procurement_payload(db, extraction)
        job = job_by_id.get(record.job_id)
        if job is None and len(records) == 1 and len(jobs) == 1:
            job = jobs[0]

        if extraction is None:
            status, blocker = "Needs extraction", "No approved material extraction"
        elif quote is None:
            status, blocker = "Needs quotation", "No accepted current quotation"
        elif not payment["authorized"]:
            status, blocker = "Payment hold", payment["reason"]
        elif approved_revision is None:
            status, blocker = "Needs drawing approval", "No approved current drawing"
        elif procurement["shortage_count"]:
            status, blocker = "Procurement hold", (
                f"{procurement['shortage_count']} material line"
                f"{'' if procurement['shortage_count'] == 1 else 's'} need action")
        elif not preproduction_qc["approved"]:
            status = "Pre-production QC hold"
            blocker = (
                "QA/QC must approve the current measurements, materials, "
                "quantities, drawings and procurement position")
        elif release is None:
            status, blocker = "Ready for factory release", "Factory pack not released"
        elif job is not None:
            status = lc.STAGE_LABEL.get(job.stage, job.stage)
            blocker = lc.advance_block_reason(db, job) or ""
        else:
            status, blocker = "Factory released", "Production job is not linked to this item"

        item_rows.append({
            "design_id": record.id,
            "ref": record.ref,
            "name": record.name,
            "category": _design_category(record),
            "system": _design_system(record),
            "qty": record.qty,
            "location": record.location,
            "status": status,
            "blocking_reason": blocker,
            "references": {
                "extraction": (
                    f"E{extraction.revision}" if extraction else None),
                "quotation": quote.quote_number if quote else None,
                "drawing": (
                    f"R{approved_revision.revision}"
                    if approved_revision else None),
                "factory_release": (
                    release.release_number if release else None),
            },
            "procurement": procurement,
            "job": ({
                "job_number": job.job_number,
                "stage": job.stage,
                "stage_label": lc.STAGE_LABEL.get(job.stage, job.stage),
                "progress": lc.STAGE_PROGRESS.get(job.stage, job.progress),
                "block": lc.advance_block_reason(db, job),
            } if job else None),
            "complete": bool(job and job.stage == "done"),
        })

    grouped = []
    for item in item_rows:
        group = next((row for row in grouped if row["name"] == item["name"]), None)
        if group is None:
            group = {
                "key": f"product-{len(grouped) + 1}",
                "name": item["name"],
                "category": item["category"],
                "system": item["system"],
                "item_count": 0,
                "total_qty": 0,
                "complete_count": 0,
                "items": [],
            }
            grouped.append(group)
        group["item_count"] += 1
        group["total_qty"] += int(item["qty"] or 1)
        group["complete_count"] += 1 if item["complete"] else 0
        group["items"].append(item)

    extraction_complete = bool(item_rows) and all(
        item["references"]["extraction"] for item in item_rows)
    # Quotation only needs the client's quote accepted per item — it must not
    # wait on a technical extraction existing (extraction is generated for
    # costing/procurement, but is no longer a required gate; see accounts_release).
    quotation_complete = bool(records) and all(
        any(quote.design_id == record.id and quote.status in ("Accepted", "Approved")
            for quote in project.quotes or [])
        for record in records)
    drawing_complete = bool(item_rows) and _qc_readiness(project)["ready"]
    procurement_shortages = sum(
        item["procurement"]["shortage_count"] for item in item_rows)
    # Only a real, known shortage blocks — no extraction means nothing to
    # check yet, not a shortage.
    procurement_complete = procurement_shortages == 0
    preproduction_qc_complete = preproduction_qc["approved"]
    release_complete = bool(item_rows) and all(
        item["references"]["factory_release"] for item in item_rows)
    production_complete = bool(jobs) and all(
        lc.stage_index(job.stage) >= lc.stage_index("qa") for job in jobs)
    qa_complete = bool(jobs) and all(
        latest_qc.get(job.id) is not None
        and latest_qc[job.id].result == "pass" for job in jobs)
    dispatch_complete = bool(jobs) and all(
        lc.stage_index(job.stage) >= lc.stage_index("install")
        and bool(job.dn_number) for job in jobs)
    delivered_complete = bool(jobs) and all(
        job.stage == "done" for job in jobs)
    released_to_technical = project.released_to_technical_at is not None
    submitted_to_qc = project.released_to_qc_at is not None

    stage_defs = [
        ("measurement", "Measurement", bool(item_rows), "Measurements captured in saved project items."),
        ("design", "Design", bool(item_rows), f"{len(item_rows)} saved design item{'' if len(item_rows) == 1 else 's'}."),
        ("quotation", "Quotation", quotation_complete, "The accepted quotation must cover every current item extraction."),
        ("payment", "Payment", payment["authorized"], payment["reason"] or "Drawing payment gate cleared."),
        ("accounts_release", "Accounts Release to Technical", released_to_technical, (
            f"Released to Technical by {project.released_to_technical_by}."
            if released_to_technical else
            "Accounts must confirm payment and release the project to Technical.")),
        ("drawing", "Drawing", drawing_complete, (
            "Every item has an approved drawing or is marked drawing-not-required."
            if drawing_complete else
            "Technical must complete or mark not-required each item's drawing.")),
        ("submit_to_qc", "Submit to QC", submitted_to_qc, (
            f"Submitted to QC by {project.released_to_qc_by}."
            if submitted_to_qc else
            "Technical must submit the project to QC.")),
        ("procurement", "Procurement", procurement_complete, f"{procurement_shortages} material line{'' if procurement_shortages == 1 else 's'} need action."),
        ("preproduction_qc", "Pre-production QC", preproduction_qc_complete, (
            "QA/QC approval is current for all measurements, materials, quantities, drawings and procurement."
            if preproduction_qc_complete else
            "QA/QC must verify all measurements, materials, quantities, drawings and procurement before factory release.")),
        ("release", "Factory Release", release_complete, "Each item requires a current approved factory pack."),
        ("production", "Production", production_complete, "Factory work must reach Quality Check."),
        ("qa", "QA", qa_complete, "Every production job needs a passing QA check."),
        ("dispatch", "Dispatch", dispatch_complete, "Delivery note, dispatch and installation are required."),
        ("delivered", "Delivered", delivered_complete, "All project jobs must be completed."),
    ]
    first_incomplete = next((index for index, row in enumerate(stage_defs)
                             if not row[2]), len(stage_defs))
    stages = []
    for index, (key, label, complete, detail) in enumerate(stage_defs):
        if complete:
            state = "complete"
        elif index == first_incomplete:
            state = "blocked" if key in {
                "payment", "accounts_release", "drawing", "submit_to_qc",
                "procurement", "preproduction_qc"} else "current"
        else:
            state = "not_started"
        stages.append({
            "key": key,
            "label": label,
            "state": state,
            "complete": complete,
            "detail": detail,
        })

    first_job = jobs[0] if jobs else None
    next_routes = {
        "measurement": ("Add the first measured item", "Supervisor", "/configurator"),
        "design": ("Complete the project design", "Design Team", "/configurator"),
        "quotation": ("Prepare or approve the current quotation", "Sales & Accounts", f"/quotations?project={project.id}"),
        "payment": ("Record the required customer payment", "Accounts", f"/accounts?job={first_job.job_number}" if first_job else "/accounts"),
        "accounts_release": ("Confirm payment and release to Technical", "Accounts", f"/accounts?job={first_job.job_number}" if first_job else "/accounts"),
        "drawing": ("Complete or mark not-required each item's drawing", "Technical", f"/drawings?project={project.id}"),
        "submit_to_qc": ("Submit the project to QC", "Technical", f"/drawings?project={project.id}"),
        "procurement": ("Resolve project material shortages", "Procurement", "/inventory"),
        "preproduction_qc": ("Complete the pre-production release check", "QA / QC", f"/quality?scope=preproduction&project={project.id}"),
        "release": ("Complete pre-production QC — release to factory happens automatically", "QA / QC", f"/quality?scope=preproduction&project={project.id}"),
        "production": ("Continue factory production", "Factory", f"/production/{first_job.job_number}" if first_job else "/production"),
        "qa": ("Complete quality checks", "QA", "/quality"),
        "dispatch": ("Assign delivery and installation", "Dispatch", "/dispatch"),
        "delivered": ("Complete delivery and close the project", "Dispatch", "/dispatch"),
    }
    next_stage = stages[first_incomplete] if first_incomplete < len(stages) else None
    if (next_stage and management["due_date"]
            and management["due_date"] < now.date().isoformat()):
        next_stage["state"] = "overdue"
    next_label, next_owner, next_url = next_routes.get(
        next_stage["key"] if next_stage else "", (
            "Project complete", "Management", f"/projects/{project.id}"))
    open_survey = next((survey for survey in surveys
                        if survey["status"] not in {"completed", "cancelled"}), None)
    if next_stage and next_stage["key"] == "measurement" and open_survey:
        next_label = (
            "Complete overdue site survey" if open_survey["overdue"]
            else "Complete scheduled site survey")
        next_owner = open_survey["assigned_to"] or "Sales / Field Team"
        next_url = "/surveys"
        next_stage["detail"] = (
            f"{open_survey['survey_number']} is scheduled for "
            f"{open_survey['scheduled_for']}.")

    alerts = []
    for survey in surveys:
        if survey["overdue"]:
            alerts.append({
                "severity": "critical",
                "title": f"Overdue site survey {survey['survey_number']}",
                "detail": (
                    f"{survey['assigned_to'] or 'Unassigned'} · scheduled "
                    f"{survey['scheduled_for']}"),
            })
    for task in management["tasks"]:
        if task["overdue"]:
            alerts.append({
                "severity": "critical",
                "title": f"Overdue {task['department']} task",
                "detail": f"{task['title']} · {task['assignee'] or 'No assignee'} · due {task['due_date']}",
            })
    for item in item_rows:
        if not item["references"]["extraction"]:
            alerts.append({
                "severity": "warning",
                "title": f"{item['ref'] or item['name']} has no approved extraction",
                "detail": "Technical quantities and downstream documents are not controlled yet.",
            })
    if quotation_complete and jobs and not payment["authorized"]:
        alerts.append({
            "severity": "critical", "title": "Customer payment is holding drawing work",
            "detail": payment["reason"],
        })
    if procurement_shortages:
        alerts.append({
            "severity": "critical", "title": "Procurement action required",
            "detail": f"{procurement_shortages} approved material line{'' if procurement_shortages == 1 else 's'} are short, unmapped or use a different unit.",
        })
    if procurement_complete and not preproduction_qc_complete:
        qc_status = preproduction_qc["status"]
        alerts.append({
            "severity": "critical" if qc_status == "hold" else "warning",
            "title": (
                "Pre-production QC placed the project on hold"
                if qc_status == "hold" else
                "Pre-production QC approval required"),
            "detail": (
                "The previous approval is stale because a controlled project input changed."
                if qc_status == "stale" else
                "Factory release is blocked until QA/QC verifies the current project pack."),
        })
    stale_quotes = [quote for quote in project.quotes or []
                    if quote.extraction_id and any(
                        (row := db.get(models.TechnicalExtraction, extraction_id)) is None
                        or row.status != "approved"
                        for extraction_id in _quote_extraction_ids(quote))]
    if stale_quotes:
        alerts.append({
            "severity": "warning", "title": "Superseded quotation basis exists",
            "detail": f"{len(stale_quotes)} quotation record{'' if len(stale_quotes) == 1 else 's'} must not drive current production.",
        })
    superseded_releases = [row for row in releases if row.status == "superseded"]
    if superseded_releases:
        alerts.append({
            "severity": "warning", "title": "Superseded factory packs retained for audit",
            "detail": f"{len(superseded_releases)} pack{'' if len(superseded_releases) == 1 else 's'} are marked Do Not Produce.",
        })
    if payment["authorized"] and jobs and all(job.stage == "pending" for job in jobs):
        alerts.append({
            "severity": "warning", "title": "Paid project has not started production",
            "detail": "The payment gate is clear but every project job is still waiting for cutting.",
        })
    if payment["authorized"] and not (management["owner"] or management["team"]):
        alerts.append({
            "severity": "critical", "title": "Paid project has no responsible owner",
            "detail": "Assign a person or team so the paid work cannot disappear between departments.",
        })
    if payment["authorized"] and not management["open_task_count"]:
        alerts.append({
            "severity": "warning", "title": "Paid project has no open departmental task",
            "detail": "Create the next accountable task with an assignee and due date.",
        })

    current_documents = []
    if records:
        current_documents.extend([
            {"kind": "project_quote", "label": "Current project quotation", "scope": "Project"},
            {"kind": "project_boq", "label": "Project material & BOQ pack", "scope": "Project"},
        ])
        if any(item["category"] in ("frame", "curtainwall") for item in item_rows):
            current_documents.append({
                "kind": "project_cutting", "label": "Project cutting & bundle pack",
                "scope": "Factory",
            })
    for quote in sorted(project.quotes or [], key=lambda row: row.created_at,
                        reverse=True):
        if quote.status in ("Accepted", "Approved") and quote not in stale_quotes:
            current_documents.append({
                "kind": "quotation", "label": quote.quote_number,
                "scope": "Issued quotation", "quote_number": quote.quote_number,
            })
    for item in item_rows:
        current_documents.append({
            "kind": "item_reports",
            "label": f"{item['ref'] or item['name']} report pack",
            "scope": item["status"],
            "design_id": item["design_id"],
        })
    for task in drawing_tasks:
        for revision in task.revisions or []:
            if revision.id in current_drawing_revision_ids:
                for file in revision.files or []:
                    current_documents.append({
                        "kind": "drawing", "label": file.filename,
                        "scope": f"Approved drawing R{revision.revision}",
                        "download_url": f"/api/drawing-files/{file.id}",
                    })
    for job in jobs:
        if job.dn_number:
            current_documents.append({
                "kind": "delivery", "label": job.dn_number,
                "scope": job.job_number, "job_number": job.job_number,
            })

    audit_documents = [{
        "kind": "factory_release",
        "label": row.release_number,
        "scope": "Do Not Produce",
        "status": row.status,
    } for row in superseded_releases]
    for task in drawing_tasks:
        for revision in task.revisions or []:
            if (revision.status == "approved"
                    and revision.id not in current_drawing_revision_ids):
                audit_documents.extend({
                    "kind": "drawing",
                    "label": file.filename,
                    "scope": f"Drawing R{revision.revision} — Do Not Produce",
                    "download_url": f"/api/drawing-files/{file.id}",
                } for file in revision.files or [])
    audit_documents.extend({
        "kind": "quotation",
        "label": quote.quote_number,
        "scope": "Superseded basis — Do Not Produce",
        "quote_number": quote.quote_number,
    } for quote in stale_quotes)

    timeline = [{
        "id": f"workflow-{event.id}",
        "source": "project",
        "kind": event.kind,
        "who": event.who,
        "note": _workflow_event_note(event),
        "job_number": None,
        "at": event.created_at.isoformat() if event.created_at else None,
    } for event in project.workflow_events or []]
    for event in job_events:
        job = job_by_id.get(event.job_id)
        timeline.append({
            "id": f"job-{event.id}",
            "source": "factory",
            "kind": event.kind,
            "who": event.who,
            "note": event.note,
            "job_number": job.job_number if job else None,
            "at": event.created_at.isoformat() if event.created_at else None,
        })
    timeline.sort(key=lambda row: row["at"] or "", reverse=True)
    last_activity = next((row["at"] for row in timeline if row["at"]), None)
    last_activity_dt = datetime.fromisoformat(last_activity) if last_activity else project.created_at
    waiting_days = max(0, (now - last_activity_dt).days) if last_activity_dt else 0

    passed_qc = sum(1 for job in jobs
                    if latest_qc.get(job.id)
                    and latest_qc[job.id].result == "pass")
    rework_qc = sum(1 for job in jobs
                    if latest_qc.get(job.id)
                    and latest_qc[job.id].result == "rework")
    return {
        "header": {
            "project_number": project.project_number,
            "name": project.name,
            "client_name": project.client.name if project.client else "Walk-in Client",
            "client_phone": project.client.phone if project.client else "",
            "site": project.location,
            "status": project.workflow_status or "measurement_received",
            "status_label": WORKFLOW_LABELS.get(
                project.workflow_status, project.workflow_status),
            "owner": management["owner"] or None,
            "team": management["team"] or None,
            "planned_start": management["planned_start"] or None,
            "due_date": management["due_date"] or None,
            "priority": management["priority"],
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "last_activity": last_activity,
            "waiting_days": waiting_days,
        },
        "commercial": {
            "contract_value": payment["contract_value"],
            "paid_amount": payment["paid_amount"],
            "outstanding_balance": round(max(
                payment["contract_value"] - payment["paid_amount"], 0), 2),
            "required_now": payment["outstanding"],
            "deposit_percent": _project_deposit_percent(project),
            "payment_gate_cleared": payment["authorized"],
            "schedule_authorized": schedule["authorized"],
            "schedule_reason": schedule["reason"],
            # Labour is billed once for the whole project, not per item — see
            # _project_client_quote_totals. Item totals below don't include
            # it, so the Pricing tab needs this to reconcile with contract_value.
            "labour_amount": (
                _project_client_quote_totals(project)["project_labour_with_margin"]
                if project.items else 0),
        },
        "next_action": {
            "stage": next_stage["key"] if next_stage else "complete",
            "label": next_label,
            "responsible": management["owner"] or management["team"] or next_owner,
            "url": next_url,
            "waiting_days": waiting_days,
            "blocking_reason": next_stage["detail"] if next_stage else "",
        },
        "pipeline": stages,
        "item_groups": grouped,
        "rollups": {
            "items": {"count": len(item_rows), "total_qty": sum(
                int(item["qty"] or 1) for item in item_rows)},
            "technical": {
                "approved_extractions": sum(1 for item in item_rows if item["references"]["extraction"]),
                "approved_drawings": sum(1 for item in item_rows if item["references"]["drawing"]),
                "factory_releases": sum(1 for item in item_rows if item["references"]["factory_release"]),
            },
            "procurement": {"shortage_count": procurement_shortages},
            "production": {
                "job_count": len(jobs),
                "completed_jobs": sum(1 for job in jobs if job.stage == "done"),
                "average_progress": round(sum(
                    lc.STAGE_PROGRESS.get(job.stage, job.progress) for job in jobs
                ) / len(jobs)) if jobs else 0,
            },
            "quality": {
                "preproduction_status": preproduction_qc["status"],
                "passed": passed_qc, "rework": rework_qc,
            },
            "delivery": {"completed": sum(
                1 for job in jobs if job.stage == "done"), "total": len(jobs)},
        },
        "alerts": alerts,
        "documents": {
            "current": current_documents,
            "audit": audit_documents,
        },
        "management": management,
        "surveys": surveys,
        "preproduction_qc": preproduction_qc,
        "timeline": timeline[:80],
    }


def _technical_workflow_payload(db: Session, project: models.Project) -> dict:
    payment = _payment_authorization(db, project)
    approved_extraction = _latest_approved_extraction(project)
    current_quote = _current_commercial_quote(project, approved_extraction)
    item_records = sorted(project.items or [], key=lambda row: row.created_at)
    has_ungrouped_chain = any(
        row.design_id is None for row in (
            list(project.extractions or [])
            + list(project.drawing_tasks or [])
            + list(project.production_releases or [])))

    # One extraction/quote lookup per distinct item, shared between the
    # per-item summary below and each drawing task's own basis-current check
    # — a task's "is this still the current chain" comparison must use its
    # own item's approved extraction, not the single project-wide one.
    chain_cache: dict = {}

    def _chain_for(design_id):
        if design_id not in chain_cache:
            item_approved = _latest_approved_extraction(project, design_id)
            item_quote = _current_commercial_quote(project, item_approved)
            chain_cache[design_id] = (item_approved, item_quote)
        return chain_cache[design_id]

    def _chain_ids_for(design_id):
        item_approved, item_quote = _chain_for(design_id)
        return (
            item_approved.id if item_approved else None,
            item_quote.id if item_quote else None)

    def _item_summary_for(design_id):
        item_approved, item_quote = _chain_for(design_id)
        return {
            "approved_extraction_id": item_approved.id if item_approved else None,
            "approved_extraction_revision": (
                item_approved.revision if item_approved else None),
            "current_quote_number": item_quote.quote_number if item_quote else None,
            "procurement": _procurement_payload(db, item_approved),
        }

    item_list = [{
        "design_id": record.id,
        "ref": record.ref,
        "name": record.name,
        "category": _design_category(record),
        "system": _design_system(record),
        "qty": record.qty,
        "location": record.location,
        "created_at": (
            record.created_at.isoformat() if record.created_at else None),
    } for record in item_records]
    item_summary = {
        str(record.id): _item_summary_for(record.id) for record in item_records
    }
    if has_ungrouped_chain:
        item_list.append({
            "design_id": None,
            "ref": "",
            "name": "Ungrouped (pre-existing project chain)",
            "category": "",
            "system": "",
            "qty": None,
            "location": "",
            "created_at": None,
        })
        item_summary["null"] = _item_summary_for(None)
    extractions = sorted(
        project.extractions or [], key=lambda row: row.revision, reverse=True)
    extractions_by_id = {row.id: row for row in extractions}
    drawing_tasks = sorted(
        project.drawing_tasks or [], key=lambda row: row.created_at, reverse=True)
    releases = sorted(
        project.production_releases or [],
        key=lambda row: row.created_at, reverse=True)
    events = sorted(
        project.workflow_events or [],
        key=lambda row: row.created_at, reverse=True)
    return {
        "project": {
            **_project_payload(project),
            "drawing_release_percent": (
                project.drawing_release_percent
                if project.drawing_release_percent is not None else 80),
            "released_at": (
                project.released_at.isoformat()
                if project.released_at else None),
            "share_token": project_share_token(project.id),
        },
        "workflow_stages": [{
            "key": key,
            "label": WORKFLOW_LABELS[key],
            "complete": (
                WORKFLOW_STATUSES.index(key)
                < WORKFLOW_STATUSES.index(
                    project.workflow_status
                    if project.workflow_status in WORKFLOW_STATUSES
                    else "measurement_received")),
            "current": key == project.workflow_status,
        } for key in WORKFLOW_STATUSES],
        "payment_gate": payment,
        "qc_submission": {
            "released_to_technical_at": (
                project.released_to_technical_at.isoformat()
                if project.released_to_technical_at else None),
            "released_to_technical_by": project.released_to_technical_by,
            "released_to_qc_at": (
                project.released_to_qc_at.isoformat()
                if project.released_to_qc_at else None),
            "released_to_qc_by": project.released_to_qc_by,
            **_qc_readiness(project),
        },
        "procurement": _procurement_payload(db, approved_extraction),
        "preproduction_qc": _preproduction_qc_payload(db, project),
        "integrity": {
            "approved_extraction_id": (
                approved_extraction.id if approved_extraction else None),
            "approved_extraction_revision": (
                approved_extraction.revision if approved_extraction else None),
            "current_quote_id": current_quote.id if current_quote else None,
            "current_quote_number": (
                current_quote.quote_number if current_quote else None),
            "warnings": [
                *([(
                    f"Quotation review required: the accepted quotation is not "
                    f"based on approved extraction E{approved_extraction.revision}."
                )] if approved_extraction and any(
                    quote.status in ("Accepted", "Approved")
                    and quote.extraction_id != approved_extraction.id
                    for quote in project.quotes or []) and not current_quote else []),
                *([(
                    f"Drawing review required: an existing drawing task is not "
                    f"based on approved extraction E{approved_extraction.revision} "
                    "and its current accepted quotation."
                )] if approved_extraction and any(
                    task.extraction_id != approved_extraction.id
                    or task.quote_id != (current_quote.id if current_quote else None)
                    for task in drawing_tasks) and not any(
                        task.extraction_id == approved_extraction.id
                        and current_quote is not None
                        and task.quote_id == current_quote.id
                        for task in drawing_tasks) else []),
                *([(
                    "Factory release superseded: approve a drawing and issue a "
                    "new pack from the current extraction and quotation."
                )] if any(row.status == "superseded" for row in releases)
                    and not any(row.status == "current" for row in releases) else []),
            ],
        },
        "extractions": [_extraction_payload(row) for row in extractions],
        "drawing_tasks": [_drawing_task_payload(
            row, *_chain_ids_for(row.design_id))
            for row in drawing_tasks],
        "quotations": [{
            "id": quote.id,
            "quote_number": quote.quote_number,
            "extraction_id": quote.extraction_id,
            "extraction_ids": _quote_extraction_ids(quote),
            "product": quote.product,
            "total": quote.total,
            "deposit_percent": quote.deposit_percent,
            "status": quote.status,
            # Current only if every bundled item's extraction is still that
            # item's own currently-approved revision — not just a match
            # against the (single, legacy) project-wide "approved extraction",
            # which no longer means anything once items have their own chains.
            "basis_status": (
                "current" if quote.extraction_id and all(
                    (row := extractions_by_id.get(extraction_id)) is not None
                    and row.status == "approved"
                    for extraction_id in _quote_extraction_ids(quote))
                else "stale" if quote.extraction_id else "unlinked"),
            "requires_review": bool(quote.extraction_id) and not all(
                (row := extractions_by_id.get(extraction_id)) is not None
                and row.status == "approved"
                for extraction_id in _quote_extraction_ids(quote)),
            "job_number": quote.job.job_number if quote.job else None,
            "job_stage": quote.job.stage if quote.job else None,
            "job_stage_label": (
                lc.STAGE_LABEL.get(quote.job.stage, quote.job.stage)
                if quote.job else None),
            "job_completed_at": (
                quote.job.delivered_at.isoformat()
                if quote.job and quote.job.delivered_at else None),
            "created_at": (
                quote.created_at.isoformat() if quote.created_at else None),
        } for quote in sorted(
            project.quotes or [],
            key=lambda row: row.created_at, reverse=True)],
        "production_releases": [{
            "id": row.id,
            "design_id": row.design_id,
            "release_number": row.release_number,
            "status": row.status,
            "extraction_id": row.extraction_id,
            "extraction_revision": row.extraction_revision,
            "quote_id": row.quote_id,
            "quotation_number": row.quotation_number,
            "drawing_revision_id": row.drawing_revision_id,
            "drawing_revision": (
                row.drawing_revision_number
                if row.drawing_revision_number is not None
                else row.drawing_revision.revision),
            "files": json.loads(row.file_manifest or "[]"),
            "released_by": row.released_by,
            "notes": row.notes,
            "created_at": (
                row.created_at.isoformat() if row.created_at else None),
        } for row in releases],
        "events": [{
            "id": row.id,
            "who": row.who,
            "kind": row.kind,
            "note": row.note,
            "at": row.created_at.isoformat() if row.created_at else None,
        } for row in events[:50]],
        "items": item_list,
        "item_summary": item_summary,
        "workspace": _project_workspace_payload(db, project, payment),
    }


def _project_payload(project: models.Project) -> dict:
    """Return one project with item-level quotes and a roll-up total."""
    approved_extraction = _latest_approved_extraction(project)
    items = sorted(project.items or [], key=lambda item: item.created_at)
    quotes = sorted(project.quotes or [], key=lambda quote: quote.created_at)
    quotes_by_item = {}
    for quote in quotes:
        if quote.design_id is not None:
            quotes_by_item.setdefault(quote.design_id, []).append({
                "quote_number": quote.quote_number,
                "total": quote.total,
                "status": quote.status,
                "job_number": quote.job.job_number if quote.job else None,
                "created_at": quote.created_at.isoformat() if quote.created_at else None,
            })
    item_rows = []
    for item in items:
        item_rows.append({
            "id": item.id, "ref": item.ref, "name": item.name,
            "client_name": item.client_name, "qty": item.qty,
            "location": item.location, "total": item.total,
            "project_id": item.project_id,
            "quotes": quotes_by_item.get(item.id, []),
        })
    return {
        "id": project.id,
        "project_number": project.project_number,
        "name": project.name,
        "client_id": project.client_id,
        "client_name": project.client.name if project.client else "",
        "client_phone": project.client.phone if project.client else "",
        "location": project.location,
        "status": project.status,
        "product_family": project.product_family or "frame",
        "product_system": project.product_system or "",
        "workflow_status": project.workflow_status or "measurement_received",
        "workflow_status_label": WORKFLOW_LABELS.get(
            project.workflow_status, project.workflow_status),
        "extraction_method": project.extraction_method or "manual",
        "drawing_method": project.drawing_method or "configurator",
        "approved_extraction_revision": (
            approved_extraction.revision if approved_extraction else None),
        "item_count": len(item_rows),
        "total": round(sum(item["total"] for item in item_rows), 2),
        "quoted_total": round(sum(q.total for q in quotes), 2),
        "quotes": [{
            "quote_number": q.quote_number, "product": q.product,
            "total": q.total, "status": q.status,
            "design_id": q.design_id,
            "pricing_mode": q.pricing_mode,
            "created_at": q.created_at.isoformat() if q.created_at else None,
        } for q in quotes],
        "items": item_rows,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


def _project_client_quote_totals(project: models.Project) -> dict:
    """The one combined total the client actually sees for a project.

    Recalculated fresh from every saved design item — the same numbers the
    PROJECT QUOTATION PDF shows. This is also what Accounts bills against
    (_payment_authorization) and what a payment's outstanding balance is
    capped at, so the amount sent to Accounts can never drift from the
    amount quoted to the client again.
    """
    totals = {key: 0.0 for key in (
        "client_subtotal", "discount_amount", "client_net", "getf_nhis",
        "vat", "client_grand_total", "internal_floor",
    )}
    first_design = None
    total_labour_area = 0.0
    for item in sorted(project.items or [], key=lambda row: row.created_at):
        try:
            raw_design = json.loads(item.design_json)
            design = schemas.DesignIn(**raw_design).engine_dict()
            result = calc_any_quote(design)
        except Exception:
            raw_design, design, result = None, None, None
        if first_design is None and design is not None:
            first_design = design
        manual_price = float((raw_design or {}).get("manualSellingPrice", 0) or 0)
        is_manual = (raw_design or {}).get("pricingMode") == "manual" and manual_price > 0
        if is_manual:
            # A manual price is the agreed final figure for this item — it
            # doesn't go through the computed discount/tax cascade, so it
            # only contributes to subtotal and grand total, keeping
            # subtotal - discount + tax == grand_total true in aggregate.
            totals["client_subtotal"] += manual_price
            totals["client_grand_total"] += manual_price
            if result:
                total_labour_area += (float(result.get("area", 0) or 0)
                                       * float(result.get("qty", 1) or 1))
        elif result:
            # Frame prices in client_grand_total (post discount/VAT/GETF);
            # Frameless and Curtain Wall have no tax split and only ever
            # return grand_total — same figure, different key per engine.
            totals["client_grand_total"] += float(
                result.get("client_grand_total", result.get("grand_total", 0)) or 0)
            for key in totals:
                if key != "client_grand_total":
                    totals[key] += float(result.get(key, 0) or 0)
            total_labour_area += (float(result.get("area", 0) or 0)
                                   * float(result.get("qty", 1) or 1))
        else:
            # Preserve an older saved item's last known total even when its
            # payload predates the current schema and can't be recalculated.
            totals["client_grand_total"] += float(item.total or 0)

    # Labour is billed once for the whole project rather than folded into
    # each item's own price — one line sized off total project area, with
    # margin applied like any other cost head, then taxed the same way the
    # rest of the quote is (using the first item's rates as the project's).
    project_labour = total_labour_area * LABOUR_PER_M2
    project_labour_with_margin = project_labour * (1 + MARGIN_PCT / 100)
    discount_percent = max(0, float((first_design or {}).get("discount_percent", 0) or 0))
    getf_nhis_percent = max(0, float((first_design or {}).get("getf_nhis_percent", 5) or 0))
    vat_percent = max(0, float((first_design or {}).get("vat_percent", 15) or 0))
    labour_discount = project_labour_with_margin * discount_percent / 100
    labour_net = project_labour_with_margin - labour_discount
    labour_getf_nhis = labour_net * getf_nhis_percent / 100
    labour_vat = labour_net * vat_percent / 100
    totals["client_subtotal"] += project_labour_with_margin
    totals["discount_amount"] += labour_discount
    totals["client_net"] += labour_net
    totals["getf_nhis"] += labour_getf_nhis
    totals["vat"] += labour_vat
    totals["client_grand_total"] += labour_net + labour_getf_nhis + labour_vat
    totals["internal_floor"] += project_labour  # true cost, no margin — for the floor guardrail

    return {
        **{key: round(value, 2) for key, value in totals.items()},
        "project_labour": round(project_labour, 2),
        "project_labour_with_margin": round(project_labour_with_margin, 2),
        "project_labour_area": round(total_labour_area, 2),
        "deposit_percent": max(0, min(
            100, float((first_design or {}).get("deposit_percent") or 80))),
        "quote_valid_days": max(1, int(
            (first_design or {}).get("quote_valid_days") or 3)),
    }


def _project_quote_payload(project: models.Project) -> dict:
    """Build the current consolidated client quote for every saved item.

    Item-level quotes remain separate records. The project quotation is
    recalculated from each saved design so a previous quote revision cannot be
    counted twice in the consolidated total.
    """
    payload = _project_payload(project)
    records = {item.id: item for item in (project.items or [])}
    enriched_items = []
    for item in payload["items"]:
        record = records.get(item["id"])
        raw_design = json.loads(record.design_json) if record else {}
        try:
            design = schemas.DesignIn(**raw_design).engine_dict()
            result = calc_any_quote(design)
        except Exception:
            design = raw_design
            result = None
        approved_item_extraction = (
            _latest_approved_extraction(project, record.id) if record else None)
        current_item_quote = _current_commercial_quote(
            project, approved_item_extraction)
        if result and approved_item_extraction:
            result = _result_with_approved_extraction(
                result,
                approved_item_extraction,
                _quote_snapshot(current_item_quote)
                if current_item_quote else None,
            )
        row = {**item, "design": design, "result": result}
        manual_price = float(raw_design.get("manualSellingPrice", 0) or 0)
        if raw_design.get("pricingMode") == "manual" and manual_price > 0:
            row["total"] = manual_price
        elif result:
            row["total"] = result.get("client_grand_total", result.get("grand_total", 0))
        enriched_items.append(row)

    payload["items"] = enriched_items
    payload.update(_project_client_quote_totals(project))
    payload["total"] = payload["client_grand_total"]
    payload["project_quote_number"] = payload["project_number"]
    payload["effective_discount_percent"] = round(
        (payload["discount_amount"] / payload["client_subtotal"] * 100)
        if payload["client_subtotal"] else 0, 2)
    payload["effective_getf_nhis_percent"] = round(
        (payload["getf_nhis"] / payload["client_net"] * 100)
        if payload["client_net"] else 0, 2)
    payload["effective_vat_percent"] = round(
        (payload["vat"] / payload["client_net"] * 100)
        if payload["client_net"] else 0, 2)
    has_item_approved_extraction = any(
        (item.get("result") or {}).get("approved_extraction")
        for item in enriched_items)
    approved_extraction = (
        None if has_item_approved_extraction
        else _latest_approved_extraction(project))
    approved_payload = (
        _extraction_payload(approved_extraction)
        if approved_extraction else None)
    current_quote = _current_commercial_quote(project, approved_extraction)
    commercial = _quote_snapshot(current_quote) if current_quote else None
    if approved_payload and commercial:
        quoted_prices = {
            int(line["extraction_item_id"]): float(
                line.get("unit_price", 0) or 0)
            for line in commercial.get("lines", [])
            if line.get("extraction_item_id") is not None
        }
        for item in approved_payload["items"]:
            if item["id"] in quoted_prices:
                item["unit_price"] = quoted_prices[item["id"]]
                item["line_total"] = round(
                    item["quantity"] * item["unit_price"], 2)
        priced_material_total = round(sum(
            item["line_total"] for item in approved_payload["items"]), 2)
        service_charge_percent = float(commercial.get(
            "service_charge_percent",
            commercial.get("installation_percent", 0)) or 0)
        service_charge_amount = float(commercial.get(
            "service_charge_amount",
            commercial.get("installation_amount", 0)) or 0)
        approved_payload.update({
            "subtotal": priced_material_total,
            "pricing_source": "approved_quotation",
            "quotation_number": current_quote.quote_number,
            "service_charge_percent": service_charge_percent,
            "service_charge_amount": service_charge_amount,
            "priced_total": round(
                priced_material_total + service_charge_amount, 2),
        })
    payload["approved_extraction"] = approved_payload
    return payload


LEAD_STAGES = ("enquiry", "contacted", "quoted", "won", "lost")


def _lead_value(db: Session, lead: models.Lead) -> float:
    """See `list_leads` for why this isn't just `lead.estimated_value`."""
    if lead.project_id is None:
        return round(lead.estimated_value or 0.0, 2)
    total = db.scalar(
        select(func.sum(models.DesignRecord.total))
        .where(models.DesignRecord.project_id == lead.project_id)) or 0.0
    return round(float(total), 2)


def _mark_lead_won_on_payment(db: Session, project: models.Project | None) -> None:
    """A recorded payment against a converted lead's project is a won deal —
    Evans's own framing ("any payment from client is a deal won"). Does not
    touch a lead already resolved (`won`/`lost`), so a manual "lost" call
    after the fact is never silently reopened by a later payment."""
    if project is None:
        return
    lead = db.scalar(select(models.Lead).where(models.Lead.project_id == project.id))
    if lead is None or lead.stage in ("won", "lost"):
        return
    lead.stage = "won"
    lead.quoted_at = lead.quoted_at or datetime.utcnow()
    lead.closed_at = lead.closed_at or datetime.utcnow()
    lead.updated_at = datetime.utcnow()


def _lead_payload(lead: models.Lead, value: float) -> dict:
    return {
        "id": lead.id, "lead_number": lead.lead_number, "name": lead.name,
        "contact_name": lead.contact_name, "phone": lead.phone, "email": lead.email,
        "site": lead.site, "city": lead.city, "source": lead.source,
        "project_type": lead.project_type, "product_type": lead.product_type,
        "customer_size": lead.customer_size, "sales_executive": lead.sales_executive,
        "estimated_value": value, "stage": lead.stage,
        "lost_reason": lead.lost_reason, "note": lead.note,
        "expected_close": lead.expected_close,
        "client_id": lead.client_id, "project_id": lead.project_id,
        "quoted_at": lead.quoted_at.isoformat() if lead.quoted_at else None,
        "closed_at": lead.closed_at.isoformat() if lead.closed_at else None,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


@app.get("/api/leads")
def list_leads(db: Session = Depends(get_db)):
    """Every lead plus the aggregates the dashboard reports on."""
    leads = db.scalars(
        select(models.Lead).order_by(models.Lead.created_at.desc())).all()

    # A lead's pipeline value once it has a project is the real total of
    # that project's saved items/quotes — not `estimated_value`, which has
    # no UI to enter it and so is always its 0.0 default. This lets a
    # value show up automatically the moment a quote exists, and lets
    # staff compare quoted value against what Accounts has actually
    # collected (Accounts/Production track payments separately per job).
    project_ids = [lead.project_id for lead in leads if lead.project_id is not None]
    design_totals: dict[int, float] = {}
    if project_ids:
        design_totals = {
            project_id: float(total or 0)
            for project_id, total in db.execute(
                select(models.DesignRecord.project_id, func.sum(models.DesignRecord.total))
                .where(models.DesignRecord.project_id.in_(project_ids))
                .group_by(models.DesignRecord.project_id)
            ).all()
        }

    def value_of(lead):
        if lead.project_id is not None:
            return round(design_totals.get(lead.project_id, 0.0), 2)
        return round(lead.estimated_value or 0.0, 2)

    def totals(rows):
        return {"count": len(rows),
                "value": round(sum(value_of(row) for row in rows), 2)}

    quoted = [lead for lead in leads if lead.quoted_at is not None]
    won = [lead for lead in leads if lead.stage == "won"]
    lost = [lead for lead in leads if lead.stage == "lost"]

    def breakdown(field, rows):
        grouped: dict[str, dict] = {}
        for row in rows:
            key = (getattr(row, field) or "").strip() or "Not recorded"
            entry = grouped.setdefault(key, {"label": key, "count": 0, "value": 0.0})
            entry["count"] += 1
            entry["value"] = round(entry["value"] + value_of(row), 2)
        return sorted(grouped.values(), key=lambda entry: -entry["value"])

    return {
        "leads": [_lead_payload(lead, value_of(lead)) for lead in leads],
        "summary": {
            "created": totals(leads), "quoted": totals(quoted),
            "won": totals(won), "lost": totals(lost),
        },
        "by_source": breakdown("source", leads),
        "by_city": breakdown("city", leads),
        "by_product_type": breakdown("product_type", leads),
        "lost_reasons": breakdown("lost_reason", lost),
    }


@app.post("/api/leads")
def create_lead(req: schemas.LeadIn, db: Session = Depends(get_db)):
    if not req.name.strip():
        raise HTTPException(400, "Lead name is required")
    if req.stage not in LEAD_STAGES:
        raise HTTPException(400, f"Stage must be one of {', '.join(LEAD_STAGES)}")
    n = db.scalar(select(func.count(models.Lead.id))) or 0
    lead = models.Lead(
        lead_number=f"SOF-L-{datetime.now():%Y}-{n + 1:03d}",
        **{field: (value.strip() if isinstance(value, str) else value)
           for field, value in req.model_dump().items()},
    )
    if lead.stage in ("quoted", "won", "lost"):
        lead.quoted_at = datetime.utcnow()
    if lead.stage in ("won", "lost"):
        lead.closed_at = datetime.utcnow()
    db.add(lead); db.commit(); db.refresh(lead)
    return _lead_payload(lead, _lead_value(db, lead))


@app.patch("/api/leads/{lead_id}")
def update_lead(lead_id: int, req: schemas.LeadUpdate, db: Session = Depends(get_db)):
    lead = db.get(models.Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    changes = req.model_dump(exclude_unset=True)
    if "stage" in changes and changes["stage"] not in LEAD_STAGES:
        raise HTTPException(400, f"Stage must be one of {', '.join(LEAD_STAGES)}")
    for field, value in changes.items():
        setattr(lead, field, value.strip() if isinstance(value, str) else value)
    # timestamps are derived from the stage so conversion analytics stay honest
    if lead.stage in ("quoted", "won", "lost") and lead.quoted_at is None:
        lead.quoted_at = datetime.utcnow()
    if lead.stage in ("won", "lost"):
        lead.closed_at = lead.closed_at or datetime.utcnow()
    else:
        lead.closed_at = None
    if lead.stage != "lost":
        lead.lost_reason = ""
    lead.updated_at = datetime.utcnow()
    db.commit(); db.refresh(lead)
    return _lead_payload(lead, _lead_value(db, lead))


@app.post("/api/leads/{lead_id}/convert")
def convert_lead(lead_id: int, req: schemas.ProjectIn, db: Session = Depends(get_db)):
    """Turn a won lead into a client project, carrying its context forward."""
    lead = db.get(models.Lead, lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    if lead.project_id:
        raise HTTPException(409, f"{lead.lead_number} already has a project")
    project = create_project(req, db)
    lead.project_id = project["id"]
    lead.client_id = project.get("client_id")
    lead.stage = "won"
    lead.quoted_at = lead.quoted_at or datetime.utcnow()
    lead.closed_at = lead.closed_at or datetime.utcnow()
    lead.updated_at = datetime.utcnow()
    if lead.sales_executive:
        # carries the lead's assignee forward as the project's owner, so the
        # person who owned the lead is already on record as who builds the quote
        _workflow_log(db, _get_project(db, project["id"]), "project_assignment", _pm_note({
            "owner": lead.sales_executive, "team": "", "planned_start": "",
            "due_date": "", "priority": "normal",
        }), who="System")
    db.commit(); db.refresh(lead)
    return {"lead": _lead_payload(lead, _lead_value(db, lead)), "project": project}


@app.post("/api/projects")
def create_project(req: schemas.ProjectIn, db: Session = Depends(get_db)):
    """Create a project container under a client."""
    if not req.name.strip():
        raise HTTPException(400, "Project name is required")
    client = db.get(models.Client, req.client_id) if req.client_id else None
    if client is None and req.client_name.strip():
        client = db.scalar(select(models.Client).where(models.Client.name == req.client_name.strip()))
        if client is None:
            client = models.Client(name=req.client_name.strip())
            db.add(client); db.flush()
    n = db.scalar(select(func.count(models.Project.id))) or 0
    project = models.Project(
        project_number=f"SOF-P-{datetime.now():%Y}-{n + 1:03d}",
        name=req.name.strip(), client_id=client.id if client else None,
        location=req.location.strip(), status="draft",
        product_family=(
            req.product_family if req.product_family in PRODUCT_FAMILIES
            else "frame"),
        product_system=req.product_system.strip(),
        workflow_status="measurement_received",
    )
    db.add(project); db.flush()
    _workflow_log(
        db, project, "measurement",
        "project opened and site measurement workflow started",
        who="System")
    db.commit(); db.refresh(project)
    return _project_payload(project)


def _quote_workspace_meta(project: models.Project) -> dict:
    event = next((row for row in sorted(
        project.workflow_events or [], key=lambda row: row.created_at,
        reverse=True) if row.kind == "quote_workspace"), None)
    payload = _pm_payload(event.note) if event else None
    return payload or {"lead_id": None}


def _quote_workspace_payload(project: models.Project, lead: models.Lead | None) -> dict:
    meta = _quote_workspace_meta(project)
    management = _project_management_payload(project)
    quotes = sorted(project.quotes or [], key=lambda row: row.created_at)
    current_quotes = [row for row in quotes if row.status != "Declined"]
    default_quote = current_quotes[-1] if current_quotes else None
    if ((lead and lead.stage == "lost") or project.status in {"lost", "declined"}
            or (quotes and not current_quotes)):
        scope = "lost"
    elif ((lead and lead.stage == "won") or project.status == "accepted"
          or any(row.status in {"Accepted", "Approved"} for row in quotes)):
        scope = "won"
    else:
        scope = "active"

    total_area = 0.0
    total_qty = 0
    for record in project.items or []:
        total_qty += max(1, int(record.qty or 1))
        try:
            design = json.loads(record.design_json)
            total_area += (
                float(design.get("width", 0) or 0)
                * float(design.get("height", 0) or 0)
                / 1_000_000
                * max(1, int(record.qty or 1)))
        except (TypeError, ValueError, AttributeError):
            continue

    design_total = round(sum(float(row.total or 0) for row in project.items or []), 2)
    return {
        "project_id": project.id,
        "project_number": project.project_number,
        "project_name": project.name,
        "client_name": project.client.name if project.client else "Walk-in Client",
        "opportunity_id": lead.id if lead else meta.get("lead_id"),
        "opportunity_number": lead.lead_number if lead else None,
        "scope": scope,
        "deal_stage": lead.stage if lead else project.status,
        "default_quote": default_quote.quote_number if default_quote else None,
        "quote_count": len(quotes),
        "item_count": len(project.items or []),
        "quantity": total_qty,
        "area": round(total_area, 2),
        "value": design_total,
        "quote_value": design_total,
        "planned_start": management["planned_start"],
        "due_date": management["due_date"],
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@app.get("/api/quote-workspaces")
def list_quote_workspaces(db: Session = Depends(get_db)):
    projects = db.scalars(select(models.Project).order_by(
        models.Project.created_at.desc())).all()
    leads = db.scalars(select(models.Lead).where(
        models.Lead.project_id.is_not(None))).all()
    lead_by_project = {lead.project_id: lead for lead in leads}
    rows = []
    for project in projects:
        meta = _quote_workspace_meta(project)
        if not (meta.get("lead_id") or project.items or project.quotes):
            continue
        rows.append(_quote_workspace_payload(
            project, lead_by_project.get(project.id)))
    return rows


@app.post("/api/quote-workspaces")
def create_quote_workspace(
        req: schemas.QuoteWorkspaceIn, db: Session = Depends(get_db)):
    lead = db.get(models.Lead, req.lead_id)
    if lead is None:
        raise HTTPException(404, "Lead not found")
    if lead.stage == "lost":
        raise HTTPException(409, "A lost lead must be reopened before quoting")
    if lead.project_id:
        raise HTTPException(
            409, f"{lead.lead_number} already has a quote workspace")

    product_family = (
        "frameless" if "frameless" in lead.product_type.lower()
        else "balustrade" if "balustrade" in lead.product_type.lower()
        else "other" if "curtain" in lead.product_type.lower()
        else "frame")
    created = create_project(schemas.ProjectIn(
        name=lead.name,
        client_name=lead.contact_name or lead.name,
        location=lead.site or lead.city,
        product_family=product_family,
    ), db)
    project = db.get(models.Project, created["id"])
    project.extraction_method = "generated"
    if project.client:
        project.client.contact = lead.contact_name
        project.client.phone = lead.phone
        project.client.location = lead.site or lead.city

    lead.project_id = project.id
    lead.client_id = project.client_id
    if lead.stage not in {"won", "lost"}:
        lead.stage = "quoted"
        lead.closed_at = None
    lead.quoted_at = lead.quoted_at or datetime.utcnow()
    lead.updated_at = datetime.utcnow()
    _workflow_log(db, project, "quote_workspace", _pm_note({
        "lead_id": lead.id,
    }), who="Sales")
    db.commit(); db.refresh(project); db.refresh(lead)
    return _quote_workspace_payload(project, lead)


def _current_quote_workspace_quotes(project: models.Project) -> list[models.Quote]:
    """Return the newest persisted quote for every current design item."""
    latest_by_design: dict[int, models.Quote] = {}
    for quote in sorted(
            project.quotes or [], key=lambda row: (row.created_at, row.id)):
        if quote.design_id is not None:
            latest_by_design[quote.design_id] = quote
    return [latest_by_design[item.id] for item in project.items or []
            if item.id in latest_by_design]


def _process_quote_workspace_status(
        db: Session, project: models.Project, status: str, who: str,
        lost_reason: str = "") -> dict:
    """Shared core of a project-wide quote decision — used by the staff
    endpoint below and by the public client-accept endpoint (share links),
    so both paths run exactly the same guards and side effects."""
    reason = lost_reason.strip()
    if status == "Declined" and not reason:
        raise HTTPException(400, "A lost reason is required")
    if len(reason) > 160:
        raise HTTPException(400, "Lost reason must be 160 characters or fewer")

    quotes = _current_quote_workspace_quotes(project)
    if not project.items or len(quotes) != len(project.items):
        raise HTTPException(
            409, "Save measurements for every design before issuing the quotation")
    if any(quote.status in {"Accepted", "Approved"} for quote in quotes):
        if status == "Accepted" and all(
                quote.status in {"Accepted", "Approved"} for quote in quotes):
            return {
                "project_id": project.id,
                "status": "Accepted",
                "quote_numbers": [quote.quote_number for quote in quotes],
                "job_numbers": [quote.job.job_number for quote in quotes if quote.job],
            }
        raise HTTPException(
            409, "An accepted project quotation cannot be replaced; use the controlled change workflow")
    if any(quote.status == "Declined" for quote in quotes):
        raise HTTPException(
            409, "Revise the declined design and save it before recording a new decision")

    results = [
        _apply_quote_status(db, quote, status, who)
        for quote in quotes
    ]
    lead = db.scalar(select(models.Lead).where(
        models.Lead.project_id == project.id))
    now = datetime.utcnow()
    if lead:
        if status == "Accepted":
            lead.stage = "won"
            lead.lost_reason = ""
            lead.closed_at = now
        elif status == "Declined":
            lead.stage = "lost"
            lead.lost_reason = reason
            lead.closed_at = now
        else:
            lead.stage = "quoted"
            lead.lost_reason = ""
            lead.closed_at = None
        lead.quoted_at = lead.quoted_at or now
        lead.updated_at = now
    if status == "Declined":
        project.status = "lost"
        _workflow_log(
            db, project, "quote",
            f"client declined project quotation — {reason}", who=who)
    db.commit()
    return {
        "project_id": project.id,
        "status": status,
        "quote_numbers": [result["quote_number"] for result in results],
        "job_numbers": [result.get("job_number") for result in results
                        if result.get("job_number")],
    }


@app.post("/api/quote-workspaces/{project_id}/status")
def update_quote_workspace_status(
        project_id: int, req: schemas.QuoteWorkspaceStatusIn,
        db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Quote workspace not found")
    if req.status not in {"Sent", "Accepted", "Declined"}:
        raise HTTPException(400, "status must be Sent|Accepted|Declined")
    return _process_quote_workspace_status(
        db, project, req.status, req.who, req.lost_reason)


@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    return [_project_payload(project) for project in db.scalars(
        select(models.Project).order_by(models.Project.created_at.desc())
    ).all()]


@app.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return _project_payload(project)


def _get_project(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def _materials_by_code(db: Session) -> dict:
    """Live Inventory prices, for calc_any_quote's frame material take-off.
    The backend queries Supabase directly here — no frontend-style cache."""
    return {
        m.code: {"name": m.name, "unit": m.unit, "unit_price": m.unit_price}
        for m in db.query(models.Material).all()
    }


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a project with everything drafted under it.

    Blocked once a factory job exists — that job carries production and
    payment records, so it must be cancelled from the job, not by removing
    the project underneath it.
    """
    project = _get_project(db, project_id)
    if project.jobs:
        raise HTTPException(
            409,
            "This project already has a factory job — cancel the job before "
            "deleting the project.")
    items = list(project.items)
    quotes = {quote.id: quote for quote in project.quotes}
    for item in items:
        for quote in item.quotes:
            quotes[quote.id] = quote
    # Delete children before their parents so the FK graph stays valid on
    # Postgres: releases → drawing tasks → quotes → extractions → items.
    for release in list(project.production_releases):
        db.delete(release)
    for task in list(project.drawing_tasks):
        db.delete(task)
    db.flush()
    for quote in quotes.values():
        db.delete(quote)
    for extraction in list(project.extractions):
        db.delete(extraction)
    db.flush()
    for item in items:
        db.delete(item)
    db.flush()
    project_number = project.project_number
    db.delete(project)
    db.commit()
    return {"deleted": True, "project_number": project_number,
            "items_deleted": len(items), "quotes_deleted": len(quotes)}


@app.get("/api/projects/{project_id}/workflow")
def get_project_workflow(project_id: int, db: Session = Depends(get_db)):
    return _technical_workflow_payload(db, _get_project(db, project_id))


@app.get("/api/preproduction-qc")
def list_preproduction_qc(db: Session = Depends(get_db)):
    projects = db.scalars(select(models.Project).order_by(
        models.Project.created_at.desc())).all()
    return [_preproduction_qc_payload(db, project) for project in projects]


@app.get("/api/projects/{project_id}/preproduction-qc")
def get_preproduction_qc(project_id: int, db: Session = Depends(get_db)):
    return _preproduction_qc_payload(db, _get_project(db, project_id))


@app.get("/api/drawings/queue")
def list_drawings_queue(db: Session = Depends(get_db)):
    projects = db.scalars(select(models.Project).where(
        models.Project.released_to_technical_at.isnot(None)
    ).order_by(models.Project.released_to_technical_at.desc())).all()
    return [_drawing_queue_payload(project) for project in projects]


@app.post("/api/projects/{project_id}/preproduction-qc")
def record_preproduction_qc(
        project_id: int, req: schemas.PreProductionQcIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    result = req.result.strip().lower()
    if result not in {"approved", "hold"}:
        raise HTTPException(400, "result must be approved|hold")
    inspector = req.inspector.strip()
    notes = req.notes.strip()
    if not inspector:
        raise HTTPException(400, "inspector is required")
    if len(inspector) > 60:
        raise HTTPException(400, "inspector must be 60 characters or fewer")
    if len(notes) > 160:
        raise HTTPException(400, "notes must be 160 characters or fewer")
    if result == "hold" and not notes:
        raise HTTPException(400, "Explain why the project is on hold")

    gate = _preproduction_qc_payload(db, project)
    checklist = {
        "m": req.measurements_verified,
        "mat": req.materials_verified,
        "qty": req.quantities_verified,
        "drw": req.drawings_verified,
        "proc": req.procurement_verified,
    }
    if result == "approved":
        if gate["issues"]:
            raise HTTPException(
                409, "Pre-production QC cannot approve this project: "
                + "; ".join(gate["issues"]))
        if not all(checklist.values()):
            raise HTTPException(
                400, "Every pre-production QC checklist item must be verified")

    releases = []
    if result == "approved":
        releases = _release_project_to_factory(
            db, project, released_by=inspector,
            notes="Released to factory floor by pre-production QC approval.")
        # Auto-confirming a missing drawing changes the exact inputs the QC
        # snapshot hashes (each item's drawing revision). The session cached
        # `project.drawing_tasks` when `gate` was first computed above, and a
        # flush alone doesn't invalidate that — expire it so the recompute
        # actually observes the new drawing, instead of being marked stale
        # by its own side effect.
        db.expire(project)
        gate = _preproduction_qc_payload(db, project)

    _workflow_log(db, project, "preproduction_qc", _pm_note({
        "r": result,
        "s": gate["snapshot_hash"],
        "c": checklist,
        "n": notes,
        "i": inspector,
        "count": gate["item_count"],
    }), inspector)
    if releases:
        _workflow_log(
            db, project, "release",
            "released to factory on QC approval: " + ", ".join(
                f"{release.release_number} (drawing R"
                f"{release.drawing_revision_number})" for release in releases),
            who=inspector)
    db.commit()
    return _preproduction_qc_payload(db, project)


@app.get("/api/team")
def list_team(db: Session = Depends(get_db)):
    return [{"id": user.id, "name": user.name, "role": user.role,
             "phone": user.phone}
            for user in db.scalars(select(models.User).order_by(
                models.User.role, models.User.name)).all()]


@app.put("/api/projects/{project_id}/management")
def update_project_management(
        project_id: int, req: schemas.ProjectManagementIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if req.priority not in _PROJECT_PRIORITIES:
        raise HTTPException(400, "priority must be normal|high|urgent")
    planned_start = _valid_date(req.planned_start, "planned_start")
    due_date = _valid_date(req.due_date, "due_date")
    if planned_start and due_date and due_date < planned_start:
        raise HTTPException(400, "due_date cannot be before planned_start")
    current = _project_management_payload(project)
    schedule_changed = (
        planned_start != current["planned_start"]
        or due_date != current["due_date"])
    if schedule_changed and (planned_start or due_date):
        schedule = _project_schedule_authorization(db, project)
        if not schedule["authorized"]:
            raise HTTPException(409, schedule["reason"])
    payload = {
        "owner": req.owner.strip(), "team": req.team.strip(),
        "planned_start": planned_start, "due_date": due_date,
        "priority": req.priority,
    }
    _workflow_log(db, project, "project_assignment", _pm_note(payload), req.who)
    db.commit()
    return _project_management_payload(project)


@app.patch("/api/projects/{project_id}/board-position")
def set_project_board_position(
        project_id: int, req: schemas.BoardPositionIn,
        db: Session = Depends(get_db)):
    """Manual drag-and-drop on the Projects board. Purely a display
    position — it never touches payment/drawing/QC state, so it can't be
    used to skip a real gate. See `_board_stage` for how it's discarded once
    automation catches up."""
    project = _get_project(db, project_id)
    if req.stage not in BOARD_STAGES:
        raise HTTPException(400, "Unknown board column")
    workspace = _project_workspace_payload(
        db, project, _payment_authorization(db, project))
    auto_stage = _board_stage_auto(workspace)
    payload = {
        "stage": "" if req.stage == auto_stage else req.stage,
        "base_stage": "" if req.stage == auto_stage else auto_stage,
    }
    _workflow_log(db, project, "board_position", _pm_note(payload), req.who)
    db.commit()
    return {"stage": req.stage}


@app.post("/api/projects/{project_id}/tasks")
def create_project_task(
        project_id: int, req: schemas.ProjectTaskIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if not req.department.strip() or not req.title.strip():
        raise HTTPException(400, "department and title are required")
    if req.status not in _TASK_STATUSES:
        raise HTTPException(400, "status must be todo|in_progress|blocked|done")
    payload = {
        "department": req.department.strip(), "title": req.title.strip(),
        "assignee": req.assignee.strip(),
        "due_date": _valid_date(req.due_date, "due_date"),
        "status": req.status, "notes": req.notes.strip(),
    }
    _workflow_log(db, project, "project_task", _pm_note(payload), req.who)
    db.commit()
    return _project_management_payload(project)


@app.put("/api/projects/{project_id}/tasks/{task_id}")
def update_project_task(
        project_id: int, task_id: int, req: schemas.ProjectTaskUpdateIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    task_event = db.get(models.WorkflowEvent, task_id)
    if (task_event is None or task_event.project_id != project.id
            or task_event.kind != "project_task"):
        raise HTTPException(404, "Project task not found")
    if req.status not in _TASK_STATUSES:
        raise HTTPException(400, "status must be todo|in_progress|blocked|done")
    payload = {"task_id": task_id, "status": req.status}
    if req.assignee is not None:
        payload["assignee"] = req.assignee.strip()
    if req.due_date is not None:
        payload["due_date"] = _valid_date(req.due_date, "due_date")
    if req.notes is not None:
        payload["notes"] = req.notes.strip()
    _workflow_log(db, project, "project_task_update", _pm_note(payload), req.who)
    db.commit()
    return _project_management_payload(project)


@app.get("/api/surveys")
def list_site_surveys(db: Session = Depends(get_db)):
    projects = db.scalars(select(models.Project).order_by(
        models.Project.created_at.desc())).all()
    surveys = [
        survey for project in projects for survey in _project_surveys(project)]
    surveys.sort(key=lambda row: (
        row["status"] in {"completed", "cancelled"},
        row["scheduled_for"] or "9999-12-31T23:59", row["id"]))
    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=7)

    def scheduled_date(row):
        try:
            return datetime.fromisoformat(row["scheduled_for"]).date()
        except (TypeError, ValueError):
            return None

    active = [row for row in surveys
              if row["status"] not in {"completed", "cancelled"}]
    next_survey = next((row for row in active
                        if row["scheduled_for"] >= datetime.now().isoformat(
                            timespec="minutes")), None)
    return {
        "surveys": surveys,
        "stats": {
            "this_week": sum(
                1 for row in surveys
                if (day := scheduled_date(row)) is not None
                and week_start <= day < week_end),
            "completed": sum(1 for row in surveys if row["status"] == "completed"),
            "scheduled": sum(1 for row in surveys if row["status"] == "scheduled"),
            "in_progress": sum(1 for row in surveys if row["status"] == "in_progress"),
            "overdue": sum(1 for row in surveys if row["overdue"]),
            "next": next_survey["scheduled_for"] if next_survey else None,
        },
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


@app.post("/api/projects/{project_id}/surveys")
def create_site_survey(
        project_id: int, req: schemas.SiteSurveyIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    assigned_to = req.assigned_to.strip()
    if not assigned_to:
        raise HTTPException(400, "assigned_to is required")
    if req.units < 0:
        raise HTTPException(400, "units cannot be negative")
    payload = {
        "scheduled_for": _valid_datetime(
            req.scheduled_for, "scheduled_for"),
        "assigned_to": assigned_to,
        "units": req.units,
        "notes": req.notes.strip(),
        "status": "scheduled",
    }
    event = _workflow_log(
        db, project, "site_survey", _pm_note(payload), req.who)
    if not project.items and not project.extractions and not project.quotes:
        project.workflow_status = "survey_scheduled"
    db.commit()
    surveys = _project_surveys(project)
    return {
        "survey": next(row for row in surveys if row["id"] == event.id),
        "surveys": surveys,
    }


@app.put("/api/projects/{project_id}/surveys/{survey_id}")
def update_site_survey(
        project_id: int, survey_id: int, req: schemas.SiteSurveyUpdateIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    survey_event = db.get(models.WorkflowEvent, survey_id)
    if (survey_event is None or survey_event.project_id != project.id
            or survey_event.kind != "site_survey"):
        raise HTTPException(404, "Site survey not found")
    payload: dict = {"survey_id": survey_id}
    if req.status is not None:
        if req.status not in _SURVEY_STATUSES:
            raise HTTPException(
                400, "status must be scheduled|in_progress|completed|cancelled")
        payload["status"] = req.status
        if req.status == "completed":
            payload["completed_at"] = datetime.now().isoformat(
                timespec="seconds")
            if project.workflow_status == "survey_scheduled":
                project.workflow_status = "measurement_received"
    if req.scheduled_for is not None:
        payload["scheduled_for"] = _valid_datetime(
            req.scheduled_for, "scheduled_for")
    if req.assigned_to is not None:
        assigned_to = req.assigned_to.strip()
        if not assigned_to:
            raise HTTPException(400, "assigned_to is required")
        payload["assigned_to"] = assigned_to
    if req.units is not None:
        if req.units < 0:
            raise HTTPException(400, "units cannot be negative")
        payload["units"] = req.units
    if req.notes is not None:
        payload["notes"] = req.notes.strip()
    if req.variance is not None:
        payload["variance"] = req.variance.strip()
    if len(payload) == 1:
        raise HTTPException(400, "No survey changes supplied")
    _workflow_log(
        db, project, "site_survey_update", _pm_note(payload), req.who)
    db.commit()
    surveys = _project_surveys(project)
    return {
        "survey": next(row for row in surveys if row["id"] == survey_id),
        "surveys": surveys,
    }


BOARD_STAGES = ("measurement", "quotation", "awaiting_payment", "paid_technical",
                "production", "qa", "dispatch", "delivered")


def _board_stage_auto(workspace: dict) -> str:
    stage = workspace["next_action"]["stage"]
    if stage in ("measurement", "design"):
        return "measurement"
    if stage == "quotation":
        return "quotation"
    if stage == "payment":
        return "awaiting_payment"
    if stage in ("accounts_release", "drawing", "submit_to_qc", "procurement",
                 "preproduction_qc", "release"):
        return "paid_technical"
    if stage == "production":
        return "production"
    if stage == "qa":
        return "qa"
    if stage == "dispatch":
        return "dispatch"
    return "delivered"


def _board_stage(workspace: dict) -> str:
    """Automated pipeline stage, unless someone dragged the card manually on
    the board (see set_project_board_position) and automation hasn't moved
    the project past the stage it was dragged away from yet — once it does,
    the manual position is discarded and the card follows automation again.
    """
    auto = _board_stage_auto(workspace)
    management = workspace.get("management") or {}
    override = management.get("board_stage")
    if override and management.get("board_stage_base") == auto:
        return override
    return auto


@app.get("/api/project-board")
def project_board(db: Session = Depends(get_db)):
    projects = db.scalars(select(models.Project).order_by(
        models.Project.created_at.desc())).all()
    cards = []
    for project in projects:
        workspace = _project_workspace_payload(
            db, project, _payment_authorization(db, project))
        cards.append({
            "id": project.id,
            "project_number": project.project_number,
            "name": project.name,
            "client_name": workspace["header"]["client_name"],
            "site": workspace["header"]["site"],
            "stage": _board_stage(workspace),
            "status_label": workspace["header"]["status_label"],
            "owner": workspace["header"]["owner"],
            "team": workspace["header"].get("team"),
            "planned_start": workspace["header"]["planned_start"],
            "due_date": workspace["header"]["due_date"],
            "priority": workspace["header"].get("priority", "normal"),
            "waiting_days": workspace["header"]["waiting_days"],
            "next_action": workspace["next_action"],
            "commercial": workspace["commercial"],
            "item_count": workspace["rollups"]["items"]["count"],
            "open_task_count": workspace["management"]["open_task_count"],
            "overdue_task_count": workspace["management"]["overdue_task_count"],
            "alert_count": len(workspace["alerts"]),
            "serious_alert": next((alert for alert in workspace["alerts"]
                                   if alert["severity"] == "critical"),
                                  workspace["alerts"][0] if workspace["alerts"] else None),
        })
    return {"cards": cards}


@app.post("/api/projects/{project_id}/workflow")
def update_project_workflow(project_id: int, req: schemas.ProjectWorkflowIn,
                            db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    changes = []
    if req.product_family is not None:
        if req.product_family not in PRODUCT_FAMILIES:
            raise HTTPException(400, "Unsupported product family")
        project.product_family = req.product_family
        changes.append(f"product family: {req.product_family}")
    if req.product_system is not None:
        project.product_system = req.product_system.strip()
        changes.append(f"system: {project.product_system or 'not selected'}")
    if req.extraction_method is not None:
        if req.extraction_method not in EXTRACTION_METHODS:
            raise HTTPException(400, "extraction_method must be manual|generated|hybrid")
        project.extraction_method = req.extraction_method
        changes.append(f"extraction: {req.extraction_method}")
    if req.drawing_method is not None:
        if req.drawing_method not in DRAWING_METHODS:
            raise HTTPException(400, "drawing_method must be configurator|autocad")
        project.drawing_method = req.drawing_method
        changes.append(f"drawing: {req.drawing_method}")
    if req.drawing_release_percent is not None:
        if not 0 <= req.drawing_release_percent <= 100:
            raise HTTPException(400, "drawing_release_percent must be 0-100")
        project.drawing_release_percent = req.drawing_release_percent
        changes.append(
            f"drawing payment threshold: {req.drawing_release_percent:g}%")
    if req.workflow_status is not None:
        if req.workflow_status not in WORKFLOW_STATUSES:
            raise HTTPException(400, "Unsupported workflow status")
        protected = {
            "drawing_in_progress": bool(project.drawing_tasks),
            "drawing_under_review": any(
                task.revisions for task in (project.drawing_tasks or [])),
            "drawing_approved": any(
                revision.status == "approved"
                for task in (project.drawing_tasks or [])
                for revision in (task.revisions or [])),
            "released_to_factory": bool(project.production_releases),
        }
        if req.workflow_status in protected and not protected[req.workflow_status]:
            raise HTTPException(
                409,
                f"{WORKFLOW_LABELS[req.workflow_status]} is set by its workflow action")
        if req.workflow_status in (
                "drawing_authorized", "drawing_in_progress",
                "drawing_under_review", "client_overview_sent",
                "drawing_approved", "production_pack_ready",
                "released_to_factory") and project.released_to_technical_at is None:
            raise HTTPException(
                409, "Accounts must release this project to Technical first")
        project.workflow_status = req.workflow_status
        changes.append(f"status: {WORKFLOW_LABELS[req.workflow_status]}")
    if changes:
        _workflow_log(
            db, project, "workflow", "; ".join(changes), who=req.who)
    db.commit()
    return _technical_workflow_payload(db, project)


def _finalize_extraction(
        db: Session, extraction: models.TechnicalExtraction,
        project: models.Project, approved_by: str,
        reset_workflow_status: bool = True) -> bool:
    """Extraction has no separate manual sign-off anymore — this runs at
    creation time and does what the old `approve_extraction` endpoint used
    to do: supersede any prior approved extraction on the same item's chain
    and mark dependent drawing tasks/releases stale. Returns True if
    downstream work existed that this invalidates, for the log message.

    `reset_workflow_status=False` skips moving the project's Technical
    Workflow stepper — used when an extraction is auto-generated as a
    side effect of a project that never used Technical Workflow (the
    quick quote-from-design path), where rewinding an already-later
    `workflow_status` back to "extraction_ready" would be a confusing
    regression, not a real technical-review step.
    """
    siblings = db.query(models.TechnicalExtraction).filter_by(
        project_id=project.id, design_id=extraction.design_id).all()
    sibling_ids = {row.id for row in siblings}
    downstream_exists = bool(
        any(task.design_id == extraction.design_id
            for task in project.drawing_tasks or [])
        or any(release.design_id == extraction.design_id
               for release in project.production_releases or [])
        or any(sibling_ids.intersection(_quote_extraction_ids(quote))
               for quote in project.quotes or []))
    for other in siblings:
        if other.id != extraction.id and other.status == "approved":
            other.status = "superseded"
    for task in project.drawing_tasks or []:
        if task.design_id == extraction.design_id and task.extraction_id != extraction.id:
            task.status = "stale_extraction"
    for release in project.production_releases or []:
        if release.design_id == extraction.design_id and release.status == "current":
            release.status = "superseded"
    extraction.status = "approved"
    extraction.approved_by = approved_by
    extraction.approved_at = datetime.utcnow()
    if reset_workflow_status:
        project.workflow_status = "extraction_ready"
        project.released_at = None
    return downstream_exists


@app.post("/api/projects/{project_id}/extractions")
def create_extraction(project_id: int, req: schemas.ExtractionIn,
                      db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if req.method not in EXTRACTION_METHODS:
        raise HTTPException(400, "method must be manual|generated|hybrid")
    if req.recipe_status not in RECIPE_STATUSES:
        raise HTTPException(400, "recipe_status must be manual|provisional|approved")
    if not req.items:
        raise HTTPException(400, "Add at least one extraction material")
    if any(not item.material.strip() or item.quantity <= 0 for item in req.items):
        raise HTTPException(400, "Every material needs a name and positive quantity")
    if req.design_id is not None:
        record = db.get(models.DesignRecord, req.design_id)
        if record is None or record.project_id != project.id:
            raise HTTPException(400, "Design does not belong to this project")
    elif len(project.items or []) > 1:
        raise HTTPException(
            409,
            "This project has more than one item — select which item this "
            "extraction is for")
    revision = max(
        [row.revision for row in (project.extractions or [])
         if row.design_id == req.design_id] or [0]) + 1
    extraction = models.TechnicalExtraction(
        project_id=project.id,
        design_id=req.design_id,
        revision=revision,
        method=req.method,
        recipe_status=req.recipe_status,
        status="draft",
        notes=req.notes.strip(),
        created_by=req.created_by.strip(),
    )
    db.add(extraction); db.flush()
    for item in req.items:
        db.add(models.ExtractionItem(
            extraction_id=extraction.id,
            code=item.code.strip(),
            material=item.material.strip(),
            category=item.category.strip() or "Material",
            quantity=item.quantity,
            unit=item.unit.strip() or "pcs",
            unit_price=max(0, item.unit_price),
            source=(
                item.source if item.source in EXTRACTION_METHODS
                else req.method),
            notes=item.notes.strip(),
        ))
    db.flush()
    downstream_exists = _finalize_extraction(
        db, extraction, project, req.created_by.strip())
    project.extraction_method = req.method
    _workflow_log(
        db, project, "extraction",
        f"created and approved extraction revision E{revision} with {len(req.items)} material rows ({req.method})"
        + (
            "; previous quotation, drawing and release records require review"
            if downstream_exists else ""),
        who=req.created_by)
    db.commit(); db.refresh(extraction)
    return _technical_workflow_payload(db, project)


def _generate_extraction_for_record(
        db: Session, project: models.Project, record: models.DesignRecord,
        extraction_design_id: int | None, created_by: str, notes: str = "",
        reset_workflow_status: bool = True,
) -> tuple[models.TechnicalExtraction | None, bool]:
    """Build and approve a material take-off generated from one saved
    project item's design. `record` is the item to read the design/geometry
    from; `extraction_design_id` is the chain key the extraction is filed
    under (usually `record.id`, but `None` for the legacy ungrouped chain —
    see `_qc_item_scopes`). Returns `(extraction, downstream_exists)`;
    `extraction` is `None` if the design produced no extractable rows.
    """
    design_schema = schemas.DesignIn(**json.loads(record.design_json))
    design = design_schema.engine_dict()
    result = calc_any_quote(design, _materials_by_code(db))
    qty = max(1, int(design.get("qty") or 1))
    rows = []
    if result.get("material_rows"):
        rows = [{
            "code": item.get("code", ""),
            "material": item.get("description") or item.get("name") or "Material",
            "category": item.get("category", "Material"),
            "quantity": float(item.get("quantity", 0) or 0),
            "unit": item.get("unit", "pcs"),
            "unit_price": float(item.get("unit_price", 0) or 0),
            "source": "generated",
        } for item in result["material_rows"]
            if float(item.get("quantity", 0) or 0) > 0]
    elif design.get("category") == "frameless":
        breakdown = frameless_breakdown(design)
        glass = breakdown["glass"]
        rows.append({
            "code": glass.get("id", design.get("glass_id", "")),
            "material": glass.get("label", "Tempered glass"),
            "category": "Glass",
            "quantity": round(breakdown["total_area"] * qty, 3),
            "unit": "m2",
            "unit_price": float(glass.get("price", 0) or 0),
            "source": "generated",
        })
        rows.extend({
            "code": item.get("code", ""),
            "material": item.get("name", item.get("code", "Hardware")),
            "category": "Hardware",
            "quantity": float(item.get("qty", 0) or 0) * qty,
            "unit": "pcs",
            "unit_price": float(item.get("price", 0) or 0),
            "source": "generated",
        } for item in breakdown.get("hardware", [])
            if float(item.get("qty", 0) or 0) > 0)
    else:
        profile_metres = {}
        for piece in extract_pieces_any(design):
            key = piece.get("profile") or "profile"
            profile_metres[key] = (
                profile_metres.get(key, 0)
                + float(piece.get("length_mm", 0))
                * float(piece.get("qty", 1)) * qty / 1000)
        rows.extend({
            "code": code,
            "material": code.replace("_", " ").title(),
            "category": "Profile",
            "quantity": round(length, 3),
            "unit": "m",
            "unit_price": 0,
            "source": "generated",
        } for code, length in profile_metres.items() if length > 0)
        rows.append({
            "code": "",
            "material": "Glass",
            "category": "Glass",
            "quantity": round(
                design["width"] * design["height"] / 1_000_000 * qty, 3),
            "unit": "m2",
            "unit_price": 0,
            "source": "generated",
        })
    if not rows:
        return None, False
    revision_number = max(
        [row.revision for row in (project.extractions or [])
         if row.design_id == extraction_design_id] or [0]) + 1
    extraction = models.TechnicalExtraction(
        project_id=project.id,
        design_id=extraction_design_id,
        revision=revision_number,
        method="generated",
        recipe_status="provisional",
        status="draft",
        notes=notes.strip() or (
            f"Generated from configurator item {record.ref or record.name}."),
        created_by=created_by.strip(),
    )
    db.add(extraction); db.flush()
    for item in rows:
        db.add(models.ExtractionItem(
            extraction_id=extraction.id, **item))
    db.flush()
    downstream_exists = _finalize_extraction(
        db, extraction, project, created_by.strip() or "System (auto)",
        reset_workflow_status=reset_workflow_status)
    project.extraction_method = "generated"
    return extraction, downstream_exists


@app.post("/api/projects/{project_id}/extractions/from-design")
def generate_extraction_from_design(
        project_id: int, req: schemas.GeneratedExtractionIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    items = project.items or []
    if req.design_id is not None:
        record = db.get(models.DesignRecord, req.design_id)
        if record is None or record.project_id != project.id:
            raise HTTPException(400, "Design does not belong to this project")
    elif len(items) > 1:
        raise HTTPException(
            409,
            "This project has more than one item — select which item to "
            "generate materials for")
    else:
        record = next(iter(sorted(
            items, key=lambda row: row.created_at, reverse=True)), None)
    if record is None:
        raise HTTPException(409, "Save a configurator item in this project first")
    extraction, downstream_exists = _generate_extraction_for_record(
        db, project, record, req.design_id, req.created_by, req.notes)
    if extraction is None:
        raise HTTPException(409, "This configurator item produced no extraction rows")
    _workflow_log(
        db, project, "extraction",
        f"generated and approved extraction E{extraction.revision} from configurator item {record.ref or record.name}"
        + (
            "; previous quotation, drawing and release records require review"
            if downstream_exists else ""),
        who=req.created_by or "System (auto)")
    db.commit()
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/extractions/assign-to-item")
def assign_ungrouped_extractions_to_item(
        project_id: int, req: schemas.AssignExtractionsToItemIn,
        db: Session = Depends(get_db)):
    """Hand a project's pre-per-item-scoping extraction chain to one item.

    Projects created before per-item scoping have their whole extraction
    chain tagged design_id=None. Once a project has more than one item that
    chain is ambiguous — this makes the (previously implicit) assumption
    explicit by having a technical person confirm which item it was really
    for, instead of the system guessing.
    """
    project = _get_project(db, project_id)
    record = db.get(models.DesignRecord, req.design_id)
    if record is None or record.project_id != project.id:
        raise HTTPException(400, "Design does not belong to this project")
    ungrouped = [row for row in project.extractions or [] if row.design_id is None]
    if not ungrouped:
        raise HTTPException(409, "This project has no ungrouped extraction chain")
    if any(row.design_id == req.design_id for row in project.extractions or []):
        raise HTTPException(
            409,
            "This item already has its own extraction chain — the ungrouped "
            "chain must belong to a different item")
    for row in ungrouped:
        row.design_id = req.design_id
    for task in project.drawing_tasks or []:
        if task.design_id is None:
            task.design_id = req.design_id
    for release in project.production_releases or []:
        if release.design_id is None:
            release.design_id = req.design_id
    _workflow_log(
        db, project, "extraction",
        f"assigned the existing extraction/drawing chain to item "
        f"{record.ref or record.name}",
        who=req.who)
    db.commit()
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/quotes/from-extraction")
def create_quote_from_extraction(
        project_id: int, req: schemas.ExtractionQuoteIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    extraction = db.get(models.TechnicalExtraction, req.extraction_id)
    if extraction is None or extraction.project_id != project.id:
        raise HTTPException(400, "Extraction does not belong to this project")
    if extraction.status != "approved":
        raise HTTPException(409, "Approve the extraction before quotation")
    extra_extractions = []
    for extra_id in req.extra_extraction_ids:
        extra = db.get(models.TechnicalExtraction, extra_id)
        if extra is None or extra.project_id != project.id:
            raise HTTPException(
                400, "A bundled extraction does not belong to this project")
        if extra.status != "approved":
            raise HTTPException(
                409, "Every bundled item's extraction must be approved before quotation")
        extra_extractions.append(extra)
    extractions = [extraction] + extra_extractions
    if not req.product.strip():
        raise HTTPException(400, "Product description is required")
    snapshot = _build_commercial_snapshot(extractions, req)
    n = db.scalar(select(func.count(models.Quote.id))) or 0
    quote_number = f"SOF-Q-{datetime.now():%Y}-{n + 143:04d}"
    client_name = (
        project.client.name if project.client else "Walk-in Client")
    snapshot_record = models.DesignRecord(
        ref=f"__QUOTE__{quote_number}",
        name=f"Quotation snapshot {quote_number}",
        client_name=client_name,
        qty=1,
        location=project.location,
        total=snapshot["grand_total"],
        design_json=json.dumps({
            "record_kind": QUOTE_SNAPSHOT_KIND,
            "commercial": snapshot,
        }),
        # Commercial snapshots are linked through Quote, not through the
        # configurator's project item collection.
        project_id=None,
    )
    db.add(snapshot_record)
    db.flush()
    quote = models.Quote(
        quote_number=quote_number,
        project_id=project.id,
        design_id=snapshot_record.id,
        extraction_id=extraction.id,
        extra_extraction_ids=json.dumps([row.id for row in extra_extractions]),
        client_name=client_name,
        product=req.product.strip(),
        total=snapshot["grand_total"],
        deposit_percent=req.deposit_percent,
        status="Draft",
    )
    db.add(quote)
    project.workflow_status = "quote_in_preparation"
    revision_label = "+".join(f"E{row.revision}" for row in extractions)
    _workflow_log(
        db, project, "quote",
        f"prepared itemised draft quotation {quote.quote_number} from extraction {revision_label}",
        who=req.created_by)
    db.commit(); db.refresh(quote)
    return _technical_workflow_payload(db, project)


@app.put("/api/quotes/{quote_number}/commercial")
def update_quote_from_extraction(
        quote_number: str, req: schemas.ExtractionQuoteIn,
        db: Session = Depends(get_db)):
    """Edit an itemised draft quotation in place before it is sent.

    The quote number is kept so a draft can be corrected without leaving
    abandoned revisions behind. Once a quotation has been sent or accepted the
    client holds that number, so it is revised as a new quotation instead.
    """
    quote = db.scalar(
        select(models.Quote).where(models.Quote.quote_number == quote_number))
    if quote is None:
        raise HTTPException(404, "Quote not found")
    if _quote_snapshot(quote) is None:
        raise HTTPException(
            409,
            "Only an itemised quotation prepared from an extraction can be "
            "edited here")
    if quote.status != "Draft":
        raise HTTPException(
            409,
            f"{quote.quote_number} is already {quote.status.lower()}. "
            "Revise it as a new quotation instead.")
    extraction = db.get(models.TechnicalExtraction, req.extraction_id)
    if extraction is None or extraction.project_id != quote.project_id:
        raise HTTPException(400, "Extraction does not belong to this project")
    if extraction.status != "approved":
        raise HTTPException(409, "Approve the extraction before quotation")
    extra_extractions = []
    for extra_id in req.extra_extraction_ids:
        extra = db.get(models.TechnicalExtraction, extra_id)
        if extra is None or extra.project_id != quote.project_id:
            raise HTTPException(
                400, "A bundled extraction does not belong to this project")
        if extra.status != "approved":
            raise HTTPException(
                409, "Every bundled item's extraction must be approved before quotation")
        extra_extractions.append(extra)
    extractions = [extraction] + extra_extractions
    if not req.product.strip():
        raise HTTPException(400, "Product description is required")
    snapshot = _build_commercial_snapshot(extractions, req)
    quote.design.design_json = json.dumps({
        "record_kind": QUOTE_SNAPSHOT_KIND,
        "commercial": snapshot,
    })
    quote.design.total = snapshot["grand_total"]
    quote.product = req.product.strip()
    quote.total = snapshot["grand_total"]
    quote.deposit_percent = req.deposit_percent
    quote.extraction_id = extraction.id
    quote.extra_extraction_ids = json.dumps([row.id for row in extra_extractions])
    _workflow_log(
        db, quote.project, "quote",
        f"updated draft quotation {quote.quote_number} before sending",
        who=req.created_by)
    db.commit()
    return _technical_workflow_payload(db, quote.project)


def _resolve_drawing_chain(
        db: Session, project: models.Project, design_id: int | None,
        extraction_id: int | None, quote_id: int | None
) -> tuple[models.TechnicalExtraction, models.Quote]:
    """The one item's approved extraction + accepted quote a drawing task
    (or a not-required declaration) must be opened against. Shared by
    `create_drawing_task` and `mark_drawing_not_required`.
    """
    extraction = None
    if extraction_id is not None:
        extraction = db.get(models.TechnicalExtraction, extraction_id)
        if extraction is None or extraction.project_id != project.id:
            raise HTTPException(400, "Extraction does not belong to this project")
        if extraction.status != "approved":
            raise HTTPException(409, "Approve the extraction before drawing handoff")
        current_extraction = _latest_approved_extraction(project, extraction.design_id)
    else:
        current_extraction = _latest_approved_extraction(project, design_id)
        extraction = current_extraction
    if extraction is None:
        raise HTTPException(409, "Approve an extraction before drawing handoff")
    if current_extraction is None or extraction.id != current_extraction.id:
        raise HTTPException(
            409, "Drawing must use the current approved extraction")
    quote = None
    if quote_id is not None:
        quote = db.get(models.Quote, quote_id)
        if quote is None or quote.project_id != project.id:
            raise HTTPException(400, "Quotation does not belong to this project")
    else:
        quote = _current_commercial_quote(project, extraction)
    if quote is None:
        raise HTTPException(
            409,
            f"Accept a quotation based on extraction E{extraction.revision} "
            "before opening the drawing task")
    if (extraction.id not in _quote_extraction_ids(quote)
            or quote.status not in ("Accepted", "Approved")):
        raise HTTPException(
            409, "Drawing must use the current accepted quotation and extraction")
    return extraction, quote


@app.post("/api/projects/{project_id}/drawing-tasks")
def create_drawing_task(project_id: int, req: schemas.DrawingTaskIn,
                        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if req.method not in DRAWING_METHODS:
        raise HTTPException(400, "method must be configurator|autocad")
    if project.released_to_technical_at is None:
        raise HTTPException(
            409, "Accounts must release this project to Technical first")
    extraction, quote = _resolve_drawing_chain(
        db, project, req.design_id, req.extraction_id, req.quote_id)
    task = models.DrawingTask(
        project_id=project.id,
        design_id=extraction.design_id,
        extraction_id=extraction.id if extraction else None,
        quote_id=quote.id if quote else None,
        method=req.method,
        status="assigned",
        assigned_to=req.assigned_to.strip(),
        brief=req.brief.strip(),
        created_by=req.created_by.strip(),
    )
    db.add(task)
    project.drawing_method = req.method
    project.workflow_status = "drawing_in_progress"
    _workflow_log(
        db, project, "drawing",
        f"opened {req.method.title()} drawing task"
        + (f" for {req.assigned_to.strip()}" if req.assigned_to.strip() else ""),
        who=req.created_by)
    db.commit(); db.refresh(task)
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/drawing-tasks/not-required")
def mark_drawing_not_required(project_id: int, req: schemas.DrawingNotRequiredIn,
                              db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if project.released_to_technical_at is None:
        raise HTTPException(
            409, "Accounts must release this project to Technical first")
    reason = req.reason.strip()
    if not reason:
        raise HTTPException(400, "Explain why no drawing is required")
    extraction, quote = _resolve_drawing_chain(
        db, project, req.design_id, req.extraction_id, None)
    record = next((
        item for item in (project.items or []) if item.id == extraction.design_id
    ), None) if extraction.design_id is not None else None
    label = (record.ref or record.name) if record else "the ungrouped item"
    task = models.DrawingTask(
        project_id=project.id,
        design_id=extraction.design_id,
        extraction_id=extraction.id,
        quote_id=quote.id,
        method="not_required",
        status="not_required",
        brief=reason,
        created_by=req.created_by.strip(),
    )
    db.add(task)
    _workflow_log(
        db, project, "drawing",
        f"{req.created_by.strip() or 'Technical Team'} marked {label} — "
        f"drawing not required: {reason}",
        who=req.created_by)
    db.commit(); db.refresh(task)
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/submit-to-qc")
def submit_project_to_qc(project_id: int, req: schemas.SubmitToQcIn,
                         db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if project.released_to_technical_at is None:
        raise HTTPException(
            409, "Accounts must release this project to Technical first")
    readiness = _qc_readiness(project)
    if not readiness["ready"]:
        raise HTTPException(
            409, "Not ready for QC: " + ", ".join(readiness["not_ready_items"]))
    project.released_to_qc_at = datetime.utcnow()
    project.released_to_qc_by = req.submitted_by.strip()
    _workflow_log(
        db, project, "drawing",
        f"{req.submitted_by.strip() or 'Technical Team'} submitted the "
        "project to QC"
        + (f" — {req.notes.strip()}" if req.notes.strip() else ""),
        who=req.submitted_by)
    db.commit()
    return _technical_workflow_payload(db, project)


@app.post("/api/drawing-tasks/{task_id}/revisions")
def create_drawing_revision(task_id: int, req: schemas.DrawingRevisionIn,
                            db: Session = Depends(get_db)):
    task = db.get(models.DrawingTask, task_id)
    if task is None:
        raise HTTPException(404, "Drawing task not found")
    current_extraction = _latest_approved_extraction(task.project, task.design_id)
    current_quote = _current_commercial_quote(task.project, current_extraction)
    if (current_extraction is None
            or task.extraction_id != current_extraction.id
            or current_quote is None
            or task.quote_id != current_quote.id):
        raise HTTPException(
            409,
            "This drawing task has a stale extraction or quotation basis. "
            "Open a new task from the current approved chain.")
    revision_number = max(
        [row.revision for row in (task.revisions or [])] or [0]) + 1
    revision = models.DrawingRevision(
        drawing_task_id=task.id,
        revision=revision_number,
        status="under_review",
        notes=req.notes.strip(),
        submitted_by=req.submitted_by.strip(),
    )
    db.add(revision)
    task.status = "under_review"
    task.project.workflow_status = "drawing_under_review"
    _workflow_log(
        db, task.project, "drawing",
        f"submitted drawing revision R{revision_number} for technical review",
        who=req.submitted_by)
    db.commit(); db.refresh(revision)
    return _technical_workflow_payload(db, task.project)


def _auto_confirm_existing_design(
        db: Session, project: models.Project, design_id: int | None,
        approved_by: str, notes: str = "") -> models.DrawingRevision:
    """Core of "confirm the saved configurator design as final" — approves
    an immutable R1 snapshot of it as the drawing, with no redraw required.
    Shared by the manual Technical Workflow action and QC's auto-release for
    any item that reaches QC with no drawing pack yet. Does not commit;
    callers own the transaction. Raises if real drawing work is already in
    progress — this must never paper over that.
    """
    target_record = (
        db.get(models.DesignRecord, design_id) if design_id is not None else None)
    extraction = _latest_approved_extraction(project, design_id)
    if extraction is None:
        raise HTTPException(409, "Approve an extraction before confirming the drawing")
    quote = _current_commercial_quote(project, extraction)
    if quote is None:
        raise HTTPException(
            409, "Accept the current quotation before confirming the drawing")

    task = next((
        row for row in sorted(
            project.drawing_tasks or [],
            key=lambda value: value.created_at, reverse=True)
        if row.method == "configurator"
        and row.extraction_id == extraction.id
        and row.quote_id == quote.id
    ), None)
    if task and any(row.status == "approved" for row in task.revisions or []):
        return next(row for row in task.revisions if row.status == "approved")
    if task and task.revisions:
        raise HTTPException(
            409,
            "A drawing revision already exists for this task. Complete its review "
            "instead of confirming the original design.")
    if task is None:
        task = models.DrawingTask(
            project_id=project.id,
            design_id=design_id,
            extraction_id=extraction.id,
            quote_id=quote.id,
            method="configurator",
            status="assigned",
            assigned_to=approved_by.strip(),
            brief="Existing saved configurator design accepted without redraw.",
            created_by=approved_by.strip(),
        )
        db.add(task)
        db.flush()

    revision = models.DrawingRevision(
        drawing_task_id=task.id,
        revision=1,
        status="approved",
        notes=notes.strip(),
        submitted_by=approved_by.strip(),
        approved_by=approved_by.strip(),
        approved_at=datetime.utcnow(),
    )
    db.add(revision)
    db.flush()

    snapshot_items = (
        [target_record] if target_record is not None
        else sorted(project.items, key=lambda value: value.created_at))
    snapshot = {
        "project_id": project.id,
        "project_number": project.project_number,
        "approved_at": revision.approved_at.isoformat(),
        "approved_by": revision.approved_by,
        "extraction_revision": extraction.revision,
        "quotation_number": quote.quote_number,
        "items": [{
            "id": item.id,
            "ref": item.ref,
            "name": item.name,
            "quantity": item.qty,
            "location": item.location,
            "design": json.loads(item.design_json),
        } for item in snapshot_items],
    }
    body = json.dumps(snapshot, indent=2).encode("utf-8")
    filename = f"{project.project_number}-approved-configurator-design.json"
    stored_name = f"{revision.id}-{uuid4().hex}-{filename}"
    (DRAWING_STORAGE / stored_name).write_bytes(body)
    db.add(models.DrawingFile(
        drawing_revision_id=revision.id,
        kind="configurator_snapshot",
        filename=filename,
        stored_name=stored_name,
        content_type="application/json",
        size_bytes=len(body),
        checksum_sha256=hashlib.sha256(body).hexdigest(),
    ))

    for other_task in project.drawing_tasks or []:
        if other_task.design_id != design_id:
            continue
        for other in other_task.revisions or []:
            if other.id != revision.id and other.status == "approved":
                other.status = "superseded"
    for release in project.production_releases or []:
        if release.design_id == design_id and release.status == "current":
            release.status = "superseded"
    task.status = "approved"
    project.drawing_method = "configurator"
    project.workflow_status = "drawing_approved"
    project.released_at = None
    _workflow_log(
        db, project, "approval",
        f"confirmed the existing configurator design as drawing R1 "
        + (f"for item {target_record.ref or target_record.name}"
           if target_record is not None
           else f"({len(project.items)} saved item"
                f"{'s' if len(project.items) != 1 else ''})"),
        who=approved_by)
    return revision


@app.post("/api/projects/{project_id}/drawing-tasks/use-existing-design")
def approve_existing_configurator_design(
        project_id: int,
        req: schemas.ExistingDesignApprovalIn,
        db: Session = Depends(get_db)):
    """Approve a saved configurator design when no redraw is required."""
    project = _get_project(db, project_id)
    if not project.items:
        raise HTTPException(
            409, "Save at least one configurator design item before confirming it")
    if req.design_id is not None:
        target_record = db.get(models.DesignRecord, req.design_id)
        if target_record is None or target_record.project_id != project.id:
            raise HTTPException(400, "Design does not belong to this project")
    elif len(project.items) > 1:
        raise HTTPException(
            409,
            "This project has more than one item — select which item's "
            "design is being confirmed")
    if project.released_to_technical_at is None:
        raise HTTPException(
            409, "Accounts must release this project to Technical first")
    _auto_confirm_existing_design(db, project, req.design_id, req.approved_by, req.notes)
    db.commit()
    return _technical_workflow_payload(db, project)


def _finalize_drawing_revision(
        db: Session, revision: models.DrawingRevision, approved_by: str) -> None:
    """Drawing has no separate manual approval anymore — this runs the
    moment a revision's required files are complete (right away for the
    "use existing design" snapshot path, or on the upload that completes the
    client-overview + factory-breakdown pair for a custom revision). Does
    what the old `approve_drawing_revision` endpoint used to do: supersede
    any prior approved revision on the same task and mark stale any
    production release still pointed at an older revision.
    """
    for other in revision.task.revisions or []:
        if other.id != revision.id and other.status == "approved":
            other.status = "superseded"
    for release in revision.task.project.production_releases or []:
        if (release.design_id == revision.task.design_id
                and release.status == "current"
                and release.drawing_revision_id != revision.id):
            release.status = "superseded"
    revision.status = "approved"
    revision.approved_by = approved_by
    revision.approved_at = datetime.utcnow()
    revision.task.status = "approved"
    revision.task.project.workflow_status = "drawing_approved"
    revision.task.project.released_at = None


@app.put("/api/drawing-revisions/{revision_id}/files/{kind}")
async def upload_drawing_file(revision_id: int, kind: str, request: Request,
                              filename: str, db: Session = Depends(get_db)):
    revision = db.get(models.DrawingRevision, revision_id)
    if revision is None:
        raise HTTPException(404, "Drawing revision not found")
    if revision.status != "under_review":
        raise HTTPException(
            409,
            "Approved or superseded drawing revisions are immutable. "
            "Submit a new revision for changes.")
    if kind not in {"source_dwg", "client_overview", "factory_breakdown",
                    "cutting_list", "material_list", "other"}:
        raise HTTPException(400, "Unsupported drawing file kind")
    safe_name = Path(filename).name.strip()
    if not safe_name:
        raise HTTPException(400, "filename is required")
    body = await request.body()
    if not body:
        raise HTTPException(400, "File is empty")
    if len(body) > 50 * 1024 * 1024:
        raise HTTPException(413, "Drawing files are limited to 50 MB")
    stored_name = f"{revision.id}-{uuid4().hex}-{safe_name}"
    path = DRAWING_STORAGE / stored_name
    path.write_bytes(body)
    file = models.DrawingFile(
        drawing_revision_id=revision.id,
        kind=kind,
        filename=safe_name,
        stored_name=stored_name,
        content_type=request.headers.get("content-type", ""),
        size_bytes=len(body),
        checksum_sha256=hashlib.sha256(body).hexdigest(),
    )
    db.add(file)
    _workflow_log(
        db, revision.task.project, "drawing",
        f"uploaded {kind.replace('_', ' ')} file {safe_name} to R{revision.revision}",
        who=revision.submitted_by or "Technical Team")
    db.flush()
    kinds = {row.kind for row in revision.files or []}
    if kinds:
        approved_by = revision.submitted_by or "System (auto)"
        _finalize_drawing_revision(db, revision, approved_by)
        _workflow_log(
            db, revision.task.project, "approval",
            f"approved drawing revision R{revision.revision}",
            who=approved_by)
    db.commit(); db.refresh(file)
    return _file_payload(file)


@app.get("/api/drawing-files/{file_id}")
def download_drawing_file(file_id: int, db: Session = Depends(get_db)):
    file = db.get(models.DrawingFile, file_id)
    if file is None:
        raise HTTPException(404, "Drawing file not found")
    path = DRAWING_STORAGE / file.stored_name
    if not path.is_file():
        raise HTTPException(404, "Stored drawing file is missing")
    return FileResponse(
        path, media_type=file.content_type or "application/octet-stream",
        filename=file.filename)


def _create_production_release(
        db: Session, project: models.Project, revision: models.DrawingRevision,
        extraction: models.TechnicalExtraction, quote: models.Quote,
        released_by: str, notes: str = "") -> models.ProductionRelease:
    """Create the current factory-release record for one item's approved
    drawing revision, superseding any prior release for the same item. Does
    not commit; caller owns the transaction. Caller must already know a new
    release is actually needed (no existing current release on this exact
    revision) — this always creates one.
    """
    item_releases = [
        row for row in project.production_releases or []
        if row.design_id == revision.task.design_id]
    for prior in item_releases:
        if prior.status == "current":
            prior.status = "superseded"
    release_index = len(item_releases) + 1
    manifest = [{
        "file_id": file.id,
        "kind": file.kind,
        "filename": file.filename,
        "size_bytes": file.size_bytes,
        "checksum_sha256": file.checksum_sha256,
    } for file in sorted(revision.files or [], key=lambda row: row.created_at)]
    release = models.ProductionRelease(
        project_id=project.id,
        design_id=revision.task.design_id,
        release_number=f"{project.project_number}-FP-{release_index:02d}",
        status="current",
        extraction_id=extraction.id,
        extraction_revision=extraction.revision,
        quote_id=quote.id,
        quotation_number=quote.quote_number,
        drawing_revision_id=revision.id,
        drawing_revision_number=revision.revision,
        file_manifest=json.dumps(manifest),
        released_by=released_by.strip(),
        notes=notes.strip(),
    )
    db.add(release)
    project.workflow_status = "released_to_factory"
    project.released_at = datetime.utcnow()
    job = db.get(models.Job, quote.job_id) if quote.job_id else None
    if job is not None:
        lc.log(
            db, "stage",
            f"factory release issued from approved drawing R{revision.revision}",
            job_id=job.id, who=released_by)
    return release


def _release_project_to_factory(
        db: Session, project: models.Project,
        released_by: str, notes: str = "") -> list[models.ProductionRelease]:
    """Release every project item's current approved factory pack. Called
    the moment pre-production QC approves — QC approval is the only gate on
    reaching the factory floor. An item with no drawing yet is auto-confirmed
    from its saved configurator design (see `_auto_confirm_existing_design`);
    `_preproduction_qc_payload`'s issues already guarantee every item is
    releasable by the time this runs, so nothing here should fail.
    """
    releases = []
    for design_id, record in _qc_item_scopes(project):
        extraction = _latest_approved_extraction(project, design_id)
        quote = _current_commercial_quote(project, extraction)
        drawing = _current_approved_drawing(project, design_id, extraction, quote)
        if drawing is None:
            if record is None:
                continue  # legacy ungrouped scope, no drawing yet — no real item to auto-confirm against
            drawing = _auto_confirm_existing_design(
                db, project, design_id, released_by,
                "Auto-confirmed on pre-production QC approval.")
            db.flush()
            extraction = _latest_approved_extraction(project, design_id)
            quote = _current_commercial_quote(project, extraction)
        already_current = any(
            row.status == "current" and row.drawing_revision_id == drawing.id
            for row in project.production_releases or [])
        if already_current:
            continue
        releases.append(_create_production_release(
            db, project, drawing, extraction, quote, released_by, notes))
    return releases


@app.get("/api/projects/{project_id}/quote-summary")
def project_quote_summary_json(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    return _project_quote_payload(project)


@app.get("/api/projects/{project_id}/quote-summary/pdf")
def project_quote_summary(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    payload = _project_quote_payload(project)
    return _pdf_response(project_quote_summary_pdf(payload),
                         f"project-quote-{project.project_number}.pdf")


@app.get("/api/projects/{project_id}/material-boq/pdf")
def project_material_boq(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    payload = _project_quote_payload(project)
    return _pdf_response(project_material_boq_pdf(payload),
                         f"project-material-boq-{project.project_number}.pdf")


@app.get("/api/projects/{project_id}/cutting-list/pdf")
def project_cutting_list(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    payload = _project_quote_payload(project)
    counters = {"Window": 0, "Door": 0, "Item": 0}
    item_packs = []
    demand = []
    for item in payload["items"]:
        design = item.get("design") or {}
        result = item.get("result")
        if not result:
            continue
        name = str(item.get("name") or design.get("name") or "").lower()
        kind = "Door" if "door" in name else "Window" if "window" in name else "Item"
        counters[kind] += 1
        label = f"{kind} {counters[kind]}"
        design = {**design, "name": item.get("name") or design.get("name"),
                  "ref": item.get("ref") or design.get("ref"),
                  "item_label": label}
        pieces = extract_pieces_any(design)
        if not pieces:
            continue
        qty = int(result.get("qty") or design.get("qty") or 1)
        demand.extend([
            {**piece, "qty": piece["qty"] * qty, "bundle": label}
            for piece in pieces
        ])
        item_packs.append({"label": label, "design": design, "result": result})
    if not item_packs:
        raise HTTPException(409, "This project has no frame or curtain-wall items with a cutting schedule")
    return _pdf_response(
        project_cutting_list_pdf(payload, item_packs, optimize(demand)),
        f"project-cutting-list-{project.project_number}.pdf",
    )


@app.get("/api/materials")
def list_materials(db: Session = Depends(get_db)):
    return [{"id": m.id, "code": m.code, "name": m.name, "category": m.category,
             "unit": m.unit, "unit_price": m.unit_price, "stock": m.stock,
             "reorder_level": m.reorder_level}
            for m in db.scalars(select(models.Material)
                                .order_by(models.Material.category, models.Material.code))]


@app.patch("/api/materials/{material_id}")
def update_material(material_id: int, req: schemas.MaterialUpdateIn,
                    db: Session = Depends(get_db)):
    """Correct a catalogue value. Prices and units are what the quote, BOM and
    cutting list read, so an edit here reaches every document."""
    mat = db.get(models.Material, material_id)
    if mat is None:
        raise HTTPException(404, "Material not found")
    changes = []
    if req.name is not None and req.name.strip():
        mat.name = req.name.strip()
    if req.category is not None and req.category.strip():
        mat.category = req.category.strip()
    if req.unit is not None and req.unit.strip() and req.unit.strip() != mat.unit:
        changes.append(f"unit {mat.unit} → {req.unit.strip()}")
        mat.unit = req.unit.strip()
    if req.unit_price is not None:
        if req.unit_price < 0:
            raise HTTPException(400, "Unit price cannot be negative")
        if round(req.unit_price, 2) != round(mat.unit_price, 2):
            changes.append(f"price {mat.unit_price} → {round(req.unit_price, 2)}")
        mat.unit_price = round(req.unit_price, 2)
    if req.reorder_level is not None:
        if req.reorder_level < 0:
            raise HTTPException(400, "Reorder level cannot be negative")
        mat.reorder_level = round(req.reorder_level, 2)
    if changes:
        lc.log(db, "stock", f"{mat.code} updated: {'; '.join(changes)}",
               who=req.who or "Inventory")
    db.commit()
    return {"id": mat.id, "code": mat.code, "name": mat.name,
            "category": mat.category, "unit": mat.unit,
            "unit_price": mat.unit_price, "stock": mat.stock,
            "reorder_level": mat.reorder_level}


@app.post("/api/materials")
def create_material(req: schemas.MaterialCreateIn, db: Session = Depends(get_db)):
    """Add a material the workbooks never listed — a new accessory, a joint
    member, an ECO-line profile."""
    code = req.code.strip().upper()
    if not code:
        raise HTTPException(400, "A material code is required")
    if db.scalar(select(models.Material).where(models.Material.code == code)):
        raise HTTPException(409, f"{code} already exists")
    mat = models.Material(
        code=code, name=req.name.strip() or code, category=req.category.strip() or "Accessory",
        unit=req.unit.strip() or "pcs", unit_price=round(max(0.0, req.unit_price), 2),
        stock=round(max(0.0, req.stock), 2), reorder_level=round(max(0.0, req.reorder_level), 2))
    db.add(mat)
    lc.log(db, "stock", f"{code} added to the material catalogue ({mat.name})",
           who=req.who or "Inventory")
    db.commit()
    db.refresh(mat)
    return {"id": mat.id, "code": mat.code, "name": mat.name, "category": mat.category,
            "unit": mat.unit, "unit_price": mat.unit_price, "stock": mat.stock,
            "reorder_level": mat.reorder_level}


@app.post("/api/materials/{material_id}/receive")
def receive_stock(material_id: int, req: schemas.ReceiveStockIn, db: Session = Depends(get_db)):
    mat = db.get(models.Material, material_id)
    if mat is None:
        raise HTTPException(404, "Material not found")
    if req.qty <= 0:
        raise HTTPException(400, "Quantity must be positive")
    mat.stock = round(mat.stock + req.qty, 2)
    db.add(models.StockMove(material_id=mat.id, delta=req.qty,
                            reason=req.note or "Goods received"))
    lc.log(db, "stock", f"received {req.qty} {mat.unit} {mat.code} ({mat.name})", who=req.who)
    db.commit()
    return {"code": mat.code, "stock": mat.stock}


@app.get("/api/stock-moves")
def stock_moves(limit: int = 25, db: Session = Depends(get_db)):
    moves = db.scalars(select(models.StockMove)
                       .order_by(models.StockMove.created_at.desc()).limit(limit)).all()
    out = []
    for mv in moves:
        mat = db.get(models.Material, mv.material_id)
        out.append({"code": mat.code if mat else "?", "name": mat.name if mat else "?",
                    "unit": mat.unit if mat else "", "delta": mv.delta,
                    "reason": mv.reason, "job": mv.job_number,
                    "extraction_id": mv.extraction_id,
                    "extraction_revision": mv.extraction_revision,
                    "at": mv.created_at.isoformat()})
    return out


@app.get("/api/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.scalars(select(models.Job).order_by(models.Job.created_at.desc())).all()
    return [lc.job_summary(db, j) for j in jobs]


def _job_summary_with_project_totals(db: Session, j: models.Job) -> dict:
    """job_summary(), but value/paid/balance/deposit reflect the whole
    project's combined contract when this job belongs to one."""
    summary = lc.job_summary(db, j)
    if not j.project:
        return summary
    project_jobs = list(j.project.jobs or [])
    contract = _project_contract_value(j.project)
    paid = sum(lc.paid_amount(db, job) for job in project_jobs)
    return {
        **summary,
        "value": round(contract, 2),
        "paid_amount": round(paid, 2),
        "balance": round(max(contract - paid, 0), 2),
        "paid": f"{min(100, round(paid / contract * 100)) if contract else 0}%",
        "deposit_percent": round(_project_deposit_percent(j.project), 2),
        "project_number": j.project.project_number,
        "project_name": j.project.name,
        "project_id": j.project.id,
        "job_count": len(project_jobs),
        "released_to_qc_at": (
            j.project.released_to_qc_at.isoformat()
            if j.project.released_to_qc_at else None),
        "released_to_qc_by": j.project.released_to_qc_by,
        "released_to_technical_at": (
            j.project.released_to_technical_at.isoformat()
            if j.project.released_to_technical_at else None),
        "released_to_technical_by": j.project.released_to_technical_by,
    }


def _account_row(db: Session, jobs: list[models.Job],
                 project: models.Project | None) -> dict:
    contract = _project_contract_value(project) if project else sum(
        float(job.value or 0) for job in jobs)
    paid = sum(lc.paid_amount(db, job) for job in jobs)
    threshold = (_project_deposit_percent(project) if project
                else max(0, min(100, float(jobs[0].deposit_percent or 80))))
    primary = min(jobs, key=lambda job: job.created_at)
    return {
        "job_number": primary.job_number,  # target for recording a new payment
        "project_id": project.id if project else None,
        "project_number": project.project_number if project else None,
        "client": primary.client.name if primary.client else "—",
        "product": project.name if project else primary.product,
        "job_count": len(jobs),
        "value": round(contract, 2),
        "paid_amount": round(paid, 2),
        "balance": round(max(contract - paid, 0), 2),
        "deposit_percent": round(threshold, 2),
        "created_at": min(job.created_at for job in jobs).isoformat(),
    }


@app.get("/api/accounts")
def list_accounts(db: Session = Depends(get_db)):
    """One billing row per project (combined contract across its items),
    plus one row per legacy job that was never attached to a project."""
    jobs = db.scalars(select(models.Job)).all()
    by_project: dict[int, list[models.Job]] = {}
    standalone: list[models.Job] = []
    for job in jobs:
        if job.project_id:
            by_project.setdefault(job.project_id, []).append(job)
        else:
            standalone.append(job)
    rows = [_account_row(db, group, group[0].project) for group in by_project.values()]
    rows += [_account_row(db, [job], None) for job in standalone]
    rows.sort(key=lambda row: row["created_at"], reverse=True)
    return rows


@app.get("/api/production/jobs")
def list_production_jobs(db: Session = Depends(get_db)):
    jobs = db.scalars(select(models.Job).order_by(models.Job.created_at.desc())).all()
    rows = []
    for job in jobs:
        row = lc.job_summary(db, job)
        legacy_active = (
            job.project_id is None
            and job.stage not in ("pending", "done"))
        if row["production_authorized"] or legacy_active:
            rows.append({**row, "legacy_active": legacy_active})
    return rows


def _get_job(db: Session, job_number: str) -> models.Job:
    job = db.scalar(select(models.Job).where(models.Job.job_number == job_number))
    if job is None:
        raise HTTPException(404, f"Job {job_number} not found")
    return job


@app.get("/api/jobs/{job_number}")
def job_detail(job_number: str, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    project_jobs = list(j.project.jobs or []) if j.project else [j]
    # Accounts bills against the whole project's one combined contract, so
    # the payment ledger shown here spans every job under the project, each
    # line labelled with which item it was actually recorded against.
    payments = db.scalars(
        select(models.Payment)
        .where(models.Payment.job_id.in_([job.id for job in project_jobs]))
        .order_by(models.Payment.created_at.desc())).all()
    payments_by_job = {job.id: job for job in project_jobs}
    events = db.scalars(select(models.Event).where(models.Event.job_id == j.id)
                        .order_by(models.Event.created_at.desc()).limit(30)).all()
    qcs = db.scalars(select(models.QcCheck).where(models.QcCheck.job_id == j.id)
                     .order_by(models.QcCheck.created_at.desc())).all()
    rec = db.scalars(select(models.DesignRecord)
                     .where(models.DesignRecord.job_id == j.id)).first()
    quote = db.scalars(select(models.Quote).where(models.Quote.job_id == j.id)).first()
    design_payload = json.loads(rec.design_json) if rec else None
    if design_payload is not None and j.project_id:
        design_payload["projectId"] = j.project_id
    return {
        **_job_summary_with_project_totals(db, j),
        "stages": [{"key": k, "label": l} for k, l, _ in lc.STAGES],
        "payments": [{"kind": p.kind, "method": p.method, "amount": p.amount,
                      "ref": p.ref, "at": p.created_at.isoformat(),
                      "job_number": payments_by_job[p.job_id].job_number,
                      "product": payments_by_job[p.job_id].product}
                     for p in payments],
        "events": [lc.event_dict(e) for e in events],
        "qc_checks": [{"result": q.result, "score": q.score, "notes": q.notes,
                       "inspector": q.inspector, "at": q.created_at.isoformat(),
                       "checklist": json.loads(q.checklist or "[]")} for q in qcs],
        "design": design_payload,
        "design_id": rec.id if rec else None,
        "design_ref": rec.ref if rec else "",
        "share_token": share_token(rec.id) if rec else None,
        "quote_number": quote.quote_number if quote else None,
    }


@app.post("/api/jobs/{job_number}/advance")
def advance_job(job_number: str, req: schemas.AdvanceIn, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    reason = lc.advance_block_reason(db, j)
    if reason:
        raise HTTPException(409, reason)
    nxt = lc.STAGE_KEYS[lc.stage_index(j.stage) + 1]
    j.stage = nxt
    j.progress = lc.STAGE_PROGRESS[nxt]
    note = f"moved {j.job_number} to {lc.STAGE_LABEL[nxt]}"
    if nxt == "cutting":
        issued = lc.issue_materials(db, j)
        if issued:
            note += f" — materials issued: {', '.join(issued[:4])}" \
                    + (f" +{len(issued) - 4} more" if len(issued) > 4 else "")
    if nxt == "done":
        j.delivered_at = j.delivered_at or datetime.utcnow()
    lc.log(db, "stage", note, job_id=j.id, who=req.who)
    lc.refresh_paid(db, j)
    db.commit()
    return lc.job_summary(db, j)


@app.post("/api/jobs/{job_number}/payments")
def add_payment(job_number: str, p: schemas.PaymentIn, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    if p.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    # No cap against the outstanding balance — Accounts decides whether an
    # amount (full settlement, a partial, or one that overshoots) is correct
    # to record; the system doesn't second-guess it.
    db.add(models.Payment(job_id=j.id, kind=p.kind, method=p.method,
                          amount=p.amount, ref=p.ref))
    lc.log(db, "payment",
           f"recorded {p.kind} of GHS {p.amount:,.2f} ({p.method}) — {j.job_number}",
           job_id=j.id, who=p.who)
    db.flush()
    lc.refresh_paid(db, j)
    if j.project:
        payment = _payment_authorization(db, j.project)
        if (payment["authorized"]
                and j.project.workflow_status in {
                    "quote_sent", "awaiting_payment", "quote_in_preparation"}):
            j.project.workflow_status = "drawing_authorized"
            _workflow_log(
                db, j.project, "payment",
                "required payment confirmed — detailed drawing authorized",
                who=p.who)
        _mark_lead_won_on_payment(db, j.project)
    db.commit()
    return _job_summary_with_project_totals(db, j)


@app.post("/api/projects/{project_id}/release-to-technical")
def release_project_to_technical(project_id: int, req: schemas.ReleaseToTechnicalIn,
                                 db: Session = Depends(get_db)):
    """Accounts confirms payment and hands the project to Technical for
    drawing work. Deliberately not gated on the 80% deposit threshold
    (`_payment_authorization`) — that figure stays visible as a reference,
    but Evans's own framing ("if the payment received deserves to be
    approved") hands the release judgment to a person, not a fixed
    percentage. Accounts is the sole payment-based gate in the pipeline;
    Technical decides separately when the project is ready for QC
    (`submit_project_to_qc`)."""
    project = _get_project(db, project_id)
    paid = sum(lc.paid_amount(db, job) for job in (project.jobs or []))
    if paid <= 0:
        raise HTTPException(409, "Record a payment before releasing to Technical")
    project.released_to_technical_at = datetime.utcnow()
    project.released_to_technical_by = req.released_by.strip()

    # Some items reach payment through the quick quote-from-design path,
    # which never runs Technical Workflow's own material extraction step —
    # Technical would otherwise open a drawing task with nothing to draw
    # from. Fill in a generated (provisional) extraction for any item that
    # doesn't already have an approved one, without touching this project's
    # Technical Workflow stepper (`reset_workflow_status=False`) since that
    # stepper isn't how this path tracks progress.
    generated_for = []
    for design_id, record in _qc_item_scopes(project):
        if record is None or _latest_approved_extraction(project, design_id) is not None:
            continue
        extraction, _ = _generate_extraction_for_record(
            db, project, record, design_id, req.released_by,
            "Auto-generated on release to Technical so drawing work can begin.",
            reset_workflow_status=False)
        if extraction is not None:
            generated_for.append(record.ref or record.name)
            # The quick "Save & Create Job" path creates its quote straight
            # from the pricing engine with no extraction_id at all — nothing
            # downstream (drawing tasks, factory release) can find "the
            # quote that goes with this extraction" without this link.
            existing_quote = next((
                q for q in sorted(
                    project.quotes or [], key=lambda row: row.created_at,
                    reverse=True)
                if q.design_id == design_id
                and q.status in ("Accepted", "Approved")
                and q.extraction_id is None
            ), None)
            if existing_quote is not None:
                existing_quote.extraction_id = extraction.id

    _workflow_log(
        db, project, "accounts_release",
        "Accounts confirmed payment and released the project to Technical"
        + (f" — {req.notes.strip()}" if req.notes.strip() else ""),
        who=req.released_by)
    if generated_for:
        _workflow_log(
            db, project, "extraction",
            "Auto-generated a material extraction for "
            f"{len(generated_for)} item(s) with none yet: "
            f"{', '.join(generated_for)}",
            who="System (auto)")
    db.commit()
    payment = _payment_authorization(db, project)
    return _project_workspace_payload(db, project, payment)


@app.post("/api/jobs/{job_number}/qc")
def add_qc(job_number: str, q: schemas.QcIn, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    if q.result not in ("pass", "rework"):
        raise HTTPException(400, "result must be pass|rework")
    db.add(models.QcCheck(job_id=j.id, result=q.result, score=q.score, notes=q.notes,
                          checklist=json.dumps(q.checklist), inspector=q.inspector))
    verdict = "passed QA" if q.result == "pass" else "flagged for REWORK at QA"
    lc.log(db, "qc", f"{j.job_number} {verdict} ({q.score}%)"
           + (f" — {q.notes}" if q.notes else ""), job_id=j.id, who=q.inspector)
    db.commit()
    return lc.job_summary(db, j)


@app.post("/api/jobs/{job_number}/dispatch")
def assign_dispatch(job_number: str, d: schemas.DispatchIn, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    if j.stage not in ("dispatch", "install", "done"):
        raise HTTPException(409, "Job has not reached Dispatch yet")
    if not j.dn_number:
        n = db.scalar(select(func.count(models.Job.id)).where(models.Job.dn_number != "")) or 0
        j.dn_number = f"SOF-DN-{datetime.now():%Y}-{n + 88:03d}"
    j.driver, j.vehicle = d.driver, d.vehicle
    lc.log(db, "dispatch",
           f"delivery {j.dn_number} assigned to {d.driver} ({d.vehicle or 'vehicle TBC'})",
           job_id=j.id, who=d.who)
    db.commit()
    return lc.job_summary(db, j)


@app.get("/api/jobs/{job_number}/delivery-note")
def delivery_note(job_number: str, db: Session = Depends(get_db)):
    j = _get_job(db, job_number)
    if not j.dn_number:
        raise HTTPException(409, "Assign a driver first — no delivery note issued yet")
    rec = db.scalars(select(models.DesignRecord)
                     .where(models.DesignRecord.job_id == j.id)).first()
    pdf = delivery_note_pdf(lc.job_summary(db, j),
                            json.loads(rec.design_json) if rec else None,
                            j.client.location if j.client else "")
    return _pdf_response(pdf, f"{j.dn_number}.pdf")


def _apply_quote_status(
        db: Session, quote: models.Quote, status: str, who: str) -> dict:
    if status == "Accepted" and quote.project and quote.design_id is None:
        approved_extraction = _latest_approved_extraction(quote.project)
        if (approved_extraction is not None
                and quote.extraction_id != approved_extraction.id):
            raise HTTPException(
                409,
                f"Quotation acceptance blocked: this quotation is not based "
                f"on approved extraction E{approved_extraction.revision}.")

    quote.status = status
    result = {"quote_number": quote.quote_number, "status": quote.status}

    if status == "Sent":
        lc.log(db, "quote", f"sent quote {quote.quote_number} to "
               f"{quote.client_name} via WhatsApp", who=who)
        if quote.project:
            quote.project.workflow_status = "quote_sent"
            _workflow_log(
                db, quote.project, "quote",
                f"sent quotation {quote.quote_number} to client", who=who)
    elif status == "Declined":
        lc.log(db, "quote", f"{quote.client_name} declined quote {quote.quote_number}",
               who=who)
    elif status == "Accepted":
        if quote.job_id is None:
            client = db.scalar(select(models.Client)
                               .where(models.Client.name == quote.client_name))
            if client is None:
                client = models.Client(name=quote.client_name)
                db.add(client); db.flush()
            n = db.scalar(select(func.count(models.Job.id))) or 0
            job = models.Job(job_number=f"SOF-{datetime.now():%Y}-{n + 101:03d}",
                             client_id=client.id, project_id=quote.project_id,
                             product=quote.product,
                             stage="pending", progress=0, paid="0%", value=quote.total,
                             deposit_percent=quote.deposit_percent or 80)
            db.add(job); db.flush()
            quote.job_id = job.id
            if quote.design:
                quote.design.job_id = job.id
            if quote.project:
                quote.project.status = "accepted"
                quote.project.workflow_status = "awaiting_payment"
                _workflow_log(
                db, quote.project, "quote",
                f"client accepted {quote.quote_number}; awaiting configured payment",
                    who=who)
            result["job_number"] = job.job_number
            lc.log(db, "quote", f"{quote.client_name} accepted {quote.quote_number} — "
                   f"job {job.job_number} opened (GHS {quote.total:,.0f}), awaiting {job.deposit_percent:.0f}% deposit",
                   job_id=job.id, who=who)
        else:
            job = db.get(models.Job, quote.job_id)
            result["job_number"] = job.job_number if job else None
        if quote.project:
            quote.project.status = "accepted"
            quote.project.workflow_status = (
                "drawing_authorized"
                if _payment_authorization(db, quote.project)["authorized"]
                else "awaiting_payment")
    return result


@app.post("/api/quotes/{quote_number}/status")
def quote_status(quote_number: str, req: schemas.QuoteStatusIn, db: Session = Depends(get_db)):
    quote = db.scalar(select(models.Quote).where(models.Quote.quote_number == quote_number))
    if quote is None:
        raise HTTPException(404, "Quote not found")
    if req.status not in ("Sent", "Accepted", "Declined"):
        raise HTTPException(400, "status must be Sent|Accepted|Declined")
    result = _apply_quote_status(db, quote, req.status, req.who)
    db.commit()
    return result


@app.get("/api/activity")
def activity(limit: int = 20, db: Session = Depends(get_db)):
    events = db.scalars(select(models.Event)
                        .order_by(models.Event.created_at.desc()).limit(limit)).all()
    out = []
    for e in events:
        job = db.get(models.Job, e.job_id) if e.job_id else None
        out.append(lc.event_dict(e, job.job_number if job else None))
    return out


@app.get("/api/quotes")
def list_quotes(db: Session = Depends(get_db)):
    quotes = db.scalars(select(models.Quote)
                        .order_by(models.Quote.created_at.desc())).all()
    out = []
    for q in quotes:
        job = db.get(models.Job, q.job_id) if q.job_id else None
        commercial = _quote_snapshot(q)
        out.append({"quote_number": q.quote_number, "client_name": q.client_name,
                    "product": q.product, "total": q.total, "status": q.status,
                    "deposit_percent": q.deposit_percent or 80,
                    "project_id": q.project_id,
                    "project_number": q.project.project_number if q.project else None,
                    "design_id": q.design_id,
                    "extraction_id": q.extraction_id,
                    "extraction_revision": (
                        q.extraction.revision if q.extraction else None),
                    "commercial": commercial,
                    "created_at": q.created_at.isoformat() if q.created_at else None,
                    "job_number": job.job_number if job else None})
    return out


@app.get("/api/quotes/{quote_number}/pdf")
def quotation_pdf(quote_number: str, db: Session = Depends(get_db)):
    quote = db.scalar(
        select(models.Quote).where(models.Quote.quote_number == quote_number))
    if quote is None:
        raise HTTPException(404, "Quote not found")
    design = None
    commercial = _quote_snapshot(quote)
    if commercial:
        result = {
            "area": 0,
            "sections": len(commercial.get("lines") or []) or 1,
            "profile_len": 0,
            "piece_count": 0,
            "qty": 1,
            "total": commercial["grand_total"],
            "grand_total": commercial["grand_total"],
            "manual_quote": True,
            "commercial_quote": True,
            "extraction_revision": commercial.get("extraction_revision"),
            "client_lines": commercial.get("lines") or [],
            "priced_lines": commercial.get("priced_lines", 0),
            "service_charge_percent": commercial.get(
                "service_charge_percent",
                commercial.get("installation_percent", 0)),
            "service_charge_amount": commercial.get(
                "service_charge_amount",
                commercial.get("installation_amount", 0)),
            "client_subtotal": commercial.get("client_subtotal", 0),
            "discount_percent": commercial.get("discount_percent", 0),
            "discount_amount": commercial.get("discount_amount", 0),
            "getf_nhis_percent": commercial.get("getf_nhis_percent", 0),
            "getf_nhis": commercial.get("getf_nhis", 0),
            "vat_percent": commercial.get("vat_percent", 0),
            "vat": commercial.get("vat", 0),
        }
        design = {
            "location": quote.project.location if quote.project else "",
            "job_description": commercial.get("product") or quote.product,
            "ref": f"E{commercial.get('extraction_revision', '—')}",
            "deposit_percent": commercial.get(
                "deposit_percent", quote.deposit_percent),
            "quote_valid_days": commercial.get("valid_days", 3),
            "client_phone": commercial.get("client_phone", ""),
            "client_email": commercial.get("client_email", ""),
        }
    elif quote.design:
        try:
            design = schemas.DesignIn(
                **json.loads(quote.design.design_json)).engine_dict()
            result = calc_any_quote(design, _materials_by_code(db))
        except Exception:
            design = None
            result = None
    else:
        result = None
    if result is None:
        result = {
            "area": 0,
            "sections": 1,
            "profile_len": 0,
            "piece_count": 0,
            "qty": 1,
            "total": quote.total,
            "grand_total": quote.total,
            "manual_quote": bool(quote.extraction),
            "extraction_revision": (
                quote.extraction.revision if quote.extraction else None),
        }
        design = {
            "location": quote.project.location if quote.project else "",
            "job_description": quote.product,
            "ref": (
                f"E{quote.extraction.revision}"
                if quote.extraction else quote.quote_number),
            "deposit_percent": quote.deposit_percent,
        }
    pdf = quote_pdf(
        quote.quote_number, quote.client_name, quote.product,
        quote.width_mm, quote.height_mm, result, design=design)
    return _pdf_response(pdf, f"{quote.quote_number}.pdf")


@app.get("/api/qc-checks")
def list_qc_checks(limit: int = 20, db: Session = Depends(get_db)):
    checks = db.scalars(select(models.QcCheck)
                        .order_by(models.QcCheck.created_at.desc()).limit(limit)).all()
    out = []
    for q in checks:
        job = db.get(models.Job, q.job_id)
        out.append({"job": job.job_number if job else "—",
                    "product": job.product if job else "—",
                    "result": q.result, "score": q.score, "notes": q.notes,
                    "inspector": q.inspector, "at": q.created_at.isoformat()})
    return out


@app.post("/api/price")
def price(req: schemas.PriceRequest):
    """Live pricing — used by the configurator."""
    return calc_quote(req.width_mm, req.height_mm, req.panels, req.opening, req.glass)


@app.post("/api/quotes", response_model=schemas.QuoteOut)
def create_quote(q: schemas.QuoteIn, db: Session = Depends(get_db)):
    result = calc_quote(q.width_mm, q.height_mm, q.panels, q.opening, q.glass)
    n = db.scalar(select(func.count(models.Quote.id))) or 0
    quote = models.Quote(
        quote_number=f"SOF-Q-{datetime.now():%Y}-{n + 143:04d}",
        client_name=q.client_name, product=q.product,
        width_mm=q.width_mm, height_mm=q.height_mm, panels=q.panels,
        opening=q.opening, glass=q.glass, total=result["total"], status="Draft",
    )
    db.add(quote); db.commit(); db.refresh(quote)
    return quote


def _persist_design_quote(db: Session, client_name: str, design: schemas.DesignIn,
                          result: dict, status: str, project_id: int | None = None) -> models.Quote:
    n = db.scalar(select(func.count(models.Quote.id))) or 0
    first = design.cells[0] if design.cells else schemas.DesignCell()
    project = db.get(models.Project, project_id) if project_id else None
    item = None
    if project:
        item = db.scalar(select(models.DesignRecord).where(
            models.DesignRecord.project_id == project.id,
            models.DesignRecord.ref == design.ref,
        ).order_by(models.DesignRecord.created_at.desc()))
        if item is None:
            item = models.DesignRecord(
                ref=design.ref, name=design.name,
                client_name=project.client.name if project.client else client_name,
                qty=design.qty, location=design.location, total=result["grand_total"],
                design_json=design.model_dump_json(), project_id=project.id,
            )
            db.add(item); db.flush()
    quote_client_name = (project.client.name if project and project.client else None) or client_name or "Walk-in Client"
    quote = models.Quote(
        quote_number=f"SOF-Q-{datetime.now():%Y}-{n + 143:04d}",
        client_name=quote_client_name, product=design.name,
        width_mm=design.width, height_mm=design.height,
        panels=design.cols * design.rows,
        opening=first.opening, glass=first.glass,
        total=result["grand_total"], deposit_percent=design.depositPercent,
        status=status, project_id=project.id if project else None,
        design_id=item.id if item else None,
    )
    db.add(quote); db.commit(); db.refresh(quote)
    return quote


def _next_quote_number(db: Session) -> str:
    number = (db.scalar(select(func.count(models.Quote.id))) or 0) + 143
    while True:
        candidate = f"SOF-Q-{datetime.now():%Y}-{number:04d}"
        exists = db.scalar(select(models.Quote.id).where(
            models.Quote.quote_number == candidate))
        if not exists:
            return candidate
        number += 1


def _sync_design_draft_quote(
        db: Session, project: models.Project, record: models.DesignRecord,
        design: schemas.DesignIn, effective_total: float) -> models.Quote:
    """Keep one current draft quote aligned with the saved design measurements.

    A sent/accepted quote remains immutable evidence. Editing that design later
    starts a new Draft instead of rewriting what the client already received.
    """
    quote = db.scalar(select(models.Quote).where(
        models.Quote.project_id == project.id,
        models.Quote.design_id == record.id,
        models.Quote.status == "Draft",
    ).order_by(models.Quote.created_at.desc()))
    created = quote is None
    first = design.cells[0] if design.cells else schemas.DesignCell()
    if quote is None:
        quote = models.Quote(
            quote_number=_next_quote_number(db),
            project_id=project.id,
            design_id=record.id,
            client_name=(project.client.name if project.client else None)
            or record.client_name or "Walk-in Client",
            product=design.name,
            status="Draft",
        )
        db.add(quote)
    quote.client_name = (
        project.client.name if project.client else record.client_name)
    quote.product = design.name
    quote.width_mm = design.width
    quote.height_mm = design.height
    quote.panels = design.cols * design.rows
    quote.opening = first.opening
    quote.glass = first.glass
    quote.total = effective_total
    quote.pricing_mode = design.pricingMode if design.pricingMode in ("auto", "manual") else "auto"
    quote.deposit_percent = design.depositPercent
    if created:
        project.status = "quoted"
        project.workflow_status = "quote_in_preparation"
        lead = db.scalar(select(models.Lead).where(
            models.Lead.project_id == project.id))
        if lead:
            lead.stage = "quoted"
            lead.lost_reason = ""
            lead.closed_at = None
            lead.quoted_at = lead.quoted_at or datetime.utcnow()
            lead.updated_at = datetime.utcnow()
        _workflow_log(
            db, project, "quote",
            f"automatic draft {quote.quote_number} generated from {record.ref or record.name}",
            who="System")
    return quote


@app.post("/api/quotes/design")
def price_design(req: schemas.DesignQuoteIn, db: Session = Depends(get_db)):
    """Live pricing for a configurator design (no persistence)."""
    return calc_any_quote(req.design.engine_dict(), _materials_by_code(db))


@app.post("/api/quotes/design/pdf")
def design_quote_pdf(req: schemas.DesignQuoteIn, db: Session = Depends(get_db)):
    """Issue a quote: persist it and return the branded PDF."""
    project = db.get(models.Project, req.project_id) if req.project_id else None
    if req.project_id and project is None:
        raise HTTPException(404, "Project not found")
    approved_extraction = _latest_approved_extraction(project)
    if approved_extraction:
        raise HTTPException(
            409,
            f"This project has approved extraction E{approved_extraction.revision}. "
            "Prepare its quotation from the Technical Workflow so the revision "
            "chain remains traceable.")
    result = calc_any_quote(req.design.engine_dict(), _materials_by_code(db))
    if result.get("floor_status") == "BELOW FLOOR":
        raise HTTPException(422, "Client net is below the internal cost floor. Reduce the discount or confirm the project BOQ floor before issuing the quote.")
    quote = _persist_design_quote(db, req.client_name, req.design, result, "Sent", req.project_id)
    if quote.project:
        if quote.project.status == "draft":
            quote.project.status = "quoted"
        quote.project.workflow_status = "quote_sent"
        _workflow_log(
            db, quote.project, "quote",
            f"issued and sent quotation {quote.quote_number}", who="Quotation Team")
        db.commit()
    pdf = quote_pdf(quote.quote_number, quote.client_name, req.design.name,
                    req.design.width, req.design.height, result,
                    design=req.design.engine_dict())
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{quote.quote_number}.pdf"',
        "X-Quote-Number": quote.quote_number,
    })


@app.post("/api/jobs/from-design")
def create_job_from_design(req: schemas.DesignQuoteIn, db: Session = Depends(get_db)):
    """Save & Create Job: persist client + accepted quote + job in one step."""
    result = calc_any_quote(req.design.engine_dict(), _materials_by_code(db))
    if result.get("floor_status") == "BELOW FLOOR":
        raise HTTPException(422, "Cannot accept a quote below the internal cost floor. Review discount and confirmed project BOQ first.")
    project = db.get(models.Project, req.project_id) if req.project_id else None
    if req.project_id and project is None:
        raise HTTPException(404, "Project not found")
    approved_extraction = _latest_approved_extraction(project)
    if approved_extraction:
        raise HTTPException(
            409,
            f"This project has approved extraction E{approved_extraction.revision}. "
            "Accept the linked Technical Workflow quotation instead of creating "
            "an unlinked job.")
    quote = _persist_design_quote(db, req.client_name, req.design, result, "Accepted", req.project_id)

    name = (project.client.name if project and project.client else None) or req.client_name or "Walk-in Client"
    client = db.scalar(select(models.Client).where(models.Client.name == name))
    if client is None:
        client = models.Client(name=name)
        db.add(client); db.flush()

    n = db.scalar(select(func.count(models.Job.id))) or 0
    job = models.Job(
        job_number=f"SOF-{datetime.now():%Y}-{n + 101:03d}",
        client_id=client.id, project_id=project.id if project else None,
        product=req.design.name,
        stage="pending", progress=0, paid="0%", value=result["grand_total"],
        deposit_percent=max(0, min(100, float(req.design.depositPercent))),
    )
    db.add(job); db.flush()
    quote.job_id = job.id
    item = quote.design
    if item is None:
        item = models.DesignRecord(
            ref=req.design.ref, name=req.design.name, client_name=name,
            qty=req.design.qty, location=req.design.location,
            total=result["grand_total"], design_json=req.design.model_dump_json(),
            project_id=project.id if project else None,
        )
        db.add(item); db.flush()
    item.job_id = job.id
    item.total = result["grand_total"]
    quote.design_id = item.id
    if project:
        project.status = "accepted"
        project.workflow_status = "awaiting_payment"
        _workflow_log(
            db, project, "quote",
            f"client accepted {quote.quote_number}; awaiting configured payment",
            who="Kwame Mensah")
    lc.log(db, "quote", f"quote {quote.quote_number} accepted — job {job.job_number} "
           f"opened for {name} (GHS {result['grand_total']:,.0f}), awaiting {job.deposit_percent:.0f}% deposit",
           job_id=job.id, who="Kwame Mensah")
    db.commit()
    return {"job_number": job.job_number, "quote_number": quote.quote_number,
            "total": result["grand_total"], "currency": "GHS"}


def _pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
    })


@app.post("/api/reports/{kind}")
def design_report(kind: str, req: schemas.DesignQuoteIn,
                  db: Session = Depends(get_db)):
    """Design documents. Any category: summary | elevation | quotation |
    price-breakdown | internal-boq. Frame/curtain wall: cutting-list | work-order.
    Frameless: glass-order | hardware-list | work-order | installation."""
    record = db.get(models.DesignRecord, req.design_id) if req.design_id else None
    if req.design_id and record is None:
        raise HTTPException(404, "Design item not found")
    if record and req.project_id and record.project_id != req.project_id:
        raise HTTPException(409, "The selected design item does not belong to this project")
    project_id = req.project_id or (record.project_id if record else None)
    project = db.get(models.Project, project_id) if project_id else None
    if project_id and project is None:
        raise HTTPException(404, "Project not found")

    d = (
        schemas.DesignIn(**json.loads(record.design_json)).engine_dict()
        if record else req.design.engine_dict())
    client_name = req.client_name or (
        record.client_name if record else "") or (
        project.client.name if project and project.client else "")
    result = calc_any_quote(d, _materials_by_code(db))
    approved_extraction = _latest_approved_extraction(
        project, record.id if record else None)
    commercial_quote = (
        _current_commercial_quote(project, approved_extraction)
        if project and approved_extraction else None)
    result = _result_with_approved_extraction(
        result, approved_extraction,
        _quote_snapshot(commercial_quote) if commercial_quote else None)
    bundle = d.get("ref") or (record.ref if record else None) or d.get("name") or "Project item"
    d["item_label"] = bundle
    pieces = extract_pieces_any(d)
    qty = d.get("qty") or 1
    demand = [{**p, "qty": p["qty"] * qty, "bundle": bundle} for p in pieces]
    plan = optimize(demand)
    ref = (d.get("ref") or d["name"]).replace(" ", "-")

    if kind == "summary":
        return _pdf_response(project_summary_pdf(d, result, client_name),
                             f"project-summary-{ref}.pdf")
    if kind == "elevation":
        return _pdf_response(elevation_pdf(d, result), f"elevation-{ref}.pdf")
    if kind == "price-breakdown":
        return _pdf_response(price_breakdown_pdf(d, result, client_name),
                             f"price-breakdown-{ref}.pdf")
    if kind == "quotation":
        # document copy for the saved project — numbered by design ref, NOT
        # persisted (quotes are issued from the configurator, which persists)
        pdf = quote_pdf(d.get("ref") or "DRAFT", client_name, d["name"],
                        d["width"], d["height"], result, design=d)
        return _pdf_response(pdf, f"quotation-{ref}.pdf")

    if d.get("category") == "frameless":
        if kind == "glass-order":
            return _pdf_response(glass_order_pdf(d, result), f"glass-order-{ref}.pdf")
        if kind == "hardware-list":
            return _pdf_response(hardware_list_pdf(d, result), f"hardware-list-{ref}.pdf")
        if kind == "work-order":
            return _pdf_response(fl_work_order_pdf(d, result), f"work-order-{ref}.pdf")
        if kind == "installation":
            return _pdf_response(installation_sheet_pdf(d, result), f"installation-{ref}.pdf")
        raise HTTPException(404, f"Unknown frameless report: {kind}")
    if kind == "cutting-list":
        return _pdf_response(cutting_list_pdf(d, result, demand, plan), f"cutting-list-{ref}.pdf")
    if kind == "work-order":
        return _pdf_response(work_order_pdf(d, result, pieces), f"work-order-{ref}.pdf")
    if kind in ("boq", "internal-boq"):
        return _pdf_response(boq_pdf(d, result, demand, plan), f"boq-{ref}.pdf")
    raise HTTPException(404, f"Unknown report: {kind}")


# ── CLIENT SHARE LINKS ──
# Stateless signed tokens (design id + HMAC) — no schema change, and every
# saved design is shareable retroactively. Demo secret; env-var in prod.
SHARE_SECRET = b"sofaamy-demo-share-secret"


def share_token(design_id: int) -> str:
    sig = hmac.new(SHARE_SECRET, str(design_id).encode(), hashlib.sha256).hexdigest()[:12]
    return f"{design_id}-{sig}"


def _shared_design(token: str, db: Session) -> models.DesignRecord:
    did, _, sig = token.partition("-")
    if not did.isdigit() or not hmac.compare_digest(share_token(int(did)), token):
        raise HTTPException(404, "Invalid share link")
    rec = db.get(models.DesignRecord, int(did))
    if rec is None:
        raise HTTPException(404, "Design not found")
    return rec


@app.get("/api/share/{token}")
def get_shared_design(token: str, db: Session = Depends(get_db)):
    """Public, read-only view of a saved design — what the client opens
    from the WhatsApp link. No internal costs, just the quoted totals."""
    rec = _shared_design(token, db)
    design = json.loads(rec.design_json)
    # Site photos are internal measurement evidence, not client-facing
    # presentation assets. Keep them on the saved project but omit them from
    # the public share payload.
    design.pop("siteImages", None)
    d = schemas.DesignIn(**design).engine_dict()
    result = calc_any_quote(d)
    panels = frameless_breakdown(d)["panels"] if d.get("category") == "frameless" else []
    return {"ref": rec.ref, "name": rec.name, "qty": rec.qty,
            "location": rec.location, "client_name": rec.client_name,
            "created_at": rec.created_at.isoformat(),
            "design": design, "panels": panels,
            "total": result["total"], "grand_total": result["grand_total"],
            "area": result["area"], "currency": "GHS"}


def project_share_token(project_id: int) -> str:
    """Same stateless HMAC pattern as `share_token`, but signs a distinct
    payload (`project:<id>`) so a design token can never be replayed as a
    project token or vice versa."""
    sig = hmac.new(
        SHARE_SECRET, f"project:{project_id}".encode(), hashlib.sha256
    ).hexdigest()[:12]
    return f"{project_id}-{sig}"


def _shared_project(token: str, db: Session) -> models.Project:
    pid, _, sig = token.partition("-")
    if not pid.isdigit() or not hmac.compare_digest(project_share_token(int(pid)), token):
        raise HTTPException(404, "Invalid share link")
    project = db.get(models.Project, int(pid))
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@app.get("/api/share/project/{token}")
def get_shared_project_quote(token: str, db: Session = Depends(get_db)):
    """Public, read-only view of a project's consolidated client quote —
    what the client opens from the WhatsApp link to review and approve.
    Same client-facing figures as the quotation PDF; no internal costs,
    extraction or procurement detail."""
    project = _shared_project(token, db)
    totals = _project_client_quote_totals(project)
    quotes = _current_quote_workspace_quotes(project)
    fully_quoted = bool(project.items) and len(quotes) == len(project.items)
    status = (
        "accepted" if fully_quoted and all(
            quote.status in ("Accepted", "Approved") for quote in quotes)
        else "declined" if any(quote.status == "Declined" for quote in quotes)
        else "pending")
    items = []
    for item in sorted(project.items or [], key=lambda row: row.created_at):
        try:
            raw_design = json.loads(item.design_json)
            manual_price = float(raw_design.get("manualSellingPrice", 0) or 0)
            if raw_design.get("pricingMode") == "manual" and manual_price > 0:
                total = manual_price
            else:
                design = schemas.DesignIn(**raw_design).engine_dict()
                result = calc_any_quote(design)
                total = float(
                    result.get("client_grand_total", result.get("grand_total", 0)) or 0)
        except Exception:
            total = float(item.total or 0)
        items.append({
            "ref": item.ref, "name": item.name, "qty": item.qty,
            "location": item.location, "total": round(total, 2),
        })
    return {
        "project_number": project.project_number,
        "name": project.name,
        "client_name": project.client.name if project.client else "",
        "items": items,
        "client_subtotal": totals["client_subtotal"],
        "discount_amount": totals["discount_amount"],
        "getf_nhis": totals["getf_nhis"],
        "vat": totals["vat"],
        "grand_total": totals["client_grand_total"],
        "deposit_percent": totals["deposit_percent"],
        "status": status,
        "currency": "GHS",
    }


@app.post("/api/share/project/{token}/accept")
def accept_shared_project_quote(
        token: str, req: schemas.PublicQuoteAcceptIn,
        db: Session = Depends(get_db)):
    """Client self-approval from the public share link. Deliberately
    accept-only — Sent/Declined stay staff actions — and the actor is always
    tagged distinguishably in the audit trail so a self-service acceptance
    can never be confused with staff recording it on the client's behalf."""
    project = _shared_project(token, db)
    confirmed_by = req.confirmed_by.strip()
    who = (
        f"Client (self-service): {confirmed_by}" if confirmed_by
        else "Client (self-service)")
    return _process_quote_workspace_status(db, project, "Accepted", who)


@app.post("/api/designs")
def save_design(req: schemas.DesignQuoteIn, db: Session = Depends(get_db)):
    """Save a design so it can be reopened / reused (EvA's saved templates)."""
    d = req.design.engine_dict()
    result = calc_any_quote(d, _materials_by_code(db))
    effective_total = (
        req.design.manualSellingPrice
        if req.design.pricingMode == "manual" and req.design.manualSellingPrice > 0
        else result["grand_total"])
    project = db.get(models.Project, req.project_id) if req.project_id else None
    if req.project_id and project is None:
        raise HTTPException(404, "Project not found")
    client_name = (project.client.name if project and project.client else None) or req.client_name
    rec = None
    if project:
        rec = db.scalar(select(models.DesignRecord).where(
            models.DesignRecord.project_id == project.id,
            models.DesignRecord.ref == req.design.ref,
        ).order_by(models.DesignRecord.created_at.desc()))
    if rec is None and project is not None and project.status == "accepted":
        raise HTTPException(
            409,
            "This project's quotation has already been accepted and its item "
            "list is locked. Start a new project for additional items.")
    if rec is None:
        rec = models.DesignRecord(
            ref=req.design.ref, name=req.design.name, client_name=client_name,
            qty=req.design.qty, location=req.design.location,
            total=effective_total, design_json=req.design.model_dump_json(),
            project_id=project.id if project else None,
        )
        db.add(rec)
        db.flush()
    else:
        rec.name = req.design.name
        rec.client_name = client_name
        rec.qty = req.design.qty
        rec.location = req.design.location
        rec.total = effective_total
        rec.design_json = req.design.model_dump_json()
    quote = None
    if project:
        quote = _sync_design_draft_quote(db, project, rec, req.design, effective_total)
        if project.status == "draft":
            project.status = "quoted"
        if project.workflow_status in {
                "measurement_received", "extraction_in_progress",
                "extraction_ready", "quote_in_preparation"}:
            project.workflow_status = "quote_in_preparation"
    db.commit(); db.refresh(rec)
    if quote:
        db.refresh(quote)
    return {"id": rec.id, "ref": rec.ref, "name": rec.name, "total": rec.total,
            "project_id": rec.project_id, "share_token": share_token(rec.id),
            "quote_number": quote.quote_number if quote else None,
            "quote_status": quote.status if quote else None}


@app.get("/api/designs")
def list_designs(db: Session = Depends(get_db)):
    recs = db.scalars(select(models.DesignRecord)
                      .order_by(models.DesignRecord.created_at.desc())).all()
    visible = []
    for record in recs:
        try:
            raw = json.loads(record.design_json)
        except (TypeError, ValueError):
            raw = {}
        if raw.get("record_kind") == QUOTE_SNAPSHOT_KIND:
            continue
        visible.append((record, raw))
    return [{"id": r.id, "ref": r.ref, "name": r.name, "qty": r.qty,
             "location": r.location, "total": r.total,
             "client_name": r.client_name,
             "project_id": r.project_id,
             "project_number": r.project.project_number if r.project else None,
             "created_at": r.created_at.isoformat(),
             "share_token": share_token(r.id),
             "design": raw} for r, raw in visible]


@app.delete("/api/designs/{design_id}")
def delete_design(design_id: int, db: Session = Depends(get_db)):
    """Remove a saved project item that has not entered the workflow yet
    (e.g. a duplicate created by mistake)."""
    rec = db.get(models.DesignRecord, design_id)
    if rec is None:
        raise HTTPException(404, "Item not found")
    blockers = []
    if rec.quotes:
        blockers.append("quoted")
    if db.scalar(select(func.count(models.TechnicalExtraction.id)).where(
            models.TechnicalExtraction.design_id == rec.id)):
        blockers.append("has a material extraction")
    if db.scalar(select(func.count(models.DrawingTask.id)).where(
            models.DrawingTask.design_id == rec.id)):
        blockers.append("has a drawing task")
    if db.scalar(select(func.count(models.ProductionRelease.id)).where(
            models.ProductionRelease.design_id == rec.id)):
        blockers.append("released to the factory")
    if blockers:
        raise HTTPException(
            409,
            f"This item is already in the technical workflow "
            f"({', '.join(blockers)}) — it cannot be deleted.")
    ref = rec.ref or rec.name
    db.delete(rec)
    db.commit()
    return {"deleted": True, "ref": ref}


@app.post("/api/optimize")
def optimize_cutting(req: schemas.OptimizeRequest):
    """Cutting optimization — nests demand pieces onto stock bars."""
    return optimize([p.model_dump() for p in req.pieces], req.kerf_mm)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    """Business command centre and management KPIs from the live database."""
    from datetime import timedelta
    now = datetime.utcnow()

    jobs = db.scalars(select(models.Job)).all()
    quotes = db.scalars(select(models.Quote)).all()
    payments = db.scalars(select(models.Payment)).all()
    materials = db.scalars(select(models.Material)).all()
    projects = db.scalars(select(models.Project)).all()
    clients = db.scalars(select(models.Client)).all()

    active = [j for j in jobs if j.stage != "done"]
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    revenue_month = sum(p.amount for p in payments if p.created_at >= month_start)
    received_total = {j.id: 0.0 for j in jobs}
    for p in payments:
        received_total[p.job_id] = received_total.get(p.job_id, 0) + p.amount
    outstanding = sum(max(j.value - received_total.get(j.id, 0), 0) for j in active)

    open_q = [q for q in quotes if q.status in ("Draft", "Sent")]
    decided = [q for q in quotes if q.status in ("Accepted", "Approved", "Declined", "Rejected")]
    won = [q for q in decided if q.status in ("Accepted", "Approved")]
    convert = round(len(won) / len(decided) * 100) if decided else 0

    def age_days(value: datetime | None) -> int:
        return max(0, (now - value).days) if value else 0

    # Payments and quotation value per week, last 8 weeks.
    trend = []
    quote_trend = []
    for w in range(7, -1, -1):
        start = now - timedelta(days=(w + 1) * 7)
        end = now - timedelta(days=w * 7)
        amt = sum(p.amount for p in payments if start <= p.created_at < end)
        trend.append({"label": f"W{8 - w}", "value": round(amt / 1000, 1)})
        quoted = sum(
            q.total for q in quotes
            if q.created_at and start <= q.created_at < end)
        quote_trend.append({
            "label": f"W{8 - w}", "value": round(quoted / 1000, 1)})

    by_stage = {}
    for j in active:
        by_stage[j.stage] = by_stage.get(j.stage, 0) + 1
    stage_mix = [{"key": k, "label": lc.STAGE_LABEL.get(k, k), "value": v}
                 for k, v in by_stage.items()]

    low_stock = [{"code": m.code, "name": m.name, "stock": m.stock,
                  "unit": m.unit, "reorder": m.reorder_level}
                 for m in materials if m.stock <= m.reorder_level]
    stock_value = sum(m.stock * m.unit_price for m in materials)

    events = db.scalars(select(models.Event)
                        .order_by(models.Event.created_at.desc()).limit(12)).all()
    workflow_events = db.scalars(
        select(models.WorkflowEvent)
        .order_by(models.WorkflowEvent.created_at.desc()).limit(12)).all()
    quote_events = db.scalars(
        select(models.Event).where(models.Event.kind == "quote")
        .order_by(models.Event.created_at.desc()).limit(250)).all()
    feed = []
    for e in events:
        job = db.get(models.Job, e.job_id) if e.job_id else None
        feed.append(lc.event_dict(e, job.job_number if job else None))
    for event in workflow_events:
        feed.append({
            "who": event.who,
            "kind": event.kind,
            "note": (
                f"{event.project.project_number} · {event.note}"
                if event.project else event.note),
            "job": "",
            "at": event.created_at.isoformat(),
        })
    feed.sort(key=lambda row: row["at"], reverse=True)
    feed = feed[:8]

    job_rows = {j.id: lc.job_summary(db, j) for j in jobs}
    recent_jobs = [job_rows[j.id] for j in
                   sorted(jobs, key=lambda j: j.created_at, reverse=True)[:6]]
    # Current released projects plus historical jobs already on the factory
    # floor before the E/Q/R release chain was introduced. New pending work is
    # never admitted without its current technical release.
    production_jobs = [{
        **job_rows[job.id],
        "legacy_active": (
            job.project_id is None
            and job.stage not in ("pending", "done")),
    } for job in active if (
        job_rows[job.id]["production_authorized"]
        or (job.project_id is None and job.stage != "pending"))]

    clients_by_name = {client.name: client for client in clients}

    def quote_last_touch(quote: models.Quote) -> datetime | None:
        return next((
            event.created_at for event in quote_events
            if quote.quote_number in (event.note or "")), quote.created_at)

    client_followups = []
    for quote in open_q:
        if quote.status != "Sent":
            continue
        touched_at = quote_last_touch(quote)
        waiting = age_days(touched_at)
        client = (
            quote.project.client if quote.project and quote.project.client
            else clients_by_name.get(quote.client_name))
        client_followups.append({
            "quote_number": quote.quote_number,
            "client": quote.client_name,
            "phone": client.phone if client else "",
            "product": quote.product,
            "value": round(quote.total, 2),
            "project_id": quote.project_id,
            "days_waiting": waiting,
            "last_touch": touched_at.isoformat() if touched_at else None,
            "priority": (
                "urgent" if waiting >= 7 else "due" if waiting >= 3
                else "watch"),
            "url": (
                f"/quotations?project={quote.project_id}"
                if quote.project_id else "/quotations"),
        })
    client_followups.sort(
        key=lambda row: (row["days_waiting"], row["value"]), reverse=True)

    accounts_queue = []
    for job in active:
        paid = received_total.get(job.id, 0)
        required = float(job.value or 0) * float(
            job.deposit_percent or 80) / 100
        due_now = max(required - paid, 0)
        balance = max(float(job.value or 0) - paid, 0)
        if balance <= 0.01:
            continue
        accounts_queue.append({
            "job_number": job.job_number,
            "client": job.client.name if job.client else "—",
            "phone": job.client.phone if job.client else "",
            "product": job.product,
            "contract_value": round(job.value, 2),
            "paid": round(paid, 2),
            "required_now": round(due_now, 2),
            "balance": round(balance, 2),
            "days_open": age_days(job.created_at),
            "status": "payment_due" if due_now > 0.01 else "deposit_cleared",
            "url": f"/accounts?job={job.job_number}",
        })
    accounts_queue.sort(
        key=lambda row: (
            row["status"] == "payment_due",
            row["required_now"],
            row["days_open"]), reverse=True)

    technical_statuses = {
        "measurement_received", "extraction_in_progress", "extraction_ready",
        "drawing_authorized", "drawing_in_progress", "drawing_under_review",
        "client_overview_sent", "drawing_approved", "production_pack_ready",
    }
    technical_projects = [
        project for project in projects
        if project.workflow_status in technical_statuses]
    payment_holds = [
        row for row in accounts_queue if row["status"] == "payment_due"]
    qa_handover_jobs = [
        row for row in production_jobs
        if row["stage"] in ("qa", "dispatch", "install")]
    blocked_cutting = [
        row for row in production_jobs
        if row["stage"] == "pending" and row["block"]]

    pipeline = [
        {
            "key": "quotation", "label": "Quotation",
            "count": len(open_q),
            "value": round(sum(q.total for q in open_q), 2),
            "detail": f"{len(client_followups)} awaiting client response",
            "url": "/quotations", "tone": "orange",
        },
        {
            "key": "accounts", "label": "Accounts",
            "count": len(payment_holds),
            "value": round(sum(row["required_now"] for row in payment_holds), 2),
            "detail": "customer payments required now",
            "url": "/accounts", "tone": "purple",
        },
        {
            "key": "technical", "label": "Technical",
            "count": len(technical_projects),
            "value": 0,
            "detail": "measurement, extraction and drawing work",
            "url": "/technical-workflow", "tone": "blue",
        },
        {
            "key": "production", "label": "Production",
            "count": len([
                row for row in production_jobs
                if row["stage"] not in ("dispatch", "install")]),
            "value": round(sum(
                row["value"] for row in production_jobs
                if row["stage"] not in ("dispatch", "install")), 2),
            "detail": f"{len(blocked_cutting)} cutting blocker"
                      f"{'' if len(blocked_cutting) == 1 else 's'}",
            "url": "/production", "tone": "green",
        },
        {
            "key": "handover", "label": "QA & Handover",
            "count": len(qa_handover_jobs),
            "value": round(sum(row["value"] for row in qa_handover_jobs), 2),
            "detail": "quality, dispatch and installation",
            "url": "/quality", "tone": "gold",
        },
    ]

    def project_destination(project: models.Project) -> tuple[str, str]:
        return (f"/projects/{project.id}", "Open project")

    workflow_index = {key: index for index, key in enumerate(WORKFLOW_STATUSES)}
    current_projects = []
    for project in projects:
        project_jobs = list(project.jobs or [])
        if project_jobs and all(job.stage == "done" for job in project_jobs):
            continue
        active_project_jobs = [
            job for job in project_jobs if job.stage != "done"]
        project_quotes = list(project.quotes or [])
        last_event = max(
            [row.created_at for row in project.workflow_events or []
             if row.created_at] or [project.created_at])
        destination, action = project_destination(project)
        contract_value = sum(job.value for job in project.jobs or [])
        project_paid = sum(
            received_total.get(job.id, 0) for job in project.jobs or [])
        status = project.workflow_status or "measurement_received"
        status_position = workflow_index.get(status, 0)
        current_projects.append({
            "id": project.id,
            "project_number": project.project_number,
            "name": project.name,
            "client": project.client.name if project.client else "Walk-in Client",
            "phone": project.client.phone if project.client else "",
            "location": project.location,
            "product": " · ".join(filter(None, [
                (project.product_family or "").title(),
                project.product_system or "",
            ])),
            "workflow_status": status,
            "workflow_status_label": WORKFLOW_LABELS.get(status, status),
            "workflow_progress": round(
                (status_position + 1) / len(WORKFLOW_STATUSES) * 100),
            "job_count": len(active_project_jobs),
            "quote_count": len(project_quotes),
            "contract_value": round(contract_value, 2),
            "paid": round(project_paid, 2),
            "balance": round(max(contract_value - project_paid, 0), 2),
            "last_activity": last_event.isoformat() if last_event else None,
            "age_days": age_days(last_event),
            "url": destination,
            "action": action,
        })
    current_projects.sort(
        key=lambda row: row["last_activity"] or "", reverse=True)

    # Live management breakdowns. These intentionally avoid invented margin or
    # waste metrics until those costs are captured as transactions.
    total_contract = sum(float(job.value or 0) for job in jobs)
    total_received = sum(float(payment.amount or 0) for payment in payments)
    backlog_value = sum(float(job.value or 0) for job in active)
    average_order = (
        sum(float(quote.total or 0) for quote in won) / len(won)
        if won else 0)
    average_progress = (
        sum(job_rows[job.id]["progress"] for job in active) / len(active)
        if active else 0)
    completed_month = len([
        job for job in jobs if job.stage == "done"
        and (job.delivered_at or job.created_at) >= month_start])

    aging_buckets = [
        ("0–7 days", 0, 7), ("8–14 days", 8, 14),
        ("15–30 days", 15, 30), ("31+ days", 31, None),
    ]
    receivable_aging = []
    for label, minimum, maximum in aging_buckets:
        matching = [
            row for row in accounts_queue
            if row["days_open"] >= minimum
            and (maximum is None or row["days_open"] <= maximum)]
        receivable_aging.append({
            "label": label,
            "value": round(sum(row["balance"] for row in matching), 2),
            "count": len(matching),
        })

    client_performance = []
    for client in clients:
        client_jobs = list(client.jobs or [])
        contract = sum(float(job.value or 0) for job in client_jobs)
        if contract <= 0:
            continue
        collected = sum(
            received_total.get(job.id, 0) for job in client_jobs)
        client_performance.append({
            "label": client.name,
            "value": round(contract, 2),
            "received": round(collected, 2),
            "outstanding": round(max(contract - collected, 0), 2),
            "jobs": len(client_jobs),
        })
    client_performance.sort(key=lambda row: row["value"], reverse=True)

    product_values = {}
    for job in jobs:
        product_values[job.product] = (
            product_values.get(job.product, 0) + float(job.value or 0))
    product_mix = [{
        "label": label, "value": round(value, 2)}
        for label, value in sorted(
            product_values.items(), key=lambda row: row[1], reverse=True)[:6]]

    workflow_mix = {}
    for project in projects:
        label = WORKFLOW_LABELS.get(
            project.workflow_status, project.workflow_status)
        workflow_mix[label] = workflow_mix.get(label, 0) + 1

    attention = {
        "total": (
            len([row for row in client_followups
                 if row["priority"] != "watch"])
            + len(payment_holds) + len(blocked_cutting)
            + len([row for row in production_jobs if row["stage"] == "qa"])
            + len(low_stock)),
        "client_followups": len([
            row for row in client_followups if row["priority"] != "watch"]),
        "payment_holds": len(payment_holds),
        "cutting_blockers": len(blocked_cutting),
        "qa_actions": len([
            row for row in production_jobs if row["stage"] == "qa"]),
        "stock_alerts": len(low_stock),
    }

    return {
        "active_jobs": len(active), "open_quotes": len(open_q),
        "clients": len(clients),
        "projects": len(projects),
        "revenue_month": round(revenue_month, 2),
        "outstanding": round(outstanding, 2),
        "convert_pct": convert,
        "quoted_month": round(sum(q.total for q in quotes
                                  if q.created_at and q.created_at >= month_start), 2),
        "trend": trend, "quote_trend": quote_trend, "stage_mix": stage_mix,
        "low_stock": low_stock, "stock_value": round(stock_value, 2),
        "activity": feed, "recent_jobs": recent_jobs,
        "awaiting_deposit": len([j for j in active if j.stage == "pending"]),
        "awaiting_qa": len([j for j in active if j.stage == "qa"]),
        "in_dispatch": len([j for j in active if j.stage in ("dispatch", "install")]),
        "pipeline": pipeline,
        "attention": attention,
        "current_projects": current_projects,
        "client_followups": client_followups,
        "accounts_queue": accounts_queue,
        "production_jobs": production_jobs,
        "insights": {
            "total_contract": round(total_contract, 2),
            "total_received": round(total_received, 2),
            "collection_pct": (
                round(total_received / total_contract * 100)
                if total_contract else 0),
            "backlog_value": round(backlog_value, 2),
            "open_quote_value": round(sum(q.total for q in open_q), 2),
            "average_order_value": round(average_order, 2),
            "average_progress": round(average_progress),
            "completed_month": completed_month,
            "total_jobs": len(jobs),
            "quote_funnel": [{
                "label": label,
                "value": len([quote for quote in quotes
                              if quote.status in statuses]),
            } for label, statuses in (
                ("Draft", {"Draft"}),
                ("Awaiting response", {"Sent"}),
                ("Won", {"Accepted", "Approved"}),
                ("Lost", {"Declined", "Rejected"}),
            )],
            "receivable_aging": receivable_aging,
            "top_clients": client_performance[:6],
            "product_mix": product_mix,
            "workflow_mix": [
                {"label": label, "value": value}
                for label, value in workflow_mix.items()],
        },
    }

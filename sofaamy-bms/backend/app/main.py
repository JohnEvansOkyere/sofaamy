"""Sofaamy Cloud API — FastAPI + SQLite.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from datetime import datetime
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

from .database import Base, engine, get_db, SessionLocal
from . import models, schemas, lifecycle as lc
from .pricing import calc_quote, calc_any_quote, extract_pieces_any, frameless_breakdown
from .optimizer import optimize
from .pdf import quote_pdf, project_quote_summary_pdf
from .reports import (boq_pdf, cutting_list_pdf, work_order_pdf,
                      glass_order_pdf, hardware_list_pdf, fl_work_order_pdf,
                      installation_sheet_pdf, delivery_note_pdf,
                      project_summary_pdf, project_material_boq_pdf,
                      elevation_pdf, price_breakdown_pdf)

Base.metadata.create_all(bind=engine)


def _auto_migrate():
    """Additive SQLite migration: create_all makes new TABLES but not new
    COLUMNS — add any the models gained, so existing databases keep working."""
    from sqlalchemy import text
    wanted = {
        "jobs": [("value", "FLOAT DEFAULT 0"), ("driver", "TEXT DEFAULT ''"),
                 ("vehicle", "TEXT DEFAULT ''"), ("dn_number", "TEXT DEFAULT ''"),
                 ("delivered_at", "DATETIME"), ("deposit_percent", "FLOAT DEFAULT 80"),
                 ("project_id", "INTEGER")],
        "quotes": [("deposit_percent", "FLOAT DEFAULT 80"), ("project_id", "INTEGER"),
                    ("design_id", "INTEGER"), ("extraction_id", "INTEGER")],
        "designs": [("project_id", "INTEGER")],
        "stock_moves": [
            ("extraction_id", "INTEGER"),
            ("extraction_revision", "INTEGER"),
        ],
        "drawing_files": [("checksum_sha256", "TEXT DEFAULT ''")],
        "production_releases": [
            ("release_number", "TEXT DEFAULT ''"),
            ("status", "TEXT DEFAULT 'current'"),
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

app = FastAPI(title="Sofaamy Cloud API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Quote-Number"],
)

DRAWING_STORAGE = Path(__file__).resolve().parent.parent / "uploads" / "drawings"
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
    return {"service": "Sofaamy Cloud API", "status": "ok", "db": "sqlite"}


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


def _workflow_log(db: Session, project: models.Project, kind: str, note: str,
                  who: str = "System") -> None:
    db.add(models.WorkflowEvent(
        project_id=project.id, kind=kind, note=note, who=who))


def _payment_authorization(db: Session, project: models.Project) -> dict:
    """Return the project's drawing-payment gate without inventing one rule.

    Every accepted project job must meet its own configured deposit threshold.
    The project-level percentage is used only when a legacy job has no value.
    """
    jobs = list(project.jobs or [])
    accepted_quotes = [q for q in (project.quotes or [])
                       if q.status in ("Accepted", "Approved")]
    required = 0.0
    paid = 0.0
    blocked_jobs = []
    for job in jobs:
        job_paid = lc.paid_amount(db, job)
        threshold = max(0, min(100, float(
            job.deposit_percent if job.deposit_percent is not None
            else project.drawing_release_percent or 80)))
        job_required = float(job.value or 0) * threshold / 100
        paid += job_paid
        required += job_required
        if job_paid + 0.5 < job_required:
            blocked_jobs.append(job.job_number)
    authorized = bool(jobs) and not blocked_jobs
    return {
        "authorized": authorized,
        "accepted_quote_count": len(accepted_quotes),
        "job_count": len(jobs),
        "required_amount": round(required, 2),
        "paid_amount": round(paid, 2),
        "outstanding": round(max(required - paid, 0), 2),
        "blocked_jobs": blocked_jobs,
        "reason": (
            "" if authorized
            else "An accepted quotation must open a project job before drawing can begin."
            if not jobs
            else f"Payment threshold not met for {', '.join(blocked_jobs)}."
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


def _extraction_payload(extraction: models.TechnicalExtraction) -> dict:
    items = sorted(extraction.items or [], key=lambda row: row.id)
    return {
        "id": extraction.id,
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
        extraction: models.TechnicalExtraction,
        req: schemas.ExtractionQuoteIn,
) -> dict:
    source_items = {row.id: row for row in extraction.items or []}
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
        item.quantity * item.unit_price for item in extraction.items or []), 2)
    if internal_floor > 0 and client_net + 0.01 < internal_floor:
        raise HTTPException(
            422,
            "Client net is below the approved extracted material cost. "
            "Review the selling rates or discount.")
    return {
        "version": 1,
        "extraction_id": extraction.id,
        "extraction_revision": extraction.revision,
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
        project: models.Project | None) -> models.TechnicalExtraction | None:
    if project is None:
        return None
    return next((
        row for row in sorted(
            project.extractions or [],
            key=lambda value: value.revision, reverse=True)
        if row.status == "approved"), None)


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
        if quote.extraction_id == extraction.id
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


def _technical_workflow_payload(db: Session, project: models.Project) -> dict:
    payment = _payment_authorization(db, project)
    approved_extraction = _latest_approved_extraction(project)
    current_quote = _current_commercial_quote(project, approved_extraction)
    extractions = sorted(
        project.extractions or [], key=lambda row: row.revision, reverse=True)
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
            "id": project.id,
            "project_number": project.project_number,
            "name": project.name,
            "client_name": project.client.name if project.client else "",
            "location": project.location,
            "product_family": project.product_family or "frame",
            "product_system": project.product_system or "",
            "workflow_status": (
                project.workflow_status or "measurement_received"),
            "workflow_status_label": WORKFLOW_LABELS.get(
                project.workflow_status, project.workflow_status),
            "extraction_method": project.extraction_method or "manual",
            "drawing_method": project.drawing_method or "configurator",
            "drawing_release_percent": (
                project.drawing_release_percent
                if project.drawing_release_percent is not None else 80),
            "item_count": len(project.items or []),
            "released_at": (
                project.released_at.isoformat()
                if project.released_at else None),
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
        "procurement": _procurement_payload(db, approved_extraction),
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
            row,
            approved_extraction.id if approved_extraction else None,
            current_quote.id if current_quote else None,
        ) for row in drawing_tasks],
        "quotations": [{
            "id": quote.id,
            "quote_number": quote.quote_number,
            "extraction_id": quote.extraction_id,
            "product": quote.product,
            "total": quote.total,
            "deposit_percent": quote.deposit_percent,
            "status": quote.status,
            "basis_status": (
                "current"
                if approved_extraction
                and quote.extraction_id == approved_extraction.id
                else "stale" if quote.extraction_id else "unlinked"),
            "requires_review": bool(
                approved_extraction
                and quote.extraction_id != approved_extraction.id),
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
            "created_at": q.created_at.isoformat() if q.created_at else None,
        } for q in quotes],
        "items": item_rows,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


def _project_quote_payload(project: models.Project) -> dict:
    """Build the current consolidated client quote for every saved item.

    Item-level quotes remain separate records. The project quotation is
    recalculated from each saved design so a previous quote revision cannot be
    counted twice in the consolidated total.
    """
    payload = _project_payload(project)
    records = {item.id: item for item in (project.items or [])}
    totals = {key: 0.0 for key in (
        "client_subtotal", "discount_amount", "client_net", "getf_nhis",
        "vat", "client_grand_total", "internal_floor",
    )}
    first_design = None
    enriched_items = []
    for item in payload["items"]:
        record = records.get(item["id"])
        raw_design = json.loads(record.design_json) if record else {}
        try:
            design = schemas.DesignIn(**raw_design).engine_dict()
            result = calc_any_quote(design)
        except Exception:
            # Preserve older saved records in the project list even if they
            # predate the current schema; they remain visible with their last
            # saved amount but do not block the rest of the quote.
            design = raw_design
            result = None
        if first_design is None:
            first_design = design
        row = {**item, "design": design, "result": result}
        if result:
            row["total"] = result["client_grand_total"]
            for key in totals:
                totals[key] += float(result.get(key, 0) or 0)
        else:
            # Keep a legacy item's saved commercial total in the roll-up even
            # when its old payload cannot be recalculated by the current engine.
            totals["client_grand_total"] += float(item.get("total", 0) or 0)
        enriched_items.append(row)

    payload["items"] = enriched_items
    payload.update({key: round(value, 2) for key, value in totals.items()})
    payload["total"] = payload["client_grand_total"]
    payload["project_quote_number"] = payload["project_number"]
    payload["quote_valid_days"] = max(1, int((first_design or {}).get("quote_valid_days") or 3))
    payload["deposit_percent"] = max(0, min(100, float((first_design or {}).get("deposit_percent") or 80)))
    payload["effective_discount_percent"] = round(
        (payload["discount_amount"] / payload["client_subtotal"] * 100)
        if payload["client_subtotal"] else 0, 2)
    payload["effective_getf_nhis_percent"] = round(
        (payload["getf_nhis"] / payload["client_net"] * 100)
        if payload["client_net"] else 0, 2)
    payload["effective_vat_percent"] = round(
        (payload["vat"] / payload["client_net"] * 100)
        if payload["client_net"] else 0, 2)
    approved_extraction = _latest_approved_extraction(project)
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


@app.get("/api/projects/{project_id}/workflow")
def get_project_workflow(project_id: int, db: Session = Depends(get_db)):
    return _technical_workflow_payload(db, _get_project(db, project_id))


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
                "released_to_factory"):
            payment = _payment_authorization(db, project)
            if not payment["authorized"]:
                raise HTTPException(409, payment["reason"])
        project.workflow_status = req.workflow_status
        changes.append(f"status: {WORKFLOW_LABELS[req.workflow_status]}")
    if changes:
        _workflow_log(
            db, project, "workflow", "; ".join(changes), who=req.who)
    db.commit()
    return _technical_workflow_payload(db, project)


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
    revision = max(
        [row.revision for row in (project.extractions or [])] or [0]) + 1
    extraction = models.TechnicalExtraction(
        project_id=project.id,
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
    project.extraction_method = req.method
    project.workflow_status = "extraction_in_progress"
    _workflow_log(
        db, project, "extraction",
        f"created extraction revision E{revision} with {len(req.items)} material rows ({req.method})",
        who=req.created_by)
    db.commit(); db.refresh(extraction)
    return _technical_workflow_payload(db, project)


@app.post("/api/extractions/{extraction_id}/approve")
def approve_extraction(extraction_id: int, req: schemas.ExtractionApprovalIn,
                       db: Session = Depends(get_db)):
    extraction = db.get(models.TechnicalExtraction, extraction_id)
    if extraction is None:
        raise HTTPException(404, "Extraction not found")
    if not extraction.items:
        raise HTTPException(409, "Cannot approve an empty extraction")
    latest_revision = max(
        row.revision for row in extraction.project.extractions or [extraction])
    if extraction.revision != latest_revision:
        raise HTTPException(
            409,
            f"Only the latest extraction E{latest_revision} can be approved. "
            f"E{extraction.revision} remains historical.")
    if extraction.status == "approved":
        return _technical_workflow_payload(db, extraction.project)
    if extraction.status == "superseded":
        raise HTTPException(409, "A superseded extraction cannot be approved again")
    project = extraction.project
    downstream_exists = bool(
        project.quotes or project.drawing_tasks or project.production_releases)
    for other in extraction.project.extractions or []:
        if other.id != extraction.id and other.status == "approved":
            other.status = "superseded"
    for task in project.drawing_tasks or []:
        if task.extraction_id != extraction.id:
            task.status = "stale_extraction"
    for release in project.production_releases or []:
        if release.status == "current":
            release.status = "superseded"
    extraction.status = "approved"
    extraction.approved_by = req.approved_by.strip()
    extraction.approved_at = datetime.utcnow()
    project.workflow_status = "extraction_ready"
    project.released_at = None
    _workflow_log(
        db, project, "extraction",
        f"approved extraction revision E{extraction.revision} for quotation"
        + (
            "; previous quotation, drawing and release records require review"
            if downstream_exists else ""),
        who=req.approved_by)
    db.commit()
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/extractions/from-design")
def generate_extraction_from_design(
        project_id: int, req: schemas.GeneratedExtractionIn,
        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if req.design_id is not None:
        record = db.get(models.DesignRecord, req.design_id)
        if record is None or record.project_id != project.id:
            raise HTTPException(400, "Design does not belong to this project")
    else:
        record = next(iter(sorted(
            project.items or [], key=lambda row: row.created_at, reverse=True)), None)
    if record is None:
        raise HTTPException(409, "Save a configurator item in this project first")
    design_schema = schemas.DesignIn(**json.loads(record.design_json))
    design = design_schema.engine_dict()
    result = calc_any_quote(design)
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
        raise HTTPException(409, "This configurator item produced no extraction rows")
    revision_number = max(
        [row.revision for row in (project.extractions or [])] or [0]) + 1
    extraction = models.TechnicalExtraction(
        project_id=project.id,
        revision=revision_number,
        method="generated",
        recipe_status="provisional",
        status="draft",
        notes=req.notes.strip() or (
            f"Generated from configurator item {record.ref or record.name}. "
            "Technical review required."),
        created_by=req.created_by.strip(),
    )
    db.add(extraction); db.flush()
    for item in rows:
        db.add(models.ExtractionItem(
            extraction_id=extraction.id, **item))
    project.extraction_method = "generated"
    project.workflow_status = "extraction_in_progress"
    _workflow_log(
        db, project, "extraction",
        f"generated provisional extraction E{revision_number} from configurator item {record.ref or record.name}",
        who=req.created_by)
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
    if not req.product.strip():
        raise HTTPException(400, "Product description is required")
    snapshot = _build_commercial_snapshot(extraction, req)
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
        client_name=client_name,
        product=req.product.strip(),
        total=snapshot["grand_total"],
        deposit_percent=req.deposit_percent,
        status="Draft",
    )
    db.add(quote)
    project.workflow_status = "quote_in_preparation"
    _workflow_log(
        db, project, "quote",
        f"prepared itemised draft quotation {quote.quote_number} from extraction E{extraction.revision}",
        who=req.created_by)
    db.commit(); db.refresh(quote)
    return _technical_workflow_payload(db, project)


@app.post("/api/projects/{project_id}/drawing-tasks")
def create_drawing_task(project_id: int, req: schemas.DrawingTaskIn,
                        db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    if req.method not in DRAWING_METHODS:
        raise HTTPException(400, "method must be configurator|autocad")
    payment = _payment_authorization(db, project)
    if not payment["authorized"]:
        raise HTTPException(409, payment["reason"])
    current_extraction = _latest_approved_extraction(project)
    extraction = None
    if req.extraction_id is not None:
        extraction = db.get(models.TechnicalExtraction, req.extraction_id)
        if extraction is None or extraction.project_id != project.id:
            raise HTTPException(400, "Extraction does not belong to this project")
        if extraction.status != "approved":
            raise HTTPException(409, "Approve the extraction before drawing handoff")
    else:
        extraction = current_extraction
    if extraction is None:
        raise HTTPException(409, "Approve an extraction before drawing handoff")
    if current_extraction is None or extraction.id != current_extraction.id:
        raise HTTPException(
            409, "Drawing must use the current approved extraction")
    quote = None
    if req.quote_id is not None:
        quote = db.get(models.Quote, req.quote_id)
        if quote is None or quote.project_id != project.id:
            raise HTTPException(400, "Quotation does not belong to this project")
    else:
        quote = _current_commercial_quote(project, extraction)
    if quote is None:
        raise HTTPException(
            409,
            f"Accept a quotation based on extraction E{extraction.revision} "
            "before opening the drawing task")
    if (quote.extraction_id != extraction.id
            or quote.status not in ("Accepted", "Approved")):
        raise HTTPException(
            409, "Drawing must use the current accepted quotation and extraction")
    task = models.DrawingTask(
        project_id=project.id,
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


@app.post("/api/drawing-tasks/{task_id}/revisions")
def create_drawing_revision(task_id: int, req: schemas.DrawingRevisionIn,
                            db: Session = Depends(get_db)):
    task = db.get(models.DrawingTask, task_id)
    if task is None:
        raise HTTPException(404, "Drawing task not found")
    current_extraction = _latest_approved_extraction(task.project)
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
    payment = _payment_authorization(db, project)
    if not payment["authorized"]:
        raise HTTPException(409, payment["reason"])
    extraction = _latest_approved_extraction(project)
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
        return _technical_workflow_payload(db, project)
    if task and task.revisions:
        raise HTTPException(
            409,
            "A drawing revision already exists for this task. Complete its review "
            "instead of confirming the original design.")
    if task is None:
        task = models.DrawingTask(
            project_id=project.id,
            extraction_id=extraction.id,
            quote_id=quote.id,
            method="configurator",
            status="assigned",
            assigned_to=req.approved_by.strip(),
            brief="Existing saved configurator design accepted without redraw.",
            created_by=req.approved_by.strip(),
        )
        db.add(task)
        db.flush()

    revision = models.DrawingRevision(
        drawing_task_id=task.id,
        revision=1,
        status="approved",
        notes=req.notes.strip(),
        submitted_by=req.approved_by.strip(),
        approved_by=req.approved_by.strip(),
        approved_at=datetime.utcnow(),
    )
    db.add(revision)
    db.flush()

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
        } for item in sorted(project.items, key=lambda value: value.created_at)],
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
        for other in other_task.revisions or []:
            if other.id != revision.id and other.status == "approved":
                other.status = "superseded"
    for release in project.production_releases or []:
        if release.status == "current":
            release.status = "superseded"
    task.status = "approved"
    project.drawing_method = "configurator"
    project.workflow_status = "drawing_approved"
    project.released_at = None
    _workflow_log(
        db, project, "approval",
        f"confirmed the existing configurator design as drawing R1 "
        f"({len(project.items)} saved item{'s' if len(project.items) != 1 else ''})",
        who=req.approved_by)
    db.commit()
    return _technical_workflow_payload(db, project)


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


@app.post("/api/drawing-revisions/{revision_id}/approve")
def approve_drawing_revision(revision_id: int, req: schemas.DrawingApprovalIn,
                             db: Session = Depends(get_db)):
    revision = db.get(models.DrawingRevision, revision_id)
    if revision is None:
        raise HTTPException(404, "Drawing revision not found")
    latest_revision = max(
        row.revision for row in revision.task.revisions or [revision])
    if revision.revision != latest_revision:
        raise HTTPException(
            409,
            f"Only the latest drawing R{latest_revision} can be approved. "
            f"R{revision.revision} remains historical.")
    if revision.status == "approved":
        return _technical_workflow_payload(db, revision.task.project)
    if revision.status == "superseded":
        raise HTTPException(409, "A superseded drawing cannot be approved again")
    current_extraction = _latest_approved_extraction(revision.task.project)
    current_quote = _current_commercial_quote(
        revision.task.project, current_extraction)
    if (current_extraction is None
            or revision.task.extraction_id != current_extraction.id
            or current_quote is None
            or revision.task.quote_id != current_quote.id):
        raise HTTPException(
            409,
            "Drawing approval blocked: its extraction or quotation basis is stale")
    kinds = {file.kind for file in revision.files or []}
    native_snapshot = "configurator_snapshot" in kinds
    if (not native_snapshot
            and not {"client_overview", "factory_breakdown"}.issubset(kinds)):
        raise HTTPException(
            409, "Upload both client overview and factory breakdown files before approval")
    for other in revision.task.revisions or []:
        if other.id != revision.id and other.status == "approved":
            other.status = "superseded"
    for release in revision.task.project.production_releases or []:
        if (release.status == "current"
                and release.drawing_revision_id != revision.id):
            release.status = "superseded"
    revision.status = "approved"
    revision.approved_by = req.approved_by.strip()
    revision.approved_at = datetime.utcnow()
    revision.task.status = "approved"
    revision.task.project.workflow_status = "drawing_approved"
    revision.task.project.released_at = None
    _workflow_log(
        db, revision.task.project, "approval",
        f"approved drawing revision R{revision.revision}",
        who=req.approved_by)
    db.commit()
    return _technical_workflow_payload(db, revision.task.project)


@app.post("/api/projects/{project_id}/production-releases")
def release_project_to_factory(project_id: int,
                               req: schemas.ProductionReleaseIn,
                               db: Session = Depends(get_db)):
    project = _get_project(db, project_id)
    revision = db.get(models.DrawingRevision, req.drawing_revision_id)
    if revision is None or revision.task.project_id != project.id:
        raise HTTPException(400, "Drawing revision does not belong to this project")
    if revision.status != "approved":
        raise HTTPException(409, "Only an approved drawing revision can be released")
    current_extraction = _latest_approved_extraction(project)
    current_quote = _current_commercial_quote(project, current_extraction)
    if current_extraction is None:
        raise HTTPException(409, "An approved extraction is required for release")
    if (revision.task.extraction_id != current_extraction.id
            or current_quote is None
            or revision.task.quote_id != current_quote.id):
        raise HTTPException(
            409,
            "Factory release blocked: drawing, quotation and approved "
            "extraction are not on the same revision chain")
    existing_release = next((
        row for row in (project.production_releases or [])
        if row.drawing_revision_id == revision.id), None)
    if existing_release:
        return _technical_workflow_payload(db, project)
    kinds = {file.kind for file in revision.files or []}
    if not {"factory_breakdown", "configurator_snapshot"}.intersection(kinds):
        raise HTTPException(
            409, "Factory breakdown or approved configurator snapshot is required")
    payment = _payment_authorization(db, project)
    if not payment["authorized"]:
        raise HTTPException(409, payment["reason"])
    for prior in project.production_releases or []:
        if prior.status == "current":
            prior.status = "superseded"
    release_index = len(project.production_releases or []) + 1
    manifest = [{
        "file_id": file.id,
        "kind": file.kind,
        "filename": file.filename,
        "size_bytes": file.size_bytes,
        "checksum_sha256": file.checksum_sha256,
    } for file in sorted(revision.files or [], key=lambda row: row.created_at)]
    release = models.ProductionRelease(
        project_id=project.id,
        release_number=(
            f"{project.project_number}-FP-{release_index:02d}"),
        status="current",
        extraction_id=current_extraction.id,
        extraction_revision=current_extraction.revision,
        quote_id=current_quote.id,
        quotation_number=current_quote.quote_number,
        drawing_revision_id=revision.id,
        drawing_revision_number=revision.revision,
        file_manifest=json.dumps(manifest),
        released_by=req.released_by.strip(),
        notes=req.notes.strip(),
    )
    db.add(release)
    project.workflow_status = "released_to_factory"
    project.released_at = datetime.utcnow()
    for job in project.jobs or []:
        lc.log(
            db, "stage",
            f"factory release issued from approved drawing R{revision.revision}",
            job_id=job.id, who=req.released_by)
    _workflow_log(
        db, project, "release",
        f"released {release.release_number}: extraction "
        f"E{current_extraction.revision}, quotation "
        f"{current_quote.quote_number}, drawing R{revision.revision}",
        who=req.released_by)
    db.commit()
    return _technical_workflow_payload(db, project)


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


@app.get("/api/materials")
def list_materials(db: Session = Depends(get_db)):
    return [{"id": m.id, "code": m.code, "name": m.name, "category": m.category,
             "unit": m.unit, "unit_price": m.unit_price, "stock": m.stock,
             "reorder_level": m.reorder_level}
            for m in db.scalars(select(models.Material)
                                .order_by(models.Material.category, models.Material.code))]


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
    payments = db.scalars(select(models.Payment).where(models.Payment.job_id == j.id)
                          .order_by(models.Payment.created_at.desc())).all()
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
        **lc.job_summary(db, j),
        "stages": [{"key": k, "label": l} for k, l, _ in lc.STAGES],
        "payments": [{"kind": p.kind, "method": p.method, "amount": p.amount,
                      "ref": p.ref, "at": p.created_at.isoformat()} for p in payments],
        "events": [lc.event_dict(e) for e in events],
        "qc_checks": [{"result": q.result, "score": q.score, "notes": q.notes,
                       "inspector": q.inspector, "at": q.created_at.isoformat(),
                       "checklist": json.loads(q.checklist or "[]")} for q in qcs],
        "design": design_payload,
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
    remaining = max(float(j.value or 0) - lc.paid_amount(db, j), 0)
    if p.amount > remaining + 0.01:
        raise HTTPException(
            400,
            f"Payment exceeds the outstanding balance of GHS {remaining:,.2f}")
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
    db.commit()
    return lc.job_summary(db, j)


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


@app.post("/api/quotes/{quote_number}/status")
def quote_status(quote_number: str, req: schemas.QuoteStatusIn, db: Session = Depends(get_db)):
    quote = db.scalar(select(models.Quote).where(models.Quote.quote_number == quote_number))
    if quote is None:
        raise HTTPException(404, "Quote not found")
    if req.status not in ("Sent", "Accepted", "Declined"):
        raise HTTPException(400, "status must be Sent|Accepted|Declined")
    if req.status == "Accepted" and quote.project:
        approved_extraction = _latest_approved_extraction(quote.project)
        if (approved_extraction is not None
                and quote.extraction_id != approved_extraction.id):
            raise HTTPException(
                409,
                f"Quotation acceptance blocked: this quotation is not based "
                f"on approved extraction E{approved_extraction.revision}.")

    quote.status = req.status
    result = {"quote_number": quote.quote_number, "status": quote.status}

    if req.status == "Sent":
        lc.log(db, "quote", f"sent quote {quote.quote_number} to "
               f"{quote.client_name} via WhatsApp", who=req.who)
        if quote.project:
            quote.project.workflow_status = "quote_sent"
            _workflow_log(
                db, quote.project, "quote",
                f"sent quotation {quote.quote_number} to client", who=req.who)
    elif req.status == "Declined":
        lc.log(db, "quote", f"{quote.client_name} declined quote {quote.quote_number}",
               who=req.who)
    elif req.status == "Accepted":
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
            if quote.project:
                quote.project.status = "accepted"
                quote.project.workflow_status = "awaiting_payment"
                _workflow_log(
                    db, quote.project, "quote",
                    f"client accepted {quote.quote_number}; awaiting configured payment",
                    who=req.who)
            result["job_number"] = job.job_number
            lc.log(db, "quote", f"{quote.client_name} accepted {quote.quote_number} — "
                   f"job {job.job_number} opened (GHS {quote.total:,.0f}), awaiting {job.deposit_percent:.0f}% deposit",
                   job_id=job.id, who=req.who)
        else:
            job = db.get(models.Job, quote.job_id)
            result["job_number"] = job.job_number if job else None
        if quote.project:
            quote.project.status = "accepted"
            quote.project.workflow_status = (
                "drawing_authorized"
                if _payment_authorization(db, quote.project)["authorized"]
                else "awaiting_payment")
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
            result = calc_any_quote(design)
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


@app.post("/api/quotes/design")
def price_design(req: schemas.DesignQuoteIn):
    """Live pricing for a configurator design (no persistence)."""
    return calc_any_quote(req.design.engine_dict())


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
    result = calc_any_quote(req.design.engine_dict())
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
    result = calc_any_quote(req.design.engine_dict())
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
    d = req.design.engine_dict()
    result = calc_any_quote(d)
    project = db.get(models.Project, req.project_id) if req.project_id else None
    approved_extraction = _latest_approved_extraction(project)
    commercial_quote = (
        _current_commercial_quote(project, approved_extraction)
        if project and approved_extraction else None)
    result = _result_with_approved_extraction(
        result, approved_extraction,
        _quote_snapshot(commercial_quote) if commercial_quote else None)
    pieces = extract_pieces_any(d)
    qty = d.get("qty") or 1
    demand = [{**p, "qty": p["qty"] * qty} for p in pieces]
    plan = optimize(demand)
    ref = (d.get("ref") or d["name"]).replace(" ", "-")

    if kind == "summary":
        return _pdf_response(project_summary_pdf(d, result, req.client_name),
                             f"project-summary-{ref}.pdf")
    if kind == "elevation":
        return _pdf_response(elevation_pdf(d, result), f"elevation-{ref}.pdf")
    if kind == "price-breakdown":
        return _pdf_response(price_breakdown_pdf(d, result, req.client_name),
                             f"price-breakdown-{ref}.pdf")
    if kind == "quotation":
        # document copy for the saved project — numbered by design ref, NOT
        # persisted (quotes are issued from the configurator, which persists)
        pdf = quote_pdf(d.get("ref") or "DRAFT", req.client_name, d["name"],
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


@app.post("/api/designs")
def save_design(req: schemas.DesignQuoteIn, db: Session = Depends(get_db)):
    """Save a design so it can be reopened / reused (EvA's saved templates)."""
    d = req.design.engine_dict()
    result = calc_any_quote(d)
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
    if rec is None:
        rec = models.DesignRecord(
            ref=req.design.ref, name=req.design.name, client_name=client_name,
            qty=req.design.qty, location=req.design.location,
            total=result["grand_total"], design_json=req.design.model_dump_json(),
            project_id=project.id if project else None,
        )
        db.add(rec)
    else:
        rec.name = req.design.name
        rec.client_name = client_name
        rec.qty = req.design.qty
        rec.location = req.design.location
        rec.total = result["grand_total"]
        rec.design_json = req.design.model_dump_json()
    db.commit(); db.refresh(rec)
    if project and project.status == "draft":
        project.status = "quoted"
        db.commit()
    return {"id": rec.id, "ref": rec.ref, "name": rec.name, "total": rec.total,
            "project_id": rec.project_id, "share_token": share_token(rec.id)}


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
        status = project.workflow_status or "measurement_received"
        project_jobs = sorted(
            [job for job in project.jobs or [] if job.stage != "done"],
            key=lambda row: row.created_at, reverse=True)
        if status == "released_to_factory" and project_jobs:
            return (
                f"/production/{project_jobs[0].job_number}",
                "Open production")
        if status in ("quote_in_preparation", "quote_sent"):
            return (f"/quotations?project={project.id}", "Open quotation")
        if status == "awaiting_payment" and project_jobs:
            return (
                f"/accounts?job={project_jobs[0].job_number}",
                "Open accounts")
        return (
            f"/technical-workflow?project={project.id}",
            "Open workflow")

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

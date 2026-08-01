"""Factory job lifecycle — stages, technical gates and side-effects.

Accounts clears the commercial payment gate before Technical can approve and
release a factory pack. Production receives only that released technical work
and owns no payment approval actions.
"""
from datetime import datetime
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .inventory_catalog import SYSTEM_MATERIALS
from .pricing import extract_pieces_any, frameless_breakdown

# Factory stages (CLAUDE.md; confirm exact list with Sofaamy)
STAGES = [
    ("pending",    "Ready for Cutting", 0),
    ("cutting",    "Cutting",          12),
    ("processing", "Processing",       25),
    ("holes",      "Holes / Routing",  38),
    ("assembly",   "Assembly",         52),
    ("glazing",    "Glazing",          65),
    ("qa",         "Quality Check",    78),
    ("dispatch",   "Dispatch",         88),
    ("install",    "Installation",     95),
    ("done",       "Completed",        100),
]
STAGE_KEYS = [k for k, _, _ in STAGES]
STAGE_LABEL = {k: l for k, l, _ in STAGES}
STAGE_PROGRESS = {k: p for k, _, p in STAGES}


def stage_index(key: str) -> int:
    return STAGE_KEYS.index(key) if key in STAGE_KEYS else 1


def log(db: Session, kind: str, note: str, job_id: int | None = None,
        who: str = "System") -> None:
    db.add(models.Event(job_id=job_id, who=who, kind=kind, note=note))


def paid_amount(db: Session, job: models.Job) -> float:
    return sum(p.amount for p in db.scalars(
        select(models.Payment).where(models.Payment.job_id == job.id)))


def paid_pct(db: Session, job: models.Job) -> int:
    if not job.value:
        return 100 if job.paid == "100%" else 50 if job.paid == "50%" else 0
    return min(100, round(paid_amount(db, job) / job.value * 100))


def latest_qc(db: Session, job: models.Job) -> models.QcCheck | None:
    return db.scalars(select(models.QcCheck)
                      .where(models.QcCheck.job_id == job.id)
                      .order_by(models.QcCheck.created_at.desc())).first()


def latest_approved_extraction(
        project: models.Project | None) -> models.TechnicalExtraction | None:
    if project is None:
        return None
    return next((
        row for row in sorted(
            project.extractions or [],
            key=lambda value: value.revision, reverse=True)
        if row.status == "approved"), None)


def current_production_release(
        project: models.Project | None,
        extraction: models.TechnicalExtraction | None
) -> models.ProductionRelease | None:
    if project is None or extraction is None:
        return None
    current_quote_ids = {
        quote.id for quote in project.quotes or []
        if quote.extraction_id == extraction.id
        and quote.status in ("Accepted", "Approved")
    }
    return next((
        row for row in sorted(
            project.production_releases or [],
            key=lambda value: value.created_at, reverse=True)
        if row.status == "current"
        and row.extraction_id == extraction.id
        and row.quote_id in current_quote_ids
        and row.drawing_revision.status == "approved"
    ), None)


def normalize_unit(unit: str) -> str:
    value = unit.lower().replace("²", "2").replace(" ", "")
    return {
        "pc": "pcs", "piece": "pcs", "pieces": "pcs",
        "each": "pcs", "unit": "pcs", "units": "pcs",
        "sqm": "m2", "squaremetre": "m2", "squaremeter": "m2",
        "metre": "m", "metres": "m", "meter": "m", "meters": "m",
    }.get(value, value)


def material_issue_block_reason(
        db: Session, extraction: models.TechnicalExtraction) -> str | None:
    """Validate that every inventory row in the approved extraction can issue."""
    problems = []
    non_stock_categories = {"service", "labour", "installation", "tax", "fee"}
    for item in extraction.items or []:
        if item.category.strip().lower() in non_stock_categories:
            continue
        code = item.code.strip()
        if not code:
            problems.append(f"{item.material}: missing stock code")
            continue
        material = db.scalar(
            select(models.Material).where(models.Material.code == code))
        if material is None:
            problems.append(f"{code}: not found in inventory")
            continue
        if normalize_unit(item.unit) != normalize_unit(material.unit):
            problems.append(
                f"{code}: extraction unit {item.unit} does not match "
                f"inventory unit {material.unit}")
            continue
        if material.stock + 0.0001 < item.quantity:
            problems.append(
                f"{code}: need {item.quantity:g} {material.unit}, "
                f"only {material.stock:g} available")
    if not problems:
        return None
    sample = "; ".join(problems[:3])
    if len(problems) > 3:
        sample += f"; +{len(problems) - 3} more"
    return (
        f"Approved extraction E{extraction.revision} cannot be issued: {sample}")


def advance_block_reason(db: Session, job: models.Job) -> str | None:
    """Why this job cannot move to the next stage (None = free to move)."""
    nxt_i = stage_index(job.stage) + 1
    if nxt_i >= len(STAGE_KEYS):
        return "Job is already completed"
    nxt = STAGE_KEYS[nxt_i]
    if job.stage == "pending":
        if not job.project_id or not job.project:
            return "Current approved technical factory release required before cutting"
        extraction = latest_approved_extraction(job.project)
        if extraction is None:
            return "Approved technical extraction required before cutting"
        if current_production_release(job.project, extraction) is None:
            return (
                f"Current factory release aligned to extraction "
                f"E{extraction.revision} required before cutting")
        issue_block = material_issue_block_reason(db, extraction)
        if issue_block:
            return issue_block
    if job.stage == "qa":
        qc = latest_qc(db, job)
        if qc is None:
            return "QA inspection not recorded yet"
        if qc.result != "pass":
            return "Last QA inspection flagged REWORK — re-inspect before dispatch"
    return None


def refresh_paid(db: Session, job: models.Job) -> None:
    job.paid = f"{paid_pct(db, job)}%"


# ── material issue when production starts ──
# Best-effort match from the design's engine output to material codes.
# Frame source profile identity is not yet mapped to cut roles. Do not issue
# stock against invented generic profile codes. Curtain-wall codes remain
# separate because that is a different system family.
PROFILE_CODE = {"cwmullion": "CW-MULLION", "cwtransom": "CW-TRANSOM"}
FL_GLASS_CODE = {"temp8": "GL-TMP-8", "temp10": "GL-TMP-10", "temp12": "GL-TMP-12",
                 "frost10": "GL-FRST-10", "lam13": "GL-LAM-13"}
FRAME_GLASS_CODE = "GL-CLR-6"   # frame glass tracked coarsely for now


def issue_materials(db: Session, job: models.Job) -> list[str]:
    """Deduct stock for a job's bill of materials when it enters Cutting.
    Returns human-readable lines of what was issued (skips unknown codes)."""
    wants: list[tuple[str, float, str]] = []   # (code, qty, unit-note)
    extraction = latest_approved_extraction(job.project)
    if extraction is not None:
        if current_production_release(job.project, extraction) is None:
            return []
        wants.extend(
            (item.code.strip(), float(item.quantity), item.unit.strip())
            for item in extraction.items or []
            if item.code.strip() and item.quantity > 0)
    else:
        # Legacy jobs without a project retain the old design-derived issue
        # path. Project jobs are gated on a released approved extraction.
        rec = db.scalars(select(models.DesignRecord)
                         .where(models.DesignRecord.job_id == job.id)).first()
        if rec is None:
            return []
        import json
        from . import schemas
        design = schemas.DesignIn(**json.loads(rec.design_json)).engine_dict()
        qty = design.get("qty") or 1
        if design.get("category") == "frameless":
            bd = frameless_breakdown(design)
            code = FL_GLASS_CODE.get(design.get("glass_id") or "temp10")
            if code:
                wants.append((code, round(bd["total_area"] * qty, 2), "m2"))
            for hardware in bd["hardware"]:
                wants.append((
                    hardware["code"], hardware["qty"] * qty, "pcs"))
        else:
            metres: dict[str, float] = {}
            for piece in extract_pieces_any(design):
                profile = piece["profile"]
                metres[profile] = (
                    metres.get(profile, 0)
                    + piece["length_mm"] * piece["qty"] / 1000)
            for profile, length in metres.items():
                code = PROFILE_CODE.get(profile)
                if code:
                    wants.append((code, round(length * qty, 2), "m"))
            area = (design["width"] / 1000) * (design["height"] / 1000)
            wants.append((FRAME_GLASS_CODE, round(area * qty, 2), "m2"))

    issued: list[str] = []
    for code, q, unit in wants:
        mat = db.scalar(select(models.Material).where(models.Material.code == code))
        if mat is None or q <= 0:
            continue
        if normalize_unit(unit) != normalize_unit(mat.unit):
            continue
        mat.stock = round(mat.stock - q, 2)
        db.add(models.StockMove(material_id=mat.id, delta=-q,
                                reason=(
                                    f"Issued to {job.job_number}"
                                    + (
                                        f" from approved extraction "
                                        f"E{extraction.revision}"
                                        if extraction else "")),
                                job_number=job.job_number,
                                extraction_id=(
                                    extraction.id if extraction else None),
                                extraction_revision=(
                                    extraction.revision if extraction else None)))
        issued.append(f"{q} {mat.unit} {mat.code}")
    return issued


def ensure_engine_materials(db: Session) -> int:
    """Add every known system material without overwriting later real data."""
    added = 0
    for code, name, cat, unit, price, stock, reorder in SYSTEM_MATERIALS:
        if db.scalar(select(models.Material).where(models.Material.code == code)) is None:
            db.add(models.Material(code=code, name=name, category=cat, unit=unit,
                                   unit_price=price, stock=stock, reorder_level=reorder))
            added += 1
    if added:
        db.commit()
    return added


# ── API payload builders ──
def job_summary(db: Session, j: models.Job) -> dict:
    paid = paid_amount(db, j)
    qc = latest_qc(db, j)
    extraction = latest_approved_extraction(j.project) if j.project else None
    release = current_production_release(j.project, extraction)
    return {
        "id": j.job_number, "job_number": j.job_number,
        "project_id": j.project_id,
        "client": j.client.name if j.client else "—",
        "client_phone": j.client.phone if j.client else "",
        "product": j.product, "stage": j.stage,
        "stage_label": STAGE_LABEL.get(j.stage, j.stage),
        "progress": STAGE_PROGRESS.get(j.stage, j.progress),
        "value": round(j.value, 2), "paid_amount": round(paid, 2),
        "balance": round(max(j.value - paid, 0), 2),
        "deposit_percent": round(j.deposit_percent or 80, 2),
        "paid": f"{paid_pct(db, j)}%",
        "production_authorized": bool(release),
        "factory_release": ({
            "release_number": release.release_number,
            "extraction_revision": release.extraction_revision,
            "quotation_number": release.quotation_number,
            "drawing_revision": (
                release.drawing_revision_number
                if release.drawing_revision_number is not None
                else release.drawing_revision.revision),
            "files": json.loads(release.file_manifest or "[]"),
        } if release else None),
        "qc": qc.result if qc else None,
        "driver": j.driver, "vehicle": j.vehicle, "dn_number": j.dn_number,
        "delivered_at": j.delivered_at.isoformat() if j.delivered_at else None,
        "created_at": j.created_at.isoformat(),
        "due": j.created_at.strftime("%d %b"),
        "block": advance_block_reason(db, j),
        "next_stage": (STAGE_LABEL.get(STAGE_KEYS[stage_index(j.stage) + 1])
                       if stage_index(j.stage) + 1 < len(STAGE_KEYS) else None),
    }


def event_dict(e: models.Event, job_number: str | None = None) -> dict:
    return {"who": e.who, "kind": e.kind, "note": e.note,
            "job": job_number or "", "at": e.created_at.isoformat()}


def utcnow() -> datetime:
    return datetime.utcnow()

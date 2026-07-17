"""Job lifecycle — stages, gates and side-effects.

The pipeline every job walks, with Sofaamy's configurable deposit gate before
production, balance before close-out, and automatic material issue when
production starts.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .pricing import extract_pieces_any, frameless_breakdown

# Factory stages (CLAUDE.md; confirm exact list with Sofaamy)
STAGES = [
    ("pending",    "Awaiting Deposit", 0),
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


def advance_block_reason(db: Session, job: models.Job) -> str | None:
    """Why this job cannot move to the next stage (None = free to move)."""
    nxt_i = stage_index(job.stage) + 1
    if nxt_i >= len(STAGE_KEYS):
        return "Job is already completed"
    nxt = STAGE_KEYS[nxt_i]
    if job.stage == "pending" and job.value:
        deposit_percent = max(0, min(100, float(job.deposit_percent or 80)))
        required = job.value * deposit_percent / 100
        if paid_amount(db, job) + 0.5 < required:
            need = required - paid_amount(db, job)
            return f"{deposit_percent:.0f}% deposit required before production — GHS {need:,.2f} outstanding"
    if job.stage == "qa":
        qc = latest_qc(db, job)
        if qc is None:
            return "QA inspection not recorded yet"
        if qc.result != "pass":
            return "Last QA inspection flagged REWORK — re-inspect before dispatch"
    if nxt == "done" and job.value:
        if paid_amount(db, job) + 0.5 < job.value:
            need = job.value - paid_amount(db, job)
            return f"Balance payment required to close job — GHS {need:,.2f} outstanding"
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
    rec = db.scalars(select(models.DesignRecord)
                     .where(models.DesignRecord.job_id == job.id)).first()
    if rec is None:
        return []
    import json
    from . import schemas
    design = schemas.DesignIn(**json.loads(rec.design_json)).engine_dict()
    qty = design.get("qty") or 1

    wants: list[tuple[str, float, str]] = []   # (code, qty, unit-note)
    if design.get("category") == "frameless":
        bd = frameless_breakdown(design)
        code = FL_GLASS_CODE.get(design.get("glass_id") or "temp10")
        if code:
            wants.append((code, round(bd["total_area"] * qty, 2), "m²"))
        for h in bd["hardware"]:
            wants.append((h["code"], h["qty"] * qty, "pcs"))
    else:
        metres: dict[str, float] = {}
        for p in extract_pieces_any(design):
            metres[p["profile"]] = metres.get(p["profile"], 0) + p["length_mm"] * p["qty"] / 1000
        for pid, m in metres.items():
            code = PROFILE_CODE.get(pid)
            if code:
                wants.append((code, round(m * qty, 2), "m"))
        area = (design["width"] / 1000) * (design["height"] / 1000)
        wants.append((FRAME_GLASS_CODE, round(area * qty, 2), "m²"))

    issued: list[str] = []
    for code, q, unit in wants:
        mat = db.scalar(select(models.Material).where(models.Material.code == code))
        if mat is None or q <= 0:
            continue
        mat.stock = round(mat.stock - q, 2)
        db.add(models.StockMove(material_id=mat.id, delta=-q,
                                reason=f"Issued to {job.job_number}",
                                job_number=job.job_number))
        issued.append(f"{q} {mat.unit} {mat.code}")
    return issued


# ── materials the engines reference — inserted if missing so material
# issue matches on existing databases too (additive only) ──
ENGINE_MATERIALS = [
    # code, name, category, unit, unit_price (GHS, PLACEHOLDER), stock, reorder
    ("CW-MULLION", "Curtain Wall Mullion",          "Profile", "m", 140, 220, 120),
    ("CW-TRANSOM", "Curtain Wall Transom",          "Profile", "m", 130, 180, 120),
    ("GL-TMP-8",   "Tempered Glass 8mm",            "Glass", "m2", 390, 85, 40),
    ("GL-TMP-10",  "Tempered Glass 10mm",           "Glass", "m2", 480, 120, 60),
    ("GL-TMP-12",  "Tempered Glass 12mm",           "Glass", "m2", 620, 45, 30),
    ("GL-FRST-10", "Frosted Tempered 10mm",         "Glass", "m2", 540, 30, 20),
    ("GL-LAM-13",  "Laminated Glass 13.52mm",       "Glass", "m2", 750, 18, 15),
    ("BL 203",     "Glass Clamp",                   "Hardware", "pcs", 36, 240, 100),
    ("CSM-50W",    "Patch Lock c/w Floor Strike",   "Hardware", "pcs", 185, 26, 12),
    ("JQ 104(900MM)", "Pull Handle 900mm Pair",     "Hardware", "pcs", 262, 18, 10),
    ("KL-HD 203-6","Floor Spring / Pivot Set",      "Hardware", "pcs", 470, 14, 8),
    ("KL-M102/T",  "Bottom Door Patch",             "Hardware", "pcs", 110, 30, 15),
    ("KL-M202",    "Top Door Patch",                "Hardware", "pcs", 110, 28, 15),
    ("KL-M402",    "Over-panel Patch",              "Hardware", "pcs", 185, 20, 10),
    ("SH-90",      "Shower Hinge",                  "Hardware", "pcs", 150, 40, 20),
    ("SH-KNOB",    "Shower Knob",                   "Hardware", "pcs", 60, 35, 15),
    ("SL-ROLLER",  "Sliding Roller Set",            "Hardware", "set", 220, 30, 15),
    ("SCL SET",    "SCL Sliding Set",               "Hardware", "set", 950, 10, 6),
    ("SH005 SET",  "SH005 Sliding Set",             "Hardware", "set", 850, 8, 6),
    ("ND-SET",     "Non-Digging Spring Set",        "Hardware", "set", 690, 9, 5),
    ("SANHE-SET",  "San He Patch Set",              "Hardware", "set", 650, 7, 5),
    ("SPIDER-SET", "Spider Fitting Set",            "Hardware", "set", 780, 6, 4),
]


def ensure_engine_materials(db: Session) -> int:
    added = 0
    for code, name, cat, unit, price, stock, reorder in ENGINE_MATERIALS:
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
    return {
        "id": j.job_number, "job_number": j.job_number,
        "client": j.client.name if j.client else "—",
        "client_phone": j.client.phone if j.client else "",
        "product": j.product, "stage": j.stage,
        "stage_label": STAGE_LABEL.get(j.stage, j.stage),
        "progress": STAGE_PROGRESS.get(j.stage, j.progress),
        "value": round(j.value, 2), "paid_amount": round(paid, 2),
        "balance": round(max(j.value - paid, 0), 2),
        "deposit_percent": round(j.deposit_percent or 80, 2),
        "paid": f"{paid_pct(db, j)}%",
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

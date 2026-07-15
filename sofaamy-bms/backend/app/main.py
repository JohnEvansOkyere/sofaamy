"""Sofaamy Cloud API — FastAPI + SQLite.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func

import hashlib
import hmac
import json

from .database import Base, engine, get_db, SessionLocal
from . import models, schemas, lifecycle as lc
from .pricing import calc_quote, calc_any_quote, extract_pieces_any, frameless_breakdown
from .optimizer import optimize
from .pdf import quote_pdf
from .reports import (boq_pdf, cutting_list_pdf, work_order_pdf,
                      glass_order_pdf, hardware_list_pdf, fl_work_order_pdf,
                      installation_sheet_pdf, delivery_note_pdf,
                      project_summary_pdf, elevation_pdf, price_breakdown_pdf)

Base.metadata.create_all(bind=engine)


def _auto_migrate():
    """Additive SQLite migration: create_all makes new TABLES but not new
    COLUMNS — add any the models gained, so existing databases keep working."""
    from sqlalchemy import text
    wanted = {
        "jobs": [("value", "FLOAT DEFAULT 0"), ("driver", "TEXT DEFAULT ''"),
                 ("vehicle", "TEXT DEFAULT ''"), ("dn_number", "TEXT DEFAULT ''"),
                 ("delivered_at", "DATETIME")],
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
                    "at": mv.created_at.isoformat()})
    return out


@app.get("/api/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.scalars(select(models.Job).order_by(models.Job.created_at.desc())).all()
    return [lc.job_summary(db, j) for j in jobs]


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
    return {
        **lc.job_summary(db, j),
        "stages": [{"key": k, "label": l} for k, l, _ in lc.STAGES],
        "payments": [{"kind": p.kind, "method": p.method, "amount": p.amount,
                      "ref": p.ref, "at": p.created_at.isoformat()} for p in payments],
        "events": [lc.event_dict(e) for e in events],
        "qc_checks": [{"result": q.result, "score": q.score, "notes": q.notes,
                       "inspector": q.inspector, "at": q.created_at.isoformat(),
                       "checklist": json.loads(q.checklist or "[]")} for q in qcs],
        "design": json.loads(rec.design_json) if rec else None,
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
    db.add(models.Payment(job_id=j.id, kind=p.kind, method=p.method,
                          amount=p.amount, ref=p.ref))
    lc.log(db, "payment",
           f"recorded {p.kind} of GHS {p.amount:,.2f} ({p.method}) — {j.job_number}",
           job_id=j.id, who=p.who)
    db.flush()
    lc.refresh_paid(db, j)
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

    quote.status = req.status
    result = {"quote_number": quote.quote_number, "status": quote.status}

    if req.status == "Sent":
        lc.log(db, "quote", f"sent quote {quote.quote_number} to "
               f"{quote.client_name} via WhatsApp", who=req.who)
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
                             client_id=client.id, product=quote.product,
                             stage="pending", progress=0, paid="0%", value=quote.total)
            db.add(job); db.flush()
            quote.job_id = job.id
            result["job_number"] = job.job_number
            lc.log(db, "quote", f"{quote.client_name} accepted {quote.quote_number} — "
                   f"job {job.job_number} opened (GHS {quote.total:,.0f}), awaiting 50% deposit",
                   job_id=job.id, who=req.who)
        else:
            job = db.get(models.Job, quote.job_id)
            result["job_number"] = job.job_number if job else None
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
        out.append({"quote_number": q.quote_number, "client_name": q.client_name,
                    "product": q.product, "total": q.total, "status": q.status,
                    "created_at": q.created_at.isoformat() if q.created_at else None,
                    "job_number": job.job_number if job else None})
    return out


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
                          result: dict, status: str) -> models.Quote:
    n = db.scalar(select(func.count(models.Quote.id))) or 0
    first = design.cells[0] if design.cells else schemas.DesignCell()
    quote = models.Quote(
        quote_number=f"SOF-Q-{datetime.now():%Y}-{n + 143:04d}",
        client_name=client_name or "Walk-in Client", product=design.name,
        width_mm=design.width, height_mm=design.height,
        panels=design.cols * design.rows,
        opening=first.opening, glass=first.glass,
        total=result["grand_total"], status=status,
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
    result = calc_any_quote(req.design.engine_dict())
    quote = _persist_design_quote(db, req.client_name, req.design, result, "Sent")
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
    quote = _persist_design_quote(db, req.client_name, req.design, result, "Accepted")

    name = req.client_name or "Walk-in Client"
    client = db.scalar(select(models.Client).where(models.Client.name == name))
    if client is None:
        client = models.Client(name=name)
        db.add(client); db.flush()

    n = db.scalar(select(func.count(models.Job.id))) or 0
    job = models.Job(
        job_number=f"SOF-{datetime.now():%Y}-{n + 101:03d}",
        client_id=client.id, product=req.design.name,
        stage="pending", progress=0, paid="0%", value=result["grand_total"],
    )
    db.add(job); db.flush()
    quote.job_id = job.id
    db.add(models.DesignRecord(
        ref=req.design.ref, name=req.design.name, client_name=name,
        qty=req.design.qty, location=req.design.location,
        total=result["grand_total"], design_json=req.design.model_dump_json(),
        job_id=job.id,
    ))
    lc.log(db, "quote", f"quote {quote.quote_number} accepted — job {job.job_number} "
           f"opened for {name} (GHS {result['grand_total']:,.0f}), awaiting 50% deposit",
           job_id=job.id, who="Kwame Mensah")
    db.commit()
    return {"job_number": job.job_number, "quote_number": quote.quote_number,
            "total": result["grand_total"], "currency": "GHS"}


def _pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
    })


@app.post("/api/reports/{kind}")
def design_report(kind: str, req: schemas.DesignQuoteIn):
    """Design documents. Any category: summary | elevation | quotation |
    price-breakdown. Frame/curtain wall: cutting-list | work-order | boq.
    Frameless: glass-order | hardware-list | work-order | installation."""
    d = req.design.engine_dict()
    result = calc_any_quote(d)
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
    if kind == "boq":
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
    rec = models.DesignRecord(
        ref=req.design.ref, name=req.design.name, client_name=req.client_name,
        qty=req.design.qty, location=req.design.location,
        total=result["grand_total"], design_json=req.design.model_dump_json(),
    )
    db.add(rec); db.commit(); db.refresh(rec)
    return {"id": rec.id, "ref": rec.ref, "name": rec.name, "total": rec.total,
            "share_token": share_token(rec.id)}


@app.get("/api/designs")
def list_designs(db: Session = Depends(get_db)):
    recs = db.scalars(select(models.DesignRecord)
                      .order_by(models.DesignRecord.created_at.desc())).all()
    return [{"id": r.id, "ref": r.ref, "name": r.name, "qty": r.qty,
             "location": r.location, "total": r.total,
             "client_name": r.client_name,
             "created_at": r.created_at.isoformat(),
             "share_token": share_token(r.id),
             "design": json.loads(r.design_json)} for r in recs]


@app.post("/api/optimize")
def optimize_cutting(req: schemas.OptimizeRequest):
    """Cutting optimization — nests demand pieces onto stock bars."""
    return optimize([p.model_dump() for p in req.pieces], req.kerf_mm)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    """Everything on the dashboard, computed from the live database."""
    from datetime import timedelta
    now = datetime.utcnow()

    jobs = db.scalars(select(models.Job)).all()
    quotes = db.scalars(select(models.Quote)).all()
    payments = db.scalars(select(models.Payment)).all()
    materials = db.scalars(select(models.Material)).all()

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

    # payments received per week, last 8 weeks
    trend = []
    for w in range(7, -1, -1):
        start = now - timedelta(days=(w + 1) * 7)
        end = now - timedelta(days=w * 7)
        amt = sum(p.amount for p in payments if start <= p.created_at < end)
        trend.append({"label": f"W{8 - w}", "value": round(amt / 1000, 1)})

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
                        .order_by(models.Event.created_at.desc()).limit(8)).all()
    feed = []
    for e in events:
        job = db.get(models.Job, e.job_id) if e.job_id else None
        feed.append(lc.event_dict(e, job.job_number if job else None))

    recent_jobs = [lc.job_summary(db, j) for j in
                   sorted(jobs, key=lambda j: j.created_at, reverse=True)[:6]]

    return {
        "active_jobs": len(active), "open_quotes": len(open_q),
        "clients": db.scalar(select(func.count(models.Client.id))) or 0,
        "revenue_month": round(revenue_month, 2),
        "outstanding": round(outstanding, 2),
        "convert_pct": convert,
        "quoted_month": round(sum(q.total for q in quotes
                                  if q.created_at and q.created_at >= month_start), 2),
        "trend": trend, "stage_mix": stage_mix,
        "low_stock": low_stock, "stock_value": round(stock_value, 2),
        "activity": feed, "recent_jobs": recent_jobs,
        "awaiting_deposit": len([j for j in active if j.stage == "pending"]),
        "awaiting_qa": len([j for j in active if j.stage == "qa"]),
        "in_dispatch": len([j for j in active if j.stage in ("dispatch", "install")]),
    }

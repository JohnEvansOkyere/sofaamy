"""Sofaamy Cloud API — FastAPI + SQLite.

Run:  uvicorn app.main:app --reload
Docs: http://localhost:8000/docs
"""
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import select, func

import json

from .database import Base, engine, get_db
from . import models, schemas
from .pricing import calc_quote, calc_any_quote, extract_pieces_any
from .optimizer import optimize
from .pdf import quote_pdf
from .reports import (boq_pdf, cutting_list_pdf, work_order_pdf,
                      glass_order_pdf, hardware_list_pdf, fl_work_order_pdf,
                      installation_sheet_pdf)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Sofaamy Cloud API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Quote-Number"],
)


@app.get("/")
def root():
    return {"service": "Sofaamy Cloud API", "status": "ok", "db": "sqlite"}


@app.get("/api/clients", response_model=list[schemas.ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return db.scalars(select(models.Client)).all()


@app.get("/api/materials", response_model=list[schemas.MaterialOut])
def list_materials(db: Session = Depends(get_db)):
    return db.scalars(select(models.Material)).all()


@app.get("/api/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.scalars(select(models.Job)).all()
    return [{"id": j.job_number, "client": j.client.name if j.client else "—",
             "product": j.product, "stage": j.stage, "progress": j.progress,
             "paid": j.paid, "due": j.created_at.strftime("%d %b")} for j in jobs]


@app.get("/api/quotes", response_model=list[schemas.QuoteOut])
def list_quotes(db: Session = Depends(get_db)):
    return db.scalars(select(models.Quote)).all()


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
        stage="cutting", progress=0, paid="0%",
    )
    db.add(job); db.flush()
    quote.job_id = job.id
    db.add(models.DesignRecord(
        ref=req.design.ref, name=req.design.name, client_name=name,
        qty=req.design.qty, location=req.design.location,
        total=result["grand_total"], design_json=req.design.model_dump_json(),
        job_id=job.id,
    ))
    db.commit()
    return {"job_number": job.job_number, "quote_number": quote.quote_number,
            "total": result["grand_total"], "currency": "GHS"}


def _pdf_response(pdf: bytes, filename: str) -> Response:
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
    })


@app.post("/api/reports/{kind}")
def design_report(kind: str, req: schemas.DesignQuoteIn):
    """Production/material reports for a design: cutting-list | work-order | boq."""
    d = req.design.engine_dict()
    result = calc_any_quote(d)
    pieces = extract_pieces_any(d)
    qty = d.get("qty") or 1
    demand = [{**p, "qty": p["qty"] * qty} for p in pieces]
    plan = optimize(demand)
    ref = (d.get("ref") or d["name"]).replace(" ", "-")

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
    return {"id": rec.id, "ref": rec.ref, "name": rec.name, "total": rec.total}


@app.get("/api/designs")
def list_designs(db: Session = Depends(get_db)):
    recs = db.scalars(select(models.DesignRecord)
                      .order_by(models.DesignRecord.created_at.desc())).all()
    return [{"id": r.id, "ref": r.ref, "name": r.name, "qty": r.qty,
             "location": r.location, "total": r.total,
             "created_at": r.created_at.isoformat(),
             "design": json.loads(r.design_json)} for r in recs]


@app.post("/api/optimize")
def optimize_cutting(req: schemas.OptimizeRequest):
    """Cutting optimization — nests demand pieces onto stock bars."""
    return optimize([p.model_dump() for p in req.pieces], req.kerf_mm)


@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db)):
    jobs = db.scalar(select(func.count(models.Job.id))) or 0
    quotes = db.scalar(select(func.count(models.Quote.id))) or 0
    clients = db.scalar(select(func.count(models.Client.id))) or 0
    return {"active_jobs": jobs, "open_quotes": quotes, "clients": clients}

"""Populate the SQLite database with demo data.

Run once:  python seed.py
WARNING: drops and recreates all tables.
"""
from datetime import datetime, timedelta

from app.database import Base, engine, SessionLocal
from app import models
from app.lifecycle import ensure_engine_materials, STAGE_PROGRESS

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()
now = datetime.utcnow()
ago = lambda **kw: now - timedelta(**kw)

users = [
    ("Kwame Mensah", "supervisor", "+233240001122"),
    ("Yaa Boateng", "supervisor", "+233201112233"),
    ("Kofi Adjei", "rep", "+233272223344"),
    ("Yaw Darko", "qa", "+233554445566"),
    ("Esi Quaye", "accounts", "+233265556677"),
    ("Kojo Antwi", "procurement", "+233246667788"),
]
db.add_all([models.User(name=n, role=r, phone=p) for n, r, p in users])

clients = [
    ("Adom Estates Ltd", "Ama Owusu", "+233241182204", "East Legon, Accra", "company"),
    ("Golden Tulip Hotel", "Facilities", "+233302213344", "Airport City, Accra", "company"),
    ("Nii Armah Residence", "Nii Armah", "+233205559081", "Cantonments, Accra", "individual"),
    ("Trasacco Valley", "Project Team", "+233249007788", "Trasacco, Accra", "company"),
    ("Kumasi City Mall", "Ops Manager", "+233322084455", "Kumasi", "company"),
    ("Mensah Family Home", "Efua Mensah", "+233276641120", "Spintex, Accra", "individual"),
]
client_rows = [models.Client(name=n, contact=c, phone=p, location=l, type=t)
               for n, c, p, l, t in clients]
db.add_all(client_rows)

# legacy generic materials + every code the engines reference
materials = [
    ("AL-PRO-40", "Aluminium Profile 40mm", "Profile", "m", 85, 420, 200),
    ("AL-PRO-60", "Aluminium Profile 60mm", "Profile", "m", 110, 180, 200),
    ("GL-CLR-6", "Clear Glass 6mm", "Glass", "m2", 120, 64, 40),
    ("HW-HNG-01", "Casement Hinge", "Hardware", "pcs", 45, 12, 40),
    ("AC-GSK-01", "EPDM Rubber Gasket", "Accessory", "m", 6, 800, 300),
]
db.add_all([models.Material(code=c, name=n, category=cat, unit=u,
            unit_price=pr, stock=s, reorder_level=r)
            for c, n, cat, u, pr, s, r in materials])
db.commit()
ensure_engine_materials(db)

# jobs across the whole pipeline — value + staged payments tell the story
jobs = [
    # job_no, client_idx, product, stage, value, created days ago
    # (082's value = the frameless engine's real total for its attached design)
    ("SOF-2026-082", 0, "Frameless Swing Doors ×2", "pending",  12417.60, 0),
    ("SOF-2026-081", 0, "Sliding Windows ×12",      "assembly", 86400, 9),
    ("SOF-2026-080", 1, "Curtain Wall",             "cutting",  214000, 5),
    ("SOF-2026-079", 3, "Partition + Glass",        "glazing",  112800, 12),
    ("SOF-2026-078", 2, "Aluminium Door ×2",        "qa",       24600, 16),
    ("SOF-2026-077", 4, "Frameless Shopfront",      "dispatch", 96500, 21),
    ("SOF-2026-076", 5, "Casement Windows ×6",      "done",     31200, 30),
]
job_rows = {}
for jn, ci, pr, st, val, days in jobs:
    j = models.Job(job_number=jn, client_id=ci + 1, product=pr, stage=st,
                   progress=STAGE_PROGRESS.get(st, 0), value=val,
                   paid="0%", created_at=ago(days=days))
    job_rows[jn] = j
    db.add(j)
db.flush()

# attach the real configurator design to the pending job, so advancing it
# to Cutting issues glass + hardware from stock (the flagship demo path)
import json
swing_design = {
    "category": "frameless", "name": "Double Swing Doors", "ref": "AD-DR-1",
    "qty": 2, "location": "Main entrance, East Legon site",
    "system": "standard", "finishType": "powder",
    "width": 1900, "height": 2400, "cols": 2, "rows": 1, "frame": "mill",
    "colWidths": [950, 950], "rowHeights": [2400],
    "cells": [{"glass": "clear", "opening": "fixed", "panels": 1, "type": "door"},
              {"glass": "clear", "opening": "fixed", "panels": 1, "type": "door"}],
    "glassId": "temp10", "overPanel": False, "doorH": 2100,
    "flSystem": "klpatches", "slideSystem": "scl", "cornerAfter": -1,
    "scene": "shopfront",
}
db.add(models.DesignRecord(ref="AD-DR-1", name="Double Swing Doors",
                           client_name="Adom Estates Ltd", qty=2,
                           location="Main entrance, East Legon site",
                           total=12417.60, design_json=json.dumps(swing_design),
                           job_id=job_rows["SOF-2026-082"].id,
                           created_at=ago(days=1)))

# payments — deposits when jobs opened, balances near delivery (spread over
# the last 8 weeks so the revenue trend has shape)
payments = [
    ("SOF-2026-081", "deposit", "momo", 43200, 9),
    ("SOF-2026-080", "deposit", "bank", 107000, 5),
    ("SOF-2026-079", "deposit", "bank", 56400, 12),
    ("SOF-2026-078", "deposit", "momo", 12300, 16),
    ("SOF-2026-078", "balance", "momo", 12300, 2),
    ("SOF-2026-077", "deposit", "bank", 48250, 21),
    ("SOF-2026-077", "balance", "bank", 48250, 1),
    ("SOF-2026-076", "deposit", "cash", 15600, 30),
    ("SOF-2026-076", "balance", "momo", 15600, 24),
]
for jn, kind, method, amount, days in payments:
    db.add(models.Payment(job_id=job_rows[jn].id, kind=kind, method=method,
                          amount=amount, created_at=ago(days=days)))
for j in job_rows.values():
    paid = sum(a for jn2, _, _, a, _ in payments if jn2 == j.job_number)
    j.paid = f"{min(100, round(paid / j.value * 100)) if j.value else 0}%"

# QC + dispatch state
db.add(models.QcCheck(job_id=job_rows["SOF-2026-077"].id, result="pass", score=92,
                      inspector="Yaw Darko", notes="Edgework clean, dims within 1mm",
                      created_at=ago(days=2)))
db.add(models.QcCheck(job_id=job_rows["SOF-2026-079"].id, result="rework", score=71,
                      inspector="Yaw Darko", notes="Glazing bead gap on F2 — redo seal",
                      created_at=ago(days=1)))
job_rows["SOF-2026-077"].driver = "Sammy K."
job_rows["SOF-2026-077"].vehicle = "GT-4821-22"
job_rows["SOF-2026-077"].dn_number = "SOF-DN-2026-088"
job_rows["SOF-2026-076"].driver = "Emmanuel O."
job_rows["SOF-2026-076"].vehicle = "GS-1190-21"
job_rows["SOF-2026-076"].dn_number = "SOF-DN-2026-087"
job_rows["SOF-2026-076"].delivered_at = ago(days=23)

quotes = [
    ("SOF-Q-2026-0142", "Adom Estates Ltd", "Sliding Windows ×12", 86400, "Accepted", "SOF-2026-081", 10),
    ("SOF-Q-2026-0141", "Golden Tulip Hotel", "Curtain Wall", 214000, "Accepted", "SOF-2026-080", 6),
    ("SOF-Q-2026-0140", "Nii Armah Residence", "Aluminium Door ×2", 24600, "Accepted", "SOF-2026-078", 17),
    ("SOF-Q-2026-0139", "Trasacco Valley", "Partition + Glass", 112800, "Accepted", "SOF-2026-079", 13),
    ("SOF-Q-2026-0138", "Mensah Family Home", "Casement Windows ×6", 31200, "Declined", None, 8),
    ("SOF-Q-2026-0137", "Kumasi City Mall", "Frameless Sliding Partition", 42800, "Sent", None, 2),
    ("SOF-Q-2026-0136", "Adom Estates Ltd", "Frameless Swing Doors ×2", 12417.60, "Accepted", "SOF-2026-082", 1),
    ("SOF-Q-2026-0135", "Golden Tulip Hotel", "Balustrade Run — Pool Deck", 18900, "Draft", None, 0),
]
for qn, cn, pr, total, status, jn, days in quotes:
    db.add(models.Quote(quote_number=qn, client_name=cn, product=pr, total=total,
                        status=status, created_at=ago(days=days),
                        job_id=job_rows[jn].id if jn else None))

# activity feed
events = [
    (None, "Esi Quaye", "payment", "recorded balance of GHS 48,250.00 (bank) — SOF-2026-077", 1, "SOF-2026-077"),
    (None, "Yaw Darko", "qc", "SOF-2026-077 passed QA (92%) — Edgework clean, dims within 1mm", 2, "SOF-2026-077"),
    (None, "Kwame Mensah", "dispatch", "delivery SOF-DN-2026-088 assigned to Sammy K. (GT-4821-22)", 1, "SOF-2026-077"),
    (None, "Yaw Darko", "qc", "SOF-2026-079 flagged for REWORK at QA (71%) — Glazing bead gap on F2", 1, "SOF-2026-079"),
    (None, "Kwame Mensah", "quote", "sent quote SOF-Q-2026-0137 to Kumasi City Mall via WhatsApp", 2, None),
    (None, "Kwame Mensah", "quote", "quote SOF-Q-2026-0136 accepted — job SOF-2026-082 opened for Adom Estates Ltd (GHS 12,418), awaiting 50% deposit", 1, "SOF-2026-082"),
    (None, "Yaa Boateng", "stage", "moved SOF-2026-080 to Cutting — materials issued: 118.4 m AL-MOLLIUM, 86.2 m AL-TRANSUM", 4, "SOF-2026-080"),
    (None, "Kojo Antwi", "stock", "received 200 m AL-MOLLIUM (Mollium Profile)", 3, None),
]
for _, who, kind, note, days, jn in events:
    db.add(models.Event(job_id=job_rows[jn].id if jn else None, who=who, kind=kind,
                        note=note, created_at=ago(days=days, hours=2)))

# a few stock movements so Inventory has history
mat = {m.code: m for m in db.query(models.Material).all()}
moves = [
    ("AL-MOLLIUM", 200, "Goods received — Tema supplier", "", 3),
    ("AL-MOLLIUM", -118.4, "Issued to SOF-2026-080", "SOF-2026-080", 4),
    ("AL-TRANSUM", -86.2, "Issued to SOF-2026-080", "SOF-2026-080", 4),
    ("GL-TMP-10", -11.4, "Issued to SOF-2026-077", "SOF-2026-077", 18),
    ("BL 203", -22, "Issued to SOF-2026-077", "SOF-2026-077", 18),
]
for code, delta, reason, jn, days in moves:
    if code in mat:
        db.add(models.StockMove(material_id=mat[code].id, delta=delta, reason=reason,
                                job_number=jn, created_at=ago(days=days)))

db.commit()
print("Seeded sofaamy.db:",
      db.query(models.Client).count(), "clients,",
      db.query(models.Job).count(), "jobs,",
      db.query(models.Material).count(), "materials,",
      db.query(models.Quote).count(), "quotes,",
      db.query(models.Payment).count(), "payments,",
      db.query(models.Event).count(), "events.")
db.close()

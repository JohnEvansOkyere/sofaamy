"""Populate the SQLite database with demo data.

Run once:  python seed.py
"""
from app.database import Base, engine, SessionLocal
from app import models

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
db = SessionLocal()

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
]
client_rows = [models.Client(name=n, contact=c, phone=p, location=l, type=t)
               for n, c, p, l, t in clients]
db.add_all(client_rows)

materials = [
    ("AL-PRO-40", "Aluminium Profile 40mm", "Profile", "m", 85, 420, 200),
    ("AL-PRO-60", "Aluminium Profile 60mm", "Profile", "m", 110, 180, 200),
    ("GL-CLR-6", "Clear Glass 6mm", "Glass", "m2", 120, 64, 40),
    ("GL-TMP-8", "Tempered Glass 8mm", "Glass", "m2", 230, 22, 30),
    ("HW-SLD-01", "Sliding Roller Set", "Hardware", "set", 240, 96, 50),
    ("HW-HNG-01", "Casement Hinge", "Hardware", "pcs", 45, 12, 40),
    ("AC-GSK-01", "EPDM Rubber Gasket", "Accessory", "m", 6, 800, 300),
]
db.add_all([models.Material(code=c, name=n, category=cat, unit=u,
            unit_price=pr, stock=s, reorder_level=r)
            for c, n, cat, u, pr, s, r in materials])

db.commit()

jobs = [
    ("SOF-2026-081", 1, "Sliding Windows x12", "assembly", 55, "50%"),
    ("SOF-2026-080", 2, "Curtain Wall", "cutting", 15, "50%"),
    ("SOF-2026-079", 4, "Partition + Glass", "glazing", 72, "50%"),
    ("SOF-2026-078", 3, "Aluminium Door x2", "qa", 88, "100%"),
    ("SOF-2026-077", 5, "Frameless Shopfront", "dispatch", 94, "100%"),
]
db.add_all([models.Job(job_number=jn, client_id=cid, product=pr,
            stage=st, progress=pg, paid=pd)
            for jn, cid, pr, st, pg, pd in jobs])

quotes = [
    ("SOF-Q-2026-0142", "Adom Estates Ltd", "Sliding Windows x12", 86400, "Approved"),
    ("SOF-Q-2026-0141", "Golden Tulip Hotel", "Curtain Wall", 214000, "Sent"),
    ("SOF-Q-2026-0140", "Nii Armah Residence", "Aluminium Door x2", 24600, "Draft"),
    ("SOF-Q-2026-0139", "Trasacco Valley", "Partition + Glass", 112800, "Approved"),
]
db.add_all([models.Quote(quote_number=qn, client_name=cn, product=pr,
            total=t, status=s)
            for qn, cn, pr, t, s in quotes])

db.commit()
print("Seeded sofaamy.db:",
      db.query(models.Client).count(), "clients,",
      db.query(models.Job).count(), "jobs,",
      db.query(models.Material).count(), "materials,",
      db.query(models.Quote).count(), "quotes.")
db.close()

# Sofaamy BMS — Master Checklist

Living tracker for the Sofaamy engagement. Tick items as they complete. See `PROJECT_OUTLINE.md` for the full scope and `../CLAUDE.md` for conventions.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked/needs decision

---

## A. Blocking Inputs From Sofaamy
*(From the Information Requirements doc — we can't finalize Phase 1 pricing/templates without the Urgent items.)*

### Products & pricing (Urgent)
- [ ] Full product list (all types they make)
- [ ] Standard / min / max sizes per product
- [ ] Opening types per product (fixed, casement, sliding, louvre; single/double leaf, pivot, folding…)
- [ ] Panel configurations (1/2/3 panels, standard divisions)
- [ ] Aluminium profile list + price per metre
- [ ] Glass types + price per m²
- [ ] Labour calculation basis + current rate
- [ ] Payment terms (assumed 50% deposit / 50% delivery — confirm)

### Products & pricing (Standard)
- [ ] Hardware items + prices
- [ ] Accessories + how priced
- [ ] How often prices change + who updates them
- [ ] Existing drawings / CAD / sketches

### Team & setup (Urgent)
- [ ] Full user list + job titles + system roles
- [ ] WhatsApp business number
- [ ] Current quote layout (total only vs full breakdown)
- [ ] Company logo (hi-res PNG, transparent)
- [ ] System administrator name
- [ ] Primary day-to-day contact

### Team & setup (Standard)
- [ ] Phone/email per user
- [ ] Existing client list + import decision
- [ ] Job numbering format (assumed `SOF-YYYY-NNN` — confirm)
- [ ] Factory stages confirmed + who owns each stage
- [ ] Preferred web address (e.g. app.sofaamy.com)
- [ ] Devices the team uses

---

## B. Demo-Day Prep (win the joint meeting vs EvA)
- [ ] Rehearse the 5 win themes (Outline §3)
- [ ] Configurator demo script: build a real Sofaamy product → live GHS quote → PDF → "send on WhatsApp"
- [ ] Pipeline-tracker walkthrough screen
- [ ] EvA-vs-Veloxa comparison one-pager (feature parity + 3-year cost of ownership)
- [ ] Sofaamy branding applied (logo, name; "Powered by Veloxa" only)
- [ ] Confirm meeting date/time + attendees (Sofaamy + EvA India team)

---

## C. Build Phases

### Phase 0 — Demo-to-win  ✅ BUILT & VERIFIED (`sofaamy-bms/`)
- [x] Sofaamy-branded app shell + full dashboard (11 modules, populated)
- [x] Multiple product templates (window, door, sliding, partition, curtain wall, frameless, balustrade, canopy)
- [x] Fully-interactive react-konva configurator (dimensions, panels, opening, glass, finish)
- [x] Live GHS quote + bill of materials
- [x] "Send on WhatsApp" / "Download PDF" / "Save & Create Job" actions (mocked)
- [x] Production pipeline board (factory stages) + CRM, surveys, inventory, dispatch, QA, reports
- [x] FastAPI + SQLite backend (seeded; pricing + data endpoints, verified)
- [ ] Wire frontend → backend API (currently frontend runs on seed data)
- [ ] Real PDF generation + live WhatsApp send (Africa's Talking)

### Phase 1 — Foundation + Configurator
- [ ] Repo init (frontend + backend) + tooling
- [ ] Auth + 7 roles (JWT + Supabase RLS)
- [ ] DB schema (jobs, clients, measurements, templates, designs, quotes, bom_items, pipeline_stages, materials)
- [ ] M1 intake (field PWA + walk-in)
- [ ] M2 configurator + estimator wired to real backend + real prices
- [ ] Quote PDF + WhatsApp send (Africa's Talking)

### Phase 2 — Pipeline + Commercial
- [ ] M3 pipeline tracker (real factory stages, notifications, QA/payment gates)
- [ ] Survey capture + quote-vs-survey diff
- [ ] M5 invoicing & payments (GHS, 50/50 gates)

### Phase 3 — Optimization + Inventory + Analytics
- [ ] M3 production/cutting optimization (nesting)
- [ ] QR dispatch + on-site install tracking
- [ ] M4 inventory & procurement
- [ ] M6 management analytics dashboard

---

## D. Housekeeping / Decisions Needed
- [!] `archive/` holds 2 older Project-Proposal PDF versions + 2 configurator zips — **confirm safe to delete** (kept, not deleted).
- [!] Duplicate `Sofaamy Business Management System — Project Proposal.docx` still inside `prototypes/configurator/` — leave or remove?
- [ ] Decide whether to `git init` the workspace.
- [ ] Confirm canonical Project Proposal = newest version (moved to `docs/reference/Project-Proposal.pdf`).

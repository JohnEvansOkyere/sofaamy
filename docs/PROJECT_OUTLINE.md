# Sofaamy Business Management System — Project Outline & Win Strategy

**Client:** Sofaamy Co. Ltd — Accra, Ghana (glass & aluminium fabrication and installation)
**Vendor:** Veloxa Technology Limited
**Competitor:** EvA Cloud — evawinoptimize.com (Evolutionary Algorithms Pvt Ltd, India)
**Status:** Competitive bid. Sofaamy is impressed by our demo but is also evaluating EvA Cloud and leaning toward buying it. We must win the deal via a superior, tailored system and a decisive live demo (joint meeting with Sofaamy + EvA's India team).
**Document owner:** Veloxa · **Version:** 1.0 · **Date:** 2026-07-07

---

## 1. The Situation

Sofaamy manufactures and installs glass & aluminium products (window frames, door frames, frameless glass, curtain walls, canopies, balustrades, partitions). Their current process is manual: phone/WhatsApp intake, hand-measured surveys, manual quotes, verbal/printed factory instructions, no live job tracking.

We showed a working **visual design configurator** demo (React + react-konva, live GHS pricing). They were impressed. Last week they sent us **EvA Cloud** — a mature, off-the-shelf cloud fenestration ERP from India — saying it "solves their problem," and asked for a joint demo. They are close to buying EvA.

**Our objective:** convert Sofaamy from "buy EvA" to "build with Veloxa" by proving a system that is *more tailored, more local, and fully owned* — and that matches EvA on the capabilities that impressed them.

---

## 2. Competitor Snapshot — EvA Cloud

Cloud-based fenestration (window & door) ERP for uPVC + aluminium fabricators. Confirmed capabilities:

| Area | EvA Cloud offers |
|---|---|
| Design | 3D/CAD design configurator, sectional drawings, CAD output |
| Quotation | Instant on-site quotes on mobile/tablet/laptop from a design library |
| CRM | Built-in CRM — opportunities, tasks, contacts, sales pipeline, reporting |
| Survey | Site survey data capture; quote-vs-survey comparison reports |
| Production | Profile/cutting **optimization** (waste reduction), production calculation, batch scheduling, work-order + machine-utilization monitoring |
| Inventory | Stock management, batch management |
| Tracking | Barcode scanning for dispatch & installation tracking |
| Quality | Post-production & post-installation QA checks |
| Ops | Order processing → invoicing |

**Their weaknesses (our openings):**
- Foreign vendor — recurring per-user SaaS licensing, priced in INR/USD, paid abroad indefinitely.
- Generic to uPVC/aluminium windows & doors — **not** shaped to Sofaamy's fuller product range (curtain wall, canopy, balustrade, partition, frameless glass) or their exact Accra factory stages.
- No native Ghana context: no first-class **WhatsApp** client comms, GHS pricing conventions, Ghana payment terms (50% deposit / 50% on delivery), or on-the-ground support.
- Data lives on their servers, on their roadmap, on their timeline. Sofaamy can't own it or change it.
- Onboarding = bend Sofaamy's workflow to fit EvA's product. We do the reverse.

---

## 3. Win Strategy — Why Veloxa Beats EvA

We do not out-feature EvA on day one. We **out-fit** them, then reach feature parity on the things Sofaamy actually values, and we own the relationship.

**Five win themes (use these verbatim in the meeting):**

1. **Tailored, not adapted.** Every screen, product template, factory stage, role and price rule is built around *how Sofaamy already works* — confirmed against their Information Requirements. EvA makes Sofaamy change; we change the software.
2. **Ghana-native.** WhatsApp-first client notifications (Africa's Talking), GHS pricing, local payment terms, offline-capable mobile capture for field reps on Android, and support in Accra in their timezone.
3. **You own it.** One-time build + maintenance, not perpetual per-seat rent to a foreign vendor. Their data, their system, their roadmap.
4. **Feature parity where it counts.** We match EvA's configurator, instant quoting, CRM, survey, production/cutting optimization, stock, barcode tracking and QA — delivered in phases, with a working configurator already live.
5. **Full product range.** Curtain walls, canopies, balustrades, partitions and frameless glass are first-class here, not shoehorned into a "window & door" tool.

---

## 4. Feature-Parity Map (EvA → Sofaamy BMS)

Every EvA capability has a home in our architecture, plus tailoring EvA can't match.

| EvA capability | Sofaamy BMS module | Phase | Tailoring edge |
|---|---|---|---|
| Design configurator | **M2 — Visual Configurator & Estimator** (already demoed) | 1 | Sofaamy's own product templates + GHS pricing engine |
| Instant on-site quote | M2 quote engine → PDF | 1 | Matches Sofaamy's current quote layout + WhatsApp send |
| CRM / opportunities | **M1 — Intake & CRM** | 1–2 | Field-rep + walk-in dual intake, WhatsApp lead source |
| Survey management | **M1 — Survey capture** | 2 | Offline mobile survey, photos, GPS, quote-vs-survey diff |
| Cutting/profile optimization | **M3 — Production Optimization** | 3 | Nesting/optimizer tuned to Sofaamy's stock profile lengths |
| Batch & work-order mgmt | **M3 — Pipeline Tracker** | 2–3 | Sofaamy's exact 7 factory stages |
| Stock / inventory | **M4 — Inventory & Procurement** | 3 | Profiles, glass, hardware, accessories, reorder alerts |
| Barcode dispatch/install tracking | **M3 — QR job tracking** | 3 | QR per job/unit, scan at dispatch + on-site install |
| Post-prod / post-install QA | **M3 — QA gates** | 2–3 | QA checkpoints matched to Sofaamy's real checks |
| Order → invoicing | **M5 — Commercial** | 2 | GHS invoices, 50/50 payment gates, WhatsApp receipts |
| Management reporting | **M6 — Analytics** | 3 | Owner dashboard: pipeline, revenue, waste, cycle time |

---

## 5. System Modules

**M1 — Intake & CRM**
Dual entry: (A) field rep captures on mobile PWA on-site (dimensions, photos, notes, GPS, offline-capable); (B) walk-in/office staff enters via desktop form. Both create a **Job** in the supervisor queue. Lead/opportunity tracking, client contacts, follow-up tasks. WhatsApp captured as a lead source.

**M2 — Visual Configurator & Estimator** *(demo already built)*
Parametric canvas (react-konva) where a supervisor builds the live product visual with editable dimensions, panels, opening type, glass type, frame colour. Auto-generates three outputs simultaneously: **client quote PDF**, **engineer spec sheet**, and **bill of materials**. GHS pricing engine (profiles/m, glass/m², hardware sets, labour/m², margin %). Extend from window frames → all Sofaamy product types.

**M3 — Internal Job Pipeline Tracker**
Full lifecycle tracking through Sofaamy's factory stages with role-based views, stage notifications, QA gates, payment gates, and QR-based dispatch/install tracking. Production optimization (cutting/nesting) and work-order batching layer on top.

**M4 — Inventory & Procurement**
Stock of aluminium profiles, glass, hardware, accessories. Consumption deducted from BOM. Low-stock/reorder alerts. Procurement role manages purchase and price updates (prices feed the estimator).

**M5 — Commercial (Invoicing & Payments)**
GHS invoices from approved quotes. Payment terms (50% deposit before production, 50% on delivery) enforced as pipeline gates. Accounts confirms payments; WhatsApp receipts to client.

**M6 — Management Analytics**
Owner/management dashboard: active jobs by stage, revenue, quote conversion, material waste, average cycle time per stage, rep performance.

---

## 6. Roles & Permissions (7 roles)

Field Rep · Supervisor · Accounts · Procurement · Factory · QA · Management.
Enforced via JWT auth + Postgres Row-Level Security. Each role sees only its relevant surface (e.g. factory sees the job view + their stage; management sees everything read-only + analytics; supervisor can override).

---

## 7. Job Lifecycle (target pipeline — confirm with Sofaamy)

Intake → Survey/Measurement → Design & Quote → Quote Approved → Deposit Paid (gate) →
**Factory stages:** Cutting → Processing → Holes/Routing → Assembly → Glazing → QA →
Dispatch (QR scan) → Installation (on-site QR scan) → Final Payment → Post-install QA → Closed.

*(The blueprint models 13 pipeline stages. Confirm exact stage names, order, parallelism, and who owns each stage against Section 5 of the Information Requirements doc.)*

---

## 8. Technical Stack (as per Technical Architecture Blueprint v1.0)

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS, **PWA** (offline field capture), Zustand + React Query |
| Canvas engine | react-konva (parametric configurator) |
| Backend API | FastAPI (Python), JWT auth + role middleware |
| Services | PDF generator (quote/spec/BOM), cost engine, BOM engine |
| Data | PostgreSQL via Supabase (Auth, Storage, Realtime, Row-Level Security) |
| Notifications | **Africa's Talking** — WhatsApp + SMS |
| Hosting | Vercel (frontend) · Railway (API) · Supabase Cloud (data) |

Core tables (from blueprint ERD): `users, clients, jobs, measurements, templates, designs, quotes, bom_items, pipeline_stages, materials` (+ `inventory, invoices, payments, surveys, opportunities` to be added for M4/M5).

---

## 9. Phased Roadmap

**Phase 0 — Demo-to-Win (immediate, pre-meeting).**
Polish and extend the existing configurator into an undeniable live demo: Sofaamy-branded, multi-product templates, live GHS quote → PDF → "send on WhatsApp", plus a walkthrough of the pipeline tracker mock. Goal: win the joint meeting against EvA.

**Phase 1 — Foundation + Configurator (weeks 1–5).**
Auth + roles, DB schema, M1 intake (field + walk-in), M2 configurator & estimator with real Sofaamy templates and prices, quote PDF, WhatsApp send. *This is the contractual Phase 1 prototype promised in the Info Requirements doc.*

**Phase 2 — Pipeline + Commercial (weeks 6–10).**
M3 pipeline tracker (Sofaamy's factory stages, notifications, QA/payment gates), survey capture + quote-vs-survey, M5 invoicing & payments.

**Phase 3 — Optimization + Inventory + Analytics (weeks 11+).**
M3 production/cutting optimization + QR dispatch/install tracking, M4 inventory & procurement, M6 management analytics. This closes the last of EvA's feature gap.

---

## 10. Blocking Inputs Needed From Sofaamy

*(These are exactly what the "Information Requirements v2" document requests. We cannot finalize Phase 1 pricing/templates without the Urgent items.)*

- **Urgent:** full product list + standard/min/max sizes + opening types + panel configs; aluminium profile prices/m; glass types + prices/m²; labour calculation basis; payment terms; user list + roles; WhatsApp business number; current quote layout; company logo; system administrator.
- **Standard (first 2 weeks):** hardware/accessory prices; existing client list + import decision; job numbering format; factory stage confirmation + who owns each stage; preferred web address.

---

## 11. Demo-Day Plan (to win the meeting)

1. Open with the **five win themes** (Section 3) — frame the choice as *tailored + owned + local* vs *rented + generic + foreign*.
2. Live-drive the configurator: build one of Sofaamy's real products, change dimensions, watch the GHS quote update instantly, export the PDF, "send to client on WhatsApp."
3. Show the pipeline tracker: a job moving through Sofaamy's real factory stages with WhatsApp notifications firing.
4. Map every EvA feature Sofaamy liked onto our roadmap (Section 4) — "everything you saw in EvA, plus these things EvA can't do for you."
5. Close on ownership + local support + total cost over 3 years vs EvA's recurring licenses.

---

## 12. Repository Structure

```
sofaamy-bms/
├── frontend/     React + Vite + Tailwind PWA (configurator, dashboards, mobile capture)
├── backend/      FastAPI (auth, jobs, quotes, pricing, BOM, notifications)
├── docs/         scope, ERD, API contracts, demo script
└── infra/        deployment config (Vercel, Railway, Supabase)
```

Existing demo (`sofaamy-configurator (1)/`) is the seed for `frontend/` — its pricing engine and canvas renderer carry over directly.

# AGENT.md — Sofaamy BMS Working Directions

This is the project-specific operating guide for an agent working in the Sofaamy
Business Management System workspace. It complements `CLAUDE.md`; it does not
replace it. When instructions conflict, use this order:

1. The user's current request.
2. `CLAUDE.md` and this file.
3. The current decision log in `MEMORY.md`.
4. The relevant product and client documents under `docs/`.

Read `MEMORY.md` at the beginning of every session. Read the relevant source
documents before changing a pricing rule, fabrication rule, product template,
workflow stage, or report.

## What this repository is

Sofaamy Co. Ltd is an Accra-based glass and aluminium fabricator. Veloxa is
building a tailored business management system for three related but distinct
fabrication businesses:

- **Frame** — framed aluminium windows, doors, partitions, louvres, and related
  products.
- **Frameless** — toughened-glass entrances, showers, sliding systems,
  partitions, and balustrades.
- **Curtain Wall** — mullion/transom facade systems with vision, spandrel, and
  vent bays.

The product is being developed in a competitive context against EvA Cloud. The
win is not “generic ERP”; it is one locally fitted system that connects design,
quote, fabrication documents, cutting, production, payments, delivery, and
client communication in GHS and WhatsApp-friendly workflows.

Current state: a Phase 0 demo prototype is working. The frontend is a
standalone React/Vite app that safely falls back to local seed data. The
FastAPI/SQLite backend is real enough to persist designs, create jobs, advance
the production lifecycle, issue materials, generate PDFs, and serve a public
share view. Production authentication, multi-tenant data, and the final
Supabase/PostgreSQL deployment are not implemented yet.

## Read-first map

For a new task, use this sequence:

1. `MEMORY.md` — decisions and rejected alternatives.
2. `docs/PROJECT_OUTLINE.md` — client scope, competitive positioning, roadmap.
3. `docs/CHECKLIST.md` — outstanding inputs and build status.
4. `sofaamy-bms/docs/ARCHITECTURE.md` — the current one-data-spine model.
5. `docs/DOMAIN-GUIDE.md` — domain vocabulary and fabrication concepts.
6. `docs/SOFAAMY-QUESTIONS.md` — unanswered client questions and placeholders.
7. `docs/MEETING-REQUIREMENTS.md` — the 15 July requirements-meeting agenda
   and the documents to obtain.
8. The relevant implementation files listed below.

Do not assume that an older proposal or a seeded value is more authoritative
than a newly supplied client spreadsheet or drawing. Incoming source material
must be classified before it changes the engines.

## Repository map

```text
SOFAAMY/
├── README.md                         overview and directory map
├── CLAUDE.md                         behavioral, safety, and coding rules
├── AGENT.md                          this project-specific guide
├── MEMORY.md                         decision log
├── docs/                             engagement and domain documentation
│   ├── PROJECT_OUTLINE.md            scope and win strategy
│   ├── CHECKLIST.md                  blocking inputs and task tracker
│   ├── DOMAIN-GUIDE.md               industry vocabulary
│   ├── INDUSTRY-REPORT.md            external research and competitor read
│   ├── MEETING-REQUIREMENTS.md       latest document-first requirements list
│   ├── SOFAAMY-QUESTIONS.md          unanswered questions and placeholder map
│   └── reference/                    proposals, blueprint, client originals
├── sofaamy-bms/
│   ├── frontend/                     React/Vite application and demo UX
│   ├── backend/                      FastAPI + SQLAlchemy + SQLite API
│   ├── docs/ARCHITECTURE.md          current data-spine architecture
│   └── images/                       client drawings, PDFs, screenshots, data
├── prototypes/                       earlier configurator/static demos
└── archive/                          superseded proposals and zip snapshots
```

`sofaamy-bms/` is the product. `prototypes/` is reference/seed material, not
the default place for new product work.

## Architecture and data spine

The central invariant is: **the design record is the single source of truth**.

```text
design JSON
  ├── frontend canvas (2D; frame/frameless/curtain wall)
  ├── pricing engine
  ├── BOM and glass order
  ├── fabrication breakdown / cut list
  ├── cutting optimizer
  ├── PDF reports
  ├── saved project and job record
  └── client share view
```

Do not add a second independent calculation path for the same output. If a
fabrication rule changes, update the canonical model/engine and keep frontend
and backend parity tests or hand-checks aligned.

### Frontend

- React 18, Vite, React Router, react-konva, and React Three Fiber/drei.
- Styling is the existing hand-built CSS system in `src/styles/` and component
  CSS. The demo intentionally does not use Tailwind despite the original
  production blueprint mentioning it.
- The app shell is in `src/App.jsx` and `src/components/Layout.jsx`.
- Dashboard/operations pages are in `src/pages/`.
- The configurator is in `src/components/configurator/Configurator.jsx` and
  its category canvases.
- Data access is centralized in `src/lib/api.js`; do not scatter raw API calls
  through new components without a reason.
- Operations pages attempt the backend first and show a seed/offline-safe state
  where that behavior already exists. Preserve that demo resilience unless the
  task explicitly changes it.

### Backend

- FastAPI entrypoint: `sofaamy-bms/backend/app/main.py`.
- SQLite connection: `app/database.py`; local DB file is `sofaamy.db`.
- SQLAlchemy entities: `app/models.py`.
- Request models and design JSON translation: `app/schemas.py`.
- Job stages, payment gates, material issue, and summaries: `app/lifecycle.py`.
- Frame pricing and frameless/curtain-wall mirrors: `app/pricing.py`.
- PDF generation: `app/pdf.py` and `app/reports.py`.
- Parametric glass prep/drawing logic: `app/preps.py`.
- One-dimensional profile nesting: `app/optimizer.py`.
- Demo data: `seed.py`; it intentionally drops/recreates the local database.

The production blueprint says Supabase/PostgreSQL, JWT/RLS, Vercel, Railway,
and Africa's Talking. The current proof build deliberately uses SQLite and
seed data. Do not migrate the demo casually; a database swap is a later,
explicit task touching the data layer and deployment assumptions.

## Code map by responsibility

| Concern | Canonical implementation | Direction |
|---|---|---|
| Frame templates and cells | `frontend/src/lib/designs.js` | Preserve row-major `cells`, `cols`, `rows`, and quantity semantics. |
| Frame catalog/rates | `frontend/src/lib/products.js` | Treat rates and deductions as placeholders until mapped to a real system. |
| Frame fabrication | `frontend/src/lib/pieces.js` | Derive members and glass sizes here; do not hand-type cut lists in UI. |
| Frame quote/BOM dispatch | `frontend/src/lib/pricing.js` | `calcQuote()` and `designBOMAny()` dispatch by category. |
| Frameless product library | `frontend/src/lib/frameless.js` | Panel runs use fixed/door/hinged/slider types, fanlights, and L-shapes. |
| Frameless prep rules | `frontend/src/lib/preps.js` | Hardware codes must carry the geometry they require. |
| Curtain wall | `frontend/src/lib/curtainwall.js` | Continuous mullions; transoms span between mullions. |
| Cutting optimizer | `frontend/src/lib/optimize.js`, backend `optimizer.py` | Keep the same profile grouping, stock lengths, and kerf semantics. |
| Configurator UX | `Configurator.jsx`, `DesignCanvas.jsx`, `FramelessCanvas.jsx`, `CurtainWallCanvas.jsx` | Keep category-specific models separate while sharing project/job flow. |
| Client sharing | `backend/main.py` HMAC token routes + `pages/ShareViewer.jsx` | Public view is read-only and Sofaamy-branded. |
| Reports | `backend/reports.py`, `frontend/src/lib/reports.js` | Honest status: live, in-build, or planned. Do not label a stub live. |
| API client | `frontend/src/lib/api.js` | Add new endpoints here and keep errors visible to the operator. |

## Design models

### Frame

A framed design has overall `width`/`height` in millimetres, `cols`/`rows`,
optional `colWidths`/`rowHeights` whose sums equal the overall dimensions, and
row-major `cells`. Each cell has glass, opening, and panel count. A project item
also has `ref`, `qty`, and `location`; quantity multiplies price, BOM, and cut
demand.

The current breakdown uses these deliberately visible placeholders:

- outer frame: full-size mitred members;
- mullion/transom: reduced to butt between frame faces;
- sash: section/panel and track/interlock deductions;
- glass: separate fixed-lite and sash deductions.

These are demo formulas, not confirmed Sofaamy manufacturing rules.

### Frameless

A frameless design is a run of glass panels, not a framed grid. Each panel is
fixed, a swing door, a hinged shower door, or a slider. It may have a fanlight
and an L-shaped return (`cornerAfter`). Hardware sets and glass preps derive
from panel type and selected system.

The SmartGlazier reference job verified the following implementation inputs:

- 10 mm clear tempered glass;
- five panels, 11.41 m², 285.31 kg;
- glass weight rule: 2.5 kg per m² per mm;
- hardware codes including `BL 203`, `CSM-50W`, `JQ 104(900MM)`,
  `KL-HD 203-6`, `KL-M102/T`, `KL-M202`, and `KL-M402`;
- hardware list total: GHS 3,076.00;
- dimensioned panel drawings, cutout templates, glass order, hardware list,
  and installation sheet.

The gaps and deductions currently in code were reverse-engineered from that one
job. They still need Sofaamy confirmation as house standards before being
treated as universal.

### Curtain wall

The current engine models a stick system: continuous vertical mullions,
horizontal transoms between them, and vision/spandrel/vent bay types. The
public industry research confirms that stick systems use mullions/transoms and
pressure plates/caps, but it does not confirm Sofaamy's exact system, loads,
anchors, or pricing. Do not present the current CW constants as engineering
approval.

## Source-of-truth rules for incoming team information

Use this precedence for a business rule:

1. A current Sofaamy document, invoice, price list, fabrication drawing, or
   explicit answer from the team.
2. A current client-approved sample job pack.
3. Existing code decisions recorded in `MEMORY.md`.
4. General industry research or competitor documentation.
5. A demo placeholder.

When a new file arrives:

1. Record the filename and what it actually proves.
2. Distinguish per-bar, per-metre, per-sheet, per-square-metre, unit, and
   service prices.
3. Preserve system/brand/product context; do not flatten all profiles into one
   generic catalog.
4. Note ambiguities, duplicates, missing codes, and unit conversions.
5. Update the questions/checklist or a dedicated data-normalization document.
6. Only then change `products.js`, `frameless.js`, `curtainwall.js`, backend
   mirrors, seed materials, or reports.

### Important current evidence

The newly supplied files in `sofaamy-bms/frame-sources/` are valuable. Their
Frame catalogue master data is now integrated into the frontend catalogue
(`frontend/src/lib/frameCatalog.js`), while the fabrication and costing rules
remain pending validation:

- `PROFILES, CODES, PRICE,BAR LENGHT,ACCESSORIES PER SYSTEM.xlsx` and
  `PROFILES AND ACCESORIES (2).xlsx` contain system-specific catalogs for
  Trialco, KS-50, Italian, and FDT systems, mostly at 5,800 mm bar length,
  with profile/accessory codes and several GHS prices.
- `GLASS ONLY FINAL.xlsx` contains per-square-metre float-glass rates and
  tempering/service rates.
- `FINAL.xlsx` groups product families such as FDT casement/projected/fixed,
  framed swing/hinge doors, and sliding systems.
- `FINAL.xlsx` is organised into nine visible worksheets: FDT Profiles, Swing
  Door, Hinge Door, Trialco Sliding Door & Window, KS-50 Sliding Door & Window,
  Italian Sliding Door & Window, Casement Window, Projected Window, and Fixed
  Window. The app preserves this category/system distinction rather than
  flattening it into the old generic catalog.
- `frontend/src/lib/frameCatalog.js` is the current normalized frontend view
  of those supplied catalogue references. It intentionally calls accessory
  numbers `listedValue` because the workbook does not consistently identify
  whether each number is a unit price, pack price, or standard allowance.
- The first Frame proof slice now also uses `FRAME_PRODUCT_GROUPS` for the
  categorized configurator library, `FRAME_GLASS_CATALOG` and
  `FRAME_GLASS_SERVICES` for the supplied glass sheet, and the screenshot
  quote style (opening rows, W/H, quantity, m², editable GHS/m², discount,
  GETF+NHIS, VAT, and grand total). Frame quote rates are starting values from
  observed examples and must remain editable until the team confirms a rate
  card.
- Frame designs now retain measurement source/status and commercial metadata;
  quote/job deposit gates default to 80% but are configurable. The client PDF
  is bundled; the internal price-breakdown report is the place for detailed
  working cost lines.
- `PROFILES ELEVATION 001–004-Model.pdf`, `PROFILES.pdf`, and `PROFILES.dwg`
  are fabrication references. A text extraction that only returns labels such
  as “VIEW FROM OUTSIDE” is not enough to infer dimensions or deductions; inspect
  drawings visually or ask Sofaamy to confirm the rule.

The old prototype catalog names `Mollium`, `Transum`, and `Sash` and stock
lengths 5800/5750/5700 mm. Those names were confirmed from an earlier optimizer
screen, but the newer system-specific spreadsheets use different profile names
and codes. Treat the old catalog as a compatibility/demo model until a mapping
to real Sofaamy systems is agreed.

## External product understanding

External pages are context, not Sofaamy requirements. The research pass found
these useful comparison points:

- [EvA Cloud overview](https://www.linkedin.com/products/evolutionary-algorithms-pvt-ltd--eva-erp-cloud/)
  — cloud fenestration ERP with 3D configurator, CRM, quotations, and CAD-oriented output.
- [Smart Glazier glass-fabricator software](https://smartglazier.com/en/fabricators/)
  — quoting, order entry, design modules, hardware rules, fabrication outputs,
  and DXF/integration emphasis.
- [Smart Glazier entrance/partition designer](https://smartglazier.com/en/shopfront/)
  — drag-and-drop layouts/cutouts, built-in hardware catalogs, error checks,
  3D quoting, fabrication drawings, and installation instructions.
- [Smart Glazier quoting](https://smartglazier.com/en/business/quoting/)
  — revisions, online approval, payment capture, permissions, margin control,
  and quote reporting.
- [Orgadata Logikal](https://www.logikal-software.com/en/orgadata) and
  [Klaes](https://www.klaes.de/en-klaes-software) — mature end-to-end
  window/door/facade planning, production, procurement, dispatch, and admin
  patterns.
- [AluSync](https://www.alusync.com/), [FramePOC](https://framepoc.eu/en/),
  and [QuoteERP](https://quoteerp.com/features) — current examples of the
  configurator → quote → cut list → inventory/production spine.
- [NPSA curtain-wall overview](https://www.npsa.gov.uk/building-protection/windows-glazed-facades/introduction-glass-curtain-wall-systems)
  — useful terminology for stick, unitized, semi-unitized, and bolt-fixed
  systems; it is not a Sofaamy engineering specification.
- [Metro Glass cutout guide](https://assets.metroglass.co.nz/files/resources/processing_capabilities/12-0-glass-processing-edgework-and-cut-outs-guide.pdf)
  — general safety/processing constraints for holes, edge distances, radii,
  and toughening sequence; validate locally before enforcing rules.

Use these sources to understand interaction patterns and missing capabilities,
not to copy foreign prices, dimensions, tax treatment, or manufacturing rules.

## Working rules for implementation

- Keep all client-facing money in GHS and dimensions in mm. Convert to metres
  or square metres only at clearly named calculation boundaries.
- Never silently replace a missing client value with a realistic-looking number.
  Mark placeholders in code and surface them in docs/UI where relevant.
- Keep Sofaamy branding in client-facing outputs; Veloxa may appear only as the
  unobtrusive “Powered by Veloxa” attribution already used in the share view.
- Keep frontend and backend calculations equivalent. When changing an engine,
  run a representative parity check for Frame, Frameless, and Curtain Wall.
- Keep reports honest. A report catalog entry is not a working report until it
  has a real route and generated output.
- Prefer the smallest surgical change. Do not refactor adjacent code while
  changing a domain rule.
- Use `apply_patch` for source edits. Do not delete or overwrite client files,
  old proposals, or reference assets without explicit confirmation.
- Do not deploy, push, send real WhatsApp/email messages, run production
  migrations, or make irreversible external changes without the explicit
  confirmation required by `CLAUDE.md`.
- Treat `seed.py` as destructive to the local demo database: warn before using
  it if a user may have local data worth preserving.

## Current Frame visualizer

`frontend/src/components/configurator/Design3D.jsx` is the client-facing Frame
visualizer. It derives geometry from the same saved design cells used by the
2D canvas and quote engine. It supports wall/frame colour controls, Orbit,
Front, Inside, and Back views, plus animated opening for sliding, casement,
projected/awning, swing, and hinge-style openings. Presentation preferences
are persisted as `wallColor`, `floorColor`, `customFrameColor`, and
`visualView`; keep them optional and do not treat the animation as engineering
clearance validation.

## Verification commands

From the repository root:

```bash
cd sofaamy-bms/frontend
npm run build
```

For backend syntax/import checks:

```bash
cd sofaamy-bms/backend
python3 -m py_compile app/*.py seed.py
```

For an API smoke test, start the backend from `sofaamy-bms/backend` with
`uvicorn app.main:app --reload`, then check `/`, `/api/dashboard`,
`/api/designs`, and the relevant PDF/report route. The backend is optional for
the frontend demo, so an offline badge is expected when it is not running.

## Current next directions

When the user provides more meeting information, prioritize in this order:

1. Normalize the supplied profile, accessory, glass, and service catalogs with
   units and system mappings.
2. Replace generic frame placeholders with system-aware products and templates.
3. Validate frame deductions, mitres, machining, and glass sizes against the
   supplied elevation/fabrication drawings.
4. Replace frameless placeholder hardware/glass values with the team's actual
   catalog and confirm the one-job gap rules as standards.
5. Define the curtain-wall system, pressure-plate/cap, anchor, spandrel,
   openable-vent, installation, and engineering inputs from a real job.
6. Add quote revisions/manual overrides, VAT treatment, and explicit price
   provenance before calling quotes production-ready.
7. Continue the operational spine: multi-design projects, real job/design
   persistence, role permissions, and the agreed report set.

The immediate goal is not to make the prototype look more complete. It is to
make every number and fabrication instruction traceable to Sofaamy's own data
while preserving the one-design-record flow that makes the system credible.

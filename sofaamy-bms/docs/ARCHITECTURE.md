# Sofaamy BMS — Architecture (One-Month Proof Build)

**Goal:** prove, within one month, a production-close unified platform (configurator → quote → cutting optimization → pipeline) so Sofaamy builds with Veloxa instead of buying EvA Cloud.

## Core idea — one data spine

The design on the configurator canvas is the single source of truth. Everything else derives from it; nobody types data twice. That sentence is the pitch against their current toolchain (AutoCAD + SmartGlazier + standalone desktop cutting optimizer, re-keyed by hand at every step).

```
DESIGN (canvas JSON — lib/designs.js)
   │
   ▼
PIECE EXTRACTOR (lib/pieces.js) — design → cut list
   │  [{profile, member, lengthMm, qty}]  = the DEMAND table of their optimizer
   │
   ├─► PRICING (lib/pricing.js, per-profile GHS rates) ─► Quote (PDF/WhatsApp)
   ├─► BOM (designBOM — per-profile metres + glass + hardware) ─► Procurement
   └─► CUTTING OPTIMIZER (lib/optimize.js ⇄ backend app/optimizer.py)
         FFD 1D nesting, kerf-aware, per profile group ─► bar-by-bar cut plan,
         waste %, cutting list for the saw station
```

All of it hangs off a **Job** (`SOF-YYYY-NNN`) that moves through the pipeline tracker.

## Design model v2 (after studying EvA's demo, 2026-07-12)

A design is a **project item**: `ref` (e.g. "w3") + `qty` (units to make — multiplies BOM,
demand and pricing) + `location` (where in the building) + the drawing itself.
Sections have **independent sizes** (`colWidths[]` / `rowHeights[]`, mm, summing to the
overall dims) — dividers drag on the canvas EvA-style, totals never change, 150 mm
minimum section. Each design carries a **profile system** (placeholder list until
Sofaamy's brands arrive) and a **surface finish** (type + colour).
Glass is priced per real section area; sash pieces take their own section's dims.

## Member mapping (piece extractor)

Stick-built, curtain-wall convention — **CONFIRM against Sofaamy's fabrication drawings**:

| Members | Profile | Rule |
|---|---|---|
| 2 jambs + (cols−1) mullions | **Mollium** | full design height |
| Head + sill | **Transum** | full design width |
| Internal transoms | **Transum** | span between mullions: (rows−1) × cols pieces of width/cols |
| Sash frames | **Sash** | each non-fixed section: 2 rails (cell width) + 2 stiles (cell height) |

No deduction/mitre allowances yet — placeholder until Sofaamy confirms.

## Confirmed facts vs placeholders

| Value | Status | Source |
|---|---|---|
| Profile names Mollium / Transum / Sash | **Confirmed** | cutting-optimizer screen, meeting 2026-07-10 |
| Stock lengths 5800 / 5750 / 5700 mm | **Confirmed** | same screenshot |
| Kerf 5 mm, min offcut 300 mm | Placeholder | ask Sofaamy |
| Profile prices/m (85/85/95 GHS) | Placeholder | awaiting material list |
| Grinding (top/left/bottom/right per piece) | Not modeled yet | seen in their optimizer; ask what it adds |
| Mitre vs butt joints per member | Not modeled yet | ask |

## External systems

- **AutoCAD** — not replaced. Jobs get a drawings-attachment slot for DWG files.
- **SmartGlazier (frameless)** — becomes design templates in the same configurator (balustrade/partition first); same spine, glass panels + hardware instead of profile bars.
- **Their desktop cutting optimizer** — replaced by our optimizer module, fed automatically from the design instead of by hand. FFD is deliberately simple; parity of feed-path matters more than algorithm sophistication in month one.

## Optimizer contract

`POST /api/optimize` — body `{pieces:[{profile, member, length_mm, qty}], kerf_mm}` → groups per profile: bars with cuts, used/waste mm, utilization %. Frontend mirror `lib/optimize.js` keeps the demo alive with no API running. Profile groups never share bars (different stock; finishes can't mix on a bar).

## Stack for this month

SQLite + FastAPI + React/Vite as already built (MEMORY.md 2026-07-07). Supabase/Postgres swap is a data-layer change later; engines (pieces/pricing/optimizer) are pure functions and don't move.

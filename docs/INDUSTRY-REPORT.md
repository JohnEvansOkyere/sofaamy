# The Aluminium & Glass Fabrication Industry — How It Works, How Software Serves It, and What Sofaamy's System Must Be

**Prepared for:** Evans / Veloxa Technology Ltd
**Date:** 13 July 2026
**Purpose:** Standalone briefing. Sofaamy's team confirmed their business splits into three product families — **Frame**, **Frameless**, and **Curtain Wall**. This report explains each family the way the industry itself understands them: what the product is, how it is fabricated, what hardware and materials drive it, and what a serious software system (SmartGlazier, EvA Cloud) generates for it. It closes with the direct implications for our configurator.

---

## 1. The industry in one page

An aluminium & glass company like Sofaamy is really **three businesses sharing one workshop**:

| Family | What holds the glass | Core material cost | Core skill | Software model |
|---|---|---|---|---|
| **Frame** (framed aluminium) | Extruded aluminium profiles all around every pane | Aluminium profile per metre | Cutting/joining profiles accurately | Grid of profiles + dividers; cutting list & bar nesting |
| **Frameless** (toughened glass) | The glass itself — structural, 10–12 mm tempered — held by small stainless fittings | Glass per m² + hardware per piece | Specifying glass fabrication (holes, cutouts, edgework) *before* tempering | Panel run + hardware sets; glass order drawings |
| **Curtain Wall** | A self-supporting mullion/transom grid hung on the building face | Aluminium per metre + glass per m² | Structural grid setting-out, sealing, anchoring | Mullion/transom grid; vision vs spandrel zones |

The families look similar on a showroom wall but are **fabricated, priced, and documented completely differently**. That is why Sofaamy runs *two* software systems today — EvA-class software for framed work and **SmartGlazier for frameless** — and why a configurator that treats everything as "a frame with dividers" reads as amateur to them instantly.

---

## 2. Family 1 — FRAME (framed aluminium windows & doors)

### 2.1 What it is
Every pane sits inside a surrounding aluminium profile. Products: casement/sliding/awning/louvre windows, hinged and sliding doors, framed office partitions, fly screens. This is the volume business — repetitive, price-sensitive, profile-driven.

### 2.2 How it's fabricated
- **Outer frame** (head, sill, jambs) cut full-size, usually mitred 45°; **mullions/transoms** butt-jointed square-cut between frame faces, with deductions for the profile depth.
- **Sashes** (the moving panels) are their own smaller frames; sliding sashes overlap at an interlock stile and sit in tracks.
- **Glass** is cut to the daylight opening minus glazing deductions, held by beads and EPDM gaskets.
- The bottleneck cost decision is **bar nesting**: cutting the required pieces out of 5.8 m stock bars with minimum waste (this is the optimizer Sofaamy already runs on the desktop — Mollium 5800 / Transum 5750 / Sash 5700 stock).

### 2.3 What software must output
Quote with elevation drawing → profile cutting list (position, length after deductions, cut angles) → bar optimization → glass cut sizes → hardware set per opening type → BOQ. **This is what we have already built.** EvA Cloud is the benchmark here and we have its interaction model (shapes → dividers → per-section openings) matched.

---

## 3. Family 2 — FRAMELESS (structural toughened glass)

### 3.1 What it is
No aluminium around the glass. The glass itself — **10 mm or 12 mm clear tempered**, sometimes laminated — is the structure. Small stainless-steel fittings clamp or bolt through it. Products:

- **Glass entrances / shopfronts** — swing doors with fixed side panels and over-panels (transom lites)
- **Shower cubicles** — inline door + panel, 90° corner, neo-angle; hinged or sliding
- **Frameless sliding doors** — panels hung from a top track on rollers
- **Office partitions** — fixed panels joined edge-to-edge with silicone or H-channels
- **Balustrades** — bottom-channel or standoff-bolted glass
- **Mirrors, splash-backs, table tops** — cut-to-shape processing work

### 3.2 The hardware language (this is the credibility test)
Frameless has its own vocabulary, and Sofaamy's own SmartGlazier print (see §5) uses it:

- **Patch fittings** — stainless plates clamping the glass corners: **bottom patch** (connects to floor spring spindle), **top patch** (top pivot), **over-panel/transom patches** connecting door, side lite and over-panel at one node, corner connectors at 90°/135°/180°.
- **Floor spring** — a door closer buried in the floor; the door pivots on it (double-action swing). The workhorse of every glass shopfront.
- **Patch locks** — lock patch at door bottom with a floor/strike keep.
- **Pull handles** — back-to-back stainless tubes (e.g. 900 mm high).
- **Glass-to-glass clamps / channels** — hold fixed panels; **spider fittings** bolt structural glass to fins or walls (glass facades, canopies).
- **Shower hardware** — wall-to-glass hinges, glass-to-glass 90°/135° hinges, U-channel, header bars, knobs, towel bars; sliding barn-style rollers.

### 3.3 Why fabrication is unforgiving
Tempered glass **cannot be cut, drilled or notched after toughening**. Every hole (ø16/ø18/ø20 mm for patches and handles), every cutout (lock notches with r ≥ glass thickness, min ~10 mm radius), every edge treatment (flat polish on exposed edges, arris elsewhere) must be specified on the **glass order drawing** sent to the processor *before* tempering. Rules of thumb: hole edge ≥ 1.5× glass thickness from glass edge; weight = **2.5 kg per m² per mm of thickness** (10 mm glass = 25 kg/m² — a 900×2100 door leaf is ~47 kg, which is why floor springs are sized by leaf weight).

Get one hole 5 mm wrong and the panel is scrap — remake, re-temper, days lost. **This is why glass shops buy software**: the win isn't the quote, it's the error-free fabrication drawing.

### 3.4 What software must output (SmartGlazier's model)
SmartGlazier — the system Sofaamy uses for this today — is built exactly around that risk:

1. **Quote** — elevation drawing, glass spec, hardware list, price with discount line.
2. **Hardware list** — every fitting with code, finish, qty, unit cost.
3. **Glass order** — one page per panel: exact cut size, weight, edgework ("Flat Polish 2 Long 2 Short"), stamp position, every hole ø and position, cutout **templates** with radii — ready to email to the glass processor.
4. **Installation sheet** — panel layout with joint gaps (typically 5 mm panel-to-panel, 10 mm at doors), centreline void dims, out-of-plumb survey box, hardware checklist, comments page.

Design logic the software encodes: a shopfront elevation is a **run of panels** — `fixed | door | door | fixed` — with optional **over-panel band** above door height; door leaves get standard gaps (~5 mm at pivot jamb, ~3 mm at meeting stiles, floor clearance ~10 mm); hardware is **auto-selected as compatible sets** (bottom patch + top patch + floor spring + over-panel patch + lock + handles per door leaf), not picked item by item.

---

## 4. Family 3 — CURTAIN WALL

### 4.1 What it is
A lightweight aluminium-and-glass skin **hung on the outside of a building's structure**, floor to floor, carrying only its own weight and wind load. This is the prestige/commercial business: office blocks, hotel facades, bank frontages.

### 4.2 The two build methods
- **Stick system** (what Ghanaian fabricators, incl. Sofaamy, actually build): vertical **mullions** anchored to slab edges run first, horizontal **transoms** butt between them, then glass/spandrel panels are set and clamped with **pressure plates** hidden by snap-on **cover caps**. Fabricated as a kit of cut bars, assembled on site.
- **Unitized system**: whole panels pre-assembled in a factory and craned in — high-rise territory, imported, rarely fabricated locally. We model stick.

### 4.3 The grid language
- **Vision glass** — the see-through zones (often reflective/tinted tempered or laminated in Ghana's climate).
- **Spandrel** — the opaque bands hiding slab edges and services: back-painted glass or aluminium composite panel (ACP).
- **Openable vents** — occasional top-hung windows inserted in the grid.
- **Structural glazing** variant: glass siliconed to a hidden frame, no visible caps ("frameless look" from the street).
- Setting-out is by **grid bay**: mullion spacing (~1.0–1.5 m) × transom heights matched to floor/sill/door lines. Mullions run **continuous full height**; transoms are cut between them (note: the *opposite* joint hierarchy to a window frame, where head/sill run through).

### 4.4 What software must output
Grid elevation with bay dims → mullion/transom cutting list (mullions full height, transoms = bay width − mullion width) → bar nesting (same optimizer as Frame — mullion bars are just longer) → glass schedule per cell tagged vision/spandrel/vent → pressure plate + gasket + cap lengths → anchor/bracket counts per mullion per floor.

---

## 5. What Sofaamy's own SmartGlazier print tells us (`sofaamy-bms/images/sofaamy.pdf`)

The 12-page pack is one real job — *"SWING DOOR 10MM CL"*, customer Benjamin, site MAXI ALUMINIUM ENT / THEOPHILUS, ref SGP/4462-26A — and it is a perfect specimen of §3.4:

- **Elevation**: opening 4560 × 2530 mm; layout `fixed 1368 | door 900 | door 900 | fixed 1367` with an **over-panel 1805 × 410** above the two doors. All 10 mm clear tempered, 5 panels, 11.41 m², **285.31 kg** (= 11.41 × 10 × 2.5 — the standard weight rule, confirmed).
- **Quote**: drawing + spec block ("10mm Clear Tempered, JQ 104(900MM), KL-HD 203-6, Locking: CSM-50W") + price **GH₵10,397.90 − 10% = GH₵9,358.11**. Note: quote shows *sets*, not itemised hardware.
- **Hardware list** (internal, priced): 12× BL 203 clamps ₵36; 2× CSM-50W locks ₵185; 2× JQ 104 900mm pull handles ₵262; 2× KL-HD 203-6 floor springs ₵470; 2× KL-M102/T bottom patches ₵110; 2× KL-M202 top patches ₵110; 2× KL-M402 over-panel patches ₵185 — total **GH₵3,076**. These are **real Sofaamy hardware codes and GHS prices** — our first hard cost data.
- **Glass order**: one drawing per panel — door leaf 900 × 2100 (47.3 kg) with ø16 handle holes at 700/700 centres 100 mm off the stile, patch **cutout templates A/B** (r80/r55 S-curves, ø20 spindle hole) at top and bottom corners, lock notch 80 × 60; side panels 1368 × 2520 (86.2 kg) with ø18 clamp holes 200 mm in from corners, 20 mm from edge; "Flat Polish 2 Long 2 Short", "TFA stamp in Bottom Left Corner".
- **Installation sheet**: panel run with **5 mm joints at fixed glass, 10 mm at door edges**, centreline void "1373 | 908 | 907 | 1372", out-of-plumb survey box, shopfront hardware checklist, comments page.

**Read the deductions backwards** — this is the design logic we must encode: void 4560 wide splits into 4 bays; each glass panel = bay − joint allowances (1373 → 1368 = −5 mm; door bay 908 → leaf 900 = −8 mm). Height 2530 = 2520 side panels + 10 floor gap; door leaf 2100 + over-panel 410 + gaps = 2520. Simple, rule-driven arithmetic — exactly what a configurator automates.

---

## 6. Competitive read: SmartGlazier vs EvA vs us

- **SmartGlazier** (glazier software, AU/NZ origin): frameless-first. Entrance/partition designer, shower designer, preloaded compatible-hardware libraries, error checks, supplier pricing, 3D views, DXF export, glass-order drawings "at the touch of a button". Weak side: it is a glass-shop tool, not a fabrication ERP — no profile cutting optimization, thin production pipeline.
- **EvA Cloud**: framed-fenestration ERP. Grid/divider configurator, per-section systems and finishes, costing, production stages. Weak side: frameless and curtain wall are not its native models; India-centric catalogs; SaaS rent; no Ghana-local fit.
- **Sofaamy today**: SmartGlazier for frameless + desktop cutting optimizer + AutoCAD + manual Excel/WhatsApp glue. **No single system covers all three families — that unification is our winning story.** One project ("Theophilus shopfront + upper-floor curtain wall + framed back-office windows") quoted, documented and tracked in one place, in GHS, sent on WhatsApp.

---

## 7. Implications for the configurator (build spec)

1. **Category first.** "New Design" starts with **Frame | Frameless | Curtain Wall**. Each opens its own design library and its own canvas semantics — not one grid model wearing three hats.
2. **Frame** — keep the current model (it already matches EvA): grid + dividers + per-section openings → profile breakdown → nesting.
3. **Frameless** — new model: **panel run** (fixed/swing/sliding leaves) + optional over-panel band; joint-gap and floor-gap deductions compute glass cut sizes from the void; **hardware sets auto-attached per panel type using Sofaamy's real codes/prices from §5**; outputs = quote, hardware list, glass order (per-panel sizes/weights/edgework, hole specs), installation summary. Weights via 2.5 kg/m²/mm.
4. **Curtain wall** — new model: bay grid with continuous mullions, transoms cut between, per-cell **vision/spandrel/vent**; cutting list feeds the same bar optimizer; glass schedule per cell.
5. **Honesty discipline stands**: Sofaamy's hardware prices from the PDF are real; glass ₵/m² by thickness, profile ₵/m, and gap constants beyond what the PDF proves remain marked placeholders in `docs/SOFAAMY-QUESTIONS.md`.

**Demo storyline this enables:** rebuild the *actual* Theophilus job from their own SmartGlazier print in our configurator — same 4560×2530 elevation, same panel sizes, same hardware codes, same ₵3,076 hardware cost — then show what SmartGlazier can't do: the same project carrying a framed window *and* a curtain-wall bay, one quote, one WhatsApp send, one production pipeline.

---

## Sources

- Sofaamy SmartGlazier job pack, `sofaamy-bms/images/sofaamy.pdf` (primary evidence)
- [Smart Glazier — Glass Entrance & Partition Designer](https://smartglazier.com/en/shopfront/) · [Smart Glazier — Quoting](https://smartglazier.com/en/business/quoting/) · [Smart Glazier — Glass Shop Software](https://smartglazier.com/en/for-installers/business/glass-shop-software/)
- [Forge Hardware — Patch fittings](https://forgehardware.com.au/entry-door/patch-fittings.html) · [FHC — Patch hardware](https://fhc-usa.com/arch-hardware/patch-fittings.html) · [Quality Glass Fittings — Patch fittings buyer's guide](https://qualityglassfittings.co.uk/blogs/blog/patch-fittings-glass-doors-buyers-guide) · [CR Laurence — Patch fitting glass door systems](https://www.crlaurence.com/productsubcategory/A10_AH)
- [NPSA — Introduction to glass curtain wall systems](https://www.npsa.gov.uk/building-protection/windows-glazed-facades/introduction-glass-curtain-wall-systems) · [Glass Magazine — Curtain wall fundamentals](https://www.glassmagazine.com/article/curtain-wall-fundamentals) · [APRO — Stick vs unitized](https://aprowin.com/stick-vs-unitized-curtain-wall/) · [AC Glass — Curtain wall systems explained](https://acglass.com/blog/curtainwall-systems-explained-commercial-construction.html)
- [Florida Shower Doors — Inline door + return panel](https://flshowerdoors.com/frameless-inline-door-return-panel/) · [ByRoman — Shower enclosure styles](https://www.byroman.com/home-builders/shower-door-styles/) · [Schicker — Neo-angle corner](https://www.schickershowerdoors.com/upcp-product-category/neo-angle-corner/)
- [Metro Glass — Processing, edgework and cut-outs guide](https://assets.metroglass.co.nz/files/resources/processing_capabilities/12-0-glass-processing-edgework-and-cut-outs-guide.pdf) · [ToughGlaze — Templates for glass processors](https://www.toughglaze.com/how-to-create-a-template-for-a-glass-processor) · [TuffX — Technical manual](https://www.tuffxglass.co.uk/wp-content/uploads/TuffX-Techincal-Handbook-Issue-12.pdf)

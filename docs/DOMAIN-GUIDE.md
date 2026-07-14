# Glass & Aluminium Fabrication — Domain Guide

*For Evans. Everything you need to understand what Sofaamy does, what EvA sells, and what we're building — in plain language. Read this before every client meeting until it's second nature.*

---

## 1. What a fabricator actually does

Sofaamy takes **long aluminium bars** and **big sheets of glass**, and turns them into **windows, doors, partitions, curtain walls, balustrades and canopies**, then installs them in buildings. Every job is custom-sized — nothing is off the shelf. That's why software matters so much in this industry: every single job needs its own drawings, its own material list, its own cut list, and its own price, and doing that by hand is slow and error-prone.

The money flow: client asks for a price → someone measures the openings on site → the design is drawn and priced → client pays a deposit (Sofaamy: 50%) → factory fabricates → deliver + install → client pays the balance (50%). Material cost is the biggest cost, and **aluminium waste is where profit silently leaks** — which is why cutting optimization is a headline feature in every fenestration ERP.

## 2. The anatomy of a window (learn these words)

Take the w3 design from the EvA demo — 2000 × 1400 mm, split into a fixed panel and a sliding door:

```
        HEAD (top horizontal member)
   ┌────┬──────────────────────┐
   │    │                      │   JAMB  = vertical member at each outer edge
 J │ F1 │        F2            │ J MULLION = vertical divider between sections
 A │fixed  ┌────────┬───────┐  │ A TRANSOM = horizontal divider between sections
 M │    │  │  S1    │  S2   │  │ M SASH  = the moving frame that holds glass in
 B │    │  │ slides │ slides│  │ B         an openable section
   │    │  └────────┴───────┘  │
   └────┴──────────────────────┘
        SILL (bottom horizontal member)
```

- **Frame** — the fixed outer rectangle screwed to the wall: head + sill + 2 jambs.
- **Mullion / Transom** — dividers that split the frame into **sections** (EvA labels them F1, F2…). A mullion is vertical, a transom is horizontal. *Sofaamy's optimizer spells them "MOLLIUM" and "TRANSUM" — same things.*
- **Section** — one "hole" in the grid. Each section is either **fixed** (glass direct into the frame) or **openable** (holds a sash).
- **Sash** — a smaller frame-within-the-frame that moves (slides, swings, tilts). An openable section = 4 extra profile pieces (2 rails horizontal, 2 stiles vertical) + hardware. EvA labels sashes S1, S2.
- **Opening types**: fixed, casement (side-hinged swing), awning (top-hinged), sliding, tilt & turn (both tilts and swings — the European type in EvA's library), louvre (angled slats), pivot.

**Why this matters for software:** every one of those members is a piece of aluminium that must be cut to a length. The design *is* the cut list — that's the whole thesis of our build.

## 3. Profiles and "systems"

An aluminium **profile** is a specific cross-section shape, extruded in long bars (Sofaamy buys 5.8 m mollium, 5.75 m transum, 5.7 m sash bars — confirmed from their optimizer screen). A **system** (what EvA's "Select System" panel with VEKA / SCHUCO / GULF EXTRUSION means) is a *family* of profiles engineered to work together — frame, sash, mullion, bead, interlock — from one supplier. You can't mix systems within a window: a VEKA sash doesn't fit an ALULINE frame.

Practical consequences:
- Each system has its own price/m, its own stock lengths, its own look (slim vs heavy).
- The choice of system is a **per-design decision** (sometimes per-section for curtain walls).
- We don't know Sofaamy's real system list yet — it's the #1 question in `SOFAAMY-QUESTIONS.md`. Ours has placeholders ("Standard / Heavy-Duty / Slimline") until then.

## 4. Glass

Sold by **area (m²)**, priced by type and thickness. Common in the Ghanaian market: clear, frosted, tinted (grey/bronze), reflective, **tempered/toughened** (heat-treated for strength — required for doors, balustrades, anything a person can walk into), **laminated** (two panes with a plastic interlayer — stays in place when broken; required overhead in canopies), and double-glazed units. EvA's dropdown showed thickness in the name: "6MM CLEAR GLASS, 5MM FROSTED TOUGHENED" — thickness is part of the product, not an option, and drives price.

Frameless work (Sofaamy's SmartGlazier domain — shopfronts, shower cubicles, glass partitions, balustrades) is a different discipline: 10–12 mm toughened glass, no aluminium frame, held by **patch fittings, spider clamps, standoffs and channels**. The glass itself must be cut *and holes drilled* before toughening — you cannot cut toughened glass. That's why frameless orders go to the glass processor with exact hole positions, and why SmartGlazier generates DXF files.

## 5. Hardware & finishes

- **Hardware** = everything that moves or locks: handles, hinges, rollers (sliding), locks, stays, friction hinges. Priced **per set per opening type** — a sliding section needs rollers + a lock; a fixed section needs nothing.
- **Surface finish** = what's done to the raw ("mill finish") aluminium: **powder coating** (baked-on colour — most common), **anodizing** (electro-chemical, metallic look), **wood-finish coating**, **PVDF** (premium architectural coating for curtain walls), **lamination** (film). EvA treats finish type + colour as a design property; so do we now. Finish affects price (often +10–20% on profile cost) *and cutting* — different colours can't share a stock bar.

## 6. The factory process (what happens after the deposit)

1. **Cutting** — bars cut to length per the cutting list. The saw blade eats **kerf** (~3–5 mm) per cut. Corners are either **mitred** (45°, like a picture frame) or **square/butt cut** — mitred pieces are measured to the *long* edge, which changes the cut list math.
2. **Machining / prep** — holes and slots: drainage slots, lock cases, handle holes, screw ports.
3. **Assembly** — frame and sashes joined (corner cleats or screws), gaskets inserted.
4. **Glazing** — glass into sashes/frame, secured with **beads** (small snap-in profiles) and rubber gaskets.
5. **QA** — check operation, squareness, finish damage.
6. **Dispatch → site installation → handover.**

Sofaamy's stated stages: Cutting → Processing → Holes/Routing → Assembly → Glazing → QA → Delivery. (Still to confirm who owns each stage.)

## 7. Cutting optimization — the deep dive

The problem: you need pieces of many lengths (the **demand**); you buy bars of fixed length (the **stock**); how do you assign pieces to bars so you buy the fewest bars and bin the least metal? This is the classic **1D cutting-stock problem**.

- **Kerf**: every cut loses blade-width. 100 cuts at 5 mm = half a metre gone. Must be modeled.
- **Offcut / remnant**: the leftover on each bar. Long ones (> ~300 mm?) go back to the rack for reuse; short ones are scrap. A serious system tracks the remnant rack as inventory.

- **Utilization / yield**: % of purchased length that ends up in product. 85–92% is typical good practice; their current average is a number we want (it becomes our benchmark).
- **Batching**: optimizing 5 windows together always beats optimizing them one at a time — more piece lengths to mix and match per bar. This is why EvA's Qty field matters: qty 5 multiplies the demand before nesting.
- **Grouping rule**: pieces can only share a bar if same profile *and* same finish/colour.
- Their current tool also has per-piece **grinding** (top/left/bottom/right) and **rotatable** flags — machining/orientation attributes we haven't modeled yet (asked in the questions doc).

Our engine: first-fit-decreasing (sort longest-first, place each piece in the first bar with room). Simple, fast, and within a few % of optimal at this scale. The winning feature isn't the algorithm — it's that **our demand table fills itself from the design** while theirs is typed by hand from a paper calculation.

## 8. How EvA models a project (from the demo) — and how we map it

| EvA concept | What it is | Ours today |
|---|---|---|
| Project | Container: client + many design items | Job (`SOF-YYYY-NNN`) |
| Design item: ref `w3`, Qty 5, Location | One design, made N times, for a named opening in the building | ✅ ref / qty / location on design |
| Canvas with F1/F2 sections, unequal, draggable | The drawing = the data | ✅ draggable dividers, per-section mm |
| Divider library (vertical, horizontal, grids…) | How you split the frame | ✅ grid dividers (steppers) |
| Openable design library (casement, tilt&turn, sliding…) dragged into a section | Turns a section into a sash arrangement | ✅ opening types per section (drag-into-section is Phase 2 polish) |
| Select System (VEKA, SCHUCO…) per section | Profile family choice | ✅ per-design system (placeholder list) |
| Colors: powder / lamination / wood / PVDF | Surface finish | ✅ finish type + colour |
| Inside/Outside, 3D, realistic, section, wall views | Presentation modes | ❌ Phase 2 (2D elevation only today) |
| Share link with client | Client sees/plays with the design | ❌ Phase 2 |
| Save / duplicate template | Reuse designs across projects | ❌ Phase 2 (high value, low effort — next up) |
| Pricing page: manual override, add/delete cost lines | Estimator control over auto-pricing | ❌ next up this month |
| Reports catalog | Every downstream document | ✅ catalog built; quotation + cutting list live |

## 9. What we say in the demo (positioning)

1. Their day today: draw in SmartGlazier or AutoCAD → calculate member lengths by hand → type them into the desktop optimizer → type the same numbers again into a quote. Three tools, zero shared data.
2. Our system: draw once → cut list, quote, BOQ, optimization all *derive*. Change the width 100 mm and watch every downstream number update.
3. EvA does this too — but generic, rented, foreign. Ours is shaped to Sofaamy: their profiles, their stock lengths, their stages, GHS, WhatsApp, and they own it. AutoCAD stays for the jobs that need it.

## 10. Glossary (quick reference)

| Term | Meaning |
|---|---|
| Profile | Extruded aluminium bar with a specific cross-section |
| System | Matched family of profiles from one supplier (frame+sash+bead…) |
| Mullion / Transom | Vertical / horizontal divider member ("mollium"/"transum" at Sofaamy) |
| Sash | The moving sub-frame in an openable section (rails + stiles) |
| Bead | Snap-in strip that holds glass into a frame |
| Gasket | Rubber seal between glass and metal (EPDM) |
| Kerf | Metal lost to the saw blade per cut |
| Nesting | Fitting demand pieces onto stock bars to minimize waste |
| Offcut / remnant | Leftover bar piece; reusable if long enough |
| Utilization / yield | % of bought material that ends up in product |
| Mitre / butt cut | 45° corner cut / straight 90° cut |
| Toughened (tempered) | Heat-strengthened safety glass; cannot be cut after treatment |
| Laminated | Two glass panes bonded with interlayer; holds together when broken |
| BOQ | Bill of quantities — the shopping list for a job |
| Elevation | The flat, dimensioned front-view drawing of a design |
| Curtain wall | Full-façade aluminium+glass grid on a building exterior |
| Patch fitting / spider | Steel connectors that hold frameless glass |
| DXF | CAD file format machines and processors accept |

# First Demo — Sofaamy Team Feedback

**Captured:** 2026-08-13 (relayed by Evans from the demo meeting)
**Implementation status:** Implemented in the current Sofaamy platform on
2026-08-14 for all recommendations that do not require missing Sofaamy business
data. This platform is the product foundation and will be hardened
incrementally, not replaced after the presentation. Items marked ⚠️ still
require confirmation or source documents before they can be made
production-authoritative.

## Implementation map — 14 August 2026

| Feedback | Demo implementation | Remaining dependency |
|---|---|---|
| A1 / A3 | System-scoped, icon-led library and valid-opening filtering | Sofaamy approval of every non-Trialco recipe/catalogue rule |
| A2 | One open project workspace with many independently editable items, combined client quotation and project BOQ | Representative 22-opening acceptance job |
| A4 | Quick-add, project item rail, validation indicators and fewer page changes | Tablet acceptance walkthrough |
| B1 / B2 / B4 | Project cutting and bundle PDF with dimensioned members, both end angles, per-window/door labels and shared-stock nesting | None for demo; validate quantities against a completed job |
| B3 | Intentionally not invented | Sofaamy pyramid/offcut sketch |
| C1 / C2 | Persistent owner/team, dates, departmental tasks, audit timeline, project kanban, calendar and stalled-paid exceptions | Final role permissions and inactivity threshold |
| D1 | Role-focus dashboard views plus Management overview and Project Control Board | Server-enforced authentication/permissions |
| E1 | Generated-first material extraction; manual rows hidden unless a reasoned supervisor exception is opened | Completed job packs and approved product recipes |
| E2 | Rule recorded and recipes remain provisional | Exact door-only extra-key/accessory codes and quantities |
| F1 | Enforced project-wide Pre-production QC gate between Procurement and Factory Release, with five signed checks, holds and stale-approval detection | Confirm whether Sofaamy names the owning department QA or QC |

The `Current state` notes below preserve what was observed at feedback capture;
the table above and `NEXT-BUILD-CHECKLIST.md` are the current implementation
record.

Sofaamy's framing: **the Design Configurator is the heart of the software and still needs a lot of work.** The feedback below is genuine product direction from the people who will use it daily — treat it as the primary input for the next build phase, alongside the scope-request returns.

---

## A. Configurator (the heart)

### A1. Configurator must be scoped to the chosen product system
**What they said:** If the project is a Trialco sliding window, everything in the configurator should be of benefit to a Trialco sliding window. Choosing "sliding window" but still seeing casement (and other unrelated) options makes the system cumbersome.

**Interpretation:** The design library, opening types, properties, and accessory choices should be **filtered by the selected product system/category** — not a full catalogue with irrelevant entries visible.

**Current state:** The New Project modal picks a category (Frame/Frameless/Curtain Wall) and a system (e.g. Trialco), but the shape/design libraries and section opening choices still expose the full range (casement, projected, etc.) regardless of system.

**Direction:** Once a system is chosen, only that system's valid designs, openings, and options appear. Ties directly to A3 (sidebar filtering).

---

### A2. Multiple windows (items) inside ONE open configurator — no Duplicate & Edit
**What they said:** They often work on jobs of e.g. **22 windows, each with its own measurements — no formula, every window is measured individually**. They must be able to keep adding windows with their separate measurements **inside the one configurator that is open**, without duplicating the project per window ("it makes the project become plenty"). Same applies across product types: working on sliding windows and needing to add a projected window should happen **in the same open configurator**, not via Duplicate & Edit — so that quoting and the material list come out **unified** for the whole client job.

**Interpretation:** The configurator workspace becomes a **project workspace**: a list of the project's windows/doors (items) always visible, "Add window" adds a new item in place (with its own dimensions, design, glass, opening), click any item to edit it on the canvas. One project → many items → one client quote → one combined material list/cutting list.

**Current state:** The data model already supports many items per project (per-item extraction chains, logged 2026-08-01), but the **UX route is Duplicate & Edit per item** — exactly what they rejected. The client quotation PDF already rolls up all items; the material/cutting documents are per item.

**Logged decisions this touches:**
- *2026-08-03 Duplicate & Edit* — the mechanism works, but this feedback supersedes it as the primary way to add items. It can remain as a convenience ("copy this window as a starting point") inside the new in-workspace flow.
- *2026-08-01 per-item pipeline* — unaffected in the data model (each window keeps its own technical identity); this is a workspace/UX change plus combined documents.
- *2026-08-02 per-item quoting* — Evans already established: items are standalone through the pipeline, but **client quoting lists all items with their costs**. This feedback is consistent with that. ⚠️ See open question Q4 on what "unified material list" means for internal docs.

---

### A3. Sidebar icons that filter the library by product type
**What they said:** Icons on the configurator sidebar — click **Frame** and everything relating to frame opens; click **Sliding Door** and only sliding-door content shows; same for the rest.

**Interpretation:** Replace the current grouped library panels with an **icon-driven, category-then-type navigation** — the library only ever shows what's relevant to the icon selected. Works together with A1 (system scoping).

---

### A4. Too many clicks / too much movement
**What they said:** "The clicking is too much in this system." There is a lot of movement. They need it as easy as possible.

**Interpretation:** A general UX pass on the configurator's main flows: create project → add windows → set measurements → quote should take the minimum possible interactions. A2 and A3 are the two biggest concrete de-click wins; beyond those, audit each demo flow for steps that can collapse.

---

## B. Cutting list & factory documents

### B1. Cutting list must carry drawings with measurement breakdowns
**What they said:** The cutting list should also have **drawings with their measurement breakdowns** — each piece with each height, detailed breakdowns the **factory workers can use to do the cutting**.

**Interpretation:** Not just the table of positions/lengths — each cut piece (or each window's piece set) gets a **dimensioned drawing** on the cutting document itself, so a cutter works from the drawing, not from cross-referencing a table.

**Current state:** The cutting-list PDF has the demand table, bar-by-bar nesting sequences, and waste %. Dimensioned drawings exist elsewhere (elevation report, frameless per-panel drawings) but are **not on the cutting list**.

---

### B2. Cut angles must be visible — 90/90 vs 45/45
**What they said:** The cutter should see, e.g. cutting 2000 two pieces, whether the ends are **90/90 or 45/45**.

**Interpretation:** Every cutting-list line (and drawing, per B1) states the end-cut angle for each end of the piece, plus quantity of identical cuts.

**Current state:** The fabrication engine already knows this internally (outer frames mitred 45°/45°, mullions/transoms square-cut — logged 2026-07-12), but the cutting list does **not print the angles**. This is exposing existing data, not new modelling.

---

### B3. ⚠️ "Excess" shown as pyramid instead of rectangle
**What they said:** On the cutting-list design showing the excess, can it change from **rectangle to pyramid**? (Evans: "I don't know how that will look like.")

**Best interpretation (unconfirmed):** This is almost certainly about **mitre cuts**. A profile cut at 45° at both ends is not a rectangle — drawn in 2D it is a **trapezoid** (a "pyramid with the top cut off"), and two mitred pieces nested against each other form triangular offcut wedges. Read together with B2, they are likely saying: *draw the pieces on the bar diagram with their true angled ends, so the cutter sees the mitre and the real waste shape — not abstract rectangles.*

**Open question — Q1:** Confirm with Sofaamy: do they mean (a) draw pieces with their true 45° ends (trapezoid/angled shapes) on the bar diagram, or (b) something specific about how the leftover/offcut itself is drawn? A quick sketch from them settles it.

---

### B4. Cutting list broken down per window — "Window 1, Window 2, …"
**What they said:** The cutting list should differentiate: this breakdown is Window 1, this is Window 2, and the rest.

**Interpretation:** In a multi-item project (A2), the combined cutting document groups/labels every piece by which window it belongs to, so the factory can cut and bundle per window. (Nesting can still optimise across the whole batch — labels tell the cutter which window each piece serves. ⚠️ See Q4 for whether they also want the option of per-window nesting.)

---

## C. Project management & tracking

### C1. Assign projects to individuals with deadlines, start/end dates, calendar
**What they said:** They need to **assign projects to specific individuals or teams, with a deadline** — a start date and an end date — and a **calendar for tracking the tasks given**, colour-coded, so everyone knows what they're doing each week. In all: **project management**.

**The pain point behind it (their words):** *Sometimes procurement forgets about a project. The customer has paid, but nothing has been done about it.* They need something that tracks this.

**Interpretation:** A project-management layer: assignments (project → person/team), scheduling (start/end dates), a colour-coded calendar/week view, and — critically — **alerts on stalled paid projects** (deposit received but no movement in X days). The forgotten-paid-project alarm is arguably the highest-value single feature in this whole feedback set: it's a named, costly, recurring failure.

**Current state:** Nothing exists for assignment, deadlines, or calendars. Jobs have stages but no owner, no dates, no idle-time alerting.

**⚠️ Open questions — Q5:** Who assigns (management? supervisor per department)? Are deadlines at project level, per stage, or per department task? Does "team" map to the existing 7 roles or to named individuals? (Likely answered properly by the department scope forms — but worth asking the coordinator directly since they raised it.)

---

### C2. Kanban board for the project pipeline
**What they said:** They suggested **kanban for tracking the project pipeline**, and later: they need a **project dashboard, kanban board** — they don't currently *see the flow of work*.

**Interpretation:** A **project-level kanban** spanning the whole business pipeline (e.g. Measurement → Quoted → Deposit Paid → In Production → QA → Dispatch → Delivered), where a card = a client project. This is different from the existing Production page kanban, which is the **factory stage board for jobs** — what they're missing is the whole-of-business view where a paid-but-idle project is visibly stuck in a column (directly serving the C1 pain point).

---

## D. Dashboard & roles

### D1. Dashboard is too busy; segregate by role
**What they said:** The dashboard is **too informative — it is busy**; they need it organized. And **roles must be segregated**: each role sees its own view.

**Interpretation:** Replace the single dense dashboard with **role-scoped views** (management, sales, procurement, factory, accounts, QA see what's theirs), and make the project kanban (C2) the default "flow of work" screen rather than stat panels.

**Current state:** One dashboard for everyone (monthly figures, trends, stage mix, low stock, activity feed). The 7-role model is defined in the architecture but there is no per-role UI scoping yet.

---

## E. Extraction & materials

### E1. ⚠️ Extraction should NOT allow users to add materials — the system generates them
**What they said:** The extraction shouldn't allow users to add materials. **The system should be able to generate the right materials.**

**Interpretation:** Material extraction becomes fully automatic from the design: the configurator's design record determines the complete, correct material list; the technical user reviews/approves rather than composes.

**Hard dependency:** Auto-generating the *right* materials requires **Sofaamy's confirmed per-system rules** — consumption, cut deductions, glass deductions, accessory counts, wastage — which are exactly the provisional placeholders logged repeatedly since 2026-07-11 and requested in the scope request's supporting documents (completed job packs). **This feedback is the strongest argument yet for Sofaamy returning those documents**: the thing they asked for is only buildable with the rules only they hold. Worth saying to them in exactly those terms.

**⚠️ Open question — Q3:** Does "shouldn't allow users to add materials" mean literally *no* manual line at all, or auto-generate with a supervised override? Recommendation: auto-generate everything, keep an explicit flagged override (audit-logged), at least until their rules have been validated against real completed jobs — a hard lockout before validation would block real work the first time a rule is wrong.

### E2. Domain fact: frame doors = frame window materials + extras
**What they said:** Frame doors and windows use the **same materials**, except doors take **extra keys** to it.

**Interpretation:** In the frame catalogue, a door's BOM = the window BOM for the same system **plus a door-specific accessory set** — "keys" presumably meaning **locks/lock cylinders and keys** (⚠️ Q2: confirm the exact extra items and codes — likely lock body, cylinder + keys, possibly different handles/hinges).

**Value:** This is a real, free consumption rule from the client — record it in the frame catalogue model so door systems derive from window systems rather than being modelled separately.

---

## F. Pre-production quality release

### F1. QA/QC verifies the complete project before production begins

**What they said:** After Procurement, QA or QC checks that all measurements,
materials and other production information are correct before releasing the
work to the factory floor.

**Implemented interpretation:** This is a separate control from the final QA
inspection after production. The current pipeline is now:

```text
Procurement → Pre-production QC → Factory Release → Production → Final QA
```

The pre-production check is project-wide because QA/QC is authorising the
complete production pack. It requires five explicit confirmations:

1. measurements;
2. material types/specifications;
3. material and production quantities;
4. current approved drawings; and
5. completed procurement/material availability.

QA/QC can approve or place the project on hold with a reason. Factory release
is rejected by the backend until a current approval exists. The approval is
bound to the saved design, approved extraction, accepted quotation, approved
drawing and procurement quantities for every item. Any later controlled change
makes that approval stale and requires a new check. Final post-production QA
remains a separate enforced gate before Dispatch.

---

## Open questions (to take back to Sofaamy / for Evans)

In the current product, Q3–Q6 use safe provisional defaults: generated materials with a
reasoned supervisor exception; combined documents alongside per-item documents;
project-wide nesting with bundle labels; dates at project and task level; and a
business-project board separate from factory production. These are visible
choices to confirm in the meeting, not hidden assumptions.

| # | Question | Blocks |
|---|----------|--------|
| Q1 | "Pyramid" excess: do they mean drawing pieces with true 45° mitred ends (trapezoids) on the bar diagram, or something else about the offcut shape? Ask for a sketch. | B3 |
| Q2 | "Extra keys" on doors: exact list of the door-only accessories (lock body? cylinder + keys? handles? hinges?) with codes. | E2 |
| Q3 | Auto-generated materials: zero manual entry, or auto-generate with a flagged supervisor override? (Recommend override until rules are validated.) | E1 |
| Q4 | "Unified material list": one combined cutting list/BOQ for the whole project with per-window labels (B4) — does that *replace* per-item documents or sit alongside them? And should nesting optimise across the whole batch or per window? | A2, B4 |
| Q5 | Assignment model: who assigns, deadline granularity (project / stage / task), teams vs the 7 roles? | C1 |
| Q6 | Kanban columns: confirm the pipeline stages they want to see on the project board (proposed: Measurement → Quoted → Deposit Paid → In Production → QA → Dispatch → Delivered). | C2 |
| Q7 | What is the exact Sofaamy department/title for the pre-production release check: QA, QC, or another name? The platform currently uses the neutral label `QA / QC`. | F1 |

## Notes on fit with logged decisions

- **A2 supersedes Duplicate & Edit as the primary add-item flow** (2026-08-03 decision) — flagging per the MEMORY rule; the underlying per-item data model survives unchanged.
- **E1 depends on the supporting-document request** in `SOFAAMY-SCOPE-REQUEST.md` — completed job packs are what turn provisional formulas into "the system generates the right materials."
- Nothing here contradicts the per-item pipeline / combined-client-quote model (2026-08-01, 2026-08-02); A2/B4 extend it with combined *internal* documents, pending Q4.

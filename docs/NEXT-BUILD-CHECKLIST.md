# Sofaamy — Current Product Hardening Checklist

**Prepared:** 14 August 2026  
**Primary input:** First-demo feedback  
**Supporting input:** Shared Odoo workflow and the approved technical workflow  
**Purpose:** Incremental implementation and hardening order for the existing
Sofaamy platform. This is not a replacement build.

Legend: `[ ]` todo · `[~]` in progress · `[x]` complete · `[!]` blocked by a
Sofaamy decision or source document

## Working rules

- The Configurator is the immediate product priority.
- One client project may contain many independently measured windows, doors and
  other items.
- The client can receive one combined quotation while every item keeps its own
  technical identity and revision chain.
- After E2 is approved, all current reports and operational quantities read E2.
  Older revisions remain audit history only.
- Trialco rules must not be applied to other systems without approved evidence.
- Do not remove every manual material exception until a system recipe has been
  validated against completed Sofaamy jobs.
- Do not build the `pyramid` cutting graphic until Sofaamy provides a sketch or
  confirms the intended shape.

## Milestone 1 — System-scoped Configurator — core built

### Build

- [~] Define the valid product types, openings, designs, glass choices,
  properties and accessories for every configured system.
- [x] Filter the design library by family, category, Window/Door kind and the
  applicable system scope.
- [x] Hide casement, projected and other irrelevant options when working on a
  Trialco sliding window.
- [x] Add a vertical icon tool rail and one-level-at-a-time drill-down:
  family → category → Window/Door → design.
- [x] Preserve and restore the working scope when an item is opened, switched,
  duplicated or quick-added.
- [x] Show a clear `recipe not yet Sofaamy-approved` state when a system has no
  approved recipe, while keeping measurement and quotation work available.
- [~] Audit create project → select system → enter measurements → design → save
  for unnecessary clicks and page movement.
- [~] Remove or combine redundant controls without removing required technical
  decisions.
- [x] Remove the manual accessory editor while preserving automatic accessory
  generation downstream.
- [x] Route catalogue clicks and drag/drop through the same-project quick-add
  flow so a design cannot be silently orphaned from its project.

### Acceptance checks

- [x] A Trialco sliding project shows only valid Trialco sliding opening choices.
- [x] Changing or opening an item refreshes dependent library choices safely.
- [x] A user cannot save or leave an opening/design combination invalid for its
  system.
- [ ] The main design flow works on desktop and a factory-sized tablet.
- [x] Existing valid saved designs still open without hiding legacy values.

## Milestone 2 — Multi-item Configurator workspace — core built

### Build

- [x] Add a persistent numbered project-item rail inside the open Configurator.
- [x] Add `New window/door/item` without leaving or duplicating the project.
- [x] Give every item an editable label/reference such as Window 1, Window 2 or
  Door 1.
- [x] Store independent dimensions, system, design, glass, opening and location
  for every item.
- [x] Allow users to switch items and immediately continue editing that item's
  canvas.
- [x] Keep Duplicate & Edit only as an optional `Copy item` shortcut.
- [x] Add item completion/validation indicators in the workspace list.
- [x] Auto-save the current item before switching; remain on it and show the API
  error when saving fails.
- [x] Keep per-item extraction, drawing and factory-release revision identity.
- [~] Preserve both commercial views: standalone controlled quotations per item
  and the existing combined project client-quotation total.
- [x] Generate a project material/BOQ roll-up traceable back to every item.
- [x] Thread `design_id` through Reports downloads so reports use the correct
  approved per-item extraction instead of falling back to calculated design
  data.
- [x] Replace the legacy project-level chain-integrity summary with a true
  multi-item roll-up.

### Acceptance checks

- [ ] Create one project containing at least 22 separately measured windows.
- [x] Switching between tested items preserves every item's independent values.
- [x] The tested multi-item flow keeps one project record.
- [x] One client quotation lists every selected item and its cost.
- [x] Combined BOQ quantities can be traced back to Window 1, Window 2, etc.
- [x] Revising E1 to E2 for one item does not change another item's approved
  extraction.
- [x] Every newly generated current item report reads the correct approved item
  extraction.

## Milestone 3 — Unified project workspace and full pipeline — in progress

### Product shape

Build one project page that shows the complete client job without placing every
department form on screen at once. Follow the established progressive-
disclosure rule: show the overall state and next action first, then open one
stage or item detail at a time.

Recommended route:

```text
/projects/{projectId}
```

Page structure:

```text
┌ Project, client, site, owner, due date, status ─────────────────────┐
│ Next action                 │ Payment             │ Main blocker    │
├ Measurement → Design → Extraction → Quote → Payment → Drawing ─────┤
│ → Procurement → Pre-production QC → Release → Production           │
│ → Final QA → Dispatch → Delivered                                  │
├ Product groups: Trialco Window (18) · Sliding Door (4) ────────────┤
│ Selected stage or selected item detail — one working area at a time │
├ Current documents ────────────────┬ Project activity timeline ──────┤
└───────────────────────────────────┴─────────────────────────────────┘
```

The existing department pages remain useful as registers and work queues. The
new page is the complete project context connecting them.

### Backend and data contract

- [x] Extend the existing `GET /api/projects/{id}/workflow` payload instead of
  creating a second competing project-summary endpoint.
- [x] Return one project header: client, site, project number, owner/team,
  planned start, due date, priority, contract value, paid amount, outstanding
  balance and current overall status.
- [~] Return every project item grouped by product with its own design,
  extraction, quotation, drawing and release status. Production is shown when
  an item has an explicit Job link; reliable per-item Job linkage is still due.
- [x] Return project-level roll-ups for quotation, payment, procurement,
  production, QA and delivery.
- [x] Derive a single `next_action` with responsible role or named owner/team,
  waiting duration, due date and blocking reason.
- [x] Return project alerts: stale quotation, missing approved extraction,
  payment hold, procurement shortfall, superseded drawing/release, stalled paid
  work, missing ownership/task, overdue task and delivery hold.
- [x] Return current documents and superseded audit documents separately.
- [x] Make roll-ups item-aware; do not use the first matching quote, drawing or
  release across the whole project.
- [x] Preserve the project-wide combined contract/payment calculation while
  keeping item production chains separate.

### Project-page header

- [x] Show project number, client, site and overall status.
- [x] Show owner/team, planned start, due date and waiting time.
- [x] Show combined contract value, paid, outstanding and payment gate.
- [x] Show a prominent `Next action` card with responsible role and blocker.
- [x] Provide clear actions for Open Design, Review Pricing, record the client
  quotation decision, Record Payment, Technical Workflow and View Production.
- [x] Keep the latest serious alert visible without making the page visually
  busy.

### Full pipeline on one page

- [x] Add a project pipeline covering:
  Measurement → Design → Extraction → Quotation → Payment → Drawing →
  Procurement → Pre-production QC → Factory Release → Production → Final QA →
  Dispatch → Delivered.
- [x] Enforce a project-wide pre-production QA/QC check after Procurement and
  before Factory Release: measurements, materials, quantities, drawings and
  procurement availability must all be signed off.
- [x] Persist approve/hold decisions with inspector, notes and audit time; make
  approval stale when any controlled design, E/Q/R or procurement input changes.
- [x] Keep final post-production QA as a separate gate before Dispatch.
- [x] Show complete, current, blocked, overdue and not-started states.
- [x] Make each stage selectable so only that stage's working detail opens.
- [x] Show project-level stages and per-item technical stages distinctly.
- [x] Prevent a completed state when one required item remains incomplete.
- [x] Deep-link stage actions to the existing Configurator, Quotations,
  Technical Workflow, Accounts, Inventory, Production, QA and Dispatch pages.
- [~] Preserve selected stage and product-group context in the project URL.
  Department pages still need a consistent `Return to project` action.

### Project items inside the page

- [x] Group items by product so 50 windows do not become 50 flat cards.
- [x] Show group counts, total quantities and completion counts.
- [x] Expand one group at a time to show Window 1, Window 2, Door 1, etc.
- [~] Show each item's current stage, approved E/Q/R/F references, shortages and
  blocking reason.
- [x] Open an item's Configurator editor through a project-and-item deep link.
- [x] Preserve the logged behavior that clicking a product group inside the
  Configurator opens its editor directly; add the pipeline page as a separate
  project-level action rather than silently changing that interaction.

### Activity, documents and controls

- [~] Add one chronological project timeline combining the currently persisted
  project, quotation, payment, technical, pre-production QC, production and
  dispatch events. Stock and final job QA still need fuller project-level event
  integration.
- [x] Add a current-document area for quotation, approved drawing, factory pack,
  project BOQ/cutting pack and delivery note. Invoice generation is not
  implemented.
- [x] Label superseded documents `Do Not Produce` and keep them under audit
  history.
- [x] Show procurement required, available, reserved and shortfall quantities
  from the approved item extractions.
- [ ] Show production progress as item/piece counts, not only project Job counts.

### Acceptance checks

- [x] From one URL, management can understand the project's current position,
  money status, named owner/team, due date, next action and blocker.
- [x] A project with window and door items shows independent technical chains
  and one combined commercial/payment view.
- [x] Updating one item's extraction or drawing refreshes only that item's chain
  and the correct project roll-up.
- [x] The project workspace does not report the first matching
  quote/drawing/release as though it belongs to every item.
- [x] A paid but inactive project is visibly flagged.
- [x] The page remains understandable with large item counts because details are
  grouped and progressively disclosed.
- [x] Current item reports and the combined project BOQ use the latest approved
  item extraction; current and superseded workspace documents are separated.
- [~] Direct project URLs preserve selected stage and product group. Automated
  browser back/forward verification is still due.

## Milestone 4 — Factory-ready cutting documents

### Build now

- [x] Add a dimensioned member diagram to each cutting-list group.
- [x] Print item/opening identity on every cutting group.
- [x] Print member name, length, quantity and both end-cut angles.
- [x] Distinguish 90°/90°, 45°/45° and mixed-angle pieces.
- [x] Label optimized cuts with Window 1, Window 2, Door 1, etc., even when
  nesting across the whole project.
- [x] Add bundle/group labels so factory workers can keep completed pieces with
  their intended opening.
- [x] Keep stock-bar length, kerf, used length, offcut and waste visible.
- [x] Ensure drawing dimensions and table dimensions come from the same current
  source.

### Applied defaults and remaining blocked input

- [!] Ask Sofaamy for a sketch of the requested `pyramid` excess/offcut.
- [x] Default project nesting to all eligible project items, with bundle labels
  retained on every shared bar.
- [x] Keep the combined cutting/BOQ documents alongside controlled per-item
  documents.

### Acceptance checks

- [x] A cutter can identify the item, member, length, quantity and both end
  angles without opening another report.
- [x] A multi-item cutting list remains readable and bundle-safe.
- [x] Totals use the current approved E2 extraction when present; otherwise the
  document explicitly identifies working design quantities.
- [x] PDF output is visually checked with a representative four-item job.

## Milestone 5 — Project ownership and stalled-paid-project protection

### Build

- [x] Add project owner and responsible team.
- [x] Add departmental tasks with assignee, due date, priority, status and notes.
- [~] Add planned start, due date and completed date. Start and due dates are
  complete; completed date remains derived from delivery/workflow completion.
- [x] Record assignment, task and deadline changes in the project audit trail.
- [x] Add a colour-coded calendar/month view.
- [x] Replace the static Surveys screen with project-linked scheduling,
  assignment, rescheduling, start, completion, cancellation and overdue state.
- [x] Persist survey changes in the project audit history and move a scheduled
  pre-measurement project to Measurement received when the survey completes.
- [x] Keep operational pages current through immediate same-browser mutation
  events, cross-tab events, focus refresh and a five-second active-page poll.
- [x] Add a project-level kanban separate from the factory production board.
- [x] Show the responsible person and next action on each kanban card.
- [x] Flag projects with payment recorded but no owner.
- [x] Flag paid projects with no next task.
- [ ] Flag paid projects with no activity for the configured number of days.
- [x] Show the waiting duration and responsible team on stalled project alerts.
- [x] Provide a management exception list for overdue, unassigned and
  paid-active work.

### Applied defaults and remaining decision

- [~] Assignment is available through Project Control in the current product;
  role-enforced assignment/reassignment permissions still require the approved
  authentication model.
- [x] Deadlines are supported at both project and departmental-task level.
- [x] Use business-project columns from Measurement & Design through Delivered,
  separate from factory production stages.
- [!] Confirm the inactivity threshold for a stalled paid project.

### Acceptance checks

- [x] Management can answer: `Which paid projects have not moved, who owns the
  next action, and how long have they been waiting?`
- [x] A paid project without progress cannot disappear inside the normal
  dashboard statistics.
- [x] Factory-stage movement and business-project movement remain distinct.

## Milestone 6 — Role-scoped dashboards

### Build

- [~] Define dashboard permissions and work queues for Management, Sales,
  Technical, Procurement/Stores, Accounts, Production and QA/Dispatch.
- [x] Make the project kanban or role work queue the main operational view.
- [x] Move secondary trends and analytics away from the immediate action area.
- [~] Show each role only the actions, alerts and approvals it can perform in
  the dashboard. Server-enforced permissions remain a separate security phase.
- [x] Preserve a management overview across all departments.
- [~] Add consistent hover, selected, focus and pointer feedback to dashboard
  controls.

### Acceptance checks

- [ ] Sales does not see factory controls it cannot use.
- [x] Procurement immediately sees paid/released projects requiring materials.
- [x] Accounts sees payment, balance and financial-hold work.
- [x] Management sees cross-department delays and ownership.
- [x] The dashboard is usable without scanning every business statistic first.

## Milestone 7 — Automatic extraction and validated product recipes

### Build

- [x] Make generated extraction the default project-item flow, while clearly
  marking recipes that are not yet Sofaamy-approved.
- [x] Keep Trialco on its dedicated formula path.
- [x] Make generated material rows read-only in the ordinary user flow.
- [~] Add a supervisor exception with reason, old value, new value, user
  and timestamp.
- [x] Recalculate quotation review, procurement and factory release when an
  approved extraction changes.
- [x] Keep E2 as the source for current BOQ, purchasing, stock issue, quotation
  basis and factory material reports.
- [ ] Model frame-door recipes as the related frame-window recipe plus confirmed
  door-only accessories.
- [ ] Validate every new recipe against completed Sofaamy jobs before marking it
  production-ready.

### Blocked inputs

- [!] Obtain completed job packs for every system to be automated.
- [!] Obtain profile, glass, hardware and accessory codes and prices.
- [!] Obtain deductions, quantities, wastage, stock lengths and exception rules.
- [!] Confirm the exact door-only `extra keys` items, codes and quantities.
- [!] Confirm whether supervised material exceptions are allowed after recipe
  approval.

### Acceptance checks

- [ ] A generated extraction reproduces an approved completed job within the
  accepted tolerance.
- [x] Users cannot silently introduce unapproved material changes through the
  ordinary extraction flow.
- [x] Superseded extraction data never returns as a current report source.

## Milestone 8 — Commercial and delivery controls from workflow evidence

### Build after confirmation

- [!] Confirm that 30 days is Sofaamy's approved quotation-validity rule.
- [ ] Enforce quotation expiry during acceptance/validation.
- [ ] Add supervisor expiry override with reason and audit event.
- [!] Confirm whether 5% accessory and 10% glass discounts are maximums or fixed
  values.
- [ ] Add category-specific discount policies.
- [ ] Restrict protected accessory price edits by role.
- [ ] Audit every price or discount override.
- [ ] Record immutable customer specification sign-off.
- [!] Define `Customer Copy` and its validation rule.
- [ ] Add Ready for Delivery, Delivery on Hold and Credit Released states.
- [ ] Prevent dispatch until production and financial gates pass.
- [!] Confirm who can approve credit release.

### Acceptance checks

- [ ] An expired quotation cannot proceed without an authorized override.
- [ ] Ordinary Sales users cannot bypass price and discount rules.
- [ ] A financially held order cannot be dispatched.
- [ ] Every override identifies who, when, why and what changed.

## Milestone 9 — Sales Order, invoice and reservation flow

- [!] Confirm whether the shared Odoo sequence is still Sofaamy's intended
  operating model.
- [ ] Introduce a Sales Order between accepted quotation and production Job.
- [ ] Freeze Sales Order lines from the approved quotation snapshot.
- [ ] Unbundle lines into inventory, glass-processing services and commercial
  additions without losing their source quotation/extraction references.
- [ ] Add Invoice status and client-account balance.
- [!] Confirm the payment or invoice condition that releases drawing work.
- [ ] Reserve accessories and glass against the approved extraction revision.
- [ ] Record shortage, substitution, release and cancellation events.
- [ ] Add an approved `drawing not required` path with author, date and reason.
- [ ] Treat Configurator, AutoCAD and Smart Builder as drawing methods under one
  revision-control model.

## Milestone 10 — Tagged glass-piece production

- [ ] Add a production-piece record linked to the approved factory release and
  project item.
- [ ] Generate a unique tag or QR/barcode for each glass piece.
- [!] Confirm tag format, printer and scanning equipment.
- [ ] Generate only the required route for each piece.
- [!] Confirm valid sequences for CT, PH, CNC, SB, TEM, DG and LAM.
- [ ] Add mobile start/complete actions for each operation.
- [ ] Start the next required operation when the current one completes.
- [ ] Add piece-level damaged, replacement and scrapped states.
- [ ] Preserve the relationship between a damaged piece and its replacement.
- [ ] Add glass-stand assignment and location history.
- [!] Confirm the meaning and operating rules of the GPU store.
- [ ] Derive order completion from all required non-cancelled pieces.
- [ ] Trigger customer pickup notification only after production completion.
- [ ] Link dispatch to financially cleared pieces and reservations.

### Acceptance checks

- [ ] A piece never enters an operation not present in its approved route.
- [ ] A broken piece cannot be counted as completed or dispatched.
- [ ] Staff can locate every completed piece by stand.
- [ ] The system can trace a dispatched piece back through its operations,
  factory release, drawing, quotation and approved extraction.

## Cross-cutting verification for every milestone

- [~] Add or update backend tests for business rules and authorization gates.
  Business-path coverage is updated; server authorization gates remain due.
- [ ] Add frontend tests for the main user path and invalid-state handling.
- [x] Run frontend build and type/lint checks available in the repository.
- [x] Run backend tests and compile checks from the active repository root; the
  old `sofaamy-bms/` directory is a stale duplicate.
- [x] Perform a browser walkthrough using representative Sofaamy data.
- [ ] Check desktop, tablet and mobile layouts where relevant.
- [~] Verify no visible runtime/error overlay during the tested workflow; a full
  automated console assertion remains due.
- [ ] Verify all audit events identify the real acting user.
- [x] Verify current outputs use the approved extraction revision.
- [x] Update the checklist and related workflow documentation when a rule is
  confirmed or superseded.

## Recommended immediate work package

Start with these items before deeper Odoo-style production automation:

1. Validate the implemented configurator and project cutting pack against one
   completed Sofaamy job and replace provisional recipe mappings with approved
   codes, deductions, wastage and stock lengths.
2. Obtain the pyramid/offcut sketch, door-only extra-key definitions, final
   staff roles and the stalled-project inactivity threshold.
3. Add server-enforced authentication/permissions and normalized project/task
   tables in a separately approved schema phase; the current product persists
   project management and survey changes through the existing audit-event
   store.
4. Continue Milestones 8–10 only after Sofaamy confirms the commercial,
   dispatch and tagged-glass rules.

Milestones 3–6 and the non-data controls in Milestone 7 are implemented in the
current product. Continue hardening this same platform; do not start a parallel
replacement build. The remaining work must validate Sofaamy-specific rules,
normalize persistence where justified and enforce permissions rather than
inventing factory behavior.

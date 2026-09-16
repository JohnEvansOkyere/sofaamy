# Sofaamy Odoo Workflow Evidence — System Improvement Plan

**Source:** `docs/reference/WORKFLOW DOCUMENTATION.pdf`  
**Source date:** 24 October 2025  
**Additional product input:** `docs/DEMO-1-FEEDBACK.md`  
**Review date:** 14 August 2026  
**Authority status:** Evidence of a workflow Sofaamy shared with another team. It
must be confirmed as current before it is treated as an approved build
specification.

## 1. How to use this document

The supplied workflow should be used as an operational evidence source, not as
a replacement for Sofaamy's newer technical workflow.

The first-demo feedback is the stronger source for what Sofaamy wants built
next. The workflow PDF explains operational controls and future depth; the
feedback determines the immediate product priority and user experience.

It gives useful detail about:

- quotation controls;
- payment and customer sign-off;
- sales-order and invoice handoffs;
- glass-piece production routing;
- breakage handling;
- financial clearance before delivery;
- customer pickup notification; and
- dispatch.

The current platform already has stronger revision controls around technical
extraction, quotation, drawing and factory release. Those controls should be
preserved. In particular, after extraction E2 is approved, all current reports,
inventory requirements and factory material outputs must read E2. Older
revisions remain audit history only.

The combined target is therefore:

```text
Project and measurement
→ Approved extraction E2
→ Controlled quotation Q2
→ Payment and signed specification validation
→ Sales order and invoice
→ Approved drawing R2
→ Frozen factory release F2
→ Tagged production pieces and routed operations
→ Completion and financial clearance
→ Customer notification
→ Dispatch
```

### 1.1 What the first-demo feedback changes

Sofaamy explicitly described the Design Configurator as the heart of the
software. This changes the implementation sequence:

1. make the configurator fast, system-specific and multi-item;
2. make its cutting outputs usable directly by factory workers;
3. expose stalled paid projects through assignments, deadlines and a project
   kanban;
4. automate extraction as Sofaamy supplies and approves the remaining system
   recipes; and
5. add the deeper commercial and glass-piece production controls identified in
   the Odoo workflow.

The production-piece architecture remains important, but it should not delay
the configurator and project-tracking improvements the users directly asked
for after seeing the system.

## 2. What the supplied workflow confirms

### Commercial controls

- Customer records are checked before quotation creation.
- Quotations include job description, square-metre measurements, job category,
  accessories and internal commercial nuances.
- Accessory prices are not editable by ordinary Sales Agents.
- Quotation validity is 30 days.
- Accessory and glass discounts have separate limits.
- Overrides require privileged user identification and an audit trail.
- Quotations can be sent through email, WhatsApp or print.
- Payment initiates validation and the customer signs the final specification.
- A quotation older than 30 days requires supervisor authorization.
- A customer-copy allowance must be revised or removed before validation.

### Order and drawing handoffs

- A validated quotation becomes a Sales Order.
- The Sales Order unbundles quoted amounts into recognized services and
  inventory items.
- Accessories are reserved and glass is queued at the GPU store.
- Confirming the Sales Order creates an invoice and debits the client account.
- Invoice creation queues the order for the Drawing Team.
- Drawings are prepared in Smart Builder and attached to the order.
- Where no drawing is required, the Drawing Team records that decision before
  forwarding the order to the factory.

### Production controls

- Starting production creates a tag for every glass piece.
- Required services are generated for each piece.
- The documented operation codes are:

  | Code | Operation |
  |---|---|
  | CT | Cutting |
  | PH | Polishing |
  | CNC | CNC processing |
  | SB | Sandblasting |
  | TEM | Tempering |
  | DG | Double glazing |
  | LAM | Lamination |

- Completing one operation starts the next designated operation.
- Job Monitoring Officers update work from Android or iOS devices.
- A damaged piece returns to Production Planning with a damaged marker.
- A completed piece can be assigned to a glass stand.
- The order is complete only when all its glass pieces are complete.

### Delivery controls

- Financially cleared orders become Ready for Delivery.
- Orders with outstanding balances become Delivery on Hold.
- Finance can release an on-hold order where approved credit terms exist.
- The customer is automatically prompted when all glass pieces are complete.
- Dispatch delivers the glass previously queued or reserved at the GPU store.

## 3. Fit-gap against the current platform

| Workflow capability | Current position | Improvement |
|---|---|---|
| Configurator relevance | Unrelated designs and opening options remain visible | Filter designs, openings and accessories by selected product system |
| Multi-item projects | Data model supports multiple items, but the UX relies on Duplicate & Edit | Add and switch between independently measured windows/doors inside one project workspace |
| Configurator navigation | Grouped controls require excessive movement | Use icon-driven category/type navigation and reduce steps in the main workflow |
| Factory cutting document | Tables and nesting are available, but drawings and angles are incomplete | Print dimensioned per-window drawings and both end-cut angles with each cutting group |
| Project ownership | Jobs have stages but no complete assignment or schedule model | Add owner/team, start date, due date, calendar and overdue/stalled alerts |
| Business-wide pipeline | Production has a factory-stage board | Add a project kanban from measurement through delivery |
| Role dashboards | One dense dashboard serves everyone | Show role-specific work queues, alerts and decisions |
| Extraction authoring | Manual, generated and hybrid entry are supported | Move confirmed systems toward automatic generation with audited supervisor exception |
| Approved extraction and report source | Stronger in the current platform | Preserve E2 as the source for every current operational report |
| Quotation validity | Configurable, but the active default is 3 days | Set the approved default to 30 days and enforce expiry during acceptance |
| Discount control | One general 0–100% field | Add separate policy limits by line category, role-based override and reason |
| Price editing | Selling rates are editable in the quotation workbench | Restrict protected accessory prices by role and audit overrides |
| Customer sign-off | Quote status exists | Add immutable specification-validation evidence and sign-off metadata |
| Sales Order | Quote acceptance opens a Job directly | Introduce a Sales Order record between accepted quotation and production Job |
| Invoice | Payment records exist, but there is no complete invoice lifecycle | Add invoice status, account balance and invoice-to-drawing trigger |
| Unbundling | Extraction and commercial lines are itemised | Convert approved lines into inventory reservations, services and production requirements |
| Drawing tools | Configurator and AutoCAD are supported | Add Smart Builder as an external drawing method; do not hard-code one tool |
| No-drawing path | Drawing revision is normally expected | Add a reviewed `drawing_not_required` decision with author, reason and date |
| Production tracking | One stage is stored on the whole Job | Add tagged production pieces with their own routed operations |
| Factory stages | One generic linear sequence | Use configurable routes so pieces skip operations they do not require |
| Breakage | QA rework exists at Job level | Add piece-level damage events, replacement generation and cost traceability |
| Glass stand | Not modeled | Add stand assignment and location history |
| Mobile monitoring | Responsive UI foundation exists | Provide scan-first piece actions suitable for factory phones and tablets |
| Delivery financial gate | Dispatch follows QA; balance is not a complete gate | Add Ready, On Hold and Credit Released states controlled by Finance |
| Customer completion notice | WhatsApp quotation flow exists | Trigger pickup notification only when all required pieces are complete |
| Dispatch | Driver, vehicle and delivery note exist | Link dispatch to cleared pieces, reservations and customer notification |
| Reporting | Operational reports exist in several scopes | Add production routing, breakage, turnaround and financial-hold reports |

## 4. Recommended target design

### 4.1 Preserve the project control layer

The project workflow remains the authorization chain:

```text
Measurement M2
→ Extraction E2
→ Quotation Q2
→ Sales Order SO2
→ Invoice/payment authorization
→ Drawing R2 or approved no-drawing decision
→ Factory Release F2
```

No production piece should be created from an unapproved or superseded chain.
Every piece and production route must retain the factory release and extraction
revision that authorized it.

### 4.2 Add a production-piece layer

One Job is too broad for the production behavior in the supplied workflow.
Add records similar to:

```text
ProductionPiece
  piece_tag
  job_id
  project_item/opening
  glass specification
  width and height
  quantity or sequence
  source factory release
  status
  damaged/replacement relationship
  stand assignment

PieceOperation
  production_piece_id
  operation code
  sequence
  status
  assigned workstation/team
  started_at and completed_at
  completed_by
  notes
```

The approved drawing and factory release should generate the pieces and their
required routes. A piece requiring Cutting, Polishing and Tempering must not be
forced through Sandblasting or Double Glazing.

### 4.3 Keep order status derived from its pieces

The system should calculate rather than manually guess the production state:

- **Pending:** pieces have not started;
- **In Production:** at least one required operation is active;
- **Production Complete:** every non-cancelled piece is complete;
- **Delivery on Hold:** production is complete but the financial gate is not
  cleared;
- **Ready for Delivery:** production and financial gates are clear;
- **Dispatched:** all dispatched pieces have a recorded dispatch event.

### 4.4 Treat Smart Builder as an integration option

The system should record drawing method as Configurator, AutoCAD, Smart Builder
or another approved external tool. Uploaded outputs still enter the same
revision and approval model. This avoids rebuilding Smart Builder while
preserving one controlled project record.

## 5. Recommended build order after the first-demo feedback

### Track 1 — Configurator adoption and factory-ready output

This is the team's stated product priority:

1. Scope the design library, openings, properties and accessories to the chosen
   product system.
2. Turn the configurator into a project workspace where users add, name and
   switch between many separately measured windows or doors without leaving the
   screen.
3. Keep Duplicate & Edit only as an optional copy-item shortcut.
4. Add icon-driven Frame, Sliding Door and other type filters.
5. Reduce steps from project creation through measurement, design and quote.
6. Generate one client quotation and combined internal documents while keeping
   every piece traceable to Window 1, Window 2 and so on.
7. Put dimensioned drawings and 90°/45° end-cut information on the cutting list.
8. Confirm the requested `pyramid` representation with a sketch before changing
   the nesting visualization.

### Track 2 — Never lose a paid project

This directly addresses the team's named operational failure:

1. Add project and departmental-task assignment to a person or team.
2. Add planned start, due date and completion date.
3. Add a colour-coded calendar/week view.
4. Add a project-level kanban covering the complete business workflow, not only
   factory stages.
5. Alert when payment is recorded but the project has no responsible owner, no
   next action or no movement within the approved time limit.
6. Replace the dense universal dashboard with role-scoped work queues and
   exceptions.

The first useful alert should answer:

> Which paid projects have not moved, who owns the next action, and how long
> have they been waiting?

### Track 3 — Deterministic extraction and materials

1. Generate materials automatically for product systems whose rules have been
   confirmed against completed Sofaamy jobs.
2. Start with the bounded Trialco rule set; do not generalize its deductions to
   unrelated systems.
3. Keep a supervisor-only, reason-required exception until each system recipe is
   operationally validated.
4. Model a frame door as its related frame-window recipe plus confirmed
   door-only hardware after Sofaamy supplies the exact codes and quantities.
5. Continue to make E2 the source of every current material, purchasing,
   inventory and factory report.

### Track 4 — Commercial and delivery controls

1. Make 30 days the approved quotation default.
2. Enforce expiry and supervisor override with reason and audit event.
3. Add category-based discount policies and role-based overrides.
4. Record customer specification sign-off.
5. Add Delivery on Hold, Ready for Delivery and Finance Credit Release.
6. Prevent dispatch until production and financial gates are satisfied.

### Track 5 — Production-piece foundation

1. Add `ProductionPiece`, `PieceOperation` and tag generation.
2. Generate operation routes from approved glass/fabrication requirements.
3. Add scan or tap actions to start and complete operations.
4. Derive Job completion from all required pieces.
5. Add piece-level damage and replacement handling.
6. Add glass-stand assignment.

### Track 6 — Sales Order, invoice, reservations and automation

1. Introduce Sales Order and Invoice records.
2. Convert an approved quotation snapshot into recognized line types.
3. Reserve accessories and glass against the approved extraction revision.
4. Queue drawings from the approved payment/invoice condition.
5. Preserve traceability from quote line to order line, reservation, piece and
   dispatch.
6. Trigger customer pickup notifications when all pieces are complete.
7. Report production turnaround, breakage, financial holds, stand locations and
   dispatched quantities.

## 6. Decisions to confirm with Sofaamy

The supplied document does not settle these questions:

1. Is this still the current operating workflow, or was it only a proposal to
   another implementation team?
2. Does it apply to glass processing only, or also to Frame, Frameless,
   Balustrade and installation projects?
3. Is Smart Builder still the required drawing tool alongside AutoCAD?
4. Does every paid quotation become an invoice before drawing, and what payment
   percentage is required?
5. Are 5% for accessories and 10% for glass maximum discounts or fixed
   discounts?
6. What exactly does `Customer Copy` mean and when must it be removed?
7. What is the GPU store, and is glass reserved physically, financially or
   through an Odoo location transfer?
8. Is Quality Control a separate stage even though it is omitted from this
   workflow?
9. Does Sofaamy perform installation after dispatch, or is dispatch the final
   system stage for glass-processing orders?
10. What tag format, printer type, barcode or QR standard is used today?
11. Which piece routes are valid, and which operation combinations are
    prohibited?
12. Who can approve credit terms and release a Delivery-on-Hold order?
13. For the cutting-list `pyramid`, do they mean true 45° ends on each cut piece
    or a particular shape for the remaining offcut? Obtain a sketch.
14. Which door-only accessories are meant by `extra keys`, including codes and
    quantities?
15. Should automatic extraction prohibit every manual material line, or allow a
    flagged supervisor exception?
16. Does the unified material/cutting list replace per-window documents or sit
    alongside them, and should stock nesting optimize across the whole project?
17. Who assigns projects, and are deadlines set at project, department or task
    level?
18. Confirm the columns and movement rules for the project-level kanban.

## 7. Product position

The goal should not be to reproduce Odoo screens. The opportunity is to retain
the proven operational controls while adding stronger technical traceability:

- Odoo evidence contributes commercial, factory-routing and dispatch rules.
- Sofaamy's newer workflow contributes measurement, extraction, quotation and
  drawing revision control.
- The current platform contributes one project record, E2 report sourcing,
  configurable drawing paths and frozen factory releases.

Together these create a system that can answer, for every delivered glass
piece:

> Which approved measurement, extraction, quotation, drawing and factory
> release authorized it; which operations were completed; whether it was ever
> damaged or replaced; where it was stored; who financially cleared it; and
> when it was dispatched?

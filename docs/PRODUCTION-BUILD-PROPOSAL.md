# Sofaamy Business Management System
## Production Build — Scope Definition & Engagement Proposal

**Prepared for:** Sofaamy Co. Ltd, Accra, Ghana
**Prepared by:** Veloxa Technology Limited
**Document type:** Scope Definition & Engagement Proposal
**Version:** v1.0 — Draft
**Date:** [DATE OF SUBMISSION]
**Valid for:** 30 days from the date of submission

---

## 1. Purpose of This Document

Following the system demonstration to the Sofaamy team, Sofaamy has asked Veloxa to propose the
scope for the full production build.

This document defines **what will be built, how it will be built, what Sofaamy must supply, and how
we get to a firm price.** It deliberately contains **no pricing.**

The reason is simple and in Sofaamy's interest: a price quoted before the scope is confirmed is
either padded to cover unknown risk, or it is too low and gets revised upward mid-project. Neither
is acceptable on a system this central to your operation. We will price the work once the scope is
documented and signed by Sofaamy, and not before.

**What this document asks for:** agreement on scope and process, and Sofaamy's confirmed
requirements from every department. **What it produces:** a signed scope document and a firm,
fixed commercial proposal.

---

## 2. Where We Are

The demonstration was not a mock-up or a slide deck. Sofaamy saw a working system with real
records moving through it. The following are already built and operating:

| Area | Current state |
|---|---|
| **Visual configurator** | Working design canvas for all three product families — Frame, Frameless, Curtain Wall. Drag-and-drop sections, dividers, per-section glass and opening types, live dimensions. |
| **2D / 3D / Wall views** | The same design record renders as a technical elevation, a 3D model, and a realistic in-context wall view for the client. |
| **Pricing engine** | Live GHS quotation from the design — profiles, glass, hardware, labour, discount, GETFund + NHIL, VAT, deposit percentage. |
| **Fabrication engine** | Material take-off, cut lists with deductions and mitre rules, glass cut sizes, hardware schedules — generated from the same design record. |
| **Cutting optimisation** | Bar-nesting engine producing cut plans and waste percentages against stock bar lengths. |
| **Parametric drawings** | Dimensioned fabrication drawings and 1:1 printable templates generated automatically per panel, including hole and cutout positions. |
| **Document pack** | Client quotation, internal BOQ and cost floor, cutting list, factory work order, glass order, hardware list, installation sheet, delivery note — all as branded PDFs. |
| **Project & item structure** | A project holds multiple items; each item carries its own technical chain (extraction → drawing → production release) independently. |
| **Operational pipeline** | Job stages from deposit through cutting, processing, assembly, glazing, QA, dispatch, installation and close-out, with enforced payment and QA gates. |
| **Commercial control** | Quote register with draft/sent/accepted status, revision control, payments ledger, outstanding balance tracking per project. |
| **Client channel** | Shareable client link showing the design and total, and WhatsApp message composition for quotes and status updates. |
| **Revision integrity** | One approved technical basis per item; quotations, drawings and factory releases are locked to it, so an out-of-date revision cannot silently re-enter production. |

**This is the foundation the production build starts from.** The work ahead is not inventing this
system. It is making it Sofaamy's — replacing our working assumptions with Sofaamy's confirmed
rules, validating every calculation against completed jobs, and hardening it for daily use by the
whole company.

---

## 3. What "Production Build" Means

The demonstrated system runs on **working assumptions** in the places where Sofaamy has not yet
supplied confirmed rules — deduction formulas, consumption rules, labour rates, wastage
allowances, accessory quantities and certain prices. Every one of these is visibly marked as
provisional in the system today. That was a deliberate honesty decision: we do not present invented
business numbers as fact.

The production build converts the system from **demonstrated** to **operational**:

| From | To |
|---|---|
| Working assumptions, clearly labelled | Sofaamy's confirmed, approved rules |
| Calculations validated against sample jobs | Calculations validated against completed Sofaamy projects |
| A system Sofaamy has seen | A system Sofaamy's departments run their day on |
| Single-operator demonstration | All departments, real roles, real permissions |
| Demonstration data | Sofaamy's live product catalogue, price lists, clients and staff |
| Demonstration hosting | Secure production hosting, backups, recovery |

The definition of done is not "the software works." It is **"a job can be taken from enquiry to final
payment entirely inside the system, by the people who actually do that job today, and the numbers
it produces are the numbers Sofaamy stands behind."**

---

## 4. Scope of the Production Build

Scope is set per module. The boundaries below are proposed by Veloxa and are open to Sofaamy's
adjustment during the requirements stage — that is precisely what the requirements stage is for.

### 4.1 Module scope table

| # | Module | In the production build | Later phase | Not included |
|---|---|---|---|---|
| 1 | **Client & project intake** | Enquiry capture (walk-in, phone, WhatsApp, site visit), client register, project register, site details, contacts | Full sales pipeline with opportunity stages and forecasting | Marketing automation |
| 2 | **Site measurement** | Mobile capture of openings, photos, preliminary vs final measurement status, measurement sign-off | Offline-first field capture, GPS tagging | Laser device integration |
| 3 | **Design configurator** | All three families with Sofaamy's confirmed product catalogue, systems, profiles, glass and finishes | Additional product families as Sofaamy introduces them | Replacement of AutoCAD |
| 4 | **Estimation & quotation** | Confirmed pricing rules, client quotation matching Sofaamy's approved layout, revision control, approval authority, validity and payment terms | Multi-currency, supplier-price auto-update feeds | — |
| 5 | **Technical / material take-off** | Confirmed deduction and consumption rules per system, material list, glass schedule, hardware schedule, approval before release | DXF/DWG export to the AutoCAD team | AutoCAD replacement |
| 6 | **Drawings** | Parametric fabrication drawings and templates from confirmed rules; attachment and revision control of AutoCAD drawings produced outside the system | Automated drawing generation for curtain wall assemblies | CAD authoring tools |
| 7 | **Cutting optimisation** | Optimisation against Sofaamy's confirmed stock lengths, kerf and offcut policy; cut plan and waste reporting | Machine-file output to cutting equipment | Machine control |
| 8 | **Procurement & stores** | Material requirement from approved take-off, purchase requests, goods receipt, issue to job, stock levels, reorder alerts | Supplier portal, automated purchase orders | Supplier accounting |
| 9 | **Production** | Sofaamy's confirmed factory stages, job cards, stage sign-off, work-in-progress board, release gates | Machine and operator utilisation analytics | Shop-floor hardware |
| 10 | **Quality assurance** | Sofaamy's confirmed QA checkpoints per product family, pass/fail/rework, inspector sign-off, non-conformance record | Statistical quality trending | Certification management |
| 11 | **Dispatch & installation** | Delivery notes, vehicle and driver assignment, installation scheduling, site handover and client sign-off | QR/barcode scanning at dispatch and site | Vehicle tracking |
| 12 | **Accounts** | Invoicing from accepted quotations, deposit and balance gates, payment recording with reference, outstanding balances per project, receipts to client | Integration with Sofaamy's accounting package | Full ledger / statutory accounting |
| 13 | **Client communication** | WhatsApp quotation send, status updates, shareable client design link, document delivery | Automated milestone notifications via Africa's Talking | Call-centre features |
| 14 | **Roles & access control** | All confirmed Sofaamy roles with enforced permissions, audit trail of who did what and when | Delegated approval workflows | — |
| 15 | **Management reporting** | The reports Sofaamy nominates as daily-use, plus a management dashboard | Advanced business intelligence | — |

### 4.2 Explicitly out of scope

To prevent misunderstanding later, the following are **not** part of this build:

- **Replacing AutoCAD.** The system stores, versions and controls AutoCAD drawings and links them
  to the project record. It does not author them.
- **Replacing SmartGlazier** for jobs Sofaamy chooses to keep there. The system covers the same
  ground for frameless work; the transition decision is Sofaamy's, made on evidence.
- **Statutory accounting and tax filing.** The system produces invoices, tracks payments and reports
  balances. It is not an accounting package and does not file returns.
- **Payroll, HR, and staff attendance.**
- **Hardware supply** — computers, tablets, phones, printers, scanners, network or internet.

If Sofaamy wants any of these included, raise it during the requirements stage and it will be
scoped and priced explicitly rather than assumed.

---

## 5. The Critical Path: Sofaamy's Confirmed Requirements

Sofaamy has offered to coordinate input from all departments and consolidate it for Veloxa. **This is
the single most valuable thing Sofaamy can do for this project, and it is the critical path to a firm
price.** This section gives that effort a structure.

### 5.1 The governing principle: documents, not descriptions

One completed job file answers more questions than an hour of discussion. A photograph of a
supplier invoice settles a price permanently. Wherever a document exists, please send the document
rather than a written description of it. Confidential client names and margins may be redacted —
please keep dimensions, calculations, document references, revisions and workflow steps visible.

### 5.2 What each department must supply

| Department | Owner (Sofaamy to name) | Required input |
|---|---|---|
| **Management** | | Approval authority per decision (price, discount, exception, release); who may override; margin policy; payment terms and exceptions; the three problems the system must solve first; what makes it clearly valuable within three months |
| **Sales / Front office** | | How enquiries arrive and are recorded; current quotation layout and a real recent quotation; validity periods; how discounts are decided; client list and whether it should be imported |
| **Estimation / Quotation** | | Every workbook used to build a quote and what each calculates; which formulas are company-approved rules vs personal working methods; labour basis and current rate; wastage allowances; margin rules; VAT / GETFund / NHIL treatment on client documents; which lines get manually adjusted and why |
| **Technical / AutoCAD** | | When AutoCAD is required and at which stage; what the team receives to start and what it returns; who approves a drawing before production; how the latest approved revision is identified; what happens when a drawing changes dimensions, materials or price |
| **Procurement / Stores** | | Supplier price lists or recent invoices — profiles, glass, hardware, accessories, consumables; stock bar lengths per system and supplier; what must be approved before materials are released; how shortages and substitutions are recorded; current stock list and valuation basis |
| **Production / Factory** | | Confirmed factory stages in order, and who owns each; deduction and cut rules per system (one fabrication drawing settles this); mitre vs square-cut convention; kerf and minimum reusable offcut; glass deduction rules; current average waste percentage; what must be approved before production starts; how rework is recorded |
| **Quality assurance** | | Actual QA checkpoints per product family; who signs off; what constitutes a fail vs a rework; how non-conformances are recorded and closed |
| **Dispatch / Installation** | | Delivery documentation used today; how installation is scheduled and by whom; site handover and client sign-off process; how site variations are recorded |
| **Accounts** | | Invoice format and numbering; deposit percentage and exceptions (corporate, retention); payment methods and the reference recorded for each; how outstanding balances are followed up; receipt format |
| **IT / Administration** | | Full staff list with job titles, phone numbers and intended system role; company logo in high resolution; WhatsApp business number; preferred web address; devices staff will use; who will be system administrator; primary day-to-day contact |

A per-department questionnaire has already been prepared and is available on request — it can be
distributed directly to each department head and returned completed.

### 5.3 The evidence pack

In addition to the departmental input, the following completed job files are requested. Each one
validates the engine end to end against work Sofaamy has already delivered and been paid for:

1. **One completed Frame job** — enquiry, measurement, quotation, material list, cutting list,
   fabrication drawing, work order, delivery note, invoice.
2. **One completed Frameless job** — full job pack including the glass order.
3. **One completed Curtain Wall job** — quotation, material take-off, drawings, and photographs if a
   full file is unavailable.
4. **One job that changed after approval** — where a measurement, drawing, material quantity or
   client request changed after the quotation was issued, and how it was handled.

Item 4 matters as much as the other three. How Sofaamy handles change is where most systems fail,
and it is where this one is designed to be strongest.

### 5.4 Confirmation, not assumption

The demonstrated system currently runs on working assumptions in the areas listed below. Each one
is marked as provisional inside the system today, and each becomes definitive the moment Sofaamy
confirms it:

- Profile deduction rules and cut allowances per system
- Glass deduction rules per opening type
- Kerf per saw cut and minimum reusable offcut length
- Labour calculation basis and rate
- Wastage allowance
- Accessory quantities per opening type
- Hardware set composition per system
- Certain material prices per system and supplier
- Factory stage names and ownership
- QA checkpoints per product family
- Job and quotation numbering format

**Nothing here needs rebuilding when these arrive.** The screens Sofaamy has already seen begin
producing Sofaamy's real numbers as each rule is confirmed. This is why the requirements stage
produces a firm price rather than a range — the unknowns are known, listed, and finite.

---

## 6. Engagement Approach

### Stage 1 — Requirements consolidation *(Sofaamy-led, Veloxa-supported)*

Sofaamy coordinates departmental input using the structure in Section 5. Veloxa supports with
working sessions per department, on-site or by call, and clarifies anything ambiguous as it arrives.

**Veloxa delivers:** departmental questionnaires; working sessions; a running log of what has been
received and what is outstanding.
**Sofaamy delivers:** completed departmental input; the evidence pack; named owner per department.
**Ends when:** the requirements window closes on the agreed date.

### Stage 2 — Scope document & sign-off *(Veloxa-led)*

Veloxa converts the consolidated requirements into a definitive scope document: confirmed rules per
product family, module-by-module functional scope, department workflows as they will operate in the
system, role and permission matrix, document and report inventory, and integration boundaries.

**Veloxa delivers:** the Scope & Functional Specification document, and a walkthrough of it with
Sofaamy's management and department heads.
**Sofaamy delivers:** review, corrections, and written sign-off.
**Ends when:** Sofaamy signs the scope document.

### Stage 3 — Commercial proposal *(Veloxa-led)*

Against the signed scope, Veloxa issues a firm commercial proposal: fixed build cost, payment
schedule tied to delivery milestones, delivery timeline with dates, support and maintenance terms,
and the ownership and licensing position.

**This is the point at which pricing is issued.** It is derived from a signed scope, so it is firm.

### Stage 4 — Build & validation *(Veloxa-led, on agreement of Stage 3)*

Delivery proceeds in increments, each ending in a working system Sofaamy can use and comment on —
not a long silence followed by one large handover. Each increment is reviewed with the departments
it affects.

Every increment is validated against Sofaamy's real completed jobs. A module is accepted when it
reproduces a job Sofaamy has already delivered, and the numbers match what Sofaamy actually
charged and actually consumed.

### Stage 5 — Pilot & parallel run *(joint)*

Selected live jobs run through the system alongside the current process. Discrepancies are
investigated and resolved before the current process is retired. Sofaamy does not switch off a
working process on a promise.

### Stage 6 — Training, go-live & support *(joint)*

Role-based training per department, user guides, administrator handover, data migration, controlled
go-live, and an agreed support period with a defined response commitment.

---

## 7. How We Work

- **Delivery in increments.** Working software reviewed regularly, not a single handover at the end.
- **A named Veloxa contact** accountable for the engagement throughout.
- **A regular review meeting** at an agreed cadence, with a written status note: delivered, in
  progress, blocked, and what is needed from Sofaamy.
- **A single outstanding-items list**, visible to both sides, so nothing is blocked silently.
- **No invented business numbers.** Where a rule is unconfirmed, the system labels it as provisional
  rather than presenting an assumption as fact. This is a standing commitment, not a project-stage
  behaviour.

---

## 8. Responsibilities

| Responsibility | Veloxa | Sofaamy |
|---|---|---|
| Requirements coordination across departments | Support & facilitate | **Lead** |
| Supply of documents, price lists, evidence pack | Specify what is needed | **Lead** |
| Confirmation of business rules and formulas | Document & implement | **Approve** |
| Scope document | **Lead** | Review & sign |
| System design, development, testing | **Lead** | Review |
| Validation against completed jobs | Perform | **Verify & confirm** |
| Acceptance of each increment | Present | **Decide** |
| User accounts, roles, staff list | Configure | **Provide & approve** |
| Data migration decisions | Execute | **Decide what migrates** |
| Training | **Deliver** | Attend & release staff |
| Hosting, backups, security | **Lead** | Approve |
| Devices, connectivity, printers | Advise | **Provide** |
| Go-live decision | Recommend | **Decide** |

---

## 9. Assumptions & Dependencies

The scope, timeline and eventual price depend on the following. If any changes, the affected item is
reviewed with Sofaamy openly rather than absorbed silently.

1. Sofaamy supplies departmental requirements and the evidence pack within the agreed window.
2. Sofaamy names one decision-maker per department, and one overall project owner authorised to
   approve scope.
3. Business rules confirmed by Sofaamy are treated as authoritative and are not expected to change
   materially during the build.
4. Departments release staff time for working sessions, increment reviews, validation and training.
5. Sofaamy provides devices, internet connectivity and printing at each location that will use the
   system.
6. Existing tools that Sofaamy chooses to retain (AutoCAD, SmartGlazier, Excel) continue to be
   operated by Sofaamy; the system connects to their outputs rather than replacing them.
7. Product families beyond Frame, Frameless and Curtain Wall are additions to scope.

---

## 10. Data, Ownership & Security

- **The data is Sofaamy's.** Client records, designs, quotations, prices, drawings and job history
  belong to Sofaamy without qualification, and are exportable in full at any time on request.
- **Access is by role.** Each department sees what its work requires. Cost floors, margins and
  internal breakdowns are not visible to roles that have no business seeing them.
- **Actions are recorded.** Who changed what, and when, is retained — for quotations, approvals,
  payments and production releases in particular.
- **Client-facing documents are Sofaamy-branded.** Veloxa appears only as an unobtrusive
  "Powered by Veloxa" line.
- **Hosting, backup and recovery** arrangements are proposed with the commercial proposal for
  Sofaamy's approval.

---

## 11. Change Control

After the scope document is signed, changes are handled as follows:

1. Sofaamy raises the change in writing.
2. Veloxa assesses the impact on scope, timeline and cost, and responds in writing.
3. Sofaamy approves or declines before any work begins.

No change is absorbed silently, and no change is billed without prior written approval. Corrections
to rules Sofaamy confirmed incorrectly during requirements are handled the same way — assessed
openly, not disputed.

---

## 12. Commercial Approach

No figures are quoted in this document, and this section explains how the figure will be arrived at
so that there are no surprises when it is issued.

**What determines the cost of the build:**

- The number of modules Sofaamy confirms as in-scope (Section 4).
- The number of product systems requiring their own confirmed fabrication rules.
- The number of documents and reports that must match a specific Sofaamy format.
- The volume of historical data to be migrated.
- The number of departments, roles and locations to be trained and rolled out.
- The support and maintenance level Sofaamy selects after go-live.

**The commercial model we propose:** a **one-time build with Sofaamy owning the system**, plus an
optional annual support and maintenance agreement, rather than a per-user subscription paid
indefinitely. Sofaamy's costs stop rising because the team grows or because a foreign vendor
adjusts its licence terms. Payment is structured against delivery milestones, so payment follows
delivered, accepted work.

**When pricing is issued:** with the signed scope document, as Stage 3. It will be a fixed figure
against a fixed scope, with a payment schedule and a delivery timeline carrying dates.

---

## 13. Indicative Timeline

Firm dates come with the commercial proposal, once scope is fixed. The shape of the engagement is:

| Stage | Duration | Driven by |
|---|---|---|
| 1 — Requirements consolidation | [AGREE WITH SOFAAMY] | **Sofaamy's departmental input** |
| 2 — Scope document & sign-off | [AGREE] | Veloxa, then Sofaamy review |
| 3 — Commercial proposal | [AGREE] | Veloxa |
| 4 — Build & validation | Confirmed at Stage 3 | Veloxa, in reviewed increments |
| 5 — Pilot & parallel run | Confirmed at Stage 3 | Joint |
| 6 — Training & go-live | Confirmed at Stage 3 | Joint |

Stage 1 is the only stage whose duration Sofaamy controls entirely. **The faster the departmental
input is consolidated, the sooner Sofaamy has a firm price and a firm date.**

---

## 14. Next Steps

For Sofaamy:

1. Confirm agreement with the scope boundaries in Section 4, noting any additions or removals.
2. Name one owner per department (Section 5.2) and one overall project owner.
3. Agree the closing date of the requirements window.
4. Distribute the departmental questionnaires and begin assembling the evidence pack.

For Veloxa, on Sofaamy's confirmation:

1. Issue the departmental questionnaires.
2. Schedule working sessions with each department.
3. Begin consolidating input as it arrives and maintain the outstanding-items log.

---

## 15. Closing

Sofaamy has already seen the system work. What remains is to make it Sofaamy's — built on Sofaamy's
confirmed rules, validated against Sofaamy's completed jobs, operated by Sofaamy's departments, and
owned by Sofaamy.

That begins with the requirements Sofaamy's departments hold. This document is the structure for
collecting them.

---

**Veloxa Technology Limited**
[CONTACT NAME] · [TITLE]
[PHONE] · [EMAIL]

*Prepared for Sofaamy Co. Ltd. Confidential.*

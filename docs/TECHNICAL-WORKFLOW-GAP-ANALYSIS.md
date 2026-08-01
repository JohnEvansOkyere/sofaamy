# Sofaamy Technical Workflow — Gap Analysis and Next Recommendations

**Scope:** Frame, Frameless, Balustrade, and other technical fabrication work
**Purpose:** Record what is still required to move the current workflow
foundation from a working demonstration to a safe operational system.

## Current foundation

The application now demonstrates the main connected workflow:

```text
Project
→ Measurement context
→ Technical extraction
→ Quotation
→ Payment authorization
→ Configurator or AutoCAD drawing
→ Drawing revision and approval
→ Factory release
→ Production
```

It supports manual, generated, and hybrid extraction; extraction revisions;
quotation from an approved extraction; AutoCAD and configurator drawing paths;
drawing uploads; approval; factory release; and project activity history.

The remaining work is mainly about ensuring that every department uses the
same approved revisions and that old information cannot accidentally return
to production.

## Implementation progress — 29 July 2026

The first production-safety slice of Phase 1 is now implemented in the
working code:

- only the latest extraction revision can be approved;
- approving E2 marks E1 superseded and invalidates older drawing/release paths;
- quotation acceptance, drawing handoff, drawing approval, and factory release
  must use one aligned approved extraction and accepted quotation;
- approved and superseded drawing revisions reject further uploads;
- drawing files carry SHA-256 integrity checksums;
- approving a new drawing revision supersedes the earlier factory release
  without silently switching that release to the new drawing;
- each factory release freezes its release number, extraction revision,
  quotation number, drawing revision, and released-file manifest;
- superseded factory releases remain visible as **Do Not Produce** history;
- the stock/procurement requirement shows required, available, and shortfall
  quantities from the approved extraction;
- project stock issue reads the released approved extraction and records its
  extraction revision on every stock movement; and
- the Technical Workflow screen shows stale quotation, drawing, and factory
  release warnings.

This completes the core E/Q/R alignment guard, but Phase 1 is not fully
complete. Purchase-request approval and material reservations still need a
transactional workflow linked to the approved extraction, and measurement
revision records are scheduled in Phase 2.
The local database migration has not been run as part of this implementation;
it must be applied through the normal reviewed startup/migration step.

## 1. Complete revision-chain control

Every operational output must identify the exact records from which it was
produced:

```text
Approved Measurement M2
        ↓
Approved Extraction E2
        ↓
Quotation Q2
        ↓
Approved Drawing R2
        ↓
Factory Release F2
```

A production release must record:

- approved measurement revision;
- approved extraction revision;
- quotation revision;
- payment authorization;
- approved drawing revision;
- files and reports included in the released factory pack;
- person who released it; and
- release date and notes.

The system must not silently mix records from different revisions.

### Required E2 behaviour

Once extraction E2 is approved:

- E2 becomes the only current extraction source;
- E1 is marked **Superseded**;
- every newly generated report reads E2;
- E1 must never reappear as the current report source; and
- reports must display the extraction revision used.

All current reports must use E2 for:

- materials and accessories;
- quantities;
- unit prices;
- material totals;
- internal costing;
- BOQ;
- procurement requirements;
- inventory issue quantities;
- hardware lists;
- factory material lists; and
- quotation costing basis.

Previously generated E1 documents remain only as historical audit records.
They must be visibly labelled superseded and must not be presented to staff as
the current report.

### Extraction and drawing relationship

Technical material identity and quantity come from the approved extraction.
Dimensions and fabrication geometry come from the approved drawing. Selling
rates, commercial additions, taxes, discounts, payment terms, and client
acceptance belong to an itemised quotation snapshot linked to that extraction;
they do not belong to the Configurator or overwrite the approved extraction.

A current factory pack therefore combines:

```text
Approved Extraction E2
• materials
• quantities
• approved technical cost basis, where available

Commercial Quotation Q2
• selling rates and additions
• discount and taxes
• payment terms
• hardware and accessories

Approved Drawing R2
• dimensions
• panel or member breakdowns
• holes, cutouts and processing
• cutting and fabrication geometry
```

If E2 changes something that affects dimensions, cut pieces, glass sizes,
hardware positions, or fabrication, the system must require a new drawing
revision R2 before releasing the final factory report.

## 2. Make inventory and procurement use the approved extraction

Stock deduction, material reservation, purchasing requirements, and factory
material issue must use E2 after it is approved.

The system must not:

- show 12 pieces in the approved material report;
- deduct 10 pieces from inventory using an earlier configurator calculation;
  or
- prepare a purchase request using superseded quantities.

Required flow:

```text
Approved Extraction E2
        ├── Procurement requirement
        ├── Stock availability check
        ├── Material reservation
        ├── Purchase request
        └── Factory material issue
```

Inventory transactions must record the extraction revision that authorized
the quantity.

## 3. Add project-item and opening-level extraction

A Sofaamy project can contain several windows, doors, balustrade runs, or
frameless sections. Extraction must therefore support both item detail and a
project roll-up.

Each extraction row should identify:

- project item;
- opening, room, elevation, or location reference;
- product family;
- selected system;
- material code and description;
- quantity and unit;
- unit price;
- manual, generated, or hybrid source; and
- technical notes.

Example:

```text
Project: East Legon Residence
  W1 — Trialco sliding window
  W2 — Trialco sliding window
  D1 — Frameless swing door
  B1 — Balcony balustrade
```

The system should show:

- extraction for each item;
- subtotal for each item;
- one consolidated project material list; and
- traceability from every consolidated quantity back to its item.

Generated extraction must cover every selected project item, not only the
latest saved configurator design.

## 4. Implement real measurement revisions

Site measurement must become a revision-controlled backend record rather than
remaining only inside a design payload or demonstration survey screen.

Each measurement revision should include:

- project and item/opening reference;
- width, height, and other required dimensions;
- field representative;
- measurement date;
- site photographs;
- sketches and notes;
- GPS or site location where required;
- preliminary, verified, or approved status;
- person who checked it;
- approval date; and
- reason for a new revision.

Required flow:

```text
Measurement M1 submitted
→ Technical review
→ Correction M2
→ M2 approved
→ Extraction E2 created from M2
```

Extraction, quotation, drawing, and factory reports must display the approved
measurement revision used.

## 5. Add quotation revision and commercial-impact control

When E2 changes quantity, material, or price after a quotation has been
prepared, the system must check whether commercial review is required.

It should show:

> Extraction changed from E1 to E2. Quotation review required.

The system should:

- compare E1 and E2;
- identify quantity and price differences;
- calculate the internal cost difference;
- flag the existing quotation as based on E1;
- create quotation revision Q2 where required;
- record who approved any decision not to change the client price; and
- prevent drawing or factory release when a required commercial review is
  unresolved.

An accepted quotation must remain linked to the extraction revision on which
it was based.

## 6. Add client drawing review and approval

The client overview drawing needs a controlled client-response workflow for
both configurator and AutoCAD drawings.

The client should be able to:

- open the client overview from a secure link;
- view the correct drawing revision;
- approve it;
- reject it;
- leave comments;
- see the project and drawing reference; and
- receive a confirmation of the recorded response.

The system must record:

- drawing revision sent;
- date sent;
- person who sent it;
- client response;
- response date;
- client comments; and
- whether client approval is required before factory release.

The factory breakdown and internal costing information must not be exposed in
the client link.

## 7. Make approved drawing revisions immutable

Once drawing revision R1 is approved:

- no file may be replaced or added to R1;
- R1 files must remain available for audit;
- any correction must create R2;
- R2 must pass review and approval again; and
- an existing factory release must not automatically switch to R2.

Each stored file should have:

- original filename;
- file type;
- size;
- upload date;
- uploader;
- drawing revision;
- document purpose;
- checksum or integrity reference; and
- storage location.

Production deployment should use managed object storage with backups instead
of relying only on local application-server files.

## 8. Create a frozen factory production pack

Factory release should produce one controlled pack containing:

- release cover sheet;
- project and client reference;
- approved measurement revision;
- approved extraction E2;
- approved quotation/payment authorization;
- approved drawing R2;
- client overview where required;
- factory breakdown drawings;
- cutting list or glass order;
- material and hardware list;
- processing information;
- release notes; and
- release authority.

The released pack should have its own number, for example:

```text
SOF-P-2026-001-FP-02
```

Factory staff should see only the latest released pack as current. Earlier
packs remain available but visibly show **Superseded — Do Not Produce**.

## 9. Add real authentication and role permissions

Names such as “Technical Supervisor” and “Quotation Team” must be replaced by
authenticated users.

Recommended permissions:

| Role | Main authority |
|---|---|
| Field representative | Submit measurements and site evidence |
| Technical officer | Prepare extraction and drawing revisions |
| Technical supervisor | Approve measurements, extractions, and drawings |
| Quotation/accounts | Prepare quotations and confirm payment |
| Procurement | Reserve and purchase approved materials |
| Factory supervisor | Receive released production packs |
| Management | Review workflow, costs, approvals, and performance |

The system must record the real user behind every change and approval.

## 10. Add assignments, notifications, and overdue controls

The system should show:

- current owner of the next action;
- date assigned;
- due date;
- overdue status;
- comments and internal mentions;
- notification when work is handed to another team;
- notification when payment authorizes drawing;
- notification when client approval is received; and
- notification when a factory pack is released or superseded.

This turns the platform from a document store into an operational workflow
system.

## 11. Confirm and expand product-specific automation

The common workflow should remain the same for Frame, Frameless, Balustrade,
and future products. Automation rules must remain product-specific.

Required validation work includes:

- completing and approving the Trialco extraction and cutting recipe;
- mapping other Frame-system profile codes to fabrication roles;
- confirming Frameless glass and hardware rules;
- confirming Balustrade-specific extraction and structural details;
- confirming deductions, joints, tolerances, kerf, and offcut rules;
- labelling every unapproved rule provisional; and
- preventing one product family from inheriting another family's rules.

## Recommended implementation order

### Phase 1 — Data integrity and production safety

1. Complete revision-chain links and stale-document warnings.
2. Make every current report read the latest approved extraction.
3. Make inventory and procurement use the approved extraction.
4. Lock approved drawings and released factory packs.
5. Require re-review when E2 affects quotation or drawing.

### Phase 2 — Complete the operational workflow

6. Add project-item/opening-level extraction.
7. Implement real measurement revisions.
8. Add client drawing review and approval.
9. Add factory-pack generation and controlled distribution.

### Phase 3 — Production hardening

10. Add authentication and role permissions.
11. Move files to managed object storage with backups.
12. Add assignments, due dates, notifications, and overdue controls.
13. Add automated tests, migrations, monitoring, and recovery procedures.

### Phase 4 — Expand automation coverage

14. Validate the complete Trialco recipe.
15. Add the next Frame systems.
16. Expand Frameless templates and rules.
17. Implement Balustrade-specific automation.

## Final position

The current application proves the end-to-end workflow and the value of one
connected project record. The next priority is not adding more screens. It is
ensuring that measurement, extraction, quotation, drawing, inventory, and
factory release always agree on the exact approved revisions.

The core operational rule is:

> After E2 is approved, every current report reads E2. Production proceeds
> only when the quotation, approved drawing, inventory issue, and released
> factory pack are aligned with E2.

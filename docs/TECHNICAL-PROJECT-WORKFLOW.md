# Sofaamy Technical Projects — Standard Unified Workflow

**Source:** Workflow explanation provided by Sofaamy's team
**Scope:** Frame, Frameless, Balustrade, and other technical fabrication work
**Status:** Standard workflow direction with product-specific rules and approval
details still to verify before production implementation

## 1. Process understanding

Sofaamy's product families require different calculations and drawings, but
they should follow one standard business workflow:

```text
Measurement → Extraction → Quotation → Payment authorization
→ Technical drawing → Approval → Factory production pack
```

The difference between Frame, Frameless, Balustrade, and future products is
not the workflow. The difference is how much of the extraction, pricing, and
drawing work the platform can generate automatically.

For Trialco Frame projects, Sofaamy has provided enough of the extraction
method for the system to generate working material quantities and pricing.
Other Frame systems do not yet have fully confirmed extraction rules. They
must still support manual or hybrid extraction until their formulas,
accessories, and exceptions are approved.

Frameless and Balustrade projects also require technical extraction. Where a
confirmed product recipe exists, the configurator can generate or suggest the
materials and quantities. Where the recipe is incomplete or the project is
custom, the technical team must be able to complete the extraction manually.

Extraction means reviewing the site measurements and project requirement,
then writing down:

- every glass, hardware, accessory, and other material needed;
- the quantity required for each material; and
- the information the quotation team needs to price the job.

Extraction is completed before the quotation. It is not the same as the
detailed technical drawing prepared after payment.

The quotation team uses the extracted material list and quantities to prepare
the customer quotation. A copy is sent to the client. When the required
payment is confirmed, a paid-stamped copy of the quotation is handed to the
technical person. That paid copy authorizes the technical drawing work to
begin.

The technical drawing has two audiences:

1. **Client overview drawing** — shows the complete proposed product in a form
   the client can understand, including its overall arrangement and
   measurements.
2. **Factory breakdown drawings** — separate each physical glass part or side
   and show the dimensions and other fabrication information the factory needs.

For example, a hinged door may appear to the client as one complete opening
with two sides. The factory cannot work only from that overall view. Each side
must also be shown separately, with its own width, height, measurements,
hardware preparation, and other required production details.

The final technical pack sent to the factory therefore includes the approved
drawings, detailed cutting information, figures, and material list.

## 2. Standard Sofaamy technical workflow

```text
Representative visits the project site
                │
                ▼
Site measurements are taken
                │
                ▼
Measurements are handed to the technical team
                │
                ▼
Technical extraction
• identify every required material
• generate, enter, or adjust the required quantities
• prepare the costing basis
                │
                ▼
Extraction is handed to the quotation team
                │
                ▼
Quotation is prepared
                │
                ├──► Client receives a quotation copy
                │
                ▼
Required payment is confirmed
                │
                ▼
Paid-stamped quotation copy is handed to technical
                │
                ▼
Technical drawing begins
                │
                ├──► Configurator-generated drawing, where supported
                │
                └──► AutoCAD drawing, where required
                            │
                            ├──► Complete overview for the client
                            │
                            └──► Separate part/member/panel breakdowns
                                 for the factory
                │
                ▼
Client receives the understandable overview drawing
                │
                ▼
Factory receives the production pack
• detailed drawings
• individual part/panel breakdowns
• cutting information
• figures
• material list
                │
                ▼
Factory fabrication begins
```

## 3. Important workflow distinctions

### 3.1 Extraction is not the final drawing

Extraction happens before quotation and answers:

> What materials and quantities will this project require?

The technical drawing happens after payment and answers:

> What exactly must be produced, how is the complete product arranged, and
> what are the fabrication details for every separate part?

These records are connected, but they serve different purposes and should not
be combined into one uncontrolled document.

### 3.2 The overview and breakdown drawings are different outputs

The client needs to understand the complete appearance and arrangement.
The factory needs to understand every separate physical part.

Depending on the product family, one drawing pack may therefore contain:

- complete project/product elevation;
- overall width and height;
- opening direction and arrangement;
- individual frame members, glass panels, balustrade panels, or side drawings;
- width and height of each separate part;
- glass specification and thickness;
- profile cuts, holes, notches, cutouts, edgework, and orientation where
  required;
- hardware positions and references;
- cutting or glass-order information; and
- material/hardware schedule.

### 3.3 Payment is a gate before detailed drawing

The paid-stamped quotation is not merely a receipt. In the current workflow,
it is the signal that allows the technical team to begin detailed drawing
work, whether the drawing is produced in the configurator or AutoCAD.

The future system should preserve this control digitally by recording:

- quotation status;
- required payment amount or percentage;
- amount paid;
- person who confirmed payment;
- confirmation date and reference; and
- authorization to begin technical drawing.

The exact payment threshold that releases drawing work must remain
configurable per project until Sofaamy confirms a universal rule.

## 4. Target unified-system workflow

The platform should connect the complete process without requiring AutoCAD to
be rebuilt inside the application.

```text
PROJECT RECORD
     │
     ▼
FIELD MEASUREMENT
     │
     ▼
TECHNICAL EXTRACTION
     │
     ├── Confirmed automated recipe:
     │      system generates materials, quantities, and pricing basis
     │
     ├── Partially confirmed recipe:
     │      system suggests rows and technical person adjusts them
     │
     └── Unconfigured/custom product:
            technical person completes extraction manually
     │
     ▼
QUOTATION
     │
     ▼
PAYMENT CONFIRMATION / DRAWING RELEASE
     │
     ├── CONFIGURATOR PATH
     │      generates client overview + factory breakdowns
     │
     └── AUTOCAD PATH
            technical person prepares complex drawing externally
            and uploads DWG + PDF + production outputs
     │
     ▼
TECHNICAL DRAWING REVISION
     │
     ├── client overview
     └── factory breakdown
     │
     ▼
APPROVAL AND PRODUCTION RELEASE
     │
     ▼
FACTORY PRODUCTION PACK
```

## 5. Independent extraction and drawing methods

Extraction method and drawing method are separate decisions.

A project may have:

- generated extraction and a configurator drawing;
- generated extraction and a complex AutoCAD drawing;
- manual extraction and a configurator drawing; or
- manual extraction and an AutoCAD drawing.

This prevents the system from assuming that automatic material calculation
means a project can never require a specialist drawing.

### Path A — Configurator-generated drawing

For products whose drawing rules have been confirmed, the system should use
the measured dimensions and configuration to generate the relevant outputs:

- complete client-facing overview;
- separate frame member, glass panel, balustrade panel, or part drawings;
- profile or glass sizes and cutting details;
- hardware/material list;
- quotation basis; and
- factory production pack.

The system-generated drawings must be reviewed and approved before production.
Automatic generation does not remove technical responsibility.

### Path B — AutoCAD drawing

For complex, custom, architectural, or unsupported work in any product
family, AutoCAD remains the specialist drawing tool.

The system should create an AutoCAD drawing task containing:

- project and client reference;
- site and opening reference;
- approved measurement revision;
- quotation reference;
- extraction/material revision;
- product description and arrangement;
- product family and selected system;
- site photographs, sketches, and notes; and
- required drawing outputs.

The AutoCAD technician works normally, then uploads the result to the same
project record:

- original DWG;
- exported PDF;
- client overview pages;
- factory breakdown pages;
- cutting, glass-order, or fabrication information;
- drawing revision number; and
- technical notes.

Once uploaded, the project continues through the same review, approval, and
production-release workflow as a configurator-generated drawing.

## 6. The platform's responsibility

The platform is the workflow and control system. It does not need to be the
only drawing tool.

Its responsibilities are to:

- keep the survey, extraction, quote, payment, drawing, and factory pack under
  one project number;
- show who currently owns the next action;
- preserve manual, system-generated, and hybrid extraction;
- prevent detailed drawing work from starting before the required payment
  authorization;
- store AutoCAD and configurator outputs under the same drawing-revision model;
- distinguish the client overview from the factory breakdown;
- preserve previous revisions instead of overwriting them;
- show which revision is approved;
- record who reviewed and released the drawing;
- prevent the factory from using a superseded drawing; and
- maintain an activity trail from site measurement to factory release.

## 7. Required project records

```text
Client
  └── Project
        ├── Site measurement revision(s)
        ├── Product family / system
        ├── Technical extraction revision(s)
        │     ├── material
        │     ├── quantity
        │     ├── manual / generated / hybrid method
        │     └── costing notes
        ├── Quotation revision(s)
        ├── Payment confirmation(s)
        ├── Drawing task
        │     ├── Configurator-generated, or
        │     └── AutoCAD
        ├── Technical drawing revision(s)
        │     ├── client overview
        │     ├── individual part/panel breakdowns
        │     ├── DWG/PDF files
        │     └── drawing notes
        ├── Material/hardware list
        ├── Cutting list / glass order
        ├── Technical approval
        ├── Client drawing response
        └── Factory production release
```

## 8. Recommended workflow statuses

| Stage | Meaning |
|---|---|
| Measurement received | Site information has been handed to technical |
| Extraction in progress | Technical material take-off is being prepared |
| Extraction ready for quote | Required materials and quantities are available |
| Quote in preparation | Quotation team is pricing the extraction |
| Quote sent | Client has received the commercial offer |
| Awaiting payment | Required payment has not been confirmed |
| Paid — drawing authorized | Technical drawing may begin |
| Drawing in progress | Configurator or AutoCAD work is underway |
| Drawing under review | Technical output has been submitted for checking |
| Client overview sent | Client has received the understandable overview |
| Drawing approved | Approved technical revision has been selected |
| Production pack ready | Factory documents have been assembled |
| Released to factory | Factory is authorized to fabricate from this revision |

## 9. Outputs by audience

| Audience | Required output |
|---|---|
| Client | Quotation and complete overview drawing |
| Quotation team | Approved extraction with materials and quantities |
| Technical team | Measurement record, extraction, paid authorization, drawing task, and revision history |
| AutoCAD technician | Complete technical handoff and a place to return DWG/PDF outputs |
| Factory floor | Approved product-specific breakdown drawings, cutting information, figures, material list, and hardware information |
| Management | Project status, owner, payment state, approved revision, and activity history |

## 10. Change and revision control

If a drawing changes the measurement, material, quantity, or price after the
quotation, the system should not silently replace the earlier records.

It should:

1. create a new drawing/extraction revision;
2. show exactly what changed;
3. recalculate or return the job for quotation review when the commercial
   amount is affected;
4. capture any required client response;
5. record technical approval; and
6. release only the approved production revision to the factory.

Configurator-generated and AutoCAD-uploaded drawings must follow the same
revision and approval rules.

## 11. Architecture implication

The project's connected record is the operational data spine. A configurator
design is one possible technical source inside that record, not the only
possible source for every product.

For a confirmed automated product such as the current Trialco working path,
the configurator can drive extraction, quotation, drawings, material lists,
and cutting information.

For another Frame system, Frameless product, Balustrade, or complex project,
the platform may use manual or hybrid extraction and an AutoCAD drawing while
still owning the project workflow, measurement, quotation, payment gate,
revisions, approvals, and factory release.

This preserves end-to-end visibility without pretending that every possible
architectural drawing can or should be rebuilt in the configurator.

## 12. Current automation coverage

| Product area | Extraction and pricing | Drawing path | Current position |
|---|---|---|---|
| Trialco Frame | System-generated working recipe | Configurator or AutoCAD when complexity requires it | Deepest modeled Frame path; remaining assumptions must still be approved |
| Other Frame systems | Manual or hybrid until system-specific recipes are confirmed | Configurator where supported; AutoCAD for complex work | Catalogue coverage is broader than fabrication-rule coverage |
| Frameless | Manual or generated where a confirmed template/rule exists | Configurator or AutoCAD | Product-specific glass and hardware rules must control automation |
| Balustrade | Manual or hybrid until extraction rules are confirmed | Configurator where supported; AutoCAD for custom/structural details | Must not inherit Frameless door rules automatically |
| Future product families | Manual first, then hybrid/generated after validation | Configurator or AutoCAD | Same workflow, product-specific engines |

The system must display whether an extraction or drawing is:

- **Generated from an approved recipe**
- **Generated from a working/provisional recipe**
- **Manually entered**
- **Hybrid — generated and technically adjusted**

## 13. Remaining confirmations

The following details should still be confirmed with Sofaamy:

1. Whether the client must formally approve the overview drawing before
   factory release.
2. Who performs the final technical drawing review.
3. Who has authority to release a drawing revision to the factory.
4. The exact payment condition that authorizes technical drawing.
5. Whether final measurement always happens before extraction for every
   product family.
6. The required fields and format of the manual extraction sheet for Frame,
   Frameless, and Balustrade.
7. The complete product-specific documents included in each factory pack.
8. The required AutoCAD file types, title-block fields, and revision naming
   convention.
9. How drawing changes that affect price are currently approved by the client.
10. Which Frame systems, Frameless products, and Balustrade types should be
    automated first after Trialco.

## 14. Implementation status — first working slice

The first product-neutral workflow foundation is now implemented in the
application.

### Implemented

- one Technical Workflow screen covering Frame, Frameless, Balustrade, and
  other technical projects;
- product family, product system, extraction method, and drawing method stored
  on the project;
- revision-controlled manual, generated, and hybrid extraction records;
- provisional extraction generation from a saved configurator item;
- **Duplicate & Edit** for generated or manual extractions, creating a new
  hybrid revision without overwriting the source revision;
- technical approval of an extraction before drawing handoff;
- a dedicated Quotation workbench that receives an approved manual, generated,
  or hybrid extraction without requiring a configurator drawing;
- locked technical material descriptions, quantities, and units alongside
  quotation-team selling rates and editable labour, installation, transport,
  and other commercial lines;
- quotation-only control of discount, GETF + NHIS, VAT, required-payment
  percentage, validity, contact details, quote PDF, sending, and client
  acceptance;
- immutable itemised commercial snapshots for generated quote revisions,
  separate from the approved technical extraction;
- production authorization on the Quotations page only after the accepted
  quote, required payment, and approved drawing gates are all complete;
- removal of monetary totals, price controls, quote issuance, and direct job
  creation from the Configurator and Technical Workflow screens;
- downloadable customer quotation PDFs for both configurator and
  extraction-based quotations;
- latest-approved-extraction sourcing for newly generated material lists,
  internal BOQs, price breakdowns, hardware issue lists, and factory work
  orders;
- automatic superseding of the previous approved extraction when the edited
  revision is approved;
- payment authorization calculated from accepted project jobs and their
  configured deposit thresholds;
- independent Configurator or AutoCAD drawing tasks;
- revision-controlled drawing submissions;
- storage and download of source DWG, client overview, factory breakdown,
  cutting list, material list, and supporting files;
- required client-overview and factory-breakdown files before drawing
  approval;
- one approved drawing revision at a time, with older approved revisions
  marked superseded;
- factory release tied to an approved drawing revision;
- existing project jobs prevented from entering Cutting until their project
  has a factory release; and
- a project-level technical activity trail.

### Current boundaries

- Generated extraction is labelled **provisional** until Sofaamy approves the
  complete recipe and exceptions.
- The current screen creates extraction revisions; editing an existing
  revision in place is intentionally avoided. Corrections create the next
  revision.
- Client drawing response is represented in the workflow model but a dedicated
  client approval action is still pending confirmation of Sofaamy's approval
  policy.
- File storage is local to the application server for this build. Production
  deployment should move drawing files to managed object storage while keeping
  the same drawing-file records.
- Authentication and role permissions must be added before production so only
  authorized accounts and technical supervisors can approve payments,
  extractions, drawings, and factory releases.

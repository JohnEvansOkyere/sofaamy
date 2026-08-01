# Sofaamy Frame Projects — Current Process and System Workflow

**Source:** Conversation with Sofaamy's team
**Scope:** Framed aluminium windows, doors, partitions, and related frame work
**Status:** Working process document — validate exact names, approval rights, and measurements with Sofaamy before production deployment

## 1. Process understanding

Sofaamy's Frame project begins with a client requirement and ends with a
fabricated frame installed at the client's site.

The company has two ways of receiving project dimensions:

1. A walk-in client brings measurements to the office.
2. Sofaamy sends one of its own representatives to the site, normally using
   the representative's/company vehicle, to measure the opening.

The preferred process is the second one: Sofaamy wants its own people to visit
the site and capture the measurements themselves. Representatives currently
record measurements in a physical book and bring the information back to the
contract manager or supervisor.

The first measurement is not always the final fabrication measurement. It is
used to prepare the quotation and estimate. Before production, Sofaamy may
return to the site for a final measurement. Production may sometimes use the
first measurement, but the safer and preferred control is to use the final
approved measurement whenever a final visit has been completed.

The production handoff depends on an accurate, detailed cutting-list
breakdown. The cutting list is not merely a quotation attachment: it is the
instruction that production follows to cut the aluminium profiles. A wrong or
incomplete cutting list can create material waste, incorrect parts, rework,
and installation problems.

Quality assurance is performed while production is ongoing. QA does not wait
until every production activity is finished; the work is checked progressively
until the produced frames are acceptable. Once production and QA are complete,
the job is scheduled for installation.

## 2. Current Sofaamy pipeline

```text
Client enquiry / walk-in
        │
        ├── Client supplies measurements
        │
        └── Sofaamy sends representative to site
                    │
                    ▼
          Preliminary site measurement
          (currently recorded in a book)
                    │
                    ▼
          Contract manager / supervisor
          reviews measurement information
                    │
                    ▼
          Material cost + labour cost
          are calculated
                    │
                    ▼
          Quotation is prepared and sent
          with similar-project photographs
                    │
                    ▼
          Client accepts, negotiates, or declines
                    │
                    ▼
          Payment arrangement is agreed
          (usually 70–80% upfront; instalments may apply)
                    │
                    ▼
          Final site measurement, where required
          (production dimensions are confirmed)
                    │
                    ▼
          Procurement handoff
          • approved quotation
          • material requirements
          • accurate cutting list
                    │
                    ▼
          Procurement releases materials/documents
          to production
                    │
                    ▼
          Production / cutting / fabrication
          with QA checks running concurrently
                    │
                    ▼
          QA confirms acceptable work
                    │
                    ▼
          Installation is scheduled
                    │
                    ▼
          Installation completed
          → project closed
```

## 3. Detailed workflow

### Stage 1 — Client enquiry and project intake

The client approaches Sofaamy either by walking into the office or through
the normal sales/client communication channel. The client may already have
measurements, or may request that Sofaamy measure the site.

The system should create a project record before measurements and quotation
work begin.

Minimum intake information:

- Client name and contact person
- Phone number and preferred communication channel
- Project/site address
- Type of frame work requested
- Number of openings or units, if known
- Whether the client supplied measurements or Sofaamy must survey the site
- Initial notes, photographs, drawings, or sketches

The intake record must distinguish a client-provided measurement from a
Sofaamy-verified measurement. They are not equivalent sources of fabrication
truth.

### Stage 2 — Measurement source and preliminary site survey

#### Option A — Client-provided measurements

The client supplies dimensions. Sofaamy records them as client-provided
measurements and may use them for an initial estimate. They should not be
silently presented as Sofaamy-verified site dimensions.

#### Option B — Sofaamy representative measures on site

This is Sofaamy's preferred path. A representative is assigned to visit the
site, normally using the company's/representative's vehicle. The representative
currently writes measurements in a book and returns them to the contract
manager or supervisor.

The digital workflow should replace the paper handoff with a field measurement
record containing:

- Representative assigned
- Visit date and time
- Site and opening reference
- Width and height measurements
- Measurement unit, stored as millimetres in the system
- Number of bays/panels and opening type where known
- Wall/opening condition notes
- Level, plumb, sill, head, and jamb observations where taken
- Photos of each opening and surrounding conditions
- Sketch or drawing attachment where available
- Whether the dimensions are preliminary or final

The first survey creates the quotation basis. It is a preliminary measurement
unless Sofaamy explicitly marks it as final.

### Stage 3 — Measurement review by contract manager or supervisor

The representative returns the measurement information to the contract
manager or supervisor. That person reviews the record before preparing the
quotation.

The reviewer should confirm:

- All required openings have a reference and dimensions
- Width and height are plausible and use millimetres
- Bay/panel arrangement is understood
- Opening type is identified where possible
- Site notes do not contain unresolved access or installation risks
- Missing dimensions or unclear sketches are sent back for clarification

The reviewer may create a preliminary frame design from the survey. This
design is used for costing, visual explanation, and quotation—not necessarily
for cutting.

### Stage 4 — Quotation preparation

The contract manager or supervisor prepares the quotation from the reviewed
measurement/design information.

The quotation calculation includes at least:

- Aluminium/profile material cost
- Glass cost, where the frame includes glass
- Hardware and accessories, where applicable
- Labour/fabrication cost
- Installation cost, where included in the agreement
- Any other agreed project charges
- The commercial total and payment terms

The system must retain the calculation inputs, not only the final total. A
future user must be able to see which dimensions, profile system, glass type,
hardware, labour rule, and margin produced the amount.

### Stage 5 — Client visual review

After preparing the quotation, Sofaamy sends the client photographs of
similar completed projects so the client can understand the expected style and
appearance.

The team explained that they generally cannot show the client the exact frame
that will be fabricated at quotation time. Therefore, the current sales
support is based on similar-project photographs rather than an exact rendered
frame.

The system should support attaching/selecting similar-project reference
images to the quotation. These images must be labelled as examples or similar
work; they must not be represented as the client's exact final frame unless
the design is actually the client's approved design.

### Stage 6 — Client decision and payment arrangement

The client may accept the quotation, request changes, negotiate terms, or
decline it.

When the client accepts, Sofaamy normally collects a large upfront payment.
The team described the usual upfront amount as approximately **70–80%**,
depending on the agreement with the client. Some clients pay by instalments.

The system must therefore support:

- A project-specific payment schedule
- An agreed upfront percentage or amount
- Instalment payments with dates and references
- Payment method and proof/reference
- Amount paid, amount outstanding, and payment status
- Clear permission for who can confirm that payment is sufficient to proceed

The 50% deposit rule in older project documents is not the rule described in
this conversation. Do not replace it silently; the production system must make
the payment schedule configurable and record the agreement for each project.

### Stage 7 — Final site measurement and production confirmation

Sofaamy does not always use the preliminary measurement directly in
production. In some projects, the team returns to the site and takes a final
measurement after the client has accepted the quotation and payment has been
made or arranged.

This creates two measurement states:

| Measurement | Purpose | Production authority |
|---|---|---|
| Preliminary measurement | Estimate, design, quotation, client discussion | Not automatically final |
| Final measurement | Confirm the actual opening before fabrication | Preferred production source |

The final measurement record must be versioned rather than overwriting the
first survey. If the final measurement differs from the preliminary design,
the system should show the variance and require the supervisor/contract
manager to approve the resulting design, price, and cutting list.

Before procurement release, the project should clearly state one of the
following:

- `Final measurement confirmed — use for production`
- `Preliminary measurement approved for production by [authorized person]`
- `Measurement incomplete — do not release to production`

The second option exists because the team said that sometimes production does
use the first measurement. It must be an explicit decision, not an accidental
default.

### Stage 8 — Procurement handoff

Once the client decision/payment condition and production measurement decision
are satisfied, the contract manager or supervisor submits the production
pack to procurement.

The procurement pack contains:

1. Approved quotation and payment status
2. Final approved design/measurements
3. Accurate cutting-list breakdown
4. Material requirements
5. Glass requirements and cut sizes
6. Hardware and accessory requirements
7. Relevant drawings, photographs, and site notes
8. Any installation or special-condition notes

The quotation explains the commercial agreement. The cutting list explains
what production must physically cut. They are related but are not the same
document.

Procurement reviews stock and purchasing requirements, then releases the
approved materials and production documents to the factory.

### Stage 9 — Cutting-list review and production release

The cutting list is the critical production-control document for Frame work.
It must be accurate enough for the factory team to cut each profile without
recalculating the job from the quotation.

For each cut piece, the breakdown should identify:

- Project/job number
- Design reference and unit number
- Profile system and exact profile code/name
- Member role: frame, jamb, head, sill, mullion, transom, sash rail, sash
  stile, bead, interlock, or other applicable member
- Piece length in millimetres
- Quantity
- Cut angle/end treatment where applicable
- Related opening/section/panel reference
- Notes for machining, holes, routing, grinding, or orientation

The cutting list should also provide:

- Glass cut sizes by panel/section
- Glass type and thickness
- Hardware/accessory quantities
- Stock-bar allocation or optimization result
- Expected offcut/waste
- Any unresolved placeholder or supervisor approval note

No generic “profile metres” total is sufficient by itself for production. The
factory needs the piece-level breakdown and the profile identity.

### Stage 10 — Procurement release to production

Procurement releases the material and approved documents to production. The
production team should work from the released revision of the cutting list.

The system should record:

- Who released the job
- Release date/time
- Cutting-list revision
- Materials issued
- Shortages or substitutions
- Production owner/station
- Any change after release

If a dimension, profile, or material changes after release, the system should
create a revised production document and record who approved the change. The
factory should not continue from an obsolete printed or downloaded list.

### Stage 11 — Production and fabrication

Production follows the released cutting list to cut and fabricate the frames.
The exact internal production stages must be confirmed with Sofaamy, but the
Frame workflow requires at least:

- Cutting
- Profile processing/machining
- Assembly
- Glazing, where applicable
- Final preparation for installation

The system should allow production staff to mark progress against the job and
against individual design units where practical. The cut list remains the
reference for the physical parts; the job board tracks status and ownership.

### Stage 12 — Quality assurance during production

QA works concurrently with production. Checks happen as work is produced,
not only as a single final inspection after all fabrication is complete.

QA should be able to record:

- Job/design/unit being checked
- Production stage checked
- Inspector
- Pass, rework, or hold result
- Checklist items and measured result
- Notes and photographs
- Rework instruction and responsible person
- Re-inspection result

The Frame QA checklist should eventually be product-specific. Candidate areas
to confirm with Sofaamy include:

- Overall dimensions and tolerance
- Bay and sash dimensions
- Squareness and diagonal check
- Correct profile/system/code
- Correct opening direction and panel arrangement
- Hardware position and operation
- Glass type, size, edge condition, and damage check
- Bead/gasket fit and sealing
- Finish/colour match
- Surface scratches, dents, or damage
- Drainage/weep-hole treatment where applicable
- Readiness for transport and installation

QA approval should be tied to the actual production revision. A rework result
must keep the job from being treated as ready for installation until the
re-inspection passes.

### Stage 13 — Installation scheduling

After production is complete and QA has accepted the work, Sofaamy schedules
installation.

The installation schedule should include:

- Job and client
- Site address and contact
- Units/design references to install
- Required vehicle and crew
- Access restrictions or site notes
- Installation date/time
- Outstanding balance/payment status
- Delivery and handling requirements

The system should generate a delivery/installation pack containing the design
references, relevant dimensions, drawings, notes, and any client-specific
requirements.

### Stage 14 — Installation and close-out

The installation team completes the work at site and records the outcome.

Close-out should capture:

- Installed units/design references
- Installation date and crew
- Site condition or variation notes
- Photos of completed work
- Client acknowledgement/sign-off
- Snags or defects, if any
- Outstanding payment or retention
- Final project status

The project is complete when the fabricated frame has been installed, QA or
handover requirements are satisfied, and the commercial close-out is recorded.

## 4. Required system records

The Frame workflow needs these connected records:

```text
Client
  └── Project / Job
        ├── Preliminary measurement(s)
        ├── Final measurement(s)
        ├── Frame design / project item(s)
        ├── Quotation revisions
        ├── Payment schedule and payments
        ├── Procurement pack
        ├── Cutting-list revisions
        ├── Material issues and shortages
        ├── Production progress
        ├── QA inspections and rework
        ├── Installation schedule
        └── Handover / close-out
```

The design, quotation, cutting list, and production records must remain linked
by project/job number and design reference. A price change or measurement
change must be traceable to the revision that produced it.

## 5. Roles and handoffs described by the team

| Role | Current responsibility described |
|---|---|
| Client | Supplies requirements/measurements, reviews quotation/examples, agrees payment, approves work. |
| Field representative | Visits site, takes measurements in the current book-based process, returns information to the office. |
| Contract manager | Receives/reviews measurements, prepares or coordinates quotation, manages client agreement and handoff. |
| Supervisor | Reviews measurements/designs, prepares or approves quotation, confirms production information and releases work. |
| Procurement | Receives quotation, cutting list, and material requirements; checks/releases materials to production. |
| Production | Follows the cutting list to cut and fabricate the frame work. |
| QA | Checks work while production is ongoing, records defects/rework, and confirms acceptable work. |
| Installation team | Receives the completed job, schedules/executes installation, and reports completion or snags. |

The final permission matrix—who may approve measurements, prices, payment,
cutting-list release, substitutions, QA, and installation—still needs to be
confirmed by name and role.

## 6. Critical controls for the Sofaamy system

1. **Measurement provenance:** label client, preliminary Sofaamy, and final
   Sofaamy measurements separately.
2. **Final-measurement decision:** do not silently use an old measurement when
   a final survey exists.
3. **Payment flexibility:** record the agreed 70–80% upfront amount or an
   instalment schedule per client/project; do not force one universal term.
4. **Revision control:** quote, design, cutting list, and procurement pack must
   have revision identity.
5. **Piece-level cutting list:** production requires exact member, profile,
   length, quantity, and cut-treatment information.
6. **Material identity:** profile names/codes must come from the selected
   Sofaamy system, not a generic placeholder.
7. **QA during production:** allow stage-level checks, rework, and reinspection.
8. **Release authority:** procurement and production should only see the
   approved/released document revision.
9. **Installation readiness:** production complete and QA accepted before
   installation scheduling, except where an authorized exception is recorded.
10. **Commercial close-out:** installation, client acknowledgement, snags, and
    outstanding payment must be visible before the project is closed.

## 7. Immediate Frame module implications

The current Frame implementation should evolve around this sequence:

1. Create a client/project from walk-in or field-survey intake.
2. Capture preliminary measurements with photos and source/provenance.
3. Build a Frame design and calculate material and labour costs.
4. Attach similar-project photographs to the client quotation.
5. Record client acceptance and the agreed payment schedule.
6. Capture or approve the final measurement revision.
7. Regenerate the design, quote, BOM, glass sizes, and cutting list from the
   final approved dimensions.
8. Send the procurement pack and release the exact cutting-list revision.
9. Issue materials and track production.
10. Record concurrent QA checks and rework.
11. Schedule installation and generate the installation/delivery pack.
12. Record installation, handover, snags, payment balance, and closure.

The existing one-design-record principle remains important: the approved Frame
design must drive the quotation, BOM, glass order, piece-level cutting list,
optimization, and production documents. The missing business layer is the
measurement/revision/approval chain around that design.

## 8. Items to confirm with Sofaamy

The following were not specified precisely in the conversation and should be
confirmed before hard-coding them:

- Exact names and authority of contract manager, supervisor, procurement,
  production, QA, and installation roles
- Whether payment is always required before final measurement or only before
  procurement release
- Whether 70% or 80% is the most common default, and how exceptions are approved
- Accepted payment methods and how instalment references are recorded
- Exact Frame production stages and which role owns each stage
- Whether QA checks every unit, every stage, or sampled units
- Measurement tolerances and the rules for when a final site visit is mandatory
- How to handle a final measurement that changes the quoted price
- Exact cutting-list format currently trusted by the factory
- Mitre, butt-cut, machining, deduction, grinding, and clearance rules per
  profile system
- Whether similar-project photos are selected from a controlled company library
- Installation sign-off, snag handling, warranty, and final-payment rules


# EvA UI/UX Observation Log

**Purpose:** Capture Evans's phase-by-phase review of EvA Cloud before any
SOFAAMY interface redesign begins.

**Status:** Observation in progress. Do not treat this document as an approved
build specification until Evans explicitly says the walkthrough is complete.

## Working method

For every phase of the walkthrough, record:

1. What EvA shows.
2. What the user does and what happens next.
3. What makes the interaction feel clean or easy.
4. How the equivalent SOFAAMY experience currently differs.
5. A possible SOFAAMY implication, clearly marked as provisional.

After the walkthrough is complete, connect the observations into one coherent
information architecture and simplification plan. Preserve SOFAAMY's approved
business rules, project/item boundaries, revision controls, and report accuracy;
the goal is to reduce cognitive load, not silently remove operational safety.

## Baseline observation

### Overall impression

- EvA's UI/UX feels cleaner and easier to follow than the current SOFAAMY
  interface.
- The current SOFAAMY interface feels too busy, confirming the feedback from
  Sofaamy's team.
- Simplicity and ease of navigation are now first-class redesign requirements,
  not cosmetic polish to apply after adding features.

### Existing visual evidence already available

The repository contains earlier EvA configurator screenshots showing a large
central design canvas, a compact vertical tool rail, contextual side panels,
and controls revealed around the current design task. These are useful evidence,
but Evans's new walkthrough is the authoritative source for the full experience
being reviewed now.

## Phase observations

### Phase 1 — Sidebar scale and sales dashboard

#### Evidence reviewed

- `docs/reference/EVA-UI_UX_FLOW/dashboard-overview.jpg`
- `docs/reference/EVA-UI_UX_FLOW/dashboard_filter.jpg`
- `docs/reference/EVA-UI_UX_FLOW/dahboard-after-filter.jpg`
- `docs/reference/EVA-UI_UX_FLOW/dashboard-downfeatures.jpg`

#### Sidebar observation

- EvA keeps its entire primary sidebar to eight items; the current SOFAAMY
  sidebar exposes fifteen destinations.
- EvA's rail is visually compact and icon-led. Settings is separated at the
  bottom instead of competing with everyday work.
- The SOFAAMY redesign must remove, combine, or move secondary destinations
  out of the primary sidebar. The final eight-or-fewer information architecture
  should be decided only after the complete EvA walkthrough reveals how its
  other work areas are grouped.

#### Dashboard layout

EvA's dashboard follows a simple top-to-bottom analytical hierarchy:

1. A single row of four equal opportunity summary cards:
   - Created opportunity — count and total value.
   - Newly quoted — count and total value.
   - Won opportunity — count and total value.
   - Lost opportunity — count and total value.
2. A large **Sales analytics** bar chart, using the same colors as the four
   opportunity states. A compact period control sits inside the chart card
   (`Weekly` before filtering and `Monthly` in the filtered example).
3. A narrower **Sales location** panel to the right of the main chart. Its
   visible view is `City`, with a table of opportunity location, quantity, and
   value. This is the city-performance view Evans mentioned.
4. A second analytical row below the fold:
   - **Lost opportunity reasons** — pie chart, total lost value, and percentage
     breakdown by reason.
   - **Opportunity source** — donut chart with a source legend and counts.
   - **Opportunity Conversion Analytics** — a descending horizontal conversion
     funnel for Created → Quoted → Won, carrying counts, percentages, and value.
5. The screenshots also show **All active opportunities in various stages**
   and **Teams of the month** below this row. Evans does not consider these
   important for the intended SOFAAMY dashboard, so they are not part of the
   provisional core.

#### Dashboard filter

The top-right `Filter` action opens a right-side drawer and dims the dashboard
behind it. The drawer keeps filters out of the normal dashboard layout until
they are needed. Visible filter fields are:

1. Date period — the visible selected value is `This Year`.
2. Date range — calendar-backed start and end dates.
3. Source.
4. User.
5. Project Type.
6. Product Type.
7. Supply.
8. Customer Size.
9. Sales Executive Name.

The drawer ends with `Clear` and `Apply`. After applying, a small control near
the top right reports how many filters are active and provides a separate
`Clear` action. The images do not expose the dropdown value lists, apart from
`This Year`; those values must come from SOFAAMY's real data vocabulary rather
than being guessed from EvA.

#### Why this dashboard feels clean

- One dominant story: opportunity and sales performance.
- Four consistent KPIs rather than many unrelated attention counters.
- Colors retain the same meaning from summary cards into the chart.
- The largest space goes to the primary trend; city performance is a compact
  secondary comparison alongside it.
- Detailed breakdowns sit below the fold instead of competing with the first
  view.
- Advanced filters live in a temporary drawer rather than permanently taking
  space.
- White space, light borders, restrained color, and consistent card geometry
  create separation without heavy visual decoration.

#### Provisional SOFAAMY implication

- Replace the current all-department command-centre density with a focused
  management/sales overview based on the four opportunity states.
- Keep one primary sales chart, one compact Ghana location/city-performance
  panel, and the three lower conversion/source/loss visuals.
- Translate all money to GHS and all geography to SOFAAMY's Ghana operating
  locations.
- Move operational queues and role-specific work out of the management
  dashboard's first view; their final home will be determined after the full
  navigation and workflow review.
- Do not yet choose which seven sidebar entries to remove or merge. The target
  is a much smaller primary navigation, but the mapping depends on the remaining
  phases.

#### Phase status

Dashboard concept understood. No blocking ambiguity for proceeding to the next
phase. The exact selectable values inside EvA's filter dropdowns are not visible,
but they are not required to understand or reproduce the clean layout pattern.

### Phase 2 — Opportunities list and opportunity creation

#### Evidence reviewed

- `docs/reference/EVA-UI_UX_FLOW/opportunity/opportunity-dashboard.jpg`
- `docs/reference/EVA-UI_UX_FLOW/opportunity/creating-opportunity.jpg`
- `docs/reference/EVA-UI_UX_FLOW/opportunity/basic-info-contuation.jpg`
- `docs/reference/EVA-UI_UX_FLOW/opportunity/official-info-page.jpg`

#### Opportunity list

EvA gives Opportunities a dedicated, table-first page rather than mixing the
list with dashboard cards or a pipeline board.

- The page title is **Opportunity**.
- Four tabs keep lifecycle views on the same route:
  - Active
  - Won
  - Lost
  - All
- One primary **Create opportunity** button sits at the top right.
- A compact table toolbar contains:
  - `Default View` selector.
  - Search.
  - Date-period selector, shown as `Last 90 days`.
  - User/avatar scope controls.
  - Filter.
  - Sort by.
  - List/grid view controls.
- The visible table columns are:
  - Opportunity.
  - Contact.
  - Contact Number.
  - Location.
  - Account.
  - Managed By.
  - Opportunity Category.
  - Opportunity Value.
  - Deal Stage.
- Each row has a compact overflow menu instead of displaying many actions.
  A column/settings control appears at the right of the header.

#### Create-opportunity structure

Creation opens as a dedicated full page with a breadcrumb and a two-step
progress indicator. It is not squeezed into the opportunity table or placed in
a small modal.

**Step 1 — Basic info**

The progress indicator says this step has two mandatory fields. The form is
split into understandable sections.

Basic details:

- Project name — required.
- First name with title selector — required.
- Last name.
- Phone number with country-code selector.
- Email.
- Note.

Site address:

- Address 1.
- Address 2.
- Pin code.
- City.
- State.
- Country.

Site location:

- Searchable/geocoded site-location field.
- Large map showing the selected location.

**Step 2 — Official info**

The progress indicator says this step has five mandatory fields. The screenshot
shows the business and classification fields below; only three required marks
are visible in the captured area, so the complete five-field mandatory set must
not be guessed from this image alone.

Official information:

- Bill to.
- Marketing Partner.
- Managed by — required.
- Opportunity stage — required; shown as `Enquiry`.
- Opportunity source — required.
- Estimated opportunity value.
- Opportunity Category.
- Expected closure date.
- Expected supply start date.
- Expected supply end date.

Opportunity tags visible in the image:

- Project Type.
- Product Type.
- Supply.
- Customer Size.
- Sales Executive Name.
- XYZ Tags.
- Customer Group.
- Customer type (`Cust type` in the image).

There may be more content below the captured viewport. Only the visible fields
are treated as confirmed.

#### Connected data concept

- The same fields used to classify an opportunity—source, project type, product
  type, supply, customer size, sales executive, user, and location—become the
  filters and breakdown dimensions on the dashboard.
- Site address and map location are not isolated form details; they support the
  city-performance analysis seen in Phase 1.
- Estimated opportunity value belongs to the early sales record. A formal quote
  can remain a later controlled document rather than being required to create
  the opportunity.
- Active, Won, Lost, and All are simple list scopes. Detailed deal stages such
  as Enquiry or Negotiation remain row-level workflow states inside those scopes.

#### Why this flow feels clean

- One screen has one job: find and manage opportunities.
- Lifecycle states are four tabs, not four sidebar destinations.
- Search, date, filter, sort, and view controls share one compact toolbar.
- Secondary row actions are hidden in an overflow menu.
- Creation is separated from browsing and split into Basic info and Official
  info instead of presenting every field at once.
- Related inputs are grouped under clear section headings with generous spacing.
- The stepper communicates both progress and mandatory-field expectations.

#### Current SOFAAMY contrast

The current `CRM & Leads` page combines four KPI cards, a client table, a
five-column sales pipeline, and a New Client modal. It also treats adding a
client as the main creation action even though a client and a sales lead
are different business records. This is materially denser and less explicit
than EvA's focused opportunity flow.

#### Provisional SOFAAMY implication

- Make Leads a focused list experience with Active, Won, Lost, and All tabs and
  one Create Lead action.
- Use a table as the default operational view. A board/grid view can remain an
  optional toggle instead of always occupying the page.
- Separate lead creation from client-directory management.
- Use a full-page, staged creation flow: contact/project/site facts first, then
  ownership, value, dates, source, and classification.
- Adapt country code, address vocabulary, currency, map defaults, cities, and
  lead tags to Ghana and SOFAAMY rather than copying India's values.
- Keep the lead fields consistent with dashboard filters so analytics
  come from the records staff already create.
- Do not implement or decide the final CRM/client navigation placement until
  the remaining EvA workflow phases show where contacts and accounts live.

#### Phase status

Opportunity list and creation concept understood. No blocking ambiguity for
continuing. The screenshots do not show every dropdown value, the bottom of the
Official info form, or the final submit action; those details can be added if a
later phase exposes them, but they do not prevent understanding the core flow.

### Phase 3 — Quote workspace, catalogue, configurator, pricing, and reports

#### Evidence reviewed

- `docs/reference/EVA-UI_UX_FLOW/Quote/quote-first-entry-page.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/creating-a-new-quote.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/starting-a-design.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/catalogs.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/reusing-a-template.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/creating-a-new-design.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/desing-page.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/the-tools.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/when-cliacked-on-a-pane-or-side-box.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/3d-view.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/pricing-page.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/desing-manual-rate-reprot.jpg`
- `docs/reference/EVA-UI_UX_FLOW/Quote/profile-cutting-optimization.jpg`

#### Quote register

Selecting Quote from EvA's primary navigation opens another focused table page
that is visually consistent with Opportunities.

- Page title: **Quote**.
- Lifecycle tabs: Active, Won, Lost, and All.
- One primary **Create quote** action at the top right.
- The same compact register tools are reused: Default View, Search, Last 90
  days, user/avatar scope, Filter, Sort by, and table controls.
- Visible quote columns include:
  - Project Name.
  - Default Quote.
  - Revision No.
  - Revision Title.
  - Parent Quote ID.
  - Area.
  - Quantity.
  - Opportunity Value.
  - Deal Stage.
- Rows have an expander and overflow action. When the user hovers around the
  project name, a small `View` action appears. This avoids filling every row
  with permanently visible buttons.
- The Default Quote, Revision No., Revision Title, and Parent Quote ID fields
  show that quote versions remain traceable even though the page looks simple.

#### Creating the quote shell

`Create quote` opens a small **Create first quote** modal with only three
inputs:

1. Opportunity — required; selected from opportunities created earlier.
2. Expected supply start date.
3. Expected supply end date.

The modal has Cancel and Add actions. It does not ask the user to re-enter the
client, site, contact, project classification, or sales ownership already held
by the opportunity.

This creates the quote/project context first. Design configuration, pricing,
and documents happen inside that context afterward.

#### Selected quote as a workspace

Using the row's `View` action opens the selected project/quote workspace. The
header keeps the project name and quote number visible and provides four
first-level work areas:

1. Documents.
2. Design.
3. Pricing.
4. Report.

The header also shows the running quote value and total quantity and exposes a
Quick quote action. The global eight-item application sidebar is no longer the
main interaction surface inside the configurator; the selected quote's own
navigation carries the work.

This is a major information-architecture concept: Configurator, Pricing, and
Reports are not presented as unrelated destinations. They are stages/tools
inside the quote currently being prepared.

#### Project designs versus reusable catalogue

The Design area has two tabs:

- **Project** — designs/items belonging to the selected client quote.
- **Catalog** — reusable product designs/templates.

When the project has no design yet, the Project tab offers two clear choices:

1. **Select a design from templates** → Choose from catalog.
2. **Create new design** → Create design.

The Catalog tab is a reusable design library with:

- A Create design action.
- Search, Filter, and Sort by controls.
- Visual cards containing a drawing thumbnail, template/design name, profile
  system/series, and a single Select design action.

The screenshots and Evans's walkthrough support the working interpretation
that Catalog holds reusable Sofaamy product typologies created in the system,
while Project holds the client-specific instances selected and configured for
the current quote. The catalogue is not the client-project archive.

Selecting or creating a design exposes a compact metadata form. Confirmed
visible fields are:

- Design reference — required.
- Quantity — required.
- Design name.
- Location.
- Floor number.
- Note.
- Selected glass.

The user applies those details and proceeds into the design editor.

#### Full-screen configurator interaction

The configurator gives almost the entire viewport to the drawing grid.

- A small metadata card at the upper left shows design reference, quantity,
  and location with an edit action.
- Save and close actions sit at the upper right.
- A narrow icon tool rail sits on the left.
- Selecting a tool temporarily opens its relevant library beside the rail. One
  screenshot shows grouped Openable Designs, Tilt & Turn Designs, and Tilt &
  Slide Designs.
- The 2D drawing, dimensions, panel identities, floor-aperture reference, and
  inside/outside state remain the visual centre.
- Compact canvas/view controls sit at the bottom right, including 2D/3D view
  behavior demonstrated by the separate 3D screenshot.
- Undo/redo and other view tools remain close to the canvas rather than in a
  permanent application panel.

Most importantly, the **Properties** panel is contextual. Clicking a panel or
another editable design element opens a right-side properties drawer for that
selection. The visible example contains System, Part group, locking, fixed
shutter, roller, and equalization choices plus Apply. When the user is not
editing that selection, the drawer does not permanently consume the right side
of the screen.

This is the opposite of the current SOFAAMY default, where the properties/quote
column starts open and exposes item, measurement, size, system, finish, panel,
and production details continuously. EvA preserves the canvas first and reveals
controls only in response to the current action.

#### Pricing area

Pricing is a dedicated quote work area, not a permanent configurator sidebar.
Its secondary navigation visibly includes:

- Project Price Structure.
- Profile Rate.
- Reinforcement Rate.
- Hardware Rate.
- Glass Rate.
- Mesh Rate.
- Design Add On Cost Heads.
- Design Manual Rate.

The Project Price Structure view contains a structured cost-head table and an
Update Pricing action, with a separate Price Summary card showing packing,
basic/final value, discount, subtotal, transportation, loading/unloading, and
grand total.

The Design Manual Rate view lists each design/system with location, area,
quantity, actual basic/SQMT cost, calculation type, and manual basic/SQMT cost.
It supports switching an individual design between actual and manual pricing,
then Reset or Save.

The useful concept for SOFAAMY is the separation and progressive depth: users
first see the quote total, then enter Pricing, then choose a specific pricing
dimension only when needed. It is not necessary to reproduce every EvA pricing
page if SOFAAMY does not use that rate type.

#### Reports and profile cutting optimization

EvA exposes many reports from the selected quote's Report area. Evans's current
direction is to retain SOFAAMY's existing essential generated report set rather
than copying EvA's full catalogue.

The supplied **Profile Cutting Optimization Report** sample is a 14-page PDF.
Its visible first page is organized as follows:

- Report title, date, project name, and project code.
- A short table identifying the included project, project code, quantity, and
  quote alias.
- A separate colored section for each profile/designation.
- Profile cross-section thumbnail, code, color/finish, designation, and cutting
  tolerance.
- Repeated stock-bar rows showing optimization-bar count, stock length, rest,
  and waste.
- A visual segmented bar for each cutting plan, with cut lengths and design/
  bundle references under the segments.
- Reusable remainder/offcut is differentiated visually in green.

The concept worth carrying forward is a highly scannable factory document:
group by profile, state the stock assumptions once, and visualize every bar's
cuts, identity, remainder, and waste. SOFAAMY already generates cutting and
optimization outputs; this sample is evidence for how to make those outputs
cleaner, not a reason to multiply the report catalogue.

#### Connected workflow concept

The first three phases now form one clear chain:

1. Create and qualify an Opportunity.
2. Create a Quote by selecting that Opportunity.
3. Open the Quote as the working project context.
4. Select a reusable Catalogue design or create a new product design.
5. Configure one or more project design instances.
6. Review Pricing.
7. Generate the required Documents and Reports.

EvA reduces duplicate entry by carrying the opportunity context forward. It
reduces navigation by putting design, pricing, and outputs inside the quote.

#### Provisional SOFAAMY implication

- Make every new quotation originate from an existing lead, with a
  controlled exception only if Sofaamy later confirms a walk-in/direct-quote
  path is required.
- Let the quote become the commercial workspace that holds its project items,
  designs, pricing, documents, and reports.
- Separate reusable product Catalogue templates from client project design
  instances. Selecting a template should create a project-specific copy that
  can be configured without overwriting the catalogue original.
- Move the Configurator away from being a broad standalone destination and
  toward being the Design work area of the selected quote/project. Keep a
  catalogue-management entry point for authorized template creation.
- Default the configurator to a near-full-screen canvas. Keep the slim tool rail,
  open libraries on demand, and show properties only for the selected object.
- Move pricing summaries and detailed price controls into the Pricing work area;
  do not keep them permanently beside the canvas.
- Preserve SOFAAMY's approved per-item extraction/revision controls and combined
  project quotation even if the interface becomes simpler.
- Keep the existing essential SOFAAMY report pack, then use EvA's cutting report
  as a visual-quality reference for profile grouping and bar-plan readability.
- This grouping could remove Configurator and Reports from the primary sidebar,
  helping reduce the current fifteen entries, but the final sidebar is still
  deferred until the complete walkthrough is documented.

#### Open details that do not block the concept

- The screenshots do not yet explain the exact functional boundary between the
  top-level Documents and Report areas.
- Catalogue behavior strongly supports the reusable-template interpretation,
  but rules for promoting a project design back into the catalogue are not shown.
- The Report landing page and full report list are not visible; only the profile
  cutting report output is confirmed here.
- EvA's unrestricted manual-rate behavior must not be copied over SOFAAMY's
  approved quote/revision safeguards without an explicit business decision.

#### Phase status

Quote, catalogue, configurator, pricing, and report concepts understood. No
blocking ambiguity for continuing to the next phase.

#### Confirmed quote-flow correction — 2026-08-14

SOFAAMY uses **Lead** throughout this implementation. **Opportunity** remains
in earlier observations only where it records EvA's own labels and screens.

The live Quotes route must not expose the former extraction-led preparation
pipeline. Its entry screen is the EvA-style quotation register with Active,
Won, Lost, and All views plus a Create Quote action. Create Quote takes the
existing lead and the expected supply start/end dates, then opens that
quote's workspace.

Inside the workspace, Documents, Design, Pricing, and Report remain together.
The user selects or creates a product design and enters its width, height,
quantity, and configuration. Saving the design calculates and updates the
current draft item quote automatically from the system's configured rates. No
separate extraction or manual "prepare quote" step is part of this commercial
flow. Technical extraction and revision records remain downstream internal
controls for approved manufacturing information; they do not gate generation
of the commercial draft.

The workspace now completes the client loop without returning to the old page:
download the combined quotation, open its WhatsApp message, record acceptance,
or record a loss with a required reason. The decision applies to the current
item quotations together so the lead moves consistently into Won or
Lost. Sent and declined quotations can be revised by changing the design and
saving; this creates a new Draft instead of overwriting the issued record.

The Configurator now keeps the properties panel closed by default. Selecting a
section, panel, or curtain-wall bay opens a floating contextual drawer; closing
it returns the full width to the drawing. Opening the drawer does not resize the
canvas or permanently consume a grid column.

## Connected redesign plan

_To be written only after Evans confirms the walkthrough is complete._

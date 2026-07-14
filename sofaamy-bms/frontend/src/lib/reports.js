// ============================================================
// REPORT CATALOG — every document the system produces, grouped
// the way EvA Cloud groups them (validated against Sofaamy's
// real workflow). status: 'live' = works today,
// 'build' = being built this month, 'planned' = phase 2/3.
// ============================================================

export const REPORT_GROUPS = [
  {
    id:'project', title:'Project & Basic Details',
    sub:'Who, where, and what is being made',
    reports:[
      { name:'Project summary', desc:'Client, site, all design items with ref · location · qty', status:'build' },
      { name:'Design register', desc:'Every design in the project: ref, dimensions, sections, finish', status:'build' },
      { name:'Elevation drawings', desc:'Dimensioned drawing per design, as on the canvas', status:'build' },
      { name:'Site survey sheet', desc:'Field measurements, photos, GPS — from the mobile capture', status:'planned' },
      { name:'Quote vs survey variance', desc:'Differences between quoted and surveyed dimensions', status:'planned' },
    ],
  },
  {
    id:'quotation', title:'Quotation & Pricing',
    sub:'Client-facing commercial documents',
    reports:[
      { name:'Client quotation (PDF)', desc:'Sofaamy-branded, GHS line items, 50/50 payment terms', status:'live' },
      { name:'Detailed price breakdown', desc:'Per-design cost lines: profile, glass, hardware, labour', status:'live' },
      { name:'Proforma invoice', desc:'For the 50% production deposit', status:'planned' },
      { name:'Payment schedule', desc:'Deposit / balance milestones per job', status:'planned' },
      { name:'Margin analysis (internal)', desc:'Quoted margin per job — management only', status:'planned' },
    ],
  },
  {
    id:'materials', title:'Material & Purchase Orders',
    sub:'What to buy before production can start',
    reports:[
      { name:'Profile BOQ', desc:'Metres + stock bars needed per profile (Mollium/Transum/Sash)', status:'live' },
      { name:'Glass BOQ', desc:'m² per glass type + individual panel sizes to order', status:'live' },
      { name:'Hardware & accessories BOQ', desc:'Handles, locks, rollers, hinges per opening type', status:'live' },
      { name:'Consumables BOQ', desc:'Gaskets, screws, silicone, packers', status:'planned' },
      { name:'Supplier purchase order', desc:'PO document per supplier from the BOQs', status:'planned' },
      { name:'Shortage vs stock', desc:'BOQ compared against store inventory — what to actually buy', status:'planned' },
    ],
  },
  {
    id:'production', title:'Production Reports',
    sub:'What the factory floor works from',
    reports:[
      { name:'Cutting list & optimization', desc:'Bar-by-bar nesting with waste % — live in the configurator', status:'live' },
      { name:'Factory work order / job card', desc:'Per unit: stages, materials, drawings, QA boxes', status:'live' },
      { name:'Glass order sheet', desc:'Panel cut sizes to send to the glass supplier/processor', status:'build' },
      { name:'Assembly sheet', desc:'Per design: sash sizes, hardware positions, gasket runs', status:'planned' },
      { name:'Machining / prep sheet', desc:'Holes, routing, lock prep per piece', status:'planned' },
      { name:'Batch schedule', desc:'Grouped work orders across jobs for shared cutting', status:'planned' },
      { name:'Offcut / remnant register', desc:'Reusable leftovers by profile and length', status:'planned' },
      { name:'Waste report', desc:'Actual vs optimized waste per batch', status:'planned' },
    ],
  },
  {
    id:'dispatch', title:'Dispatch & Installation',
    sub:'Getting finished units to site, proven',
    reports:[
      { name:'Delivery note / packing list', desc:'Units per trip, checked off at loading', status:'planned' },
      { name:'Dispatch scan log', desc:'QR scan per unit at the gate', status:'planned' },
      { name:'Installation & handover report', desc:'On-site completion, client sign-off, photos', status:'planned' },
      { name:'Snag list', desc:'Post-installation defects to resolve', status:'planned' },
    ],
  },
  {
    id:'labels', title:'Labels & Stickers',
    sub:'Physical tracking on pieces and units',
    reports:[
      { name:'Cut-piece labels', desc:'Per profile piece: job, design ref, member, length', status:'planned' },
      { name:'Unit labels (QR)', desc:'Per finished window/door: job + design ref + QR', status:'planned' },
      { name:'Glass panel labels', desc:'Per panel: size, glass type, section', status:'planned' },
      { name:'Crate / delivery labels', desc:'Per crate: contents, destination, handling', status:'planned' },
    ],
  },
  {
    id:'management', title:'Additional & Management',
    sub:'Business intelligence across all jobs',
    reports:[
      { name:'Sales register & conversion', desc:'Quotes issued vs won, by rep and product', status:'build' },
      { name:'Outstanding payments', desc:'Deposits and balances owed, by client', status:'planned' },
      { name:'Job costing (quoted vs actual)', desc:'Where jobs made or lost money', status:'planned' },
      { name:'Cycle-time report', desc:'Days per factory stage, bottleneck finder', status:'planned' },
      { name:'Utilization & waste trend', desc:'Material efficiency month over month', status:'planned' },
      { name:'Team performance', desc:'Jobs handled per rep/supervisor', status:'live' },
    ],
  },
]

export const REPORT_STATUS = {
  live:    { label:'Live',        tone:'green'  },
  build:   { label:'In build',    tone:'orange' },
  planned: { label:'Phase 2–3',   tone:'gray'   },
}

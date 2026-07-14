// ============================================================
// SOFAAMY PRODUCT CATALOG
// Product templates, opening types, glass, hardware, frame finishes.
// Prices in GHS (Ghana Cedi). Placeholder rates until Sofaamy confirms
// their real material list (see docs/CHECKLIST.md §A).
// ============================================================

export const PRODUCTS = [
  { id:'window',     name:'Window Frame',   maxPanels:4, defaults:{ w:1200, h:1200, panels:2, opening:'sliding'  }, openings:['fixed','casement','sliding','awning','louvre'] },
  { id:'door',       name:'Door Frame',     maxPanels:3, defaults:{ w:900,  h:2100, panels:1, opening:'single'   }, openings:['single','double','sliding','pivot'] },
  { id:'sliding',    name:'Sliding Door',   maxPanels:4, defaults:{ w:2400, h:2100, panels:2, opening:'sliding'  }, openings:['sliding'] },
  { id:'partition',  name:'Partition',      maxPanels:6, defaults:{ w:3000, h:2400, panels:4, opening:'fixed'    }, openings:['fixed','sliding'] },
  { id:'curtainwall',name:'Curtain Wall',   maxPanels:8, defaults:{ w:4000, h:3000, panels:6, opening:'fixed'    }, openings:['fixed'] },
  { id:'frameless',  name:'Frameless Glass',maxPanels:3, defaults:{ w:1500, h:2100, panels:2, opening:'fixed'    }, openings:['fixed','pivot'] },
  { id:'balustrade', name:'Balustrade',     maxPanels:6, defaults:{ w:3000, h:1100, panels:5, opening:'fixed'    }, openings:['fixed'] },
  { id:'canopy',     name:'Canopy',         maxPanels:4, defaults:{ w:3000, h:1200, panels:3, opening:'fixed'    }, openings:['fixed'] },
]

export const OPENINGS = {
  fixed:   { label:'Fixed',    hardware:80  },
  casement:{ label:'Casement', hardware:180 },
  sliding: { label:'Sliding',  hardware:240 },
  awning:  { label:'Awning',   hardware:200 },
  louvre:  { label:'Louvre',   hardware:320 },
  single:  { label:'Single Leaf', hardware:260 },
  double:  { label:'Double Leaf', hardware:420 },
  pivot:   { label:'Pivot',    hardware:520 },
}

// Openable-design library (EvA parity: "Openable Designs", "Tilt & Turn"…).
// Drag one INTO a section (or click with a section selected): the section
// becomes that arrangement — `panels` sashes of the given opening type.
export const OPENING_DESIGNS = [
  { group:'Openable Designs', items:[
    { id:'od-fixed',    label:'Fixed',            opening:'fixed',    panels:1 },
    { id:'od-casement', label:'Casement',         opening:'casement', panels:1 },
    { id:'od-cas2',     label:'Double Casement',  opening:'casement', panels:2 },
    { id:'od-awning',   label:'Awning',           opening:'awning',   panels:1 },
    { id:'od-louvre',   label:'Louvre',           opening:'louvre',   panels:1 },
    { id:'od-pivot',    label:'Pivot',            opening:'pivot',    panels:1 },
  ]},
  { group:'Sliding Designs', items:[
    { id:'od-slide2',   label:'Sliding 2-Panel',  opening:'sliding',  panels:2 },
    { id:'od-slide3',   label:'Sliding 3-Panel',  opening:'sliding',  panels:3 },
  ]},
  { group:'Door Designs', items:[
    { id:'od-door1',    label:'Single Door',      opening:'single',   panels:1 },
    { id:'od-door2',    label:'Double Door',      opening:'double',   panels:2 },
    { id:'od-slidedoor',label:'Sliding Door',     opening:'sliding',  panels:2 },
  ]},
]

export const openingDesignById = (id) => {
  for (const g of OPENING_DESIGNS) { const x = g.items.find(i => i.id === id); if (x) return x }
  return null
}

export const GLASS = {
  clear:    { label:'Clear',        price:120, fill:'#cfe6f2', opacity:0.55 },
  frosted:  { label:'Frosted',      price:160, fill:'#dde8ee', opacity:0.78 },
  tinted:   { label:'Tinted (Grey)',price:175, fill:'#7f94a3', opacity:0.5  },
  reflective:{label:'Reflective',   price:210, fill:'#9ec6c2', opacity:0.55 },
  tempered: { label:'Tempered',     price:230, fill:'#bcd9ea', opacity:0.6  },
  laminated:{ label:'Laminated',    price:275, fill:'#d0c8e0', opacity:0.6  },
  double:   { label:'Double Glazed',price:340, fill:'#c7e2ef', opacity:0.65 },
}

// Profile systems (per-design). PLACEHOLDER names — Sofaamy's real
// supplier/system list is a blocking input (see docs/SOFAAMY-QUESTIONS.md).
// EvA equivalent: per-section "Select System" (VEKA, SCHUCO, GULF EXTRUSION…).
export const SYSTEMS = {
  standard: { label:'Standard Aluminium' },
  heavy:    { label:'Heavy-Duty Series' },
  slim:     { label:'Slimline Series' },
}

// Surface finish types (EvA parity: powder coating, lamination,
// wood-finish coating, PVDF, anodized). Combined with FRAMES colour.
export const FINISH_TYPES = {
  powder:   { label:'Powder Coating' },
  anodized: { label:'Anodized' },
  pvdf:     { label:'PVDF Coating' },
  wood:     { label:'Wood-Finish Coating' },
  lamination:{ label:'Lamination' },
}

export const FRAMES = {
  mill:    { label:'Mill Finish',    color:'#aeb8c2' },
  white:   { label:'White',          color:'#eef1f4' },
  bronze:  { label:'Bronze',         color:'#7d5a1e' },
  black:   { label:'Matte Black',    color:'#2b2f33' },
  charcoal:{ label:'Charcoal Grey',  color:'#474d52' },
  wood:    { label:'Wood Grain',     color:'#6b4a2b' },
}

// ── Aluminium profiles ──
// Names + stock lengths confirmed from Sofaamy's cutting-optimizer screen
// (meeting 2026-07-10): MOLLIUM 5800, TRANSUM 5750, SASH 5700.
// Prices/m are PLACEHOLDERS until Sofaamy's material list arrives.
export const PROFILES = {
  mollium: { label:'Mollium',  role:'Vertical members (jambs, mullions)',   pricePerM:85, stockMm:5800 },
  transum: { label:'Transum',  role:'Horizontal members (head, sill, transoms)', pricePerM:85, stockMm:5750 },
  sash:    { label:'Sash',     role:'Opening-panel frames',                 pricePerM:95, stockMm:5700 },
  // curtain-wall sticks — PLACEHOLDER profile/prices pending Sofaamy's CW system
  cwmullion: { label:'CW Mullion', role:'Curtain wall vertical (continuous, anchored)', pricePerM:140, stockMm:5800 },
  cwtransom: { label:'CW Transom', role:'Curtain wall horizontal (between mullions)',   pricePerM:130, stockMm:5750 },
}

// Cutting parameters — PLACEHOLDERS, confirm with Sofaamy
// (see docs/CHECKLIST.md: kerf, min reusable offcut, mitre allowances)
export const CUTTING = {
  kerfMm: 5,        // material lost per saw cut
  minOffcutMm: 300, // shorter than this = scrap, not remnant
}

// Fabrication deduction rules — EVERY VALUE IS A PLACEHOLDER until
// Sofaamy's system specs arrive (docs/SOFAAMY-QUESTIONS.md §B9).
// Formulas:
//   outer frame (head/sill/jambs) → full size, mitred 45°/45°
//   mullion  = height − 2 × frameDepth   (butts between head & sill, 90°)
//   transom  = span   − 2 × frameDepth   (butts between verticals, 90°)
//   sliding sash W = sectionW/n + interlock/2 (panels overlap at interlock)
//   sash H         = sectionH − trackClear
//   glass (fixed)  = section − glassDeductFixed (each dimension)
//   glass (sash)   = sash size − glassDeductSash (each dimension)
export const FAB = {
  frameDepthMm: 50,       // outer frame profile depth
  interlockMm: 30,        // sliding-sash overlap at the meeting stile
  trackClearMm: 30,       // sash height clearance in the track
  glassDeductFixedMm: 70, // glass cut size vs section, fixed lite
  glassDeductSashMm: 60,  // glass cut size vs sash outer size
}

// ============================================================
// PRODUCT CATEGORIES — the three businesses Sofaamy runs
// (confirmed by their team, 2026-07-13). Each category has its
// own design library, fabrication model and document set.
// ============================================================
export const CATEGORIES = {
  frame:       { label:'Frame',        sub:'Aluminium windows, doors & framed partitions',   accent:'#1a5276' },
  frameless:   { label:'Frameless',    sub:'Toughened glass — entrances, showers, sliding',  accent:'#117a65' },
  curtainwall: { label:'Curtain Wall', sub:'Structural mullion/transom facades',             accent:'#6c3483' },
}

// ── FRAMELESS: toughened-glass panel products ──
// Glass ₵/m² are PLACEHOLDERS. Thickness drives weight:
// 2.5 kg per m² per mm (verified against Sofaamy's SmartGlazier
// print — 11.41 m² × 10 mm × 2.5 = 285.3 kg, matches).
export const FL_GLASS = {
  temp10:  { label:'10mm Clear Tempered',   thicknessMm:10, price:480, fill:'#cfe6f2', opacity:0.5 },
  temp12:  { label:'12mm Clear Tempered',   thicknessMm:12, price:620, fill:'#c3dfee', opacity:0.55 },
  temp8:   { label:'8mm Clear Tempered',    thicknessMm:8,  price:390, fill:'#d6ebf5', opacity:0.45 },
  frost10: { label:'10mm Frosted Tempered', thicknessMm:10, price:540, fill:'#dde8ee', opacity:0.8 },
  lam13:   { label:'13.52mm Clear Laminated',thicknessMm:13.52, price:750, fill:'#d0dcea', opacity:0.55 },
}

// Frameless hardware — codes, finishes and GHS unit prices are REAL:
// taken from Sofaamy's own SmartGlazier hardware list
// (images/sofaamy.pdf, job SGP/4462-26A "SWING DOOR 10MM CL").
// Items marked PLACEHOLDER are ours pending Sofaamy's catalog.
export const FL_HARDWARE = {
  'BL 203':        { desc:'Glass clamp (fixed panels)',            finish:'Stainless Steel', price:36 },
  'CSM-50W':       { desc:'Patch lock c/w floor strike',           finish:'Stainless Steel', price:185 },
  'JQ 104(900MM)': { desc:'Pull handle 900 mm, back-to-back pair', finish:'Stainless Steel', price:262 },
  'KL-HD 203-6':   { desc:'Floor spring / pivot set',              finish:'Stainless Steel', price:470 },
  'KL-M102/T':     { desc:'Bottom door patch',                     finish:'Stainless Steel', price:110 },
  'KL-M202':       { desc:'Top door patch',                        finish:'Stainless Steel', price:110 },
  'KL-M402':       { desc:'Over-panel / transom patch',            finish:'Stainless Steel', price:185 },
  'SH-90':         { desc:'Shower hinge, glass-to-wall — PLACEHOLDER code', finish:'Chrome', price:150 },
  'SH-KNOB':       { desc:'Shower knob / towel bar — PLACEHOLDER code',     finish:'Chrome', price:60 },
  'SL-ROLLER':     { desc:'Sliding roller set — PLACEHOLDER code', finish:'Stainless Steel', price:220 },
  'SL-TRACK':      { desc:'Top sliding track, per m — PLACEHOLDER code', finish:'Aluminium', price:180 },
  // swing-system alternatives from Sofaamy's frameless list (docs/reference/
  // frameless.docx): NON-DIGGING / SAN HE / SPIDER — prices PLACEHOLDER
  'ND-SET':        { desc:'Non-digging spring door set (top+bottom patch, no floor cut) — PLACEHOLDER price', finish:'Stainless Steel', price:690 },
  'SANHE-SET':     { desc:'San He patch fitting set — PLACEHOLDER price',   finish:'Stainless Steel', price:650 },
  'SPIDER-SET':    { desc:'Spider fitting door set — PLACEHOLDER price',    finish:'Stainless Steel', price:780 },
  'SCL SET':       { desc:'SCL sliding set — track, rollers, guides — PLACEHOLDER price', finish:'Stainless Steel', price:950 },
  'SH005 SET':     { desc:'SH005 sliding set — track, rollers, guides — PLACEHOLDER price', finish:'Stainless Steel', price:850 },
}

// Hardware set auto-attached per panel type (per leaf).
// Door set mirrors the SGP/4462-26A job exactly: bottom patch + top
// patch + floor spring + pull handle + patch lock (+ over-panel patch
// when an over-panel sits above the door).
export const FL_SETS = {
  fixed:  [['BL 203', 5]],
  door:   [['KL-M102/T', 1], ['KL-M202', 1], ['KL-HD 203-6', 1], ['JQ 104(900MM)', 1], ['CSM-50W', 1]],
  hinged: [['SH-90', 2], ['SH-KNOB', 1]],
  slider: [['SL-ROLLER', 1]],
}
export const FL_OVERPANEL_SET = [['BL 203', 2], ['KL-M402', 2]]

// ── Hardware SYSTEM options — from Sofaamy's frameless list
// (docs/reference/frameless.docx). Swing doors: NON-DIGGING / SAN HE /
// SPIDER / KL-PATCHES. Sliding: SCL SET / SH005. Each choice swaps the
// pivot/roller part of the per-leaf set; handle + lock stay.
// Only KL-Patches carries REAL prices (from job SGP/4462-26A).
export const FL_SYSTEMS = {
  klpatches:  { label:'KL Patches',            kinds:['door'],   set:[['KL-M102/T',1],['KL-M202',1],['KL-HD 203-6',1],['JQ 104(900MM)',1],['CSM-50W',1]] },
  nondigging: { label:'Non-Digging',           kinds:['door'],   set:[['ND-SET',1],['JQ 104(900MM)',1],['CSM-50W',1]] },
  sanhe:      { label:'San He',                kinds:['door'],   set:[['SANHE-SET',1],['JQ 104(900MM)',1],['CSM-50W',1]] },
  spider:     { label:'Spider',                kinds:['door'],   set:[['SPIDER-SET',1],['JQ 104(900MM)',1],['CSM-50W',1]] },
  scl:        { label:'SCL Set',               kinds:['slider'], set:[['SCL SET',1]] },
  sh005:      { label:'SH005',                 kinds:['slider'], set:[['SH005 SET',1]] },
  shower:     { label:'Shower Hinge Set',      kinds:['hinged'], set:[['SH-90',2],['SH-KNOB',1]] },
}
// which system choices apply to a leaf/slider panel type
export const FL_SYSTEM_CHOICES = {
  door:   ['klpatches','nondigging','sanhe','spider'],
  slider: ['scl','sh005'],
  hinged: ['shower'],
}

export const FL_PANEL_TYPES = {
  fixed:  { label:'Fixed Panel' },
  door:   { label:'Swing Door' },
  hinged: { label:'Hinged Door' },
  slider: { label:'Sliding Panel' },
}

// Frameless gap/deduction rules — DERIVED FROM SOFAAMY'S REAL JOB
// (SGP/4462-26A): fixed panel = bay − 5 · door leaf = bay − 8 ·
// panels stop 10 mm above floor · over-panel = height − floor gap
// − door height − 10 mm joint. Confirm as house standards.
export const FL_FAB = {
  jointMm: 5,        // fixed panel deduction per bay
  doorGapMm: 8,      // door leaf deduction per bay
  floorGapMm: 10,    // clearance above finished floor
  overGapMm: 10,     // joint between door top and over-panel
  slideOverlapMm: 50,   // slider overlaps adjacent fixed panel
  slideTrackMm: 60,     // slider height lost to top track
  defaultDoorH: 2100,   // door leaf height under an over-panel
  kgPerM2PerMm: 2.5,    // glass weight rule (verified vs their print)
}

// ── CURTAIN WALL: stick-system constants ──
// PLACEHOLDER values pending Sofaamy's curtain-wall system specs.
export const CW_CELL_TYPES = {
  vision:   { label:'Vision Glass',   fill:'#9ec6d8', opacity:0.55 },
  spandrel: { label:'Spandrel Panel', fill:'#3b4652', opacity:0.92 },
  vent:     { label:'Openable Vent',  fill:'#bcd9ea', opacity:0.5 },
}
export const CW_FAB = {
  mullionFaceMm: 50,     // transom cut = bay − mullion face
  glassDeductMm: 20,     // glass/spandrel cut vs bay, each dimension
  pressurePlatePerM: 35, // GHS/m — pressure plate + cover cap
  gasketPerM: 12,        // GHS/m — EPDM inner+outer
  anchorEach: 120,       // GHS per slab bracket
  ventHardware: 260,     // GHS per openable vent (top-hung set)
  spandrelPerM2: 260,    // GHS/m² — back-painted glass / ACP infill
}

// Material rates that feed the pricing engine (GHS)
export const RATES = {
  profilePerMetre: 85,   // aluminium profile, GHS / m
  labourPerM2:     95,   // GHS / m²
  marginPercent:   20,   // markup %
  installPerM2:    45,   // installation, GHS / m²
}

export const productById = (id) => PRODUCTS.find(p => p.id === id) || PRODUCTS[0]

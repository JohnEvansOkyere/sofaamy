// ============================================================
// FRAMELESS (structural toughened glass) — design model + engine.
// A frameless design is a RUN OF GLASS PANELS across a void
// (fixed | swing door | hinged door | slider), with an optional
// over-panel band above the door leaves — the SmartGlazier model,
// reverse-engineered from Sofaamy's own job SGP/4462-26A.
// Panel cut sizes come from the void minus gap allowances; every
// panel auto-carries its compatible hardware set (real codes).
// ============================================================
import { FL_GLASS, FL_FAB, FL_SETS, FL_SYSTEMS, FL_OVERPANEL_SET, FL_HARDWARE, RATES } from './products.js'

// ── DESIGN LIBRARY — Sofaamy's OWN frameless product list, verbatim
// from docs/reference/frameless.docx (received 2026-07-14).
// Three system families: Hinged (shower hinges) · Sliding (SCL SET /
// SH005) · Swing (Non-Digging / San He / Spider / KL-Patches).
// `overPanel` = FANLIGHT · `cornerAfter` = L-shape (panels after that
// index sit on the return wall) · `scene` drives the realistic 3D view.
export const FL_GROUPS = [
  { group:'Hinged Systems', items:[
    { id:'fl-h1', name:'Single Door + Side Fix',                    use:'Shower',             panels:['hinged','fixed'],                w:1400, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom' },
    { id:'fl-h2', name:'Door in Middle, Fix Both Sides',            use:'Shower',             panels:['fixed','hinged','fixed'],        w:2000, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom' },
    { id:'fl-h3', name:'Double Hinged Doors',                       use:'Shopfront',          panels:['hinged','hinged'],               w:1800, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-h4', name:'Double Hinged Doors + Fanlight',            use:'Shopfront',          panels:['hinged','hinged'],               w:1800, h:2800, overPanel:true,  scene:'shopfront' },
    { id:'fl-h5', name:'Double Hinged Doors + Side Fixes',          use:'Shopfront & Shower', panels:['fixed','hinged','hinged','fixed'],w:3200, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-h6', name:'Double Hinged + Side Fixes + Fanlight',     use:'Shopfront',          panels:['fixed','hinged','hinged','fixed'],w:3200, h:2800, overPanel:true,  scene:'shopfront' },
    { id:'fl-h7', name:'Single Hinged Door + Side Fix',             use:'Shopfront',          panels:['fixed','hinged'],                w:1600, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-h8', name:'L-Shape Hinged Door + Fixed',               use:'Shower & Shopfront', panels:['hinged','fixed'],                w:1700, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom', cornerAfter:0 },
  ]},
  { group:'Sliding Systems', items:[
    { id:'fl-s1', name:'Single Sliding Door + Fix',                 use:'SCL Set / SH005',    panels:['fixed','slider'],                w:2000, h:2100, overPanel:false, scene:'shopfront', slideSystem:'scl' },
    { id:'fl-s2', name:'L-Shape Sliding Shower',                    use:'SCL Set / SH005',    panels:['fixed','slider','fixed'],        w:2400, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom', slideSystem:'scl', cornerAfter:1 },
    { id:'fl-s3', name:'Single Sliding Shower + Side Fixes',        use:'SCL Set / SH005',    panels:['fixed','slider','fixed'],        w:2200, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom', slideSystem:'scl' },
    { id:'fl-s4', name:'Double Sliding Shower + Side Fixes',        use:'SCL Set / SH005',    panels:['fixed','slider','slider','fixed'],w:2800, h:2000, overPanel:false, glassId:'temp8',  scene:'bathroom', slideSystem:'scl' },
    { id:'fl-s5', name:'Double Sliding + Side Fixes — Shopfront',   use:'SCL Set / SH005',    panels:['fixed','slider','slider','fixed'],w:4200, h:2530, overPanel:false, scene:'shopfront', slideSystem:'scl' },
    { id:'fl-s6', name:'Single Sliding + Side Fixes — Shopfront',   use:'SCL Set / SH005',    panels:['fixed','slider','fixed'],        w:3200, h:2530, overPanel:false, scene:'shopfront', slideSystem:'scl' },
    { id:'fl-s7', name:'Double Sliding + Side Fixes + Fanlight',    use:'SCL Set / SH005',    panels:['fixed','slider','slider','fixed'],w:4200, h:2900, overPanel:true,  scene:'shopfront', slideSystem:'scl' },
    { id:'fl-s8', name:'Single Sliding + Side Fixes + Fanlight',    use:'SCL Set / SH005',    panels:['fixed','slider','fixed'],        w:3200, h:2900, overPanel:true,  scene:'shopfront', slideSystem:'scl' },
  ]},
  { group:'Swing Door Systems', items:[
    { id:'fl-w1', name:'Single Swing Door',                         use:'Non-Digging / San He / Spider / KL', panels:['door'],                          w:1000, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-w2', name:'Double Swing Doors',                        use:'Non-Digging / San He / Spider / KL', panels:['door','door'],                   w:1900, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-w3', name:'Single Swing Door + Side Fix',              use:'Non-Digging / San He / Spider / KL', panels:['fixed','door'],                  w:2000, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-w4', name:'Door in Middle + Side Fixes',               use:'Non-Digging / San He / Spider / KL', panels:['fixed','door','fixed'],          w:2800, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-w5', name:'Double Doors in Middle + Side Fixes',       use:'Non-Digging / San He / Spider / KL', panels:['fixed','door','door','fixed'],   w:3600, h:2530, overPanel:false, scene:'shopfront' },
    { id:'fl-w6', name:'Double Doors + Side Fixes + Fanlight',      use:'Non-Digging / San He / Spider / KL', panels:['fixed','door','door','fixed'],   w:4560, h:2530, overPanel:true,  scene:'shopfront' },
    { id:'fl-w7', name:'Single Door + Fanlight',                    use:'Non-Digging / San He / Spider / KL', panels:['door'],                          w:1000, h:2800, overPanel:true,  scene:'shopfront' },
    { id:'fl-w8', name:'Single Door + Side Fix + Fanlight',         use:'Non-Digging / San He / Spider / KL', panels:['fixed','door'],                  w:2000, h:2800, overPanel:true,  scene:'shopfront' },
    { id:'fl-w9', name:'L-Shape Swing Door + Fix',                  use:'Non-Digging / San He / Spider / KL', panels:['door','fixed'],                  w:2000, h:2400, overPanel:false, scene:'shopfront', cornerAfter:0 },
  ]},
  { group:'Partitions & Balustrades', items:[
    { id:'fl-part3',  name:'Partition — 3 Fixed', use:'Office', panels:['fixed','fixed','fixed'],        w:3600, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-part4',  name:'Partition — 4 Fixed', use:'Office', panels:['fixed','fixed','fixed','fixed'],w:4800, h:2400, overPanel:false, scene:'shopfront' },
    { id:'fl-balust', name:'Balustrade Run',      use:'Terrace',panels:['fixed','fixed','fixed'],        w:3000, h:1100, overPanel:false, glassId:'temp12', scene:'shopfront' },
  ]},
]

export const flTemplateById = (id) => {
  for (const g of FL_GROUPS) { const t = g.items.find(i => i.id === id); if (t) return { ...t, group:g.group } }
  return null
}

const equalSplit = (total, n) => {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => i < n - 1 ? base : total - base * (n - 1))
}

export function buildFrameless(t) {
  return { category:'frameless', templateId:t.id, name:t.name, group:t.group,
    ref:'', qty:1, location:'',
    clientPhone:'', clientEmail:'', jobDescription:'', colourDescription:'', quoteValidDays:3, costFloorOverride:0,
    accessoryOverrides:[], customCutPieces:[], siteImages:[],
    glassId:t.glassId || 'temp10', frame:'mill', system:'standard', finishType:'powder',
    width:t.w, height:t.h,
    cols:t.panels.length, rows:1,
    colWidths: equalSplit(t.w, t.panels.length), rowHeights:[t.h],
    // cells carry the panel type so grid helpers (moveDivider etc.) work
    cells: t.panels.map(type => ({ type, glass:'clear', opening:'fixed', panels:1 })),
    overPanel: !!t.overPanel, doorH: FL_FAB.defaultDoorH,
    flSystem: t.flSystem || 'klpatches',      // swing-door hardware system
    slideSystem: t.slideSystem || 'scl',      // sliding hardware system
    cornerAfter: t.cornerAfter ?? -1,         // L-shape: last bay index on the main wall (-1 = straight run)
    scene: t.scene || 'shopfront',            // realistic 3D context
  }
}

const isLeaf = (ty) => ty === 'door' || ty === 'hinged'

// hardware set for a panel, honouring the design's system choices
export function flPanelSet(d, ty) {
  if (ty === 'door')   return FL_SYSTEMS[d.flSystem]?.set || FL_SETS.door
  if (ty === 'slider') return FL_SYSTEMS[d.slideSystem]?.set || FL_SETS.slider
  return FL_SETS[ty] || FL_SETS.fixed
}

// ── PANEL SCHEDULE: cut sizes, weights, holes, hardware — per unit ──
// This is the glass-order content (SmartGlazier's killer output).
export function framelessBreakdown(d) {
  const g = FL_GLASS[d.glassId] || FL_GLASS.temp10
  const F = FL_FAB
  const panels = []
  const hw = {}
  const addHw = (set) => set.forEach(([code, n]) => { hw[code] = (hw[code] || 0) + n })

  const fullH = d.height - F.floorGapMm
  // FANLIGHT (over-panel) spans the leaf bays — or the slider bays on
  // sliding-with-fanlight systems (Sofaamy's list has both).
  const leafIdx = d.cells.map((c, i) => isLeaf(c.type) ? i : -1).filter(i => i >= 0)
  const sliderIdx = d.cells.map((c, i) => c.type === 'slider' ? i : -1).filter(i => i >= 0)
  const overIdx = d.overPanel ? (leafIdx.length ? leafIdx : sliderIdx) : []
  const hasOver = overIdx.length > 0
  const leafH = hasOver ? d.doorH : fullH - F.jointMm  // no fanlight: leaf stops jointMm below head
  let markN = 0

  d.cells.forEach((cell, i) => {
    const bay = d.colWidths[i % d.cols]
    const ty = cell.type || 'fixed'
    if (ty === 'fixed') {
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay - F.jointMm), hMm:Math.round(fullH),
        holes:'4 × ø18 corner + 1 × ø18 mid (clamps)', edge:'Flat Polish 2 Long 2 Short' })
      addHw(flPanelSet(d, ty))
    } else if (isLeaf(ty)) {
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay - F.doorGapMm), hMm:Math.round(hasOver ? d.doorH : leafH),
        holes: ty === 'door'
          ? '2 × ø16 handle · patch cutouts top+bottom (templates) · lock notch 80×60'
          : '2 hinge cutouts · 1 × ø12 knob',
        edge:'Flat Polish 2 Long 2 Short' })
      addHw(flPanelSet(d, ty))
    } else { // slider — under a fanlight the track hangs from the over-panel joint
      const slideH = (hasOver && overIdx.includes(i) ? d.doorH : fullH) - F.slideTrackMm
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay + F.slideOverlapMm), hMm:Math.round(slideH),
        holes:'2 × ø14 roller fixings', edge:'Flat Polish 2 Long 2 Short' })
      addHw(flPanelSet(d, ty))
    }
  })

  if (hasOver) {
    const span = overIdx.reduce((s, i) => s + d.colWidths[i % d.cols], 0)
    const overH = d.height - F.floorGapMm - d.doorH - F.overGapMm
    if (overH > 60) {
      panels.push({ mark:`TRN1`, type:'over', wMm:Math.round(span - F.jointMm * 2), hMm:Math.round(overH),
        holes:'2 × ø18 clamps top · 2 patch cutouts bottom corners', edge:'Flat Polish 2 Long 2 Short' })
      addHw(FL_OVERPANEL_SET)
    }
  }

  const kg = (p) => +(p.wMm * p.hMm / 1e6 * g.thicknessMm * F.kgPerM2PerMm).toFixed(1)
  panels.forEach(p => { p.kg = kg(p); p.areaM2 = +(p.wMm * p.hMm / 1e6).toFixed(2) })

  const hardware = Object.entries(hw).filter(([, n]) => n > 0).map(([code, n]) => ({
    code, qty:n, ...FL_HARDWARE[code] }))
  const totalArea = +panels.reduce((s, p) => s + p.areaM2, 0).toFixed(2)
  const totalKg = +panels.reduce((s, p) => s + p.kg, 0).toFixed(1)
  return { panels, hardware, glass:g, totalArea, totalKg, overIdx }
}

// ── QUOTE (GHS) — same line structure as the frame engine ──
export function calcFramelessQuote(d) {
  const bd = framelessBreakdown(d)
  const qty = d.qty || 1
  const area = bd.totalArea

  const glassCost = area * bd.glass.price
  const hardwareCost = bd.hardware.reduce((s, h) => s + h.qty * h.price, 0)
  const processing = bd.panels.length * 55        // holes/cutouts/polish per panel — PLACEHOLDER rate
  const labourCost = area * RATES.labourPerM2
  const installCost = area * RATES.installPerM2

  const subtotal = glassCost + hardwareCost + processing + labourCost + installCost
  const margin = subtotal * (RATES.marginPercent / 100)
  const total = subtotal + margin

  return {
    area, sections:bd.panels.length, dividers:0, profileLen:0,
    pieces:[], pieceCount:0, totalKg:bd.totalKg,
    qty, grandTotal:+(total * qty).toFixed(2),
    lines:[
      { key:`Glass — ${bd.glass.label}`, detail:`${area.toFixed(2)} m² · ${bd.panels.length} panel(s) · ${bd.totalKg} kg`, amount:glassCost },
      { key:'Hardware & fittings', detail:bd.hardware.map(h => `${h.qty}× ${h.code}`).join(' · ') || '—', amount:hardwareCost },
      { key:'Processing — holes, cutouts, polish', detail:`${bd.panels.length} panel(s)`, amount:processing },
      { key:'Fabrication labour', detail:`${area.toFixed(2)} m² × ₵${RATES.labourPerM2}/m²`, amount:labourCost },
      { key:'Installation', detail:`${area.toFixed(2)} m² × ₵${RATES.installPerM2}/m²`, amount:installCost },
    ],
    subtotal:+subtotal.toFixed(2), margin:+margin.toFixed(2),
    marginPct:RATES.marginPercent, total:+total.toFixed(2),
    internalFloor:+(subtotal * qty).toFixed(2), calculatedInternalFloor:+(subtotal * qty).toFixed(2),
    costFloorOverride:0, costFloorSource:'working estimate', clientNet:+(total * qty).toFixed(2),
    floorGap:+(margin * qty).toFixed(2), floorStatus:'OK',
  }
}

export function framelessBOM(d) {
  const bd = framelessBreakdown(d)
  const rows = bd.panels.map(p => ({
    item:`Glass ${p.mark} — ${bd.glass.label}`,
    qty:`${p.wMm} × ${p.hMm}`,
    note:`${p.kg} kg · ${p.type === 'over' ? 'over-panel' : p.type}`,
  }))
  bd.hardware.forEach(h => rows.push({ item:`${h.code}`, qty:`${h.qty} pcs`, note:`${h.desc} · ${h.finish} · ₵${h.price}` }))
  rows.push({ item:'Silicone & setting blocks', qty:`${bd.panels.length} joint set(s)`, note:'Neutral cure' })
  return rows
}

// ============================================================
// FRAMELESS (structural toughened glass) — design model + engine.
// A frameless design is a RUN OF GLASS PANELS across a void
// (fixed | swing door | hinged door | slider), with an optional
// over-panel band above the door leaves — the SmartGlazier model,
// reverse-engineered from Sofaamy's own job SGP/4462-26A.
// Panel cut sizes come from the void minus gap allowances; every
// panel auto-carries its compatible hardware set (real codes).
// ============================================================
import { FL_GLASS, FL_FAB, FL_SETS, FL_OVERPANEL_SET, FL_HARDWARE, RATES } from './products.js'

export const FL_GROUPS = [
  { group:'Glass Entrances', items:[
    { id:'fl-door1',    name:'Single Swing Door',            panels:['door'],                        w:1000, h:2400, overPanel:false },
    { id:'fl-door2',    name:'Double Swing Door',            panels:['door','door'],                 w:1900, h:2530, overPanel:true },
    { id:'fl-doorside', name:'Door + Side Panel',            panels:['fixed','door'],                w:2100, h:2530, overPanel:true },
    { id:'fl-shopfront',name:'Shopfront — Sides + 2 Doors',  panels:['fixed','door','door','fixed'], w:4560, h:2530, overPanel:true },
  ]},
  { group:'Sliding & Partitions', items:[
    { id:'fl-slide1',   name:'Slider + Fixed',               panels:['fixed','slider'],              w:2400, h:2400, overPanel:false },
    { id:'fl-slide2',   name:'Double Slider',                panels:['fixed','slider','slider','fixed'], w:3600, h:2400, overPanel:false },
    { id:'fl-part3',    name:'Partition — 3 Fixed',          panels:['fixed','fixed','fixed'],       w:3600, h:2400, overPanel:false },
    { id:'fl-part4',    name:'Partition — 4 Fixed',          panels:['fixed','fixed','fixed','fixed'], w:4800, h:2400, overPanel:false },
  ]},
  { group:'Shower Cubicles', items:[
    { id:'fl-sh-door',  name:'Hinged Shower Door',           panels:['hinged'],                      w:800,  h:2000, overPanel:false, glassId:'temp8' },
    { id:'fl-sh-inline',name:'Inline — Panel + Door',        panels:['fixed','hinged'],              w:1500, h:2000, overPanel:false, glassId:'temp8' },
    { id:'fl-sh-3',     name:'Inline — Panel · Door · Panel',panels:['fixed','hinged','fixed'],      w:2000, h:2000, overPanel:false, glassId:'temp8' },
    { id:'fl-sh-slide', name:'Sliding Shower',               panels:['fixed','slider'],              w:1500, h:2000, overPanel:false, glassId:'temp8' },
  ]},
  { group:'Balustrades', items:[
    { id:'fl-balust',   name:'Balustrade Run',               panels:['fixed','fixed','fixed'],       w:3000, h:1100, overPanel:false, glassId:'temp12' },
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
    glassId:t.glassId || 'temp10', frame:'mill', system:'standard', finishType:'powder',
    width:t.w, height:t.h,
    cols:t.panels.length, rows:1,
    colWidths: equalSplit(t.w, t.panels.length), rowHeights:[t.h],
    // cells carry the panel type so grid helpers (moveDivider etc.) work
    cells: t.panels.map(type => ({ type, glass:'clear', opening:'fixed', panels:1 })),
    overPanel: !!t.overPanel, doorH: FL_FAB.defaultDoorH,
  }
}

const isLeaf = (ty) => ty === 'door' || ty === 'hinged'

// ── PANEL SCHEDULE: cut sizes, weights, holes, hardware — per unit ──
// This is the glass-order content (SmartGlazier's killer output).
export function framelessBreakdown(d) {
  const g = FL_GLASS[d.glassId] || FL_GLASS.temp10
  const F = FL_FAB
  const panels = []
  const hw = {}
  const addHw = (set) => set.forEach(([code, n]) => { hw[code] = (hw[code] || 0) + n })

  const fullH = d.height - F.floorGapMm
  // over-panel applies over the contiguous run of leaf bays
  const leafIdx = d.cells.map((c, i) => isLeaf(c.type) ? i : -1).filter(i => i >= 0)
  const hasOver = d.overPanel && leafIdx.length > 0
  const leafH = hasOver ? d.doorH : fullH - F.jointMm  // no over-panel: leaf stops jointMm below head
  let markN = 0

  d.cells.forEach((cell, i) => {
    const bay = d.colWidths[i % d.cols]
    const ty = cell.type || 'fixed'
    if (ty === 'fixed') {
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay - F.jointMm), hMm:Math.round(fullH),
        holes:'4 × ø18 corner + 1 × ø18 mid (clamps)', edge:'Flat Polish 2 Long 2 Short' })
      addHw(FL_SETS.fixed)
    } else if (isLeaf(ty)) {
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay - F.doorGapMm), hMm:Math.round(hasOver ? d.doorH : leafH),
        holes: ty === 'door'
          ? '2 × ø16 handle · patch cutouts top+bottom (templates) · lock notch 80×60'
          : '2 hinge cutouts · 1 × ø12 knob',
        edge:'Flat Polish 2 Long 2 Short' })
      addHw(FL_SETS[ty])
    } else { // slider
      panels.push({ mark:`P${++markN}`, type:ty, wMm:Math.round(bay + F.slideOverlapMm), hMm:Math.round(fullH - F.slideTrackMm),
        holes:'2 × ø14 roller fixings', edge:'Flat Polish 2 Long 2 Short' })
      addHw(FL_SETS.slider)
    }
  })

  if (hasOver) {
    const span = leafIdx.reduce((s, i) => s + d.colWidths[i % d.cols], 0)
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
  return { panels, hardware, glass:g, totalArea, totalKg }
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

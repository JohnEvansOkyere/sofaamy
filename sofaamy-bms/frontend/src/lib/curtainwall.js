// ============================================================
// CURTAIN WALL (stick system) — design model + engine.
// A curtain wall is a mullion/transom grid hung on the slab:
// MULLIONS run CONTINUOUS full height (anchored per floor),
// TRANSOMS are cut between them — the opposite joint hierarchy
// to a window frame. Cells are vision glass, spandrel panels
// (hide slab edges/services) or openable vents. Glass is held
// by pressure plates masked with cover caps.
// ============================================================
import { PROFILES, CW_FAB, CW_CELL_TYPES, GLASS, RATES } from './products.js'

export const CW_GROUPS = [
  { group:'Facade Grids', items:[
    { id:'cw-2x2', name:'Grid 2 × 2',            cols:2, rows:2, w:3000, h:3200 },
    { id:'cw-3x3', name:'Grid 3 × 3',            cols:3, rows:3, w:4200, h:3600 },
    { id:'cw-4x3', name:'Grid 4 × 3',            cols:4, rows:3, w:5600, h:3600 },
    { id:'cw-shop',name:'Shopfront Facade 4 × 2',cols:4, rows:2, w:5600, h:3000 },
  ]},
  { group:'With Spandrel Band', items:[
    { id:'cw-sp-top', name:'Spandrel Top Band',    cols:3, rows:3, w:4200, h:3600, spandrelRows:[0] },
    { id:'cw-sp-both',name:'Spandrel Top + Bottom',cols:3, rows:4, w:4200, h:4000, spandrelRows:[0, 3] },
  ]},
]

export const cwTemplateById = (id) => {
  for (const g of CW_GROUPS) { const t = g.items.find(i => i.id === id); if (t) return { ...t, group:g.group } }
  return null
}

const equalSplit = (total, n) => {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => i < n - 1 ? base : total - base * (n - 1))
}

export function buildCurtainWall(t) {
  const cells = []
  for (let r = 0; r < t.rows; r++)
    for (let c = 0; c < t.cols; c++)
      cells.push({ type:(t.spandrelRows || []).includes(r) ? 'spandrel' : 'vision',
        glass:'reflective', opening:'fixed', panels:1 })
  return { category:'curtainwall', templateId:t.id, name:t.name, group:t.group,
    ref:'', qty:1, location:'',
    clientPhone:'', clientEmail:'', jobDescription:'', colourDescription:'', quoteValidDays:3, costFloorOverride:0,
    accessoryOverrides:[], customCutPieces:[], siteImages:[],
    frame:'mill', system:'standard', finishType:'powder',
    width:t.w, height:t.h, cols:t.cols, rows:t.rows,
    colWidths: equalSplit(t.w, t.cols), rowHeights: equalSplit(t.h, t.rows),
    cells }
}

export const cwCell = () => ({ type:'vision', glass:'reflective', opening:'fixed', panels:1 })

// ── FABRICATION BREAKDOWN — per unit (bay). Feeds the same
// cutting optimizer as framed work: that's the one-spine story. ──
export function cwBreakdown(d) {
  const cw = d.colWidths?.length === d.cols ? d.colWidths : Array.from({ length:d.cols }, () => d.width / d.cols)
  const profiles = [], glass = []
  const P = (position, profile, member, lengthMm, qty, cuts) =>
    profiles.push({ position, profile, member, lengthMm:Math.round(lengthMm), qty, cuts })

  // mullions: continuous, full height, one per grid line incl. both edges
  P('Mullions (all grid lines)', 'cwmullion', 'Mullion', d.height, d.cols + 1, '90°/90°')
  // transoms: every horizontal line (incl. head & sill), cut between mullions
  for (let c = 0; c < d.cols; c++)
    P(`Transoms — bay ${c + 1} (× ${d.rows + 1} lines)`, 'cwtransom', 'Transom',
      cw[c] - CW_FAB.mullionFaceMm, d.rows + 1, '90°/90°')

  const rh = d.rowHeights?.length === d.rows ? d.rowHeights : Array.from({ length:d.rows }, () => d.height / d.rows)
  d.cells.forEach((cell, i) => {
    const bayW = cw[i % d.cols], bayH = rh[Math.floor(i / d.cols)]
    const t = CW_CELL_TYPES[cell.type] ? cell.type : 'vision'
    glass.push({ section:`B${i + 1}`, glass:cell.glass, type:t,
      wMm:Math.round(bayW - CW_FAB.glassDeductMm), hMm:Math.round(bayH - CW_FAB.glassDeductMm),
      qty:1, note:CW_CELL_TYPES[t].label.toLowerCase() })
  })
  return { profiles, glass }
}

// ── QUOTE (GHS) ──
export function calcCurtainWallQuote(d) {
  const bd = cwBreakdown(d)
  const qty = d.qty || 1
  const area = (d.width / 1000) * (d.height / 1000)

  const metres = {}
  bd.profiles.forEach(p => { metres[p.profile] = (metres[p.profile] || 0) + p.lengthMm * p.qty / 1000 })
  const gridLen = Object.values(metres).reduce((s, m) => s + m, 0)
  const profileCost = Object.entries(metres).reduce((s, [id, m]) => s + m * (PROFILES[id]?.pricePerM ?? 130), 0)
  const plateCost = gridLen * CW_FAB.pressurePlatePerM
  const gasketCost = gridLen * CW_FAB.gasketPerM

  let visionCost = 0, spandrelCost = 0, ventCount = 0, visionArea = 0, spandrelArea = 0
  bd.glass.forEach(g => {
    const a = g.wMm * g.hMm / 1e6
    if (g.type === 'spandrel') { spandrelCost += a * CW_FAB.spandrelPerM2; spandrelArea += a }
    else {
      visionCost += a * (GLASS[g.glass]?.price ?? 210); visionArea += a
      if (g.type === 'vent') ventCount++
    }
  })
  const ventCost = ventCount * CW_FAB.ventHardware
  const anchorCost = (d.cols + 1) * 2 * CW_FAB.anchorEach
  const labourCost = area * RATES.labourPerM2
  const installCost = area * RATES.installPerM2 * 1.5   // facade access premium — PLACEHOLDER

  const subtotal = profileCost + plateCost + gasketCost + visionCost + spandrelCost + ventCost + anchorCost + labourCost + installCost
  const margin = subtotal * (RATES.marginPercent / 100)
  const total = subtotal + margin
  const pieceCount = bd.profiles.reduce((s, p) => s + p.qty, 0)

  return {
    area:+area.toFixed(2), sections:d.cols * d.rows, dividers:(d.cols - 1) + (d.rows - 1),
    profileLen:+gridLen.toFixed(2), pieces:[], pieceCount,
    qty, grandTotal:+(total * qty).toFixed(2),
    lines:[
      { key:'Aluminium grid — mullions & transoms', detail:`${gridLen.toFixed(2)} m · ${pieceCount} pieces`, amount:profileCost },
      { key:'Pressure plates & cover caps', detail:`${gridLen.toFixed(2)} m`, amount:plateCost + gasketCost },
      { key:'Vision glass', detail:`${visionArea.toFixed(2)} m²`, amount:visionCost },
      ...(spandrelArea > 0 ? [{ key:'Spandrel panels', detail:`${spandrelArea.toFixed(2)} m²`, amount:spandrelCost }] : []),
      ...(ventCount > 0 ? [{ key:'Openable vents', detail:`${ventCount} vent(s)`, amount:ventCost }] : []),
      { key:'Slab anchors & brackets', detail:`${(d.cols + 1) * 2} bracket(s)`, amount:anchorCost },
      { key:'Fabrication & installation', detail:`${area.toFixed(2)} m² (facade access incl.)`, amount:labourCost + installCost },
    ],
    subtotal:+subtotal.toFixed(2), margin:+margin.toFixed(2),
    marginPct:RATES.marginPercent, total:+total.toFixed(2),
    internalFloor:+(subtotal * qty).toFixed(2), calculatedInternalFloor:+(subtotal * qty).toFixed(2),
    costFloorOverride:0, costFloorSource:'working estimate', clientNet:+(total * qty).toFixed(2),
    floorGap:+(margin * qty).toFixed(2), floorStatus:'OK',
  }
}

export function curtainWallBOM(d) {
  const bd = cwBreakdown(d)
  const metres = {}
  bd.profiles.forEach(p => { metres[p.profile] = (metres[p.profile] || 0) + p.lengthMm * p.qty / 1000 })
  const rows = Object.entries(metres).map(([id, m]) => ({
    item:`Profile — ${PROFILES[id]?.label || id}`, qty:`${m.toFixed(2)} m`, note:PROFILES[id]?.role || '—' }))
  const gridLen = Object.values(metres).reduce((s, m) => s + m, 0)
  const byType = {}
  bd.glass.forEach(g => { byType[g.type] = (byType[g.type] || 0) + 1 })
  Object.entries(byType).forEach(([t, n]) =>
    rows.push({ item:CW_CELL_TYPES[t].label, qty:`${n} bay(s)`, note:t === 'spandrel' ? 'Back-painted glass / ACP' : '—' }))
  rows.push({ item:'Pressure plates + cover caps', qty:`${gridLen.toFixed(2)} m`, note:'Punched for drainage' })
  rows.push({ item:'EPDM gaskets (inner + outer)', qty:`${(gridLen * 2).toFixed(2)} m`, note:'—' })
  rows.push({ item:'Slab anchors', qty:`${(d.cols + 1) * 2} pcs`, note:'Serrated bracket + halfen channel' })
  return rows
}

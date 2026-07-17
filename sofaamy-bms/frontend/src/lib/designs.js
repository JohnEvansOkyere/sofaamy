// ============================================================
// DESIGN LIBRARY — grouped shape templates for the drag-and-drop
// configurator. A design is a framed grid split by dividers into
// sections (cells); each section carries its own glass + opening.
// ============================================================

import { frameSystemForTemplate, frameRateForRateKey, frameRateKeyForOpening } from './frameCatalog.js'

export const DESIGN_GROUPS = [
  { group:'Windows', items:[
    { id:'w-fixed',   name:'Fixed',            cols:1, rows:1, opening:'fixed',    w:1200, h:1200 },
    { id:'w-casement',name:'Casement',         cols:1, rows:1, opening:'casement', w:1200, h:1200 },
    { id:'w-slider2', name:'2-Panel Slider',   cols:2, rows:1, opening:'sliding',  w:1800, h:1200 },
    { id:'w-3panel',  name:'3-Panel',          cols:3, rows:1, opening:'sliding',  w:2400, h:1200 },
    { id:'w-transom', name:'Window + Transom', cols:1, rows:2, opening:'casement', w:1200, h:1500 },
    { id:'w-awning',  name:'Awning',           cols:1, rows:1, opening:'awning',   w:1200, h:900  },
  ]},
  { group:'Doors', items:[
    { id:'d-single',  name:'Single Door',      cols:1, rows:1, opening:'single',   w:900,  h:2100 },
    { id:'d-double',  name:'Double Door',      cols:2, rows:1, opening:'double',   w:1600, h:2100 },
    { id:'d-side',    name:'Door + Sidelight', cols:2, rows:1, opening:'single',   w:1500, h:2100 },
    { id:'d-slide',   name:'Sliding Door',     cols:2, rows:1, opening:'sliding',  w:2400, h:2100 },
  ]},
  { group:'Partitions & Walls', items:[
    { id:'p-2x2',     name:'2 × 2 Grid',       cols:2, rows:2, opening:'fixed',    w:2000, h:2000 },
    { id:'p-3x2',     name:'3 × 2 Grid',       cols:3, rows:2, opening:'fixed',    w:3000, h:2000 },
    { id:'p-part',    name:'Partition',        cols:4, rows:1, opening:'fixed',    w:3600, h:2400 },
  ]},
  { group:'Special', items:[
    { id:'s-canopy',  name:'Canopy',           cols:3, rows:1, opening:'fixed',    w:3000, h:1200 },
  ]},
]
// (Frameless and Curtain Wall live in their own categories now —
// see lib/frameless.js and lib/curtainwall.js.)

export const templateById = (id) => {
  for (const g of DESIGN_GROUPS) { const t = g.items.find(i => i.id === id); if (t) return { ...t, group:g.group } }
  return null
}

const makeCells = (cols, rows, opening, rateKey) =>
  Array.from({ length: cols * rows }, () => ({
    glass:'5CF', opening, panels:1,
    itemQty:1,
    rateKey: rateKey || frameRateKeyForOpening(opening),
    ratePerM2: frameRateForRateKey(rateKey || frameRateKeyForOpening(opening)),
  }))

// Divider layout library (EvA parity, image 3): click to re-split the frame.
export const DIVIDER_LAYOUTS = [
  { id:'dv-1',   label:'Single',        cols:1, rows:1 },
  { id:'dv-2v',  label:'2 Vertical',    cols:2, rows:1 },
  { id:'dv-3v',  label:'3 Vertical',    cols:3, rows:1 },
  { id:'dv-4v',  label:'4 Vertical',    cols:4, rows:1 },
  { id:'dv-2h',  label:'2 Horizontal',  cols:1, rows:2 },
  { id:'dv-3h',  label:'3 Horizontal',  cols:1, rows:3 },
  { id:'dv-2x2', label:'2 × 2 Grid',    cols:2, rows:2 },
  { id:'dv-3x2', label:'3 × 2 Grid',    cols:3, rows:2 },
]

// Split a total into n near-equal whole-mm parts that sum exactly.
const equalSplit = (total, n) => {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => i < n - 1 ? base : total - base * (n - 1))
}

export const MIN_SECTION_MM = 150

export function buildDesign(t) {
  const rateKey = t.rateKey || frameRateKeyForOpening(t.opening)
  return { category:'frame', templateId:t.id, name:t.name, group:t.group,
    ref:'', qty:1, location:'',
    system:frameSystemForTemplate(t), finishType:'powder',
    measurementStatus:'preliminary', measurementSource:'', measuredBy:'', measurementDate:'', siteNotes:'',
    accessoryOverrides:[], customCutPieces:[], siteImages:[],
    clientPhone:'', clientEmail:'', jobDescription:'', colourDescription:'', quoteValidDays:3, costFloorOverride:0,
    depositPercent:80, discountPercent:0, getfNhisPercent:5, vatPercent:15,
    wallColor:'#ded8cc', floorColor:'#cfd6dc', customFrameColor:'', visualView:'orbit',
    width:t.w, height:t.h, cols:t.cols, rows:t.rows, frame:'mill',
    colWidths: equalSplit(t.w, t.cols), rowHeights: equalSplit(t.h, t.rows),
    cells: makeCells(t.cols, t.rows, t.opening, rateKey) }
}

// Change divider count, preserving existing sections where they overlap.
export function resizeGrid(design, cols, rows) {
  const fallback = design.cells[0]?.opening || 'fixed'
  const fallbackGlass = design.cells[0]?.glass || '5CF'
  const fallbackRateKey = design.cells[0]?.rateKey || frameRateKeyForOpening(fallback)
  const fallbackRate = design.cells[0]?.ratePerM2 || frameRateForRateKey(fallbackRateKey)
  const fresh = design.category === 'curtainwall'
    ? () => ({ type:'vision', glass:'reflective', opening:'fixed', panels:1 })
    : () => ({ glass:fallbackGlass, opening:fallback, panels:1, itemQty:1, rateKey:fallbackRateKey, ratePerM2:fallbackRate })
  const cells = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const old = (r < design.rows && c < design.cols) ? design.cells[r * design.cols + c] : null
      cells.push(old ? { ...old } : fresh())
    }
  return { ...design, cols, rows, cells,
    colWidths: equalSplit(design.width, cols), rowHeights: equalSplit(design.height, rows) }
}

// Change overall width/height, scaling section sizes proportionally.
export function setSize(design, key, value) {
  const v = Math.max(1, Math.round(value))
  if (key === 'width') {
    const scaled = design.colWidths.map(wv => Math.round(wv * v / design.width))
    scaled[scaled.length - 1] += v - scaled.reduce((s, x) => s + x, 0)
    return { ...design, width: v, colWidths: scaled }
  }
  const scaled = design.rowHeights.map(hv => Math.round(hv * v / design.height))
  scaled[scaled.length - 1] += v - scaled.reduce((s, x) => s + x, 0)
  return { ...design, height: v, rowHeights: scaled }
}

// Move the boundary between two columns/rows (EvA-style divider drag):
// one side grows, the neighbour shrinks, the total never changes.
export function moveDivider(design, axis, boundary, deltaMm) {
  const arr = axis === 'col' ? [...design.colWidths] : [...design.rowHeights]
  const d = Math.round(deltaMm)
  const grow = Math.max(MIN_SECTION_MM, arr[boundary] + d)
  const shrink = Math.max(MIN_SECTION_MM, arr[boundary + 1] - (grow - arr[boundary]))
  const applied = arr[boundary + 1] - shrink
  arr[boundary] += applied
  arr[boundary + 1] -= applied
  return axis === 'col' ? { ...design, colWidths: arr } : { ...design, rowHeights: arr }
}

// Set one section's width/height directly; the neighbour absorbs the change.
export function setSectionSize(design, axis, index, mm) {
  const arr = axis === 'col' ? design.colWidths : design.rowHeights
  if (arr.length === 1) return setSize(design, axis === 'col' ? 'width' : 'height', mm)
  const neighbour = index < arr.length - 1 ? index + 1 : index - 1
  const clamped = Math.min(
    Math.max(MIN_SECTION_MM, Math.round(mm)),
    arr[index] + arr[neighbour] - MIN_SECTION_MM)
  return moveDivider(design, axis, Math.min(index, neighbour), (clamped - arr[index]) * (index < neighbour ? 1 : -1))
}

export const sectionCount = (d) => d.cols * d.rows

// Canvas geometry — shared by DesignCanvas (drawing) and the drop
// handler (hit-testing which section a design was dropped on).
export function designLayout(design, stageW, stageH) {
  const { width, height, cols, rows } = design
  const colW = design.colWidths?.length === cols ? design.colWidths : Array.from({ length: cols }, () => width / cols)
  const rowH = design.rowHeights?.length === rows ? design.rowHeights : Array.from({ length: rows }, () => height / rows)
  const PAD = 80
  const scale = Math.min((stageW - PAD*2) / width, (stageH - PAD*2) / height) * 0.9
  const fw = width * scale, fh = height * scale
  const ox = (stageW - fw) / 2, oy = (stageH - fh) / 2
  const ft = Math.max(7, Math.min(15, Math.min(fw, fh) * 0.035))
  const cumX = colW.reduce((a, w) => [...a, a[a.length-1] + w], [0])
  const cumY = rowH.reduce((a, h) => [...a, a[a.length-1] + h], [0])
  // stage px → cell index (or null outside the frame)
  const cellAt = (px, py) => {
    const mmX = (px - ox) / scale, mmY = (py - oy) / scale
    if (mmX < 0 || mmY < 0 || mmX > width || mmY > height) return null
    let c = cumX.findIndex(x => x > mmX) - 1; if (c < 0) c = cols - 1
    let r = cumY.findIndex(y => y > mmY) - 1; if (r < 0) r = rows - 1
    return Math.min(r, rows - 1) * cols + Math.min(c, cols - 1)
  }
  return { colW, rowH, scale, fw, fh, ox, oy, ft, cumX, cumY, cellAt }
}

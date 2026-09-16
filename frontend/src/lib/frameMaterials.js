// ============================================================
// FRAME MATERIAL TAKE-OFF — one list, read by the quote, the BOM,
// the cutting list, procurement and the factory pack.
//
// Prices resolve in this order:
//   1. the `materials` table in Supabase — what Inventory edits
//   2. the supplied workbook value shipped in frameCatalog.js
// so a corrected price in Inventory changes every document without
// a code change, and an un-corrected part still prices from source.
//
// Aluminium is bought in 5800 mm bars, so profile cost is bars
// consumed (nested with the same first-fit rule as the cutting
// optimizer), not metres × a rate.
// ============================================================
import { extractPieces } from './pieces.js'
import { resolveGroup } from './frameRecipes.js'
import { FRAME_SYSTEMS, FRAME_GLASS_CATALOG, frameAccessoryRows } from './frameCatalog.js'
import { CUTTING } from './products.js'

const STOCK_MM = 5800

// ── price book ───────────────────────────────────────────────
// Inventory rows, pushed in by whoever fetched them, so the pricing path
// stays free of the API module and testable on its own.
let INVENTORY = new Map()

export function setMaterialPrices(rows = []) {
  INVENTORY = new Map(rows.map(m => [String(m.code).trim(), m]))
  return INVENTORY.size
}

export const materialPricesLoaded = () => INVENTORY.size > 0

// The catalogue values shipped with the app, keyed by code.
const CATALOGUE = (() => {
  const map = new Map()
  Object.values(FRAME_SYSTEMS).forEach(system => {
    (system.profiles || []).forEach(p => map.has(p.code) || map.set(p.code, {
      code: p.code, name: p.name, category: 'Profile', unit: 'bar', unit_price: p.listedPrice,
    }))
    ;(system.accessories || []).forEach(a => map.has(a.code) || map.set(a.code, {
      code: a.code, name: a.name, category: 'Accessory', unit: 'pcs', unit_price: a.listedValue,
    }))
  })
  FRAME_GLASS_CATALOG.forEach(g => map.set(g.code, {
    code: g.code, name: g.label, category: 'Glass', unit: 'm²', unit_price: g.pricePerM2,
  }))
  return map
})()

// → { code, name, unit, unitPrice, source } — `source` drives the "priced
// from inventory / from the supplied workbook" note on every document.
export function priceFor(code, fallbackName = '') {
  const key = String(code || '').trim()
  const live = INVENTORY.get(key)
  if (live) return { code: key, name: live.name, unit: live.unit,
    unitPrice: Number(live.unit_price) || 0, source: 'inventory' }
  const seed = CATALOGUE.get(key)
  if (seed) return { code: key, name: seed.name, unit: seed.unit,
    unitPrice: Number(seed.unit_price) || 0, source: 'workbook' }
  return { code: key, name: fallbackName || key || 'Unmapped part', unit: 'pcs',
    unitPrice: 0, source: 'unpriced' }
}

// ── profile bars ─────────────────────────────────────────────
// Nest one code's cuts into 5800 mm bars, kerf on every cut.
function barsForCuts(lengths, kerfMm = CUTTING.kerfMm) {
  const bars = []
  ;[...lengths].sort((a, b) => b - a).forEach(length => {
    const need = length + kerfMm
    if (need > STOCK_MM) { bars.push(STOCK_MM); return }   // oversize: its own bar
    const bar = bars.findIndex(used => STOCK_MM - used >= need)
    if (bar === -1) bars.push(need)
    else bars[bar] += need
  })
  return bars
}

// → [{ code, name, unit:'bar', qty, unitPrice, total, metres, utilisation, … }]
export function profileMaterialRows(design, projectQty = 1) {
  const pieces = extractPieces(design)
  const byCode = new Map()
  pieces.forEach(p => {
    // Trialco builds its own breakdown and carries no code on the piece;
    // resolve it from the geometry group so its bars price like the rest.
    const part = p.code ? null : resolveGroup(design, p.profile)
    const code = p.code || part?.code || p.profile
    const row = byCode.get(code) || { code, name: p.partName || part?.member || p.member, lengths: [], mm: 0,
      provisional: p.partProvisional ?? part?.provisional, mapped: Boolean(p.code || part?.code) }
    for (let i = 0; i < p.qty * projectQty; i++) row.lengths.push(p.lengthMm)
    row.mm += p.lengthMm * p.qty * projectQty
    byCode.set(code, row)
  })
  return [...byCode.values()].map(row => {
    const bars = barsForCuts(row.lengths)
    const price = priceFor(row.code, row.name)
    const qty = bars.length
    return {
      code: row.code, name: price.name, category: 'Profile', unit: 'bar',
      qty, unitPrice: price.unitPrice, total: +(qty * price.unitPrice).toFixed(2),
      metres: +(row.mm / 1000).toFixed(2),
      utilisation: qty ? Math.round(row.mm / (qty * STOCK_MM) * 100) : 0,
      priceSource: price.source, provisional: row.provisional, unmapped: !row.mapped,
      note: `${row.lengths.length} cut(s) · ${STOCK_MM} mm bars`,
    }
  }).sort((a, b) => b.total - a.total)
}

// ── glass ────────────────────────────────────────────────────
export function glassMaterialRows(breakdown, projectQty = 1) {
  const byCode = new Map()
  ;(breakdown?.glass || []).forEach(g => {
    const m2 = (g.wMm * g.hMm) / 1e6 * g.qty * projectQty
    const row = byCode.get(g.glass) || { code: g.glass, m2: 0, lights: 0 }
    row.m2 += m2
    row.lights += g.qty * projectQty
    byCode.set(g.glass, row)
  })
  return [...byCode.values()].map(row => {
    const price = priceFor(row.code)
    const qty = +row.m2.toFixed(2)
    return {
      code: row.code, name: price.name, category: 'Glass', unit: 'm²',
      qty, unitPrice: price.unitPrice, total: +(qty * price.unitPrice).toFixed(2),
      priceSource: price.source, note: `${row.lights} light(s) cut to size`,
    }
  })
}

// ── accessories ──────────────────────────────────────────────
// Quantities come from the working recipe in frameCatalog.js; prices are
// re-resolved here so an Inventory correction reaches the accessory lines.
export function accessoryMaterialRows(design) {
  return frameAccessoryRows(design).map(a => {
    const price = priceFor(a.code, a.name)
    const qty = Number(a.qty) || 0
    const unitPrice = a.edited || a.custom ? Number(a.unitPrice) || 0 : price.unitPrice
    return {
      code: a.code, name: a.name || price.name, category: 'Accessory',
      unit: a.unit || price.unit || 'pcs', qty, unitPrice,
      total: +(qty * unitPrice).toFixed(2),
      priceSource: a.edited || a.custom ? 'item override' : price.source,
      note: a.rule || '', provisional: !a.edited && !a.custom,
    }
  })
}

// ── the whole take-off ───────────────────────────────────────
// → { rows, materialCost, unpriced, provisionalCount }
export function frameMaterialTakeOff(design, breakdown, projectQty = 1) {
  const rows = [
    ...profileMaterialRows(design, projectQty),
    ...glassMaterialRows(breakdown, projectQty),
    ...accessoryMaterialRows(design),
  ]
  return {
    rows,
    materialCost: +rows.reduce((sum, r) => sum + r.total, 0).toFixed(2),
    unpriced: rows.filter(r => !r.unitPrice).map(r => r.code),
    unmapped: rows.filter(r => r.unmapped).map(r => r.code),
    provisionalCount: rows.filter(r => r.provisional).length,
    fromInventory: rows.filter(r => r.priceSource === 'inventory').length,
  }
}

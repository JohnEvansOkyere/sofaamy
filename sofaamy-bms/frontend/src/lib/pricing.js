// ============================================================
// GHS PRICING ENGINE (piece-aware)
// A design is a framed grid of sections split by dividers.
// Profile cost comes from the extracted cut list (lib/pieces.js)
// priced per profile type, so the quote, BOM and cutting
// optimizer all read the same pieces.
// cost = profile pieces + glass(per section)
//        + hardware(per section) + labour + install + margin%
// ============================================================
import { OPENINGS, GLASS, RATES, PROFILES } from './products.js'
import { extractPieces, metresByProfile, cellSizes } from './pieces.js'
import { calcFramelessQuote, framelessBOM } from './frameless.js'
import { calcCurtainWallQuote, curtainWallBOM } from './curtainwall.js'

export const GHS = (n) =>
  '₵' + Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── category dispatchers — one call site regardless of product family ──
export function calcQuote(d) {
  if (d.category === 'frameless') return calcFramelessQuote(d)
  if (d.category === 'curtainwall') return calcCurtainWallQuote(d)
  return calcDesignQuote(d)
}

export function designBOMAny(d) {
  if (d.category === 'frameless') return framelessBOM(d)
  if (d.category === 'curtainwall') return curtainWallBOM(d)
  return designBOM(d)
}

export function calcDesignQuote(d) {
  const w = d.width / 1000, h = d.height / 1000     // mm -> m
  const area = w * h
  const sections = d.cols * d.rows
  const qty = d.qty || 1

  const pieces = extractPieces(d)
  const metres = metresByProfile(pieces)
  const profileLen = Object.values(metres).reduce((s, m) => s + m, 0)
  const pieceCount = pieces.reduce((s, p) => s + p.qty, 0)
  const sizes = cellSizes(d)

  const profileCost = Object.entries(metres)
    .reduce((s, [id, m]) => s + m * (PROFILES[id]?.pricePerM ?? 85), 0)
  const glassCost    = d.cells.reduce((s,c,i) =>
    s + (sizes[i].wMm * sizes[i].hMm / 1e6) * (GLASS[c.glass]?.price ?? 120), 0)
  const hardwareCost = d.cells.reduce((s,c) =>
    s + (OPENINGS[c.opening]?.hardware ?? 80) * (c.opening === 'fixed' ? 1 : (c.panels || 1)), 0)
  const labourCost   = area * RATES.labourPerM2
  const installCost  = area * RATES.installPerM2

  const subtotal = profileCost + glassCost + hardwareCost + labourCost + installCost
  const margin   = subtotal * (RATES.marginPercent / 100)
  const total    = subtotal + margin

  return {
    area:+area.toFixed(2), sections, dividers:(d.cols-1)+(d.rows-1),
    profileLen:+profileLen.toFixed(2), pieces, pieceCount,
    qty, grandTotal:+(total * qty).toFixed(2),
    lines:[
      { key:'Aluminium profile', detail:`${profileLen.toFixed(2)} m · ${pieceCount} cut pieces`, amount:profileCost },
      { key:'Glass', detail:`${area.toFixed(2)} m² · ${sections} section(s)`, amount:glassCost },
      { key:'Hardware & fittings', detail:`${sections} section(s)`, amount:hardwareCost },
      { key:'Fabrication labour', detail:`${area.toFixed(2)} m² × ₵${RATES.labourPerM2}/m²`, amount:labourCost },
      { key:'Installation', detail:`${area.toFixed(2)} m² × ₵${RATES.installPerM2}/m²`, amount:installCost },
    ],
    subtotal:+subtotal.toFixed(2), margin:+margin.toFixed(2),
    marginPct:RATES.marginPercent, total:+total.toFixed(2),
  }
}

export function designBOM(d) {
  const q = calcDesignQuote(d)
  const byGlass = {}, byOpening = {}
  d.cells.forEach(c => {
    byGlass[c.glass] = (byGlass[c.glass] || 0) + 1
    byOpening[c.opening] = (byOpening[c.opening] || 0) + 1
  })
  const metres = metresByProfile(q.pieces)
  const rows = Object.entries(metres).map(([id, m]) => ({
    item:`Profile — ${PROFILES[id]?.label || id}`, qty:`${m.toFixed(2)} m`,
    note:PROFILES[id]?.role || '—',
  }))
  Object.entries(byGlass).forEach(([g,n]) =>
    rows.push({ item:`Glass — ${GLASS[g]?.label || g}`, qty:`${n} section(s)`, note:`₵${GLASS[g]?.price}/m²` }))
  Object.entries(byOpening).forEach(([o,n]) =>
    rows.push({ item:`Hardware — ${OPENINGS[o]?.label || o}`, qty:`${n} set(s)`, note:'—' }))
  rows.push({ item:'Rubber gaskets', qty:`${q.profileLen.toFixed(2)} m`, note:'EPDM' })
  rows.push({ item:'Fasteners', qty:`${q.sections * 8} pcs`, note:'Stainless' })
  return rows
}

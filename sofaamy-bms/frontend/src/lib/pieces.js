// ============================================================
// DESIGN BREAKDOWN — turns a design into its full fabrication
// breakdown: every profile piece (position, length after
// deductions, cut angles) and every glass panel's cut size.
// This IS the cutting list. Deduction rules and constants live
// in products.js FAB — placeholders until Sofaamy confirms.
// ============================================================
import { PROFILES, FAB } from './products.js'
import { cwBreakdown } from './curtainwall.js'

const colWidths = (d) => d.colWidths?.length === d.cols
  ? d.colWidths : Array.from({ length: d.cols }, () => d.width / d.cols)
const rowHeights = (d) => d.rowHeights?.length === d.rows
  ? d.rowHeights : Array.from({ length: d.rows }, () => d.height / d.rows)

// → { profiles:[{position, profile, member, lengthMm, qty, cuts}],
//     glass:[{section, glass, wMm, hMm, qty, note}] }  — for ONE unit
export function designBreakdown(d) {
  // curtain wall has its own joint hierarchy (continuous mullions);
  // frameless has no profiles at all (see lib/frameless.js)
  if (d.category === 'curtainwall') return cwBreakdown(d)
  if (d.category === 'frameless') return { profiles: [], glass: [] }
  const cw = colWidths(d), rh = rowHeights(d)
  const profiles = [], glass = []
  const P = (position, profile, member, lengthMm, qty, cuts) =>
    profiles.push({ position, profile, member, lengthMm: Math.round(lengthMm), qty, cuts })

  // ── outer frame: full size, mitred
  P('Frame head', 'transum', 'Head', d.width, 1, '45°/45°')
  P('Frame sill', 'transum', 'Sill', d.width, 1, '45°/45°')
  P('Frame jambs (L+R)', 'mollium', 'Jamb', d.height, 2, '45°/45°')

  // ── internal members: butt between frame faces, square cut
  for (let j = 1; j < d.cols; j++)
    P(`Mullion ${j}`, 'mollium', 'Mullion', d.height - 2 * FAB.frameDepthMm, 1, '90°/90°')
  for (let r = 1; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++)
      P(`Transom ${r}.${c + 1}`, 'transum', 'Transom', cw[c] - 2 * FAB.frameDepthMm, 1, '90°/90°')

  // ── per-section: sashes + glass cut sizes
  d.cells.forEach((cell, i) => {
    const secW = cw[i % d.cols], secH = rh[Math.floor(i / d.cols)]
    const tag = `F${i + 1}`
    if (cell.opening === 'fixed') {
      glass.push({ section: tag, glass: cell.glass, wMm: Math.round(secW - FAB.glassDeductFixedMm),
        hMm: Math.round(secH - FAB.glassDeductFixedMm), qty: 1, note: 'fixed lite' })
    } else {
      const n = cell.panels || 1
      const sashW = secW / n + (n > 1 ? FAB.interlockMm / 2 : 0)
      const sashH = secH - FAB.trackClearMm
      const mitred = cell.opening === 'casement' || cell.opening === 'awning'
      const cuts = mitred ? '45°/45°' : '90°/90°'
      P(`${tag} sash rails (top+btm)`, 'sash', 'Sash rail', sashW, 2 * n, cuts)
      P(`${tag} sash stiles`, 'sash', 'Sash stile', sashH, 2 * n, cuts)
      glass.push({ section: tag, glass: cell.glass, wMm: Math.round(sashW - FAB.glassDeductSashMm),
        hMm: Math.round(sashH - FAB.glassDeductSashMm), qty: n, note: `${n} sash panel(s)` })
    }
  })
  return { profiles, glass }
}

// flat piece list for the optimizer / pricing (merged identical cuts)
export function extractPieces(d) {
  const merged = new Map()
  designBreakdown(d).profiles.forEach(p => {
    const k = `${p.profile}|${p.member}|${p.lengthMm}`
    const m = merged.get(k)
    if (m) m.qty += p.qty
    else merged.set(k, { profile: p.profile, member: p.member, lengthMm: p.lengthMm, qty: p.qty })
  })
  return [...merged.values()].sort((a, b) =>
    a.profile === b.profile ? b.lengthMm - a.lengthMm : a.profile.localeCompare(b.profile))
}

// batch demand: scale a one-unit cut list by the design quantity
export const multiplyPieces = (pieces, qty) =>
  qty === 1 ? pieces : pieces.map(p => ({ ...p, qty: p.qty * qty }))

// per-cell sizes for pricing: [{wMm, hMm}] row-major
export function cellSizes(d) {
  const cw = colWidths(d), rh = rowHeights(d)
  return d.cells.map((_, i) => ({ wMm: cw[i % d.cols], hMm: rh[Math.floor(i / d.cols)] }))
}

// total metres per profile: { mollium: 12.4, ... }
export function metresByProfile(pieces) {
  const out = {}
  pieces.forEach(p => {
    out[p.profile] = (out[p.profile] || 0) + (p.lengthMm * p.qty) / 1000
  })
  return out
}

export const profileLabel = (id) => PROFILES[id]?.label || id

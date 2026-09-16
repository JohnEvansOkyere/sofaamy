// ============================================================
// DESIGN BREAKDOWN — turns a design into its full fabrication
// breakdown: every profile piece (position, length after
// deductions, cut angles) and every glass panel's cut size.
// This IS the cutting list. Deduction rules and constants live
// in products.js FAB — placeholders until Sofaamy confirms.
// ============================================================
import { PROFILES, FAB } from './products.js'
import { cwBreakdown } from './curtainwall.js'
import { isTrialcoBay, trialcoBreakdown } from './trialco.js'
import { resolveGroup, resolveRole } from './frameRecipes.js'

const colWidths = (d) => d.colWidths?.length === d.cols
  ? d.colWidths : Array.from({ length: d.cols }, () => d.width / d.cols)
const rowHeights = (d) => d.rowHeights?.length === d.rows
  ? d.rowHeights : Array.from({ length: d.rows }, () => d.height / d.rows)

const localPanes = (cell, secW, secH) => {
  const local = cell.localDivider
  if (!local || !(local.cols > 1 || local.rows > 1)) return [{ wMm:secW, hMm:secH, index:0 }]
  const widths = local.colWidths?.length === local.cols ? local.colWidths : Array.from({ length:local.cols }, () => secW / local.cols)
  const heights = local.rowHeights?.length === local.rows ? local.rowHeights : Array.from({ length:local.rows }, () => secH / local.rows)
  return Array.from({ length:local.cols * local.rows }, (_, index) => ({
    wMm:widths[index % local.cols], hMm:heights[Math.floor(index / local.cols)], index,
  }))
}

// → { profiles:[{position, profile, member, sourceMm, adjustmentMm, lengthMm, qty, cuts}],
//     glass:[{section, glass, wMm, hMm, qty, note}] }  — for ONE unit
export function designBreakdown(d) {
  // curtain wall has its own joint hierarchy (continuous mullions);
  // frameless has no profiles at all (see lib/frameless.js)
  if (d.category === 'curtainwall') return cwBreakdown(d)
  if (d.category === 'frameless') return { profiles: [], glass: [] }
  if (isTrialcoBay(d)) return trialcoBreakdown(d)
  const cw = colWidths(d), rh = rowHeights(d)
  const profiles = [], glass = [], net = []
  // every piece carries the catalogue part it is cut from, so the cutting
  // list, the material take-off and procurement all name the same code
  const P = (position, profile, member, lengthMm, qty, cuts, sourceMm = lengthMm, adjustmentMm = lengthMm - sourceMm, note = '', role = null) => {
    const part = (role && resolveRole(d, role)) || resolveGroup(d, profile)
    profiles.push({ position, profile, member, sourceMm: Math.round(sourceMm), adjustmentMm: Math.round(adjustmentMm),
      lengthMm: Math.round(lengthMm), qty, cuts, note,
      code: part?.code || null, partName: part?.member || null,
      partProvisional: part ? part.provisional : null })
  }

  // glazing bead runs round every glazed light, mitred to the glass size
  const bead = (tag, glassW, glassH, lights = 1) => {
    if (!resolveRole(d, 'bead')) return
    P(`${tag} bead — head & sill`, 'frame_opening', 'Glazing bead — horizontal', glassW, 2 * lights, '45°/45°', glassW, 0, '', 'bead')
    P(`${tag} bead — jambs`, 'frame_opening', 'Glazing bead — vertical', glassH, 2 * lights, '45°/45°', glassH, 0, '', 'bead')
  }

  // ── working geometry only: exact source profile mapping is pending
  P('Frame head', 'frame_outer', 'Outer frame member — head', d.width, 1, '45°/45°', d.width, 0)
  P('Frame sill', 'frame_outer', 'Outer frame member — sill', d.width, 1, '45°/45°', d.width, 0)
  P('Frame left jamb', 'frame_outer', 'Outer frame member — jamb', d.height, 1, '45°/45°', d.height, 0)
  P('Frame right jamb', 'frame_outer', 'Outer frame member — jamb', d.height, 1, '45°/45°', d.height, 0)

  // ── internal members: butt between frame faces, square cut
  for (let j = 1; j < d.cols; j++)
    P(`Internal vertical ${j}`, 'frame_internal', 'Internal member — vertical', d.height - 2 * FAB.frameDepthMm, 1, '90°/90°', d.height, -2 * FAB.frameDepthMm)
  for (let r = 1; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++)
      P(`Internal horizontal ${r}.${c + 1}`, 'frame_internal', 'Internal member — horizontal', cw[c] - 2 * FAB.frameDepthMm, 1, '90°/90°', cw[c], -2 * FAB.frameDepthMm)

  // ── per-section: opening members + glass cut sizes
  d.cells.forEach((cell, i) => {
    const secW = cw[i % d.cols], secH = rh[Math.floor(i / d.cols)]
    const tag = `F${i + 1}`
    const panes = localPanes(cell, secW, secH)
    if (panes.length > 1) {
      const local = cell.localDivider
      const localWidths = local.colWidths?.length === local.cols ? local.colWidths : Array.from({ length:local.cols }, () => secW / local.cols)
      const localHeights = local.rowHeights?.length === local.rows ? local.rowHeights : Array.from({ length:local.rows }, () => secH / local.rows)
      for (let j = 1; j < local.cols; j++)
        P(`${tag} local vertical ${j}`, 'frame_internal', 'Local internal member — vertical', secH - 2 * FAB.frameDepthMm, 1, '90°/90°', secH, -2 * FAB.frameDepthMm)
      for (let r = 1; r < local.rows; r++)
        for (let c = 0; c < local.cols; c++)
          P(`${tag} local horizontal ${r}.${c + 1}`, 'frame_internal', 'Local internal member — horizontal', localWidths[c] - 2 * FAB.frameDepthMm, 1, '90°/90°', localWidths[c], -2 * FAB.frameDepthMm)
    }
    panes.forEach(pane => {
      const paneTag = panes.length > 1 ? `${tag}.${pane.index + 1}` : tag
      const paneW = pane.wMm, paneH = pane.hMm
      if (cell.opening === 'fixed') {
        const gw = paneW - FAB.glassDeductFixedMm, gh = paneH - FAB.glassDeductFixedMm
        glass.push({ section: paneTag, glass: cell.glass, sourceWMm: Math.round(paneW), sourceHMm: Math.round(paneH),
          adjustmentWMm: -FAB.glassDeductFixedMm, adjustmentHMm: -FAB.glassDeductFixedMm,
          wMm: Math.round(gw), hMm: Math.round(gh), qty: 1, note: panes.length > 1 ? 'local fixed lite' : 'fixed lite' })
        bead(paneTag, gw, gh)
        return
      }
      const n = cell.opening === 'double' ? 2 : Math.max(1, cell.panels || 1)
      const panelW = paneW / n
      const railAdjustment = n > 1 ? FAB.interlockMm / 2 : 0
      const openingW = panelW + railAdjustment
      const openingH = paneH - FAB.trackClearMm
      const mitred = cell.opening === 'casement' || cell.opening === 'awning'
      const cuts = mitred ? '45°/45°' : '90°/90°'
      for (let leaf = 1; leaf <= n; leaf++) {
        P(`${paneTag} leaf ${leaf} top rail`, 'frame_opening', 'Opening member — rail', openingW, 1, cuts, panelW, railAdjustment)
        P(`${paneTag} leaf ${leaf} bottom rail`, 'frame_opening', 'Opening member — bottom rail', openingW, 1, cuts, panelW, railAdjustment, '', 'bottom_rail')
        P(`${paneTag} leaf ${leaf} left stile`, 'frame_opening', 'Opening member — stile', openingH, 1, cuts, paneH, -FAB.trackClearMm)
        P(`${paneTag} leaf ${leaf} right stile`, 'frame_opening', 'Opening member — stile', openingH, 1, cuts, paneH, -FAB.trackClearMm)
      }
      // where two leaves close on each other: interlock on a slider, meeting
      // stile or hinge adaptor on a door. One per joint between leaves.
      if (n > 1) {
        const meetingRole = cell.opening === 'double' && resolveRole(d, 'meeting_double')
          ? 'meeting_double' : 'meeting'
        P(`${paneTag} meeting member`, 'frame_opening', 'Meeting member between leaves',
          openingH, n - 1, '90°/90°', paneH, -FAB.trackClearMm, '', meetingRole)
      }
      // the insect screen is a separate light: a fixed truck on the frame
      // and a moving net leaf, one per opening
      if (resolveRole(d, 'net_frame')) {
        P(`${paneTag} net truck — head & sill`, 'frame_opening', 'Net truck — horizontal', panelW, 2, '90°/90°', panelW, 0, '', 'net_frame')
        P(`${paneTag} net truck — jambs`, 'frame_opening', 'Net truck — vertical', openingH, 2, '90°/90°', paneH, -FAB.trackClearMm, '', 'net_frame')
      }
      if (resolveRole(d, 'net_leaf')) {
        P(`${paneTag} net leaf — head & sill`, 'frame_opening', 'Net leaf — horizontal', panelW, 2, '90°/90°', panelW, 0, '', 'net_leaf')
        P(`${paneTag} net leaf — jambs`, 'frame_opening', 'Net leaf — vertical', openingH, 2, '90°/90°', paneH, -FAB.trackClearMm, '', 'net_leaf')
        // one screen per opening, as on the Trialco sheet — not one per leaf
        net.push({ section: paneTag, wMm: Math.round(panelW), hMm: Math.round(openingH), qty: 1 })
      }
      const gw = openingW - FAB.glassDeductOpeningMm, gh = openingH - FAB.glassDeductOpeningMm
      glass.push({ section: paneTag, glass: cell.glass, sourceWMm: Math.round(panelW), sourceHMm: Math.round(paneH),
        adjustmentWMm: Math.round(railAdjustment - FAB.glassDeductOpeningMm), adjustmentHMm: -FAB.glassDeductOpeningMm,
        wMm: Math.round(gw), hMm: Math.round(gh), qty: n, note: `${n} opening panel(s)` })
      bead(paneTag, gw, gh, n)
    })
  })
  ;(d.customCutPieces || []).forEach((piece, index) => {
    const source = Number(piece.sourceMm || piece.lengthMm || 0)
    const adjustment = Number(piece.adjustmentMm || 0)
    const length = Number(piece.lengthMm || source + adjustment)
    if (length <= 0) return
    P(piece.position || `Custom piece ${index + 1}`, piece.profile || 'frame_outer',
      piece.member || 'Manual fabrication piece', length, Math.max(1, Number(piece.qty || 1)),
      piece.cuts || 'SPECIAL / TEMPLATE', source, adjustment, piece.note || '')
  })
  return { profiles, glass, net }
}

// flat piece list for the optimizer / pricing (merged identical cuts)
export function extractPieces(d) {
  const merged = new Map()
  designBreakdown(d).profiles.forEach(p => {
    // Keep the fabrication position in the optimizer key. Identical lengths
    // from different sections may share a stock bar, but production still
    // needs to know where every cut belongs.
    const k = `${p.code || p.profile}|${p.member}|${p.lengthMm}|${p.position}`
    const m = merged.get(k)
    if (m) m.qty += p.qty
    else merged.set(k, { profile: p.profile, member: p.member, position:p.position,
      lengthMm: p.lengthMm, cuts:p.cuts || '—', qty: p.qty,
      code: p.code || null, partName: p.partName || null, partProvisional: p.partProvisional ?? null })
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
  return d.cells.flatMap((cell, i) => localPanes(cell, cw[i % d.cols], rh[Math.floor(i / d.cols)]))
}

// total metres per working geometry group. Source profile identity is shown
// separately from the cut estimate until Sofaamy confirms the mapping.
export function metresByProfile(pieces) {
  const out = {}
  pieces.forEach(p => {
    out[p.profile] = (out[p.profile] || 0) + (p.lengthMm * p.qty) / 1000
  })
  return out
}

export const profileLabel = (id) => PROFILES[id]?.label || id

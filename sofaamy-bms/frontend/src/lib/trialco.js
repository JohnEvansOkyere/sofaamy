// ============================================================
// TRIALCO TWO-LEAF BAY FORMULAS
// These rules are specific to the Trialco sliding system. They
// are kept separate from the generic frame geometry so another
// profile system cannot accidentally inherit these deductions.
// ============================================================

export const TRIALCO_FORMULAS = {
  leafCount: 2,
  leafHeightDeductionMm: 70,
  netHeightDeductionMm: 10,
  glassDeductionMm: 112,
  frameProfile: 'trialco_frame',
  leafProfile: 'trialco_leaf',
  netProfile: 'trialco_net',
  interlockProfile: 'trialco_interlock',
  netQtyPerBay: 2,
  interlockQtyPerBay: 2,
  glassQtyPerBay: 2,
}

export const isTrialcoBay = (design) =>
  design?.category === 'frame' &&
  design?.system === 'trialco' &&
  (design.cells || []).some(c => c.opening === 'sliding')

const rounded = (n) => Math.round(Number(n) || 0)

export function trialcoDimensions(design) {
  const frameW = Number(design.width) || 0
  const frameH = Number(design.height) || 0
  const leafW = frameW / TRIALCO_FORMULAS.leafCount
  const leafH = frameH - TRIALCO_FORMULAS.leafHeightDeductionMm
  const netW = leafW
  const netH = leafH - TRIALCO_FORMULAS.netHeightDeductionMm
  const glassW = leafW - TRIALCO_FORMULAS.glassDeductionMm
  const glassH = leafH - TRIALCO_FORMULAS.glassDeductionMm
  return {
    frameW, frameH, leafW, leafH, netW, netH, interlockLength:leafH, glassW, glassH,
  }
}

export function trialcoBreakdown(design) {
  const d = trialcoDimensions(design)
  const profiles = []
  const net = []
  const glass = []
  const P = (position, profile, member, lengthMm, sourceMm, adjustmentMm, note = '') =>
    profiles.push({ position, profile, member, sourceMm:rounded(sourceMm), adjustmentMm:rounded(adjustmentMm),
      lengthMm:rounded(lengthMm), qty:1, cuts:'90°/90°', note })

  // Outer frame: site measurement is the working finished frame size.
  P('Frame head', TRIALCO_FORMULAS.frameProfile, 'Trialco frame — head', d.frameW, d.frameW, 0, 'Site Frame W')
  P('Frame sill', TRIALCO_FORMULAS.frameProfile, 'Trialco frame — sill', d.frameW, d.frameW, 0, 'Site Frame W')
  P('Frame left jamb', TRIALCO_FORMULAS.frameProfile, 'Trialco frame — jamb', d.frameH, d.frameH, 0, 'Site Frame H')
  P('Frame right jamb', TRIALCO_FORMULAS.frameProfile, 'Trialco frame — jamb', d.frameH, d.frameH, 0, 'Site Frame H')

  for (let leaf = 1; leaf <= TRIALCO_FORMULAS.leafCount; leaf++) {
    P(`Leaf ${leaf} top rail`, TRIALCO_FORMULAS.leafProfile, 'Trialco flat leaf — rail', d.leafW, d.leafW, 0, 'Frame W / 2')
    P(`Leaf ${leaf} bottom rail`, TRIALCO_FORMULAS.leafProfile, 'Trialco flat leaf — rail', d.leafW, d.leafW, 0, 'Frame W / 2')
    P(`Leaf ${leaf} left stile`, TRIALCO_FORMULAS.leafProfile, 'Trialco flat leaf — stile', d.leafH, d.frameH, -TRIALCO_FORMULAS.leafHeightDeductionMm, 'Frame H − 70')
    P(`Leaf ${leaf} right stile`, TRIALCO_FORMULAS.leafProfile, 'Trialco flat leaf — stile', d.leafH, d.frameH, -TRIALCO_FORMULAS.leafHeightDeductionMm, 'Frame H − 70')
  }

  for (let i = 1; i <= TRIALCO_FORMULAS.interlockQtyPerBay; i++) {
    P(`Interlock ${i}`, TRIALCO_FORMULAS.interlockProfile, 'Trialco interlock adaptor', d.interlockLength, d.frameH,
      -TRIALCO_FORMULAS.leafHeightDeductionMm, 'Leaf H')
  }

  for (let i = 1; i <= TRIALCO_FORMULAS.netQtyPerBay; i++) {
    net.push({ section:`N${i}`, sourceWMm:rounded(d.leafW), sourceHMm:rounded(d.leafH),
      adjustmentWMm:0, adjustmentHMm:-TRIALCO_FORMULAS.netHeightDeductionMm,
      wMm:rounded(d.netW), hMm:rounded(d.netH), qty:1, note:'Leaf W × (Leaf H − 10)' })
  }

  for (let i = 1; i <= TRIALCO_FORMULAS.glassQtyPerBay; i++) {
    glass.push({ section:`G${i}`, glass:design.cells?.[i - 1]?.glass || design.cells?.[0]?.glass || '5CF',
      sourceWMm:rounded(d.leafW), sourceHMm:rounded(d.leafH),
      adjustmentWMm:-TRIALCO_FORMULAS.glassDeductionMm, adjustmentHMm:-TRIALCO_FORMULAS.glassDeductionMm,
      wMm:rounded(d.glassW), hMm:rounded(d.glassH), qty:1, note:'Leaf W/H − 112' })
  }

  // Manual project-specific pieces remain part of the same production list.
  ;(design.customCutPieces || []).forEach((piece, index) => {
    const source = Number(piece.sourceMm || piece.lengthMm || 0)
    const adjustment = Number(piece.adjustmentMm || 0)
    const length = Number(piece.lengthMm || source + adjustment)
    if (length <= 0) return
    profiles.push({ position:piece.position || `Custom piece ${index + 1}`,
      profile:piece.profile || TRIALCO_FORMULAS.frameProfile,
      member:piece.member || 'Manual fabrication piece', sourceMm:rounded(source),
      adjustmentMm:rounded(adjustment), lengthMm:rounded(length), qty:Math.max(1, Number(piece.qty || 1)),
      cuts:piece.cuts || 'SPECIAL / TEMPLATE', note:piece.note || '' })
  })

  return {
    profiles, net, glass,
    fabrication: {
      system:'trialco', bayCount:1, leafCount:TRIALCO_FORMULAS.leafCount,
      frame:{ wMm:rounded(d.frameW), hMm:rounded(d.frameH) },
      leaf:{ wMm:rounded(d.leafW), hMm:rounded(d.leafH), qty:TRIALCO_FORMULAS.leafCount },
      net:{ wMm:rounded(d.netW), hMm:rounded(d.netH), qty:TRIALCO_FORMULAS.netQtyPerBay },
      interlock:{ lengthMm:rounded(d.interlockLength), qty:TRIALCO_FORMULAS.interlockQtyPerBay },
      glass:{ wMm:rounded(d.glassW), hMm:rounded(d.glassH), qty:TRIALCO_FORMULAS.glassQtyPerBay },
      status:'Working Trialco formulas — confirm quantities and final profile cut rules with Sofaamy',
    },
  }
}

// ============================================================
// GLASS PREP LIBRARY — frontend mirror of backend app/preps.py.
// Every hardware part carries the holes/cutouts it needs in the
// toughened glass; attaching hardware to a panel instantiates them
// at the panel's actual size (any project, any dimensions).
// Geometry calibrated from Sofaamy's SmartGlazier print
// (SGP/4462-26A); shower/slider values are PLACEHOLDERS.
// Coordinates: panel-local mm, origin TOP-LEFT.
// ============================================================

export const PREP_TEMPLATES = {
  A: { codes:'KL-M102/T · KL-M202', run:135.5, lead:42.5, depth:37, rise:36, r1:80, r2:55, holeDia:20, holeX:122.5, holeY:18 },
  B: { codes:'KL-M402',             run:155.5, lead:62.5, depth:37, rise:36, r1:80, r2:55, holeDia:20, holeX:142.5, holeY:18 },
}

const CLAMP = { dia:18, inset:200, edge:20 }
const CLAMP_OVER = { dia:18, inset:250, edge:20 }
const HANDLE = { dia:16, offStile:100, halfCrs:350 }
const LOCK = { w:80, h:60, off:100 }
const PIVOT_MATE = { dia:20, offEdge:25, y1:73, gap:32 }
const HINGE = { w:30, h:60, end:150 }
const KNOB = { dia:12, off:60 }
const ROLLER = { dia:14, inset:150, edge:30 }

const isLeaf = (t) => t === 'door' || t === 'hinged'

const fixedFeatures = (w, h, wallSide, doorSide) => {
  const f = []
  for (const x of [CLAMP.inset, w - CLAMP.inset])
    for (const y of [CLAMP.edge, h - CLAMP.edge])
      f.push({ kind:'hole', dia:CLAMP.dia, x, y, code:'BL 203' })
  if (wallSide)
    f.push({ kind:'hole', dia:CLAMP.dia, x:wallSide === 'left' ? CLAMP.edge : w - CLAMP.edge, y:h / 2, code:'BL 203' })
  if (doorSide) {
    const x = doorSide === 'left' ? PIVOT_MATE.offEdge : w - PIVOT_MATE.offEdge
    f.push({ kind:'hole', dia:PIVOT_MATE.dia, x, y:PIVOT_MATE.y1, code:'pivot' })
    f.push({ kind:'hole', dia:PIVOT_MATE.dia, x, y:PIVOT_MATE.y1 + PIVOT_MATE.gap, code:'pivot' })
  }
  return f
}

const doorFeatures = (w, h, pivot) => {
  const stile = pivot === 'left' ? 'right' : 'left'
  const sx = (off) => stile === 'right' ? w - off : off
  return [
    { kind:'cutout', template:'A', corner:pivot === 'left' ? 'TL' : 'TR', code:'KL-M202' },
    { kind:'cutout', template:'A', corner:pivot === 'left' ? 'BL' : 'BR', code:'KL-M102/T' },
    { kind:'notch', w:LOCK.w, h:LOCK.h, corner:stile === 'left' ? 'BL' : 'BR', off:LOCK.off, code:'CSM-50W' },
    { kind:'hole', dia:HANDLE.dia, x:sx(HANDLE.offStile), y:h / 2 - HANDLE.halfCrs, code:'JQ 104' },
    { kind:'hole', dia:HANDLE.dia, x:sx(HANDLE.offStile), y:h / 2 + HANDLE.halfCrs, code:'JQ 104' },
  ]
}

const hingedFeatures = (w, h, pivot) => [
  { kind:'notch', w:HINGE.w, h:HINGE.h, corner:pivot === 'left' ? 'TL' : 'TR', off:0, yEnd:HINGE.end, code:'SH-90' },
  { kind:'notch', w:HINGE.w, h:HINGE.h, corner:pivot === 'left' ? 'BL' : 'BR', off:0, yEnd:HINGE.end, code:'SH-90' },
  { kind:'hole', dia:KNOB.dia, x:pivot === 'left' ? w - KNOB.off : KNOB.off, y:h / 2, code:'SH-KNOB' },
]

const sliderFeatures = (w) => [
  { kind:'hole', dia:ROLLER.dia, x:ROLLER.inset, y:ROLLER.edge, code:'SL-ROLLER' },
  { kind:'hole', dia:ROLLER.dia, x:w - ROLLER.inset, y:ROLLER.edge, code:'SL-ROLLER' },
]

const overFeatures = (w) => [
  { kind:'hole', dia:CLAMP_OVER.dia, x:CLAMP_OVER.inset, y:CLAMP_OVER.edge, code:'BL 203' },
  { kind:'hole', dia:CLAMP_OVER.dia, x:w - CLAMP_OVER.inset, y:CLAMP_OVER.edge, code:'BL 203' },
  { kind:'cutout', template:'B', corner:'BL', code:'KL-M402' },
  { kind:'cutout', template:'B', corner:'BR', code:'KL-M402' },
]

export const pivotSide = (cells, i) =>
  i > 0 && isLeaf(cells[i - 1]?.type) ? 'right' : 'left'

// panels: framelessBreakdown(design).panels — returns aligned
// [{ mark, features, pivot }] (run panels first, over-panel last)
export function panelFeatures(design, panels) {
  const cells = design.cells
  const out = []
  const run = panels.filter(p => p.type !== 'over')
  run.forEach((p, j) => {
    const { wMm:w, hMm:h, type:ty } = p
    if (ty === 'fixed') {
      const wall = j === 0 ? 'left' : j === run.length - 1 ? 'right' : null
      const door = isLeaf(cells[j + 1]?.type) ? 'right' : isLeaf(cells[j - 1]?.type) ? 'left' : null
      out.push({ mark:p.mark, features:fixedFeatures(w, h, wall, door), pivot:null })
    } else if (ty === 'door') {
      const piv = pivotSide(cells, j)
      out.push({ mark:p.mark, features:doorFeatures(w, h, piv), pivot:piv })
    } else if (ty === 'hinged') {
      const piv = pivotSide(cells, j)
      out.push({ mark:p.mark, features:hingedFeatures(w, h, piv), pivot:piv })
    } else {
      out.push({ mark:p.mark, features:sliderFeatures(w), pivot:null })
    }
  })
  panels.filter(p => p.type === 'over').forEach(p =>
    out.push({ mark:p.mark, features:overFeatures(p.wMm), pivot:null }))
  return out
}

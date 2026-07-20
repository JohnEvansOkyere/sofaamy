// ============================================================
// TRIALCO INTERNAL MATERIAL COST SHEET
// Fixed unit prices are taken from the supplied Trialco costing
// sheet image (01/03/2023). Quantities are calculated from the
// measured bay, then multiplied by the design quantity.
// ============================================================

import { frameAccessoryRows, frameGlassByCode } from './frameCatalog.js'
import { trialcoDimensions, TRIALCO_FORMULAS } from './trialco.js'

export const TRIALCO_STOCK_MM = 5800
export const TRIALCO_KERF_MM = 5
export const TRIALCO_INSTALLATION_PERCENT = 30
export const TRIALCO_MIN_MARGIN_PERCENT = 15
export const TRIALCO_TARGET_MARGIN_PERCENT = 25

// Internal costing-sheet rates. These are deliberately separate from the
// customer selling rates and from the source workbook's catalogue values.
export const TRIALCO_MATERIAL_PRICES = {
  frame:       { code:'TF053N / TF073N', unit:'5.8m bar', unitPrice:775, source:'Trialco costing sheet' },
  leaf:        { code:'TF065N', unit:'5.8m bar', unitPrice:570, source:'Trialco costing sheet' },
  net:         { code:'TF223N', unit:'5.8m bar', unitPrice:210, source:'Trialco costing sheet' },
  interlock:   { code:'TF224N', unit:'5.8m bar', unitPrice:210, source:'Trialco costing sheet' },
  kit:         { code:'ACC', unit:'set', unitPrice:38, source:'Trialco costing sheet' },
  corner:      { code:'ACC04C', unit:'pcs', unitPrice:6.5, source:'Trialco costing sheet' },
  rollers:     { code:'TRIAL-R1', unit:'pcs', unitPrice:15, source:'Trialco costing sheet' },
  locks:       { code:'ACCML', unit:'pcs', unitPrice:41, source:'Trialco costing sheet' },
  netCorners:  { code:'IT01NC', unit:'pcs', unitPrice:1, source:'Trialco costing sheet' },
  netHandle:   { code:'ACCNH', unit:'pcs', unitPrice:3, source:'Trialco costing sheet' },
  netFibre:    { code:'ACCNF', unit:'m²', unitPrice:280, source:'Trialco costing sheet' },
  glazing:     { code:'ACCGRB', unit:'m', unitPrice:128, source:'Trialco costing sheet' },
  netRubber:   { code:'ACCNRB', unit:'m', unitPrice:60, source:'Trialco costing sheet' },
  screws:      { code:'ACCITS', unit:'pcs', unitPrice:55, source:'Trialco costing sheet' },
  wallPlugs:   { code:'ACCWPL', unit:'pcs', unitPrice:4.5, source:'Trialco costing sheet' },
  drainCaps:   { code:'ACCWDC', unit:'pcs', unitPrice:7, source:'Trialco costing sheet' },
  pvcCovers:   { code:'ACCPVC', unit:'pcs', unitPrice:46, source:'Trialco costing sheet' },
  silicone:    { code:'SIL', unit:'tube', unitPrice:25, source:'Trialco costing sheet' },
  brush:       { code:'ACCITB', unit:'m', unitPrice:65, source:'Trialco costing sheet' },
}

const TRIALCO_BASE_MATERIAL_CODES = new Set([
  'TF053N / TF073N', 'TF065N', 'TF223N', 'TF224N', 'ACC',
  '5CF', '6CF', '8CF', '10CF', '12CF', '3.3PL', '3.3BZL', '4.4PL', '5.5PL',
  '4.4BZL', '5BR', '5GR', '5BZR', '6MBR', '5BR-BLACK', '5DBR', '6SMBR',
  '5BT', '5BZT', '6BZT', '6BT', '6SMBT', 'ACC04C', 'TRIAL-R1', 'ACCML',
  'IT01NC', 'ACCNH', 'ACCNF', 'ACCGRB', 'ACCNRB', 'ACCITS', 'ACCWPL',
  'ACCWDC', 'ACCPVC', 'SIL', 'ACCITB',
])

const barsFor = (cuts, projectQty) => {
  const expanded = Array.from({ length: projectQty }, () => cuts).flat().sort((a, b) => b - a)
  const bars = []
  expanded.forEach(length => {
    const need = length + TRIALCO_KERF_MM
    let bar = bars.find(remaining => remaining >= need)
    if (bar === undefined) {
      bars.push(TRIALCO_STOCK_MM - need)
    } else {
      const index = bars.indexOf(bar)
      bars[index] -= need
    }
  })
  return Math.max(1, bars.length)
}
const roundQty = (n, places = 2) => {
  const p = 10 ** places
  return Math.round(n * p) / p
}

const row = (id, description, quantity, price, meta, formula, places = 2) => ({
  id, description, code:meta.code, quantity:roundQty(quantity, places), unit:meta.unit,
  unitPrice:Number(meta.unitPrice ?? price ?? 0), total:roundQty(quantity * Number(meta.unitPrice ?? price ?? 0), 2),
  formula, source:meta.source, fixedPrice:meta.fixedPrice !== false,
})

export function trialcoMaterialRows(design) {
  const d = trialcoDimensions(design)
  const itemQty = Math.max(1, Number(design.cells?.[0]?.itemQty || 1))
  const projectQty = Math.max(1, Number(design.qty || 1)) * itemQty
  const leafQty = TRIALCO_FORMULAS.leafCount
  const netQty = TRIALCO_FORMULAS.netQtyPerBay
  const glassQty = TRIALCO_FORMULAS.glassQtyPerBay
  const frameLength = 2 * (d.frameW + d.frameH)
  const leafLength = leafQty * 2 * (d.leafW + d.leafH)
  const netLength = netQty * 2 * (d.netW + d.netH)
  const interlockLength = TRIALCO_FORMULAS.interlockQtyPerBay * d.interlockLength
  const frameCuts = [d.frameW, d.frameW, d.frameH, d.frameH]
  const leafCuts = Array(leafQty).fill([d.leafW, d.leafW, d.leafH, d.leafH]).flat()
  const netCuts = Array(netQty).fill([d.netW, d.netW, d.netH, d.netH]).flat()
  const interlockCuts = Array(TRIALCO_FORMULAS.interlockQtyPerBay).fill(d.interlockLength)
  const glassArea = glassQty * d.glassW * d.glassH / 1e6
  const netArea = netQty * d.netW * d.netH / 1e6
  const glassPerimeter = glassQty * 2 * (d.glassW + d.glassH) / 1000
  const netPerimeter = netQty * 2 * (d.netW + d.netH) / 1000
  const selectedGlass = design.cells?.[0]?.glass || '5CF'
  const glass = frameGlassByCode(selectedGlass)
  const glassMeta = { code:selectedGlass, unit:'m²', unitPrice:glass?.pricePerM2 ?? 120, source:'Glass catalogue' }

  const baseRows = [
    row('trialco-frame', 'Trialco frame', barsFor(frameCuts, projectQty), TRIALCO_MATERIAL_PRICES.frame.unitPrice, TRIALCO_MATERIAL_PRICES.frame,
      `${roundQty(frameLength * projectQty / 1000)} m required · 5 mm kerf nesting · 2 × (Frame W + Frame H)`),
    row('trialco-leaf', 'Trialco leaf', barsFor(leafCuts, projectQty), TRIALCO_MATERIAL_PRICES.leaf.unitPrice, TRIALCO_MATERIAL_PRICES.leaf,
      `${roundQty(leafLength * projectQty / 1000)} m required · 2 leaves × 2 × (Leaf W + Leaf H)`),
    row('trialco-net', 'Trialco net', barsFor(netCuts, projectQty), TRIALCO_MATERIAL_PRICES.net.unitPrice, TRIALCO_MATERIAL_PRICES.net,
      `${roundQty(netLength * projectQty / 1000)} m required · 2 nets × perimeter`),
    row('trialco-interlock', 'Trialco interlock', barsFor(interlockCuts, projectQty), TRIALCO_MATERIAL_PRICES.interlock.unitPrice, TRIALCO_MATERIAL_PRICES.interlock,
      `${roundQty(interlockLength * projectQty / 1000)} m required · 2 × Leaf H`),
    row('trialco-kit', 'Trialco kits', projectQty, TRIALCO_MATERIAL_PRICES.kit.unitPrice, TRIALCO_MATERIAL_PRICES.kit,
      '1 set per bay'),
    row('glass', `Glass — ${glass?.label || selectedGlass}`, glassArea * projectQty, glassMeta.unitPrice, glassMeta,
      `${roundQty(glassArea * projectQty)} m² · 2 panels × Glass W × Glass H`),
    row('0404-corners', '0404 corners', 4 * leafQty * projectQty, TRIALCO_MATERIAL_PRICES.corner.unitPrice, TRIALCO_MATERIAL_PRICES.corner,
      '4 corners per leaf'),
    row('trialco-rollers', 'Trialco rollers', 2 * leafQty * projectQty, TRIALCO_MATERIAL_PRICES.rollers.unitPrice, TRIALCO_MATERIAL_PRICES.rollers,
      '2 rollers per leaf'),
    row('metal-locks', 'Metal locks', leafQty * projectQty, TRIALCO_MATERIAL_PRICES.locks.unitPrice, TRIALCO_MATERIAL_PRICES.locks,
      '1 lock per leaf'),
    row('net-corners', 'Net corners', 4 * netQty * projectQty, TRIALCO_MATERIAL_PRICES.netCorners.unitPrice, TRIALCO_MATERIAL_PRICES.netCorners,
      '4 corners per net'),
    row('net-handle', 'Net handle', netQty * projectQty, TRIALCO_MATERIAL_PRICES.netHandle.unitPrice, TRIALCO_MATERIAL_PRICES.netHandle,
      '1 handle per net'),
    row('net-fibre', 'Net fibre', netArea * projectQty, TRIALCO_MATERIAL_PRICES.netFibre.unitPrice, TRIALCO_MATERIAL_PRICES.netFibre,
      `${roundQty(netArea * projectQty)} m² · 2 nets × Net W × Net H`),
    row('glazing-rubber', 'Glazing rubber', glassPerimeter * projectQty, TRIALCO_MATERIAL_PRICES.glazing.unitPrice, TRIALCO_MATERIAL_PRICES.glazing,
      `${roundQty(glassPerimeter * projectQty)} m · glass perimeter`),
    row('net-rubber', 'Net rubber', netPerimeter * projectQty, TRIALCO_MATERIAL_PRICES.netRubber.unitPrice, TRIALCO_MATERIAL_PRICES.netRubber,
      `${roundQty(netPerimeter * projectQty)} m · net perimeter`),
    row('installation-screws', 'Installation screws', 4 * projectQty, TRIALCO_MATERIAL_PRICES.screws.unitPrice, TRIALCO_MATERIAL_PRICES.screws,
      '4 screws per bay'),
    row('wall-plugs', 'Wall plugs', 4 * projectQty, TRIALCO_MATERIAL_PRICES.wallPlugs.unitPrice, TRIALCO_MATERIAL_PRICES.wallPlugs,
      '4 plugs per bay'),
    row('water-drain-cap', 'Water drain cap', 2 * projectQty, TRIALCO_MATERIAL_PRICES.drainCaps.unitPrice, TRIALCO_MATERIAL_PRICES.drainCaps,
      '2 caps per bay'),
    row('pvc-hole-cover', 'PVC hole cover', 2 * projectQty, TRIALCO_MATERIAL_PRICES.pvcCovers.unitPrice, TRIALCO_MATERIAL_PRICES.pvcCovers,
      '2 covers per bay'),
    row('silicone', 'Silicone', projectQty, TRIALCO_MATERIAL_PRICES.silicone.unitPrice, TRIALCO_MATERIAL_PRICES.silicone,
      '1 tube per bay'),
    row('italian-brush', 'Italian brush', netPerimeter * projectQty, TRIALCO_MATERIAL_PRICES.brush.unitPrice, TRIALCO_MATERIAL_PRICES.brush,
      `${roundQty(netPerimeter * projectQty)} m · net perimeter`),
  ]

  // The normal accessory editor already knows catalogue door extras and
  // custom project materials. Merge overrides into matching base rows, then
  // append only genuinely additional rows so Trialco costs are not duplicated.
  const overrideByCode = new Map((design.accessoryOverrides || []).map(o => [o.code, o]))
  const adjustedBaseRows = baseRows.flatMap(base => {
    const override = overrideByCode.get(base.code)
    if (!override) return [base]
    if (override.removed || Number(override.qty || 0) <= 0) return []
    const priceOverridden = override.unitPrice != null
    return [row(base.id, override.name || base.description, Number(override.qty),
      priceOverridden ? Number(override.unitPrice) : base.unitPrice,
      { ...base, unitPrice:priceOverridden ? Number(override.unitPrice) : base.unitPrice,
        source:priceOverridden ? 'Project material override' : base.source,
        fixedPrice:!priceOverridden },
      override.rule || base.formula)]
  })
  const additionalRows = frameAccessoryRows(design)
    .filter(a => !TRIALCO_BASE_MATERIAL_CODES.has(a.code))
    .map(a => row(`trialco-extra-${a.code}`, a.name, Number(a.qty || 0), Number(a.unitPrice || 0), {
      code:a.code, unit:a.unit || 'pcs', unitPrice:Number(a.unitPrice || 0),
      source:a.custom ? 'Project custom material' : 'Trialco accessory catalogue',
      fixedPrice:!a.custom,
    }, a.rule || 'Project accessory quantity'))
  const rows = [...adjustedBaseRows, ...additionalRows]
  const materialCost = rows.reduce((s, x) => s + x.total, 0)
  const installationCost = materialCost * 0.30
  return {
    rows, materialCost:roundQty(materialCost), installationPercent:30,
    installationCost:roundQty(installationCost), totalCost:roundQty(materialCost + installationCost),
    materialCostPerUnit:roundQty(materialCost / projectQty),
    installationCostPerUnit:roundQty(installationCost / projectQty),
    totalCostPerUnit:roundQty((materialCost + installationCost) / projectQty),
    priceSource:'Trialco internal costing sheet rates · glass catalogue rate',
  }
}

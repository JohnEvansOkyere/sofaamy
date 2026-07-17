// ============================================================
// CUTTING OPTIMIZER — 1D nesting, first-fit-decreasing.
// Mirrors the backend engine (app/optimizer.py) so the demo
// works even with no API running.
//
// Each profile group is nested separately (different stock
// bars — and mill/anodized finishes can't share a bar).
// Kerf is lost on every cut. Waste = leftover on each bar.
// ============================================================
import { PROFILES, CUTTING } from './products.js'

// pieces: [{ profile, member, lengthMm, qty }]
// → { groups:[{ profile, stockMm, bars:[{cuts:[{member,lengthMm}], usedMm, wasteMm}],
//               totalMm, wasteMm, utilization }], overallUtilization, totalBars }
export function optimizeCutting(pieces, kerfMm = CUTTING.kerfMm) {
  const byProfile = {}
  pieces.forEach(p => { (byProfile[p.profile] = byProfile[p.profile] || []).push(p) })

  const groups = Object.entries(byProfile).map(([profile, list]) => {
    const stockMm = PROFILES[profile]?.stockMm || 6000

    // expand qty → individual cuts, longest first (FFD)
    const cuts = list
      .flatMap(p => Array.from({ length: p.qty }, () => ({
        member: p.member, position:p.position || p.member, lengthMm: p.lengthMm,
      })))
      .sort((a, b) => b.lengthMm - a.lengthMm)

    const bars = []
    const oversized = []
    cuts.forEach(c => {
      const need = c.lengthMm + kerfMm
      if (need > stockMm) { oversized.push({ ...c, reason:`${c.lengthMm} mm + ${kerfMm} mm kerf exceeds ${stockMm} mm stock` }); return }
      let bar = bars.find(b => stockMm - b.usedMm >= need)
      if (!bar) { bar = { cuts: [], usedMm: 0 }; bars.push(bar) }
      bar.cuts.push(c)
      bar.usedMm += need
    })
    bars.forEach(b => { b.wasteMm = stockMm - b.usedMm })

    const totalStock = bars.length * stockMm
    const totalCut = cuts.filter(c => c.lengthMm + kerfMm <= stockMm)
      .reduce((s, c) => s + c.lengthMm, 0)
    return {
      profile, stockMm, bars,
      oversized,
      totalMm: totalCut,
      wasteMm: totalStock - totalCut,
      utilization: totalStock ? +(100 * totalCut / totalStock).toFixed(1) : 0,
    }
  })

  const stockSum = groups.reduce((s, g) => s + g.bars.length * g.stockMm, 0)
  const cutSum = groups.reduce((s, g) => s + g.totalMm, 0)
  return {
    groups,
    totalBars: groups.reduce((s, g) => s + g.bars.length, 0),
    overallUtilization: stockSum ? +(100 * cutSum / stockSum).toFixed(1) : 0,
    kerfMm,
  }
}

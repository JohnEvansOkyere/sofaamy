import { useMemo } from 'react'
import { designBreakdown, extractPieces, multiplyPieces, profileLabel } from '../../lib/pieces.js'
import { optimizeCutting } from '../../lib/optimize.js'
import { PROFILES, CUTTING, GLASS } from '../../lib/products.js'
import { IconFactory } from '../icons.jsx'

// One stock bar: proportional cut segments + waste tail
function Bar({ bar, stockMm }) {
  return (
    <div className="cut-bar">
      {bar.cuts.map((c, i) => (
        <div key={i} className="cut-seg" style={{ width: `${(c.lengthMm / stockMm) * 100}%` }}
          title={`${c.member} — ${c.lengthMm} mm`}>
          <span>{c.lengthMm}</span>
        </div>
      ))}
      <div className="cut-waste" style={{ width: `${(bar.wasteMm / stockMm) * 100}%` }}
        title={`Waste — ${bar.wasteMm} mm`}>
        {bar.wasteMm > stockMm * 0.06 && <span>{bar.wasteMm}</span>}
      </div>
    </div>
  )
}

// Demand table + optimized cut plan, derived live from the design.
// This is the unified-platform moment: the DEMAND list Sofaamy
// currently types into their desktop optimizer by hand fills
// itself in from the canvas.
export default function CutPlan({ design }) {
  const qty = design.qty || 1
  const breakdown = useMemo(() => designBreakdown(design), [design])
  const pieces = useMemo(() => multiplyPieces(extractPieces(design), qty), [design, qty])
  const plan = useMemo(() => optimizeCutting(pieces), [pieces])

  return (
    <div className="cfg-panel" style={{ marginTop: 16 }}>
      <h4><IconFactory style={{ width: 16, height: 16, color: 'var(--navy-600)' }} /> Production — Cutting Plan
        <span className="badge b-green" style={{ marginLeft: 'auto' }}><span className="bdot" />Generated live from design</span>
      </h4>
      <div className="cfg-body cutplan">

        <div className="cutplan-grid">
          {/* ── DESIGN BREAKDOWN ── */}
          <div>
            <div className="cfg-label" style={{ marginTop: 0 }}>Profile Breakdown — per unit{qty > 1 ? ` (× ${qty} units for cutting)` : ''}</div>
            <table className="cut-table">
              <thead><tr><th>Position</th><th>Profile</th><th className="r">Length (mm)</th><th>Cuts</th><th className="r">Qty</th></tr></thead>
              <tbody>
                {breakdown.profiles.map((p, i) => (
                  <tr key={i}>
                    <td>{p.position}</td>
                    <td>{profileLabel(p.profile)}</td>
                    <td className="r t-mono">{p.lengthMm.toLocaleString()}</td>
                    <td className="t-mono" style={{ fontSize: 11 }}>{p.cuts}</td>
                    <td className="r t-mono">{p.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="cfg-label">Glass Cutting Sizes — per unit</div>
            <table className="cut-table">
              <thead><tr><th>Section</th><th>Glass</th><th className="r">Cut W × H (mm)</th><th className="r">Qty</th></tr></thead>
              <tbody>
                {breakdown.glass.map((g, i) => (
                  <tr key={i}>
                    <td>{g.section} <span className="muted" style={{ fontSize: 10.5 }}>({g.note})</span></td>
                    <td>{GLASS[g.glass]?.label || g.glass}</td>
                    <td className="r t-mono">{g.wMm.toLocaleString()} × {g.hMm.toLocaleString()}</td>
                    <td className="r t-mono">{g.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="cut-note">
              Deductions: mullion/transom −2×50 mm frame depth · sliding sash = section/n + 15 mm interlock,
              height −30 mm track · glass = opening −70 mm (fixed) / sash −60 mm · kerf {plan.kerfMm} mm ·
              min offcut {CUTTING.minOffcutMm} mm — <b>all placeholder values, confirm with Sofaamy</b>
            </div>
          </div>

          {/* ── OPTIMIZED PLAN ── */}
          <div>
            <div className="flex between items-center" style={{ marginBottom: 8 }}>
              <div className="cfg-label" style={{ margin: 0 }}>Optimized Nesting</div>
              <div className="cut-stats">
                <span><b>{plan.totalBars}</b> stock bar(s)</span>
                <span>Utilization <b style={{ color: plan.overallUtilization >= 85 ? 'var(--green)' : 'var(--orange)' }}>{plan.overallUtilization}%</b></span>
              </div>
            </div>
            {plan.groups.map(g => (
              <div key={g.profile} className="cut-group">
                <div className="cut-group-head">
                  <b>{profileLabel(g.profile)}</b>
                  <span className="muted">stock {g.stockMm.toLocaleString()} mm · {g.bars.length} bar(s) · waste {(g.wasteMm / 1000).toFixed(2)} m · {g.utilization}% used</span>
                </div>
                {g.bars.map((b, i) => <Bar key={i} bar={b} stockMm={g.stockMm} />)}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

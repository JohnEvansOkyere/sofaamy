import { useMemo } from 'react'
import { framelessBreakdown } from '../../lib/frameless.js'
import { FL_PANEL_TYPES } from '../../lib/products.js'
import { GHS } from '../../lib/pricing.js'
import { IconFactory } from '../icons.jsx'

// Frameless production panel — the SmartGlazier "Glass Order":
// every toughened panel's exact cut size, weight and processing
// (holes/cutouts/edgework), plus the priced hardware list.
// Tempered glass can't be cut or drilled after toughening, so this
// sheet IS the order sent to the glass processor.
export default function GlassOrder({ design }) {
  const qty = design.qty || 1
  const bd = useMemo(() => framelessBreakdown(design), [design])
  const hwTotal = bd.hardware.reduce((s, h) => s + h.qty * h.price, 0)

  return (
    <div className="cfg-panel" style={{ marginTop: 16 }}>
      <h4><IconFactory style={{ width: 16, height: 16, color: 'var(--navy-600)' }} /> Production — Glass Order & Hardware
        <span className="badge b-green" style={{ marginLeft: 'auto' }}><span className="bdot" />Generated live from design</span>
      </h4>
      <div className="cfg-body cutplan">
        <div className="cutplan-grid">
          <div>
            <div className="cfg-label" style={{ marginTop: 0 }}>
              Glass Order — per unit{qty > 1 ? ` (× ${qty} units)` : ''} · {bd.glass.label} ·
              {' '}{bd.totalArea} m² · {bd.totalKg} kg
            </div>
            <table className="cut-table">
              <thead><tr><th>Mark</th><th>Panel</th><th className="r">Cut W × H (mm)</th><th className="r">kg</th><th>Processing</th></tr></thead>
              <tbody>
                {bd.panels.map((p, i) => (
                  <tr key={i}>
                    <td className="t-mono">{p.mark}</td>
                    <td>{p.type === 'over' ? 'Over-panel' : FL_PANEL_TYPES[p.type]?.label || p.type}</td>
                    <td className="r t-mono">{p.wMm.toLocaleString()} × {p.hMm.toLocaleString()}</td>
                    <td className="r t-mono">{p.kg}</td>
                    <td style={{ fontSize: 11 }}>{p.holes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cut-note">
              All panels toughened — holes and cutouts MUST be processed before tempering ·
              edgework: flat polish 2 long 2 short · weight rule 2.5 kg/m²/mm (verified vs Sofaamy's
              SmartGlazier print) · joint gaps {`5 mm fixed / 8 mm door / 10 mm floor`} derived from job
              SGP/4462-26A — <b>confirm as house standards</b>
            </div>
          </div>

          <div>
            <div className="cfg-label" style={{ marginTop: 0 }}>Hardware — per unit (Sofaamy codes & GHS prices)</div>
            <table className="cut-table">
              <thead><tr><th className="r">Qty</th><th>Code</th><th>Description</th><th className="r">Unit</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {bd.hardware.map((h, i) => (
                  <tr key={i}>
                    <td className="r t-mono">{h.qty * qty}</td>
                    <td className="t-mono">{h.code}</td>
                    <td style={{ fontSize: 11.5 }}>{h.desc}</td>
                    <td className="r t-mono">{GHS(h.price)}</td>
                    <td className="r t-mono">{GHS(h.qty * qty * h.price)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} style={{ fontWeight: 700, textAlign: 'right' }}>Hardware total</td>
                  <td className="r t-mono" style={{ fontWeight: 700 }}>{GHS(hwTotal * qty)}</td>
                </tr>
              </tbody>
            </table>
            <div className="cut-note">
              Codes and unit prices lifted from Sofaamy's own SmartGlazier hardware list
              (job SGP/4462-26A) — items marked PLACEHOLDER pending their full catalog.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

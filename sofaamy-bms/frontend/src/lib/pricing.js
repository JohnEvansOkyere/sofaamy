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
import { FRAME_SYSTEMS, frameAccessoryRows, frameRateForRateKey, frameRateKeyForOpening, frameGlassByCode } from './frameCatalog.js'

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
    s + (sizes[i].wMm * sizes[i].hMm / 1e6) * (frameGlassByCode(c.glass)?.pricePerM2 ?? GLASS[c.glass]?.price ?? 120), 0)
  const accessories = d.category === 'frame' ? frameAccessoryRows(d) : []
  const accessoryProjectCost = accessories.reduce((s, a) => s + Number(a.qty || 0) * Number(a.unitPrice || 0), 0)
  const hardwareCost = d.category === 'frame'
    ? accessoryProjectCost / qty
    : d.cells.reduce((s,c) => s + (OPENINGS[c.opening]?.hardware ?? 80) * (c.opening === 'fixed' ? 1 : (c.panels || 1)), 0)
  const labourCost   = area * RATES.labourPerM2
  const installCost  = area * RATES.installPerM2

  const subtotal = profileCost + glassCost + hardwareCost + labourCost + installCost
  const margin   = subtotal * (RATES.marginPercent / 100)
  const internalTotal = subtotal + margin

  // Client-facing quote style from Sofaamy's spreadsheet: one row per
  // opening, area × quantity × bundled rate, then discount and taxes. The
  // material/labour lines above remain available as an internal working
  // estimate; they are not shown on the client quotation.
  const clientRows = d.cells.map((c, i) => {
    const size = sizes[i]
    const rateKey = c.rateKey || frameRateKeyForOpening(c.opening)
    const unitPrice = Number.isFinite(c.ratePerM2) ? c.ratePerM2 : frameRateForRateKey(rateKey)
    const rowArea = size.wMm * size.hMm / 1e6
    const rowQty = Math.max(1, Number(c.itemQty || 1)) * qty
    return {
      description: OPENINGS[c.opening]?.label || c.opening,
      widthMm: Math.round(size.wMm), heightMm: Math.round(size.hMm),
      qty: rowQty, m2:+(rowArea * rowQty).toFixed(2), unitPrice,
      total:+(rowArea * rowQty * unitPrice).toFixed(2), rateKey,
    }
  })
  const clientSubtotal = clientRows.reduce((s, r) => s + r.total, 0)
  const discountPercent = Math.max(0, Number(d.discountPercent ?? 0))
  const getfNhisPercent = Math.max(0, Number(d.getfNhisPercent ?? 5))
  const vatPercent = Math.max(0, Number(d.vatPercent ?? 15))
  const clientDiscount = clientSubtotal * discountPercent / 100
  const clientNet = clientSubtotal - clientDiscount
  const clientGetfNhis = clientNet * getfNhisPercent / 100
  const clientVat = clientNet * vatPercent / 100
  const clientGrandTotal = clientNet + clientGetfNhis + clientVat
  const calculatedFloor = subtotal * qty
  const floorOverride = Math.max(0, Number(d.costFloorOverride || 0))
  const internalFloor = floorOverride > 0 ? floorOverride : calculatedFloor
  const floorGap = clientNet - internalFloor

  return {
    area:+area.toFixed(2), sections, dividers:(d.cols-1)+(d.rows-1),
    profileLen:+profileLen.toFixed(2), pieces, pieceCount,
    qty, grandTotal:+clientGrandTotal.toFixed(2),
    lines:[
      { key:'Aluminium profile', detail:`${profileLen.toFixed(2)} m · ${pieceCount} cut pieces`, amount:profileCost },
      { key:'Glass', detail:`${area.toFixed(2)} m² · ${sections} section(s)`, amount:glassCost },
      { key:'Hardware & accessories', detail:`${accessories.length} catalogue/custom line(s)`, amount:hardwareCost },
      { key:'Fabrication labour', detail:`${area.toFixed(2)} m² × ₵${RATES.labourPerM2}/m²`, amount:labourCost },
      { key:'Installation', detail:`${area.toFixed(2)} m² × ₵${RATES.installPerM2}/m²`, amount:installCost },
    ],
    subtotal:+subtotal.toFixed(2), margin:+margin.toFixed(2),
    marginPct:RATES.marginPercent, total:+(clientGrandTotal / qty).toFixed(2),
    internalTotal:+internalTotal.toFixed(2),
    accessories,
    materialCostPerUnit:+(profileCost + glassCost + hardwareCost).toFixed(2),
    labourCostPerUnit:+labourCost.toFixed(2), installationCostPerUnit:+installCost.toFixed(2),
    internalFloorPerUnit:+(internalFloor / qty).toFixed(2), internalFloor:+internalFloor.toFixed(2),
    calculatedInternalFloor:+calculatedFloor.toFixed(2), costFloorOverride:+floorOverride.toFixed(2),
    costFloorSource:floorOverride > 0 ? 'approved project BOQ / material sheet' : 'working estimate',
    clientNet:+clientNet.toFixed(2), floorGap:+floorGap.toFixed(2),
    floorStatus:floorGap >= -0.01 ? 'OK' : 'BELOW FLOOR',
    clientLines:clientRows,
    clientSubtotal:+clientSubtotal.toFixed(2),
    discountPercent, discountAmount:+clientDiscount.toFixed(2),
    getfNhisPercent, getfNhis:+clientGetfNhis.toFixed(2),
    vatPercent, vat:+clientVat.toFixed(2),
    clientGrandTotal:+clientGrandTotal.toFixed(2),
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
    rows.push({ item:`Glass — ${frameGlassByCode(g)?.label || GLASS[g]?.label || g}`, qty:`${n} section(s)`, note:`₵${frameGlassByCode(g)?.pricePerM2 ?? GLASS[g]?.price ?? '—'}/m²` }))
  if (d.category === 'frame') frameAccessoryRows(d).forEach(a =>
    rows.push({ item:`Accessory — ${a.name}`, qty:`${a.qty} ${a.unit || 'pcs'}`, note:`${a.code} · ${a.rule}` }))
  else Object.entries(byOpening).forEach(([o,n]) =>
    rows.push({ item:`Hardware — ${OPENINGS[o]?.label || o}`, qty:`${n} set(s)`, note:'—' }))
  rows.push({ item:'Rubber gaskets', qty:`${q.profileLen.toFixed(2)} m`, note:'EPDM' })
  rows.push({ item:'Fasteners', qty:`${q.sections * 8} pcs`, note:'Stainless' })
  const source = FRAME_SYSTEMS[d.system]
  if (source?.profiles?.length) {
    rows.push({ item:`Catalogue references — ${source.label}`, qty:'—', note:'Source profile identity; cut-role mapping pending' })
    source.profiles.forEach(p => rows.push({
      item:`${p.name} (${p.code})`, qty:'catalogue', note:`${p.lengthMm} mm · listed GHS ${p.listedPrice}`
    }))
  }
  return rows
}

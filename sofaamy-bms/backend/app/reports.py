"""Production & material report PDFs — cutting list, factory work order,
BOQ. Sofaamy-branded, GHS amounts ("GHS" text — cedi glyph not in the
built-in fonts).
"""
from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .pricing import (FRAME_GLASS, GLASS, GLASS_LABELS, HARDWARE, PROFILE_LABELS,
                      PROFILE_PRICES, _col_widths, _row_heights, any_breakdown)

NAVY = colors.HexColor("#122a46")
MUTED = colors.HexColor("#68788a")
LINE = colors.HexColor("#d8dfe6")
BG = colors.HexColor("#eef2f6")

H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=15, textColor=NAVY, spaceAfter=1)
SUB = ParagraphStyle("sub", fontName="Helvetica", fontSize=9, textColor=MUTED, spaceAfter=8)
H2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=10.5, textColor=NAVY,
                    spaceBefore=10, spaceAfter=4)
NOTE = ParagraphStyle("note", fontName="Helvetica-Oblique", fontSize=8, textColor=MUTED,
                      spaceBefore=6)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.2, leading=9.5,
                      textColor=colors.HexColor("#111827"))

BASE_STYLE = TableStyle([
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, 0), 8),
    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
    ("FONTSIZE", (0, 1), (-1, -1), 8.5),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("BACKGROUND", (0, 0), (-1, 0), NAVY),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG]),
    ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ("TOPPADDING", (0, 0), (-1, -1), 3.5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
])


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(16 * mm, 14 * mm, A4[0] - 16 * mm, 14 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(16 * mm, 10 * mm, "Sofaamy Co. Ltd · Glass & Aluminium Fabrication · Accra, Ghana")
    canvas.drawRightString(A4[0] - 16 * mm, 10 * mm, f"Powered by Veloxa · page {doc.page}")
    canvas.restoreState()


def _build(title, sub, flow):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=20 * mm, title=title)
    doc.build([Paragraph(title, H1), Paragraph(sub, SUB)] + flow,
              onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


def _meta_line(design, result):
    ref = design.get("ref") or "—"
    loc = design.get("location") or "—"
    measurement = (design.get("measurement_status") or "preliminary").replace("_", " ").title()
    source = design.get("measurement_source") or "not recorded"
    return (f"Design ref: <b>{ref}</b> · {design['name']} · {design['width']} × {design['height']} mm · "
            f"Qty: <b>{result['qty']}</b> · Location: {loc} · Measurement: <b>{measurement}</b> ({source}) · "
            f"{datetime.now():%d %b %Y}")


def ghs(n):
    return f"GHS {n:,.2f}"


def _cell(value, style=CELL):
    """Wrap long report-table values instead of allowing columns to collide."""
    return Paragraph(escape(str(value)).replace("\n", "<br/>") or "—", style)


def _mm_adjustment(value):
    value = int(round(value or 0))
    return f"+{value:,}" if value > 0 else f"{value:,}"


def _piece_position(piece):
    return f"{piece['position']} — {piece['note']}" if piece.get("note") else piece["position"]


def _trialco_formula_table(result):
    f = result.get("fabrication") or {}
    if f.get("system") != "trialco":
        return None
    rows = [["Aspect", "Formula", "Working result"]]
    rows += [
        ["Frame", "Site measurement: Frame W × Frame H",
         f"{f['frame']['w_mm']:,} × {f['frame']['h_mm']:,} mm"],
        ["Leaf × 2", "Leaf W = Frame W ÷ 2; Leaf H = Frame H − 70",
         f"{f['leaf']['w_mm']:,} × {f['leaf']['h_mm']:,} mm"],
        ["Net × 2", "Net W = Leaf W; Net H = Leaf H − 10",
         f"{f['net']['w_mm']:,} × {f['net']['h_mm']:,} mm"],
        ["Interlock × 2", "Interlock length = Leaf H",
         f"{f['interlock']['length_mm']:,} mm long"],
        ["Glass × 2", "Glass W/H = Leaf W/H − 112",
         f"{f['glass']['w_mm']:,} × {f['glass']['h_mm']:,} mm"],
    ]
    t = Table([[_cell(v) for v in row] for row in rows], colWidths=[29 * mm, 88 * mm, 49 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    return t


def _trialco_material_table(result):
    """Project-level material quantities and fixed internal unit prices."""
    material_rows = result.get("material_rows") or []
    if not material_rows:
        return None
    rows = [["Item", "Code", "Qty", "Unit", "Unit price", "Total"]]
    for item in material_rows:
        rows.append([
            _cell(item.get("description", "—")),
            _cell(item.get("code", "—")),
            _cell(f"{float(item.get('quantity', 0) or 0):g}"),
            _cell(item.get("unit", "—")),
            _cell(ghs(float(item.get("unit_price", 0) or 0))),
            _cell(ghs(float(item.get("total", 0) or 0))),
        ])
    rows.extend([
        ["", "", "", "", "Material cost", ghs(result.get("material_cost", 0) or 0)],
        ["", "", "", "", f"Installation ({result.get('installation_percent', 30)}%)", ghs(result.get("installation_cost", 0) or 0)],
        ["", "", "", "", "Total internal cost", ghs(result.get("total_material_cost", 0) or 0)],
    ])
    table = Table(rows, colWidths=[43 * mm, 29 * mm, 18 * mm, 22 * mm, 29 * mm, 31 * mm], repeatRows=1)
    table.setStyle(BASE_STYLE)
    return table


# ── 1. CUTTING LIST ──────────────────────────────────────────

def cutting_list_pdf(design: dict, result: dict, demand: list[dict], plan: dict) -> bytes:
    bd = any_breakdown(design)
    qty = result["qty"]
    flow = []

    formula_table = _trialco_formula_table(result)
    if formula_table:
        flow.append(Paragraph("Trialco bay formula summary — PER BAY", H2))
        flow.append(formula_table)
        flow.append(Paragraph(
            "This is the working Trialco recipe used below. Quantities and final profile cut rules must be checked against Sofaamy's approved calculation before factory release.", NOTE))
        material_table = _trialco_material_table(result)
        if material_table:
            flow.append(Paragraph("Trialco internal material cost list — PROJECT TOTALS", H2))
            flow.append(material_table)
            flow.append(Paragraph(
                "Material quantities are prepopulated from Frame W, Frame H and project quantity. Unit prices are fixed internal costing-sheet rates; the selected glass catalogue rate is used for the glass row.", NOTE))

    flow.append(Paragraph("Profile breakdown — every piece, with deductions and cut angles (all units)", H2))
    rows = [["Position", "Profile", "Input (mm)", "Adj. (mm)", "Cut (mm)", "Cuts", "Qty"]] + [
        [_cell(_piece_position(p)),
         _cell(PROFILE_LABELS.get(p["profile"], p["profile"])),
         _cell(f"{p.get('source_mm', p['length_mm']):,}"),
         _cell(_mm_adjustment(p.get('adjustment_mm', 0))),
         _cell(f"{p['length_mm']:,}"), _cell(p["cuts"]), _cell(str(p["qty"] * qty))]
        for p in bd["profiles"]]
    t = Table(rows, colWidths=[42 * mm, 34 * mm, 22 * mm, 20 * mm, 22 * mm, 24 * mm, 14 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph("Glass cutting sizes (all units)", H2))
    rows = [["Section", "Glass", "Source W × H (mm)", "Cut W × H (mm)", "Qty"]] + [
        [_cell(f"{g['section']} ({g['note']})"), _cell(GLASS_LABELS.get(g["glass"], g["glass"])),
         _cell(f"{g.get('source_w_mm', g['w_mm']):,} × {g.get('source_h_mm', g['h_mm']):,}"),
         _cell(f"{g['w_mm']:,} × {g['h_mm']:,}"), _cell(str(g["qty"] * qty))] for g in bd["glass"]]
    t = Table(rows, colWidths=[38 * mm, 30 * mm, 40 * mm, 50 * mm, 20 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    flow.append(t)
    if bd.get("net"):
        flow.append(Paragraph("Net cutting sizes (all units)", H2))
        rows = [["Panel", "Source W × H (mm)", "Cut W × H (mm)", "Qty"]] + [
            [_cell(f"{n['section']} ({n.get('note', '')})"),
             _cell(f"{n.get('source_w_mm', n['w_mm']):,} × {n.get('source_h_mm', n['h_mm']):,}"),
             _cell(f"{n['w_mm']:,} × {n['h_mm']:,}"), _cell(str(n['qty'] * qty))]
            for n in bd["net"]]
        t = Table(rows, colWidths=[74 * mm, 42 * mm, 50 * mm, 20 * mm], repeatRows=1)
        t.setStyle(BASE_STYLE)
        flow.append(t)
    flow.append(Paragraph(
        "This schedule expands the design into individual fabrication pieces. Each profile row shows "
        "input size + adjustment = cut length; double openings are expanded into separate leaf rows. "
        "The current deductions are working rules and the exact Sofaamy source-profile role mapping "
        "still requires supervisor confirmation before factory release.", NOTE))

    flow.append(PageBreak())
    flow.append(Paragraph("Stock-bar nesting plan", H2))
    for g in plan["groups"]:
        label = PROFILE_LABELS.get(g["profile"], g["profile"])
        flow.append(Paragraph(
            f"{label} — stock {g['stock_mm']:,} mm · {len(g['bars'])} bar(s) · "
            f"utilization {g['utilization']}% · waste {g['waste_mm'] / 1000:.2f} m", H2))
        if g.get("oversized"):
            flow.append(Paragraph(
                f"WARNING: {len(g['oversized'])} cut(s) exceed the available {g['stock_mm']:,} mm stock length "
                "including kerf. Resolve the profile/stock rule before releasing this list.", NOTE))
        rows = [["Bar", "Cut sequence (mm)", "Used (mm)", "Waste (mm)"]]
        for i, b in enumerate(g["bars"], 1):
            seq = "  +  ".join(f"{c.get('position', c.get('member', 'cut'))}: {c['length_mm']:,}" for c in b["cuts"])
            rows.append([_cell(str(i)), _cell(seq), _cell(f"{b['used_mm']:,}"), _cell(f"{b['waste_mm']:,}")])
        t = Table(rows, colWidths=[12 * mm, 106 * mm, 30 * mm, 30 * mm])
        t.setStyle(BASE_STYLE)
        flow.append(t)

    flow.append(Paragraph(
        f"Totals: {plan['total_bars']} stock bar(s) · overall utilization "
        f"{plan['overall_utilization']}% · kerf {plan['kerf_mm']} mm per cut "
        f"(kerf and stock lengths to be confirmed with Sofaamy).", NOTE))
    return _build("CUTTING LIST", _meta_line(design, result), flow)


# ── 2. FACTORY WORK ORDER ────────────────────────────────────

STAGES = ["Cutting", "Processing", "Holes / Routing", "Assembly", "Glazing", "QA", "Delivery"]


def work_order_pdf(design: dict, result: dict, pieces_per_unit: list[dict]) -> bytes:
    cw, rh = _col_widths(design), _row_heights(design)
    cols = design["cols"]
    flow = []

    flow.append(Paragraph("Sections", H2))
    rows = [["Section", "Size (mm)", "Glass", "Opening", "Opening panels"]]
    if (result.get("fabrication") or {}).get("system") == "trialco":
        f = result["fabrication"]
        rows.append(["Bay", f"{f['frame']['w_mm']} × {f['frame']['h_mm']}",
                     "2 panels", "Trialco sliding", "2 leaves"])
    else:
        for i, c in enumerate(design["cells"]):
            rows.append([f"F{i + 1}", f"{round(cw[i % cols])} × {round(rh[i // cols])}",
                         GLASS_LABELS.get(c["glass"], c["glass"]), c["opening"].title(),
                         "—" if c["opening"] == "fixed" else str(c.get("panels") or 1)])
    t = Table(rows, colWidths=[20 * mm, 38 * mm, 45 * mm, 40 * mm, 30 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    formula_table = _trialco_formula_table(result)
    if formula_table:
        flow.append(Paragraph("Trialco fabrication formula summary", H2))
        flow.append(formula_table)
        material_table = _trialco_material_table(result)
        if material_table:
            flow.append(Paragraph("Trialco internal material cost list — PROJECT TOTALS", H2))
            flow.append(material_table)

    bd = any_breakdown(design)
    flow.append(Paragraph("Cut pieces — PER UNIT (with deductions and cut angles)", H2))
    rows = [["Position", "Profile", "Input (mm)", "Adj. (mm)", "Cut (mm)", "Cuts", "Qty"]] + [
        [_cell(_piece_position(p)),
         _cell(PROFILE_LABELS.get(p["profile"], p["profile"])),
         _cell(f"{p.get('source_mm', p['length_mm']):,}"),
         _cell(_mm_adjustment(p.get('adjustment_mm', 0))),
         _cell(f"{p['length_mm']:,}"), _cell(p["cuts"]), _cell(str(p["qty"]))]
        for p in bd["profiles"]]
    t = Table(rows, colWidths=[42 * mm, 34 * mm, 22 * mm, 20 * mm, 22 * mm, 24 * mm, 14 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph("Glass — PER UNIT (cut sizes)", H2))
    rows = [["Section", "Glass", "Source W × H (mm)", "Cut W × H (mm)", "Qty"]] + [
        [_cell(f"{g['section']} ({g['note']})"), _cell(GLASS_LABELS.get(g["glass"], g["glass"])),
         _cell(f"{g.get('source_w_mm', g['w_mm']):,} × {g.get('source_h_mm', g['h_mm']):,}"),
         _cell(f"{g['w_mm']:,} × {g['h_mm']:,}"), _cell(str(g["qty"]))] for g in bd["glass"]]
    t = Table(rows, colWidths=[38 * mm, 30 * mm, 40 * mm, 50 * mm, 20 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    flow.append(t)
    if bd.get("net"):
        flow.append(Paragraph("Net — PER UNIT (cut sizes)", H2))
        rows = [["Panel", "Source W × H (mm)", "Cut W × H (mm)", "Qty"]] + [
            [_cell(f"{n['section']} ({n.get('note', '')})"),
             _cell(f"{n.get('source_w_mm', n['w_mm']):,} × {n.get('source_h_mm', n['h_mm']):,}"),
             _cell(f"{n['w_mm']:,} × {n['h_mm']:,}"), _cell(str(n['qty']))]
            for n in bd["net"]]
        t = Table(rows, colWidths=[74 * mm, 42 * mm, 50 * mm, 20 * mm], repeatRows=1)
        t.setStyle(BASE_STYLE)
        flow.append(t)

    flow.append(Paragraph(
        "This work order carries the per-unit fabrication schedule. Confirm the source profile role, "
        "special-piece notes and approved deductions before issuing it to production.", NOTE))

    flow.append(PageBreak())
    flow.append(Paragraph("Accessories & hardware — PROJECT ISSUE LIST", H2))
    accessory_rows = [["Code", "Description", "Project qty", "Unit value"]]
    for a in result.get("accessories") or []:
        accessory_rows.append([
            _cell(a.get("code", "—")), _cell(a.get("name", "—")),
            _cell(f"{float(a.get('qty', 0) or 0):g}"),
            _cell(ghs(float(a.get("unit_price", a.get("listed_value", 0)) or 0))),
        ])
    if len(accessory_rows) == 1:
        accessory_rows.append([_cell("—"), _cell("No accessory recipe saved"), _cell("—"), _cell(ghs(0))])
    t = Table(accessory_rows, colWidths=[34 * mm, 94 * mm, 22 * mm, 28 * mm], repeatRows=1)
    t.setStyle(BASE_STYLE)
    flow.append(t)
    flow.append(Paragraph(
        "Accessory quantities are project totals derived from the selected system and editable project overrides. "
        "Confirm the issue list against the approved assembly practice before production release.", NOTE))

    flow.append(Paragraph("Production stages — sign off each stage", H2))
    rows = [["Stage", "Done by", "Date", "Checked (QA)"]] + [[s, "", "", ""] for s in STAGES]
    t = Table(rows, colWidths=[45 * mm, 45 * mm, 35 * mm, 48 * mm], rowHeights=[7 * mm] * (len(STAGES) + 1))
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph(
        "Payment gate: production must not start before the configured deposit is confirmed by Accounts.", NOTE))
    return _build("FACTORY WORK ORDER", _meta_line(design, result), flow)


# ── 3. INTERNAL BILL OF QUANTITIES ───────────────────────────

def _cost_floor_table(result: dict):
    """The management-only control block shared by the internal BOQ and
    detailed cost report. The comparison is made before customer taxes,
    because GETF/NHIS and VAT are collected taxes, not fabrication margin."""
    qty = result.get("qty") or 1
    material = result.get("material_cost_per_unit", 0) * qty
    labour = result.get("labour_cost_per_unit", 0) * qty
    install = result.get("installation_cost_per_unit", 0) * qty
    floor = result.get("internal_floor", result.get("subtotal", 0) * qty)
    net = result.get("client_net")
    gap = result.get("floor_gap")
    status = result.get("floor_status")
    rows = [["Internal cost control", "Project amount"]]
    rows += [["Materials & accessories", ghs(material)],
             ["Fabrication labour", ghs(labour)],
             ["Installation", ghs(install)],
             ["Internal cost floor", ghs(floor)]]
    if net is not None:
        rows += [["Client net before tax", ghs(net)],
                 ["Negotiation headroom / shortfall", ghs(gap or 0)],
                 ["Floor check", status or "REVIEW"]]
    t = Table(rows, colWidths=[82 * mm, 54 * mm])
    t.setStyle(META_STYLE)
    return t

def boq_pdf(design: dict, result: dict, demand: list[dict], plan: dict) -> bytes:
    cw, rh = _col_widths(design), _row_heights(design)
    cols = design["cols"]
    qty = result["qty"]
    flow = []

    # Trialco has a dedicated internal costing-sheet workflow. Keep this
    # aligned with the configurator and cutting list instead of mixing the
    # fixed-price recipe with the generic area/profile estimate below.
    material_table = _trialco_material_table(result)
    if material_table:
        flow.append(Paragraph("Trialco bay formula summary — PER BAY", H2))
        flow.append(_trialco_formula_table(result))
        flow.append(Paragraph("Trialco internal material cost list — PROJECT TOTALS", H2))
        flow.append(material_table)
        flow.append(Paragraph(
            "This is an INTERNAL material-cost document. Quantities are calculated from the measured Frame W, Frame H and project quantity. Unit prices remain fixed from the Trialco costing sheet image, while glass uses the selected glass catalogue rate. Customer selling price and taxes remain on the customer quotation.", NOTE))
        flow.append(Paragraph("Internal cost floor & negotiation control", H2))
        flow.append(_cost_floor_table(result))
        return _build("INTERNAL TRIALCO MATERIAL COST SHEET", _meta_line(design, result), flow)

    source_profiles = result.get("profile_catalog") or []
    if source_profiles:
        flow.append(Paragraph("Selected Frame system — source profile catalogue", H2))
        rows = [["Source profile", "Code", "Stock length", "Listed value"]] + [
            [_cell(p["description"]), _cell(p["code"]), _cell(f"{p['stock_mm']:,} mm"), _cell(ghs(p["listed_price"]))]
            for p in source_profiles]
        t = Table(rows, colWidths=[69 * mm, 32 * mm, 31 * mm, 28 * mm])
        t.setStyle(BASE_STYLE)
        flow.append(t)
        flow.append(Paragraph(
            "These are the exact catalogue references from Sofaamy's selected system. "
            "The working geometry cut groups below are not yet mapped to these profiles and require supervisor confirmation.", NOTE))

    # profiles: metres from demand, bars from the cut plan
    metres: dict[str, float] = {}
    for p in demand:
        metres[p["profile"]] = metres.get(p["profile"], 0) + p["length_mm"] * p["qty"] / 1000
    bars = {g["profile"]: (len(g["bars"]), g["stock_mm"]) for g in plan["groups"]}
    flow.append(Paragraph("Working cut groups (all units, nested — source mapping pending)", H2))
    rows = [["Profile", "Total metres", "Stock bars to buy", "Rate / m", "Amount"]]
    total_profiles = 0.0
    for pid, m in metres.items():
        rate = PROFILE_PRICES.get(pid, 85.0)
        amt = m * rate
        total_profiles += amt
        nbars, stock = bars.get(pid, (0, 0))
        rows.append([_cell(PROFILE_LABELS.get(pid, pid)), _cell(f"{m:.2f} m"),
                     _cell(f"{nbars} × {stock / 1000:.2f} m"), _cell(ghs(rate)), _cell(ghs(amt))])
    rows.append(["", "", "", "Subtotal", ghs(total_profiles)])
    t = Table(rows, colWidths=[50 * mm, 24 * mm, 40 * mm, 28 * mm, 34 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    # glass: per type from the breakdown's actual cut sizes × qty
    bd = any_breakdown(design)
    glass: dict[str, dict] = {}
    for g in bd["glass"]:
        e = glass.setdefault(g["glass"], {"n": 0, "area": 0.0, "sizes": []})
        e["n"] += g["qty"]
        e["area"] += g["w_mm"] * g["h_mm"] * g["qty"] / 1e6
        e["sizes"].append(f"{g['qty']} × {g['w_mm']}×{g['h_mm']}")
    flow.append(Paragraph("Glass (all units, cut sizes)", H2))
    rows = [["Glass type", "Cut sizes / unit (mm)", "Panels", "Area (m²)", "Rate / m²", "Amount"]]
    total_glass = 0.0
    for gid, e in glass.items():
        rate = FRAME_GLASS.get(gid, GLASS.get(gid, 120))
        amt = e["area"] * qty * rate
        total_glass += amt
        rows.append([_cell(GLASS_LABELS.get(gid, gid)), _cell(", ".join(e["sizes"])), _cell(str(e["n"] * qty)),
                     _cell(f"{e['area'] * qty:.2f}"), _cell(ghs(rate)), _cell(ghs(amt))])
    rows.append(["", "", "", "", "Subtotal", ghs(total_glass)])
    t = Table(rows, colWidths=[30 * mm, 42 * mm, 18 * mm, 22 * mm, 24 * mm, 27 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    if bd.get("net"):
        flow.append(Paragraph("Net panels — dimensions for issue", H2))
        net_rows = [["Panel", "Cut size (mm)", "Qty"]] + [
            [_cell(n["section"]), _cell(f"{n['w_mm']:,} × {n['h_mm']:,}"), _cell(str(n["qty"] * qty))]
            for n in bd["net"]]
        t = Table(net_rows, colWidths=[55 * mm, 65 * mm, 30 * mm], repeatRows=1)
        t.setStyle(BASE_STYLE)
        flow.append(t)

    # project accessory recipe, including any user edits saved on the design
    flow.append(Paragraph("Accessories & hardware — editable project recipe", H2))
    rows = [["Code", "Description", "Qty", "Listed / edited value", "Amount"]]
    total_hw = 0.0
    for a in result.get("accessories") or []:
        n = float(a.get("qty", 0) or 0)
        unit = float(a.get("unit_price", a.get("listed_value", 0)) or 0)
        amt = n * unit
        total_hw += amt
        rows.append([_cell(a.get("code", "—")), _cell(a.get("name", "—")), _cell(f"{n:g}"), _cell(ghs(unit)), _cell(ghs(amt))])
    if not result.get("accessories"):
        rows.append(["—", "No accessory recipe saved", "—", "—", ghs(0)])
    rows.append(["", "", "", "Subtotal", ghs(total_hw)])
    t = Table(rows, colWidths=[34 * mm, 58 * mm, 18 * mm, 34 * mm, 32 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)
    flow.append(Paragraph(
        "Quantities are derived from system, opening type, panel count and project quantity, then adjusted by project edits. "
        "Rows marked as working recipe must be checked against the selected system's assembly practice before release.", NOTE))

    flow.append(Paragraph("Internal cost floor & negotiation control", H2))
    flow.append(_cost_floor_table(result))

    flow.append(Paragraph(
        f"Working geometry material estimate from this document: {ghs(total_profiles + total_glass + total_hw)}. "
        "This is an INTERNAL document. Enter the approved project material-cost total as the floor override "
        "when the supervisor has confirmed the Excel/material sheet. Until then, the floor is a working estimate; "
        "do not release production from this report without checking the confirmed cutting list and supplier prices.", NOTE))
    return _build("INTERNAL BILL OF QUANTITIES & COST FLOOR", _meta_line(design, result), flow)


# ── 4. FRAMELESS: GLASS ORDER ────────────────────────────────
# The SmartGlazier-style order sent to the glass processor: cover
# elevation, then ONE DIMENSIONED FABRICATION DRAWING PER PANEL
# (holes, cutouts, notches — instantiated from the parametric prep
# library in preps.py, so any project/panel size renders correctly),
# then the cutout template pages.

from reportlab.graphics.shapes import (Drawing, Rect, Line, String, Circle, Path,
                                       Group as GGroup)
from reportlab.platypus import PageBreak
from .pricing import frameless_breakdown, FL_PANEL_LABELS, FL_FAB
from .preps import TEMPLATES, panel_features, templates_used

DIM = colors.HexColor("#b26a1d")
EDGE = colors.HexColor("#3d4f5e")
GLASS_FILL = colors.Color(0.86, 0.92, 0.96, alpha=0.5)


def _fl_elevation(design: dict, bd: dict, width_pt: float = 165 * mm) -> Drawing:
    """Elevation of the panel run, with bay widths + height labels."""
    W, H = design["width"], design["height"]
    scale = min(width_pt / W, (90 * mm) / H)
    dw, dh = W * scale, H * scale
    d = Drawing(width_pt, dh + 16 * mm)
    x0, y0 = (width_pt - dw) / 2, 10 * mm

    cw = design.get("col_widths") or []
    if len(cw) != design["cols"]:
        cw = [W / design["cols"]] * design["cols"]

    cells = design["cells"]
    leaf = [i for i, c in enumerate(cells) if (c.get("type") or "fixed") in ("door", "hinged")]
    has_over = bool(design.get("over_panel")) and leaf
    door_h = design.get("door_h") or 2100
    over_h = H - FL_FAB["floor_gap"] - door_h - FL_FAB["over_gap"] if has_over else 0

    d.add(Rect(x0 - 4, y0 - 2, dw + 8, dh + 4, fillColor=None,
               strokeColor=colors.HexColor("#9fb0bd"), strokeWidth=0.7))
    x = x0
    for i, c in enumerate(cells):
        bw = cw[i] * scale
        ty = c.get("type") or "fixed"
        is_leaf = ty in ("door", "hinged")
        top = y0 + dh - ((over_h + FL_FAB["over_gap"]) * scale if (has_over and is_leaf) else 2)
        d.add(Rect(x + 1.5, y0 + FL_FAB["floor_gap"] * scale, bw - 3,
                   top - y0 - FL_FAB["floor_gap"] * scale,
                   fillColor=colors.Color(0.82, 0.90, 0.95, alpha=0.6),
                   strokeColor=colors.HexColor("#5d7387"), strokeWidth=0.8))
        if is_leaf:   # handle
            hx = x + bw * 0.82
            d.add(Line(hx, y0 + dh * 0.35, hx, y0 + dh * 0.62,
                       strokeColor=colors.HexColor("#3d4f5e"), strokeWidth=2.2))
        d.add(String(x + bw / 2, y0 - 5 * mm, f"{round(cw[i])}",
                     fontName="Helvetica", fontSize=6.5, textAnchor="middle",
                     fillColor=colors.HexColor("#b26a1d")))
        x += bw
    if has_over and over_h > 60:
        xs = x0 + sum(cw[:leaf[0]]) * scale
        span = sum(cw[i] for i in leaf) * scale
        d.add(Rect(xs + 1.5, y0 + dh - over_h * scale, span - 3, over_h * scale - 2,
                   fillColor=colors.Color(0.82, 0.90, 0.95, alpha=0.6),
                   strokeColor=colors.HexColor("#5d7387"), strokeWidth=0.8))
    d.add(String(x0 + dw / 2, y0 + dh + 3 * mm, f"{W} mm",
                 fontName="Helvetica-Bold", fontSize=7.5, textAnchor="middle",
                 fillColor=colors.HexColor("#b26a1d")))
    d.add(String(x0 - 2, y0 + dh / 2, f"{H}", fontName="Helvetica", fontSize=6.5,
                 textAnchor="end", fillColor=colors.HexColor("#b26a1d")))
    return d


# drawing-space helpers: panel coords are top-left-origin mm; the
# Drawing's y axis points up, so we flip through the panel height.

def _dim_h(d, x0, x1, y, label, size=6.5):
    d.add(Line(x0, y, x1, y, strokeColor=DIM, strokeWidth=0.5))
    for xx in (x0, x1):
        d.add(Line(xx, y - 1.2, xx, y + 1.2, strokeColor=DIM, strokeWidth=0.5))
    d.add(String((x0 + x1) / 2, y + 1.6, label, fontName="Helvetica", fontSize=size,
                 textAnchor="middle", fillColor=DIM))


def _dim_v(d, x, y0, y1, label, size=6.5, side=1):
    d.add(Line(x, y0, x, y1, strokeColor=DIM, strokeWidth=0.5))
    for yy in (y0, y1):
        d.add(Line(x - 1.2, yy, x + 1.2, yy, strokeColor=DIM, strokeWidth=0.5))
    d.add(String(x + 2.2 * side, (y0 + y1) / 2 - 2, label, fontName="Helvetica",
                 fontSize=size, textAnchor="start" if side > 0 else "end", fillColor=DIM))


def _cutout_path(w_pt, h_pt, tpl, corner, s):
    """S-curve corner cutout (template A/B) as a filled Path, mirrored
    into the given corner. Returns (path, hole_center)."""
    run, lead, depth = tpl["run"] * s, tpl["lead"] * s, tpl["depth"] * s
    hx, hy = tpl["hole_x"] * s, tpl["hole_y"] * s
    fx = (lambda x: x) if corner in ("TL", "BL") else (lambda x: w_pt - x)
    fy = (lambda y: h_pt - y) if corner in ("TL", "TR") else (lambda y: y)
    p = Path(fillColor=colors.white, strokeColor=EDGE, strokeWidth=0.8)
    p.moveTo(fx(0), fy(0))
    p.lineTo(fx(0), fy(depth))
    p.lineTo(fx(lead), fy(depth))
    c1, c2 = lead + (run - lead) * 0.5, run - (run - lead) * 0.35
    p.curveTo(fx(c1), fy(depth), fx(c2), fy(0), fx(run), fy(0))
    p.closePath()
    return p, (fx(hx), fy(hy))


def _panel_drawing(p, fs, width_pt=170 * mm, max_h=185 * mm) -> Drawing:
    """One panel's dimensioned fabrication drawing."""
    W, H = p["w_mm"], p["h_mm"]
    pad = 20 * mm
    s = min((width_pt - 2 * pad) / W, (max_h - 2 * pad) / H)
    pw, ph = W * s, H * s
    d = Drawing(width_pt, ph + 2 * pad)
    x0, y0 = (width_pt - pw) / 2, pad
    G = GGroup()
    G.transform = (1, 0, 0, 1, x0, y0)

    G.add(Rect(0, 0, pw, ph, fillColor=GLASS_FILL, strokeColor=EDGE, strokeWidth=1.1))
    # FP (flat polish) edge marks like the print
    for x, y in ((pw / 2, ph - 9 * mm), (pw / 2, 6 * mm), (7 * mm, ph * 0.55), (pw - 12 * mm, ph * 0.35)):
        G.add(String(x, y, "FP", fontName="Helvetica", fontSize=6, fillColor=MUTED))
    # stamp corner
    sx = 2 * mm if "Left" in p.get("stamp", "") else pw - 9 * mm
    G.add(String(sx, 2 * mm, "TGS", fontName="Helvetica-Oblique", fontSize=6, fillColor=MUTED))

    py = lambda y_mm: ph - y_mm * s   # panel top-down mm → drawing y

    for f in fs["features"]:
        if f["kind"] == "hole":
            hx, hy = f["x"] * s, py(f["y"])
            G.add(Circle(hx, hy, max(f["dia"] * s / 2, 1.6),
                         fillColor=None, strokeColor=EDGE, strokeWidth=0.9))
            near_left = f["x"] <= W / 2
            # ø label on the side away from the locator dim
            G.add(String(hx + (2.5 if near_left else -2.5), hy + 2.5, f"ø{f['dia']}",
                         fontName="Helvetica", fontSize=6, fillColor=EDGE,
                         textAnchor="start" if near_left else "end"))
            # locator dims to the nearest edges
            ex = 0 if near_left else pw
            lx = f["x"] if near_left else W - f["x"]
            if 0 < lx < W * 0.45:
                d_y = hy
                G.add(Line(ex, d_y, hx, d_y, strokeColor=DIM, strokeWidth=0.4))
                G.add(String((ex + hx) / 2, d_y + 1.5, f"{round(lx)}", fontName="Helvetica",
                             fontSize=5.5, textAnchor="middle", fillColor=DIM))
            near_top = f["y"] <= H / 2
            ey = ph if near_top else 0
            ly = f["y"] if near_top else H - f["y"]
            if 0 < ly < H * 0.45:
                G.add(Line(hx, ey, hx, hy, strokeColor=DIM, strokeWidth=0.4))
                G.add(String(hx + 1.5, (ey + hy) / 2, f"{round(ly)}", fontName="Helvetica",
                             fontSize=5.5, fillColor=DIM))
        elif f["kind"] == "cutout":
            tpl = TEMPLATES[f["template"]]
            path, (chx, chy) = _cutout_path(pw, ph, tpl, f["corner"], s)
            G.add(path)
            G.add(Circle(chx, chy, tpl["hole_dia"] * s / 2, fillColor=None,
                         strokeColor=EDGE, strokeWidth=0.9))
            tx = 3 * mm if f["corner"] in ("TL", "BL") else pw - 3 * mm
            ty = chy + (-5 * mm if f["corner"] in ("TL", "TR") else 5 * mm)
            G.add(String(tx, ty, f"{f['template']}  {f['code']}", fontName="Helvetica-Bold",
                         fontSize=6, fillColor=EDGE,
                         textAnchor="start" if f["corner"] in ("TL", "BL") else "end"))
        elif f["kind"] == "notch":
            nw, nh = f["w"] * s, f["h"] * s
            if f.get("y_end") is not None:   # hinge notch on a side edge
                nx = 0 if f["corner"] in ("TL", "BL") else pw - nw
                ny = py(f["y_end"]) - nh if f["corner"] in ("TL", "TR") else f["y_end"] * s
            else:                            # lock notch on the bottom edge
                nx = f["off"] * s if f["corner"] == "BL" else pw - f["off"] * s - nw
                ny = 0
            G.add(Rect(nx, ny, nw, nh, fillColor=colors.white, strokeColor=EDGE, strokeWidth=0.8))
            G.add(String(nx + nw / 2, ny + nh + 1.5, f"{f['w']}×{f['h']}",
                         fontName="Helvetica", fontSize=5.5, textAnchor="middle", fillColor=DIM))

    d.add(G)
    # overall dims, top+bottom and both sides (like the print)
    _dim_h(d, x0, x0 + pw, y0 + ph + 10 * mm, f"{W:,}", 7.5)
    _dim_h(d, x0, x0 + pw, y0 - 8 * mm, f"{W:,}", 7.5)
    _dim_v(d, x0 - 9 * mm, y0, y0 + ph, f"{H:,}", 7.5, side=-1)
    _dim_v(d, x0 + pw + 9 * mm, y0, y0 + ph, f"{H:,}", 7.5, side=1)
    return d


def _template_drawing(key: str) -> Drawing:
    """1:1 template drawing (their page 7) — printable and usable."""
    tpl = TEMPLATES[key]
    s = 72 / 25.4   # 1 mm = 1/25.4 inch → true scale
    w = tpl["run"] * s + 60 * mm
    d = Drawing(w, tpl["depth"] * s + 26 * mm)
    x0, y0 = 18 * mm, 8 * mm
    depth, lead, run = tpl["depth"] * s, tpl["lead"] * s, tpl["run"] * s
    p = Path(fillColor=None, strokeColor=EDGE, strokeWidth=1.1)
    p.moveTo(x0, y0 + depth + 6 * mm)
    p.lineTo(x0, y0 + depth)
    p.lineTo(x0 + lead, y0 + depth)
    c1, c2 = lead + (run - lead) * 0.5, run - (run - lead) * 0.35
    p.curveTo(x0 + c1, y0 + depth, x0 + c2, y0, x0 + run, y0)
    p.lineTo(x0 + run + 24 * mm, y0)
    d.add(p)
    hx, hy = x0 + tpl["hole_x"] * s, y0 + (tpl["depth"] - tpl["hole_y"]) * s
    d.add(Circle(hx, hy, tpl["hole_dia"] * s / 2, fillColor=None, strokeColor=EDGE, strokeWidth=1))
    d.add(String(hx + 4 * mm, hy + 3 * mm, f"ø {tpl['hole_dia']}", fontName="Helvetica",
                 fontSize=7, fillColor=EDGE))
    _dim_h(d, x0, hx, y0 + depth + 9 * mm, f"{tpl['hole_x']}", 7)
    _dim_h(d, x0, x0 + lead, y0 + depth + 4 * mm, f"{tpl['lead']}", 6.5)
    _dim_h(d, x0, x0 + run, y0 - 5 * mm, f"{tpl['run']}", 7)
    _dim_v(d, x0 - 6 * mm, y0 + 0.5 * mm, y0 + depth, f"{tpl['depth']}", 6.5, side=-1)
    _dim_v(d, x0 + run + 10 * mm, y0, y0 + tpl["rise"] * s, f"{tpl['rise']}", 6.5, side=1)
    d.add(String(x0 + lead + 6 * mm, y0 + depth - 5 * mm, f"r {tpl['r1']}",
                 fontName="Helvetica", fontSize=6.5, fillColor=EDGE))
    d.add(String(x0 + run - 10 * mm, y0 + 3 * mm, f"r {tpl['r2']}",
                 fontName="Helvetica", fontSize=6.5, fillColor=EDGE))
    return d


PANEL_HEAD = ParagraphStyle("phead", fontName="Helvetica-Bold", fontSize=10.5,
                            textColor=NAVY, spaceBefore=2, spaceAfter=1)
PANEL_SUB = ParagraphStyle("psub", fontName="Helvetica", fontSize=8.5,
                           textColor=MUTED, spaceAfter=2)


def glass_order_pdf(design: dict, result: dict) -> bytes:
    bd = frameless_breakdown(design)
    feats = panel_features(design, bd["panels"])
    qty = result["qty"]
    flow = []

    # ── cover: elevation + order summary ──
    flow.append(_fl_elevation(design, bd))
    flow.append(Paragraph(
        f"Total {len(bd['panels'])} panel(s){' × ' + str(qty) + ' units' if qty > 1 else ''} · "
        f"{bd['glass']['label']} · {bd['total_area']:.2f} m² · {bd['total_kg']} kg per unit", H2))
    rows = [["Mark", "Panel", "Cut size W × H (mm)", "Area (m²)", "Weight (kg)", "Qty"]] + [
        [p["mark"], FL_PANEL_LABELS.get(p["type"], p["type"]),
         f"{p['w_mm']:,} × {p['h_mm']:,}", f"{p['area_m2']:.2f}", f"{p['kg']}", str(qty)]
        for p in bd["panels"]]
    t = Table(rows, colWidths=[16 * mm, 32 * mm, 42 * mm, 24 * mm, 28 * mm, 14 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)
    flow.append(Paragraph(
        "Fabrication drawings for each panel follow — all holes and cutouts must be processed "
        "BEFORE toughening. Dimensioned from the panel edges as shown; cutout templates at the end "
        "of this document print at 1:1 scale.", NOTE))

    # ── one dimensioned drawing per panel ──
    for p, fs in zip(bd["panels"], feats):
        flow.append(PageBreak())
        flow.append(Paragraph(f"{qty} pce · {bd['glass']['label']}", PANEL_HEAD))
        flow.append(Paragraph(
            f"{p['w_mm']:,} × {p['h_mm']:,}  ({p['kg']} kg) · "
            f"Flat Polish 2 Long 2 Short · TGS stamp in {fs['stamp']} · "
            f"Marks: <b>{p['mark']}</b>"
            + (f" · pivots {fs['pivot']}" if fs.get("pivot") else ""), PANEL_SUB))
        flow.append(_panel_drawing(p, fs))
        codes = sorted({f["code"] for f in fs["features"]})
        flow.append(Paragraph("Hardware on this panel: " + " · ".join(codes), NOTE))

    # ── template pages (1:1) ──
    used = templates_used(feats)
    if used:
        flow.append(PageBreak())
        flow.append(Paragraph("Templates for glass cut-outs (printed 1:1 — verify scale before use)", H2))
        for k in used:
            flow.append(Paragraph(f"Template {k}: {TEMPLATES[k]['codes']}", PANEL_HEAD))
            flow.append(_template_drawing(k))
            flow.append(Spacer(1, 8 * mm))

    return _build("GLASS ORDER", _meta_line(design, result), flow)


# ── 5. FRAMELESS: HARDWARE LIST ──────────────────────────────

def hardware_list_pdf(design: dict, result: dict) -> bytes:
    bd = frameless_breakdown(design)
    qty = result["qty"]
    flow = []

    rows = [["Qty", "Part number", "Description", "Finish", "Unit cost", "Subtotal"]]
    total = 0.0
    for h in bd["hardware"]:
        n = h["qty"] * qty
        amt = n * h["price"]
        total += amt
        rows.append([str(n), h["code"], h["desc"], h["finish"], ghs(h["price"]), ghs(amt)])
    rows.append(["", "", "", "", "Total", ghs(total)])
    t = Table(rows, colWidths=[12 * mm, 30 * mm, 56 * mm, 26 * mm, 22 * mm, 24 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph(
        "Part numbers and unit prices from Sofaamy's hardware list (SmartGlazier job SGP/4462-26A). "
        "Items marked PLACEHOLDER pending Sofaamy's full hardware catalog.", NOTE))
    return _build("HARDWARE LIST", _meta_line(design, result), flow)


# ── 6. FRAMELESS: FACTORY WORK ORDER ─────────────────────────

FL_STAGES = ["Cut & Process (holes/cutouts/polish)", "Toughening", "QA — glass inspection",
             "Hardware fit-out", "Site installation", "QA — final", "Handover"]


def fl_work_order_pdf(design: dict, result: dict) -> bytes:
    bd = frameless_breakdown(design)
    flow = []

    flow.append(Paragraph("Panels — PER UNIT", H2))
    rows = [["Mark", "Panel", "Cut size (mm)", "Weight", "Processing"]] + [
        [p["mark"], FL_PANEL_LABELS.get(p["type"], p["type"]),
         f"{p['w_mm']:,} × {p['h_mm']:,}", f"{p['kg']} kg", p["holes"]] for p in bd["panels"]]
    t = Table(rows, colWidths=[14 * mm, 26 * mm, 34 * mm, 20 * mm, 62 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph("Hardware — PER UNIT", H2))
    rows = [["Qty", "Part number", "Description"]] + [
        [str(h["qty"]), h["code"], h["desc"]] for h in bd["hardware"]]
    t = Table(rows, colWidths=[14 * mm, 36 * mm, 106 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph("Production stages — sign off each stage", H2))
    rows = [["Stage", "Done by", "Date", "Checked (QA)"]] + [[s, "", "", ""] for s in FL_STAGES]
    t = Table(rows, colWidths=[62 * mm, 38 * mm, 27 * mm, 46 * mm], rowHeights=[7 * mm] * (len(FL_STAGES) + 1))
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph(
        "Payment gate: production must not start before the configured deposit is confirmed by Accounts. "
        "Toughened panels are NOT re-workable — dimensions must be verified against site survey before cutting.", NOTE))
    return _build("FACTORY WORK ORDER — FRAMELESS", _meta_line(design, result), flow)


# ── 7. FRAMELESS: INSTALLATION SHEET ─────────────────────────

def installation_sheet_pdf(design: dict, result: dict) -> bytes:
    bd = frameless_breakdown(design)
    flow = []

    flow.append(Paragraph("Panel layout — showing centreline void", H2))
    flow.append(_fl_elevation(design, bd))

    cw = design.get("col_widths") or []
    if len(cw) != design["cols"]:
        cw = [design["width"] / design["cols"]] * design["cols"]
    rows = [["Bay", "Centreline void W (mm)", "Panel", "Glass cut W × H (mm)"]]
    for i, w in enumerate(cw):
        panel = next((p for p in bd["panels"] if p["mark"] == f"P{i + 1}"), None)
        rows.append([f"B{i + 1}", f"{round(w):,}", panel["mark"] if panel else "—",
                     f"{panel['w_mm']:,} × {panel['h_mm']:,}" if panel else "—"])
    over = next((p for p in bd["panels"] if p["type"] == "over"), None)
    if over:
        rows.append(["Fanlight", "—", over["mark"], f"{over['w_mm']:,} × {over['h_mm']:,}"])
    t = Table(rows, colWidths=[22 * mm, 42 * mm, 24 * mm, 72 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)
    flow.append(Paragraph(
        "Joint gaps: 5 mm at fixed glass · 10 mm at door edges · panels stop 10 mm above finished "
        "floor. Verify void dimensions and out-of-plumb conditions on site BEFORE releasing glass "
        "for toughening.", NOTE))

    flow.append(Paragraph("Out of plumb / level conditions — record on site", H2))
    box = Drawing(170 * mm, 42 * mm)
    box.add(Rect(20 * mm, 4 * mm, 130 * mm, 34 * mm, fillColor=None,
                 strokeColor=colors.HexColor("#9fb0bd"), strokeWidth=0.8))
    for x, y in ((20, 4), (150, 4), (20, 38), (150, 38)):
        box.add(Circle(x * mm, y * mm, 1.6, fillColor=EDGE, strokeColor=None))
    flow.append(box)

    flow.append(Paragraph("Shopfront hardware — check off on install", H2))
    rows = [["✓", "Qty", "Part number", "Description", "Finish"]] + [
        ["", str(h["qty"] * result["qty"]), h["code"], h["desc"], h["finish"]]
        for h in bd["hardware"]]
    t = Table(rows, colWidths=[8 * mm, 12 * mm, 32 * mm, 74 * mm, 30 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(PageBreak())
    flow.append(Paragraph("Installation comments", H2))
    box2 = Drawing(170 * mm, 180 * mm)
    box2.add(Rect(0, 0, 170 * mm, 178 * mm, fillColor=None,
                  strokeColor=colors.HexColor("#9fb0bd"), strokeWidth=0.8))
    flow.append(box2)
    return _build("INSTALLATION SHEET", _meta_line(design, result), flow)


# ── PROJECT SUMMARY / ELEVATION / PRICE BREAKDOWN ────────────
# Reports-page documents — generated for any saved project in any
# of the three categories (frame / frameless / curtain wall).

from .pricing import cw_breakdown, CW_TYPE_LABELS

CAT_LABELS = {"frame": "Framed (aluminium)", "frameless": "Frameless glass",
              "curtainwall": "Curtain wall"}


def _grid_elevation(design: dict, width_pt: float = 165 * mm, max_h: float = 90 * mm) -> Drawing:
    """Dimensioned elevation for frame / curtain-wall designs — outer
    frame and divider grid, as drawn on the configurator canvas."""
    W, H = design["width"], design["height"]
    cw, rh = _col_widths(design), _row_heights(design)
    cols = design["cols"]
    is_cw = (design.get("category") or "frame") == "curtainwall"
    scale = min((width_pt - 30 * mm) / W, (max_h - 16 * mm) / H)
    dw, dh = W * scale, H * scale
    d = Drawing(width_pt, dh + 18 * mm)
    x0, y0 = (width_pt - dw) / 2, 10 * mm

    d.add(Rect(x0 - 3, y0 - 3, dw + 6, dh + 6, fillColor=None,
               strokeColor=colors.HexColor("#5d7387"), strokeWidth=1.4))
    for i, c in enumerate(design["cells"]):
        col, row = i % cols, i // cols
        cx = x0 + sum(cw[:col]) * scale
        cy = y0 + dh - sum(rh[:row + 1]) * scale   # rows counted from the top
        bw, bh = cw[col] * scale, rh[row] * scale
        ty = (c.get("type") or "vision") if is_cw else (c.get("opening") or "fixed")
        spandrel = is_cw and ty == "spandrel"
        d.add(Rect(cx + 1.2, cy + 1.2, bw - 2.4, bh - 2.4,
                   fillColor=colors.Color(0.55, 0.60, 0.66, alpha=0.55) if spandrel else GLASS_FILL,
                   strokeColor=colors.HexColor("#5d7387"), strokeWidth=0.7))
        tag = f"B{i + 1}" if is_cw else f"F{i + 1}"
        label = CW_TYPE_LABELS.get(ty, "Vision Glass") if is_cw else ty.title()
        d.add(String(cx + bw / 2, cy + bh / 2 + 1, tag, fontName="Helvetica-Bold",
                     fontSize=6.5, textAnchor="middle", fillColor=EDGE))
        d.add(String(cx + bw / 2, cy + bh / 2 - 6, label, fontName="Helvetica",
                     fontSize=5.5, textAnchor="middle", fillColor=MUTED))
    x = x0
    for w in cw:                                    # per-bay widths below
        d.add(String(x + w * scale / 2, y0 - 5 * mm, f"{round(w)}", fontName="Helvetica",
                     fontSize=6.5, textAnchor="middle", fillColor=DIM))
        x += w * scale
    yy = y0 + dh
    for h in rh:                                    # per-row heights, right side
        d.add(String(x0 + dw + 2 * mm, yy - h * scale / 2 - 2, f"{round(h)}",
                     fontName="Helvetica", fontSize=6.5, fillColor=DIM))
        yy -= h * scale
    d.add(String(x0 + dw / 2, y0 + dh + 3 * mm, f"{W} mm", fontName="Helvetica-Bold",
                 fontSize=7.5, textAnchor="middle", fillColor=DIM))
    d.add(String(x0 - 2 * mm, y0 + dh / 2, f"{H}", fontName="Helvetica", fontSize=6.5,
                 textAnchor="end", fillColor=DIM))
    return d


def any_elevation(design: dict, width_pt: float = 165 * mm, max_h: float = 90 * mm) -> Drawing:
    if (design.get("category") or "frame") == "frameless":
        return _fl_elevation(design, frameless_breakdown(design), width_pt=width_pt)
    return _grid_elevation(design, width_pt, max_h)


META_STYLE = TableStyle([
    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
    ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 8.5),
    ("TEXTCOLOR", (0, 0), (0, -1), NAVY),
    ("TEXTCOLOR", (2, 0), (2, -1), NAVY),
    ("GRID", (0, 0), (-1, -1), 0.4, LINE),
    ("TOPPADDING", (0, 0), (-1, -1), 4),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
])


def _items_table(design: dict) -> Table:
    """Per-category design-items schedule."""
    cat = design.get("category") or "frame"
    if cat == "frameless":
        bd = frameless_breakdown(design)
        rows = [["Mark", "Panel", "Cut size W × H (mm)", "Area (m²)", "Weight (kg)"]] + [
            [p["mark"], FL_PANEL_LABELS.get(p["type"], p["type"]),
             f"{p['w_mm']:,} × {p['h_mm']:,}", f"{p['area_m2']:.2f}", f"{p['kg']}"]
            for p in bd["panels"]]
        t = Table(rows, colWidths=[16 * mm, 36 * mm, 46 * mm, 28 * mm, 30 * mm])
    elif cat == "curtainwall":
        bd = cw_breakdown(design)
        rows = [["Bay", "Type", "Glass", "Cut size W × H (mm)"]] + [
            [g["section"], CW_TYPE_LABELS.get(g["type"], g["type"]),
             GLASS_LABELS.get(g["glass"], g["glass"]), f"{g['w_mm']:,} × {g['h_mm']:,}"]
            for g in bd["glass"]]
        t = Table(rows, colWidths=[16 * mm, 40 * mm, 50 * mm, 50 * mm])
    else:
        cw, rh = _col_widths(design), _row_heights(design)
        cols = design["cols"]
        rows = [["Section", "Size (mm)", "Glass", "Opening", "Opening panels"]]
        for i, c in enumerate(design["cells"]):
            rows.append([f"F{i + 1}", f"{round(cw[i % cols])} × {round(rh[i // cols])}",
                         GLASS_LABELS.get(c["glass"], c["glass"]), c["opening"].title(),
                         "—" if c["opening"] == "fixed" else str(c.get("panels") or 1)])
        t = Table(rows, colWidths=[20 * mm, 38 * mm, 45 * mm, 40 * mm, 30 * mm])
    t.setStyle(BASE_STYLE)
    return t


def project_summary_pdf(design: dict, result: dict, client_name: str = "") -> bytes:
    cat = design.get("category") or "frame"
    qty = result["qty"]
    flow = []

    meta = [
        ["Client", client_name or "Walk-in Client", "Category", CAT_LABELS.get(cat, cat)],
        ["Design ref", design.get("ref") or "—", "Product", design["name"]],
        ["Overall size", f"{design['width']} × {design['height']} mm", "Quantity", str(qty)],
        ["Location", design.get("location") or "—", "Date", f"{datetime.now():%d %b %Y}"],
    ]
    t = Table(meta, colWidths=[28 * mm, 62 * mm, 26 * mm, 50 * mm])
    t.setStyle(META_STYLE)
    flow.append(t)

    flow.append(Paragraph("Elevation", H2))
    flow.append(any_elevation(design))

    flow.append(Paragraph("Design items — PER UNIT", H2))
    flow.append(_items_table(design))

    flow.append(Paragraph("Commercial summary", H2))
    rows = [["Per-unit total", ghs(result["total"])],
            ["Quantity", f"× {qty}"],
            ["Project total", ghs(result["grand_total"])],
            [f"{design.get('deposit_percent', 80):.0f}% production deposit", ghs(round(result["grand_total"] * float(design.get("deposit_percent", 80)) / 100, 2))],
            [f"{100 - float(design.get('deposit_percent', 80)):.0f}% balance before completion", ghs(round(result["grand_total"] * (100 - float(design.get("deposit_percent", 80))) / 100, 2))]]
    t = Table(rows, colWidths=[60 * mm, 50 * mm])
    t.setStyle(META_STYLE)
    flow.append(t)
    flow.append(Paragraph(
        f"Payment terms: {float(design.get('deposit_percent', 80)):.0f}% deposit before production · balance before completion. "
        "All amounts in Ghana Cedi (GHS), VAT exclusive.", NOTE))
    return _build("PROJECT SUMMARY", _meta_line(design, result), flow)


def elevation_pdf(design: dict, result: dict) -> bytes:
    flow = [any_elevation(design, width_pt=170 * mm, max_h=150 * mm)]
    cw, rh = _col_widths(design), _row_heights(design)
    rows = [["Overall size", f"{design['width']} × {design['height']} mm"],
            ["Bay widths (mm)", "  ·  ".join(str(round(w)) for w in cw)],
            ["Row heights (mm)", "  ·  ".join(str(round(h)) for h in rh)]]
    t = Table(rows, colWidths=[42 * mm, 124 * mm])
    t.setStyle(META_STYLE)
    flow.append(Spacer(0, 6 * mm))
    flow.append(t)
    flow.append(Paragraph(
        "As designed on the configurator canvas — all dimensions in millimetres. "
        "Cut sizes (with fabrication deductions) are on the cutting list / glass order.", NOTE))
    return _build("ELEVATION DRAWING", _meta_line(design, result), flow)


CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, textColor=colors.HexColor("#22303e"))
CELL_MUTED = ParagraphStyle("cellm", fontName="Helvetica", fontSize=8, textColor=MUTED)


def price_breakdown_pdf(design: dict, result: dict, client_name: str = "") -> bytes:
    qty = result["qty"]
    flow = []

    flow.append(Paragraph("Cost lines — PER UNIT", H2))
    rows = [["Description", "Basis", "Amount"]] + [
        [Paragraph(l["key"], CELL), Paragraph(l["detail"], CELL_MUTED), ghs(l["amount"])]
        for l in result["lines"]]
    t = Table(rows, colWidths=[54 * mm, 76 * mm, 26 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    material_table = _trialco_material_table(result)
    if material_table:
        flow.append(Paragraph("Trialco internal material cost list — PROJECT TOTALS", H2))
        flow.append(material_table)

    flow.append(Paragraph("Totals", H2))
    rows = [["Subtotal (per unit)", ghs(result["subtotal"])],
            [f"Margin ({result['margin_pct']:.0f}%)", ghs(result["margin"])],
            ["Unit total", ghs(result["total"])],
            ["Quantity", f"× {qty}"],
            ["Project total", ghs(result["grand_total"])]]
    t = Table(rows, colWidths=[60 * mm, 50 * mm])
    t.setStyle(META_STYLE)
    flow.append(t)

    flow.append(Paragraph("Minimum-price control", H2))
    flow.append(_cost_floor_table(result))

    flow.append(Paragraph(
        f"Client: {client_name or 'Walk-in Client'}. INTERNAL DOCUMENT — management only, "
        "not for client distribution. Client net is compared before GETF/NHIS and VAT. "
        "A project floor override should come from the approved material costing sheet; otherwise this remains a working estimate.", NOTE))
    return _build("PRICE BREAKDOWN (INTERNAL)", _meta_line(design, result), flow)


# ── DELIVERY NOTE ────────────────────────────────────────────

def delivery_note_pdf(job: dict, design: dict | None, site: str) -> bytes:
    """Delivery note for a dispatched job — items, vehicle, sign-off."""
    flow = []

    rows = [
        ["Delivery Note No.", job.get("dn_number") or "—", "Job No.", job["job_number"]],
        ["Client", job["client"], "Contact", job.get("client_phone") or "—"],
        ["Delivery Address", site or "—", "Date", f"{datetime.now():%d %b %Y}"],
        ["Driver", job.get("driver") or "—", "Vehicle", job.get("vehicle") or "—"],
    ]
    t = Table(rows, colWidths=[34 * mm, 58 * mm, 24 * mm, 50 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (0, -1), NAVY),
        ("TEXTCOLOR", (2, 0), (2, -1), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(t)

    flow.append(Paragraph("Items delivered", H2))
    if design:
        qty = design.get("qty") or 1
        item = (f"{design.get('name', job['product'])}"
                f" — {design.get('width')} × {design.get('height')} mm"
                + (f" · ref {design.get('ref')}" if design.get("ref") else ""))
        rows = [["#", "Item", "Qty", "Checked"]] + [["1", item, str(qty), "☐"]]
    else:
        rows = [["#", "Item", "Qty", "Checked"]] + [["1", job["product"], "—", "☐"]]
    rows += [[str(i), "", "", "☐"] for i in range(len(rows), 5)]
    t = Table(rows, colWidths=[10 * mm, 116 * mm, 16 * mm, 24 * mm])
    t.setStyle(BASE_STYLE)
    flow.append(t)

    flow.append(Paragraph(
        "Goods checked and received in good condition. Glass inspected for edge damage, "
        "scratches and correct sizes before signing. Balance payment due on delivery per "
        "agreed deposit and balance terms.", NOTE))

    flow.append(Spacer(0, 14 * mm))
    rows = [["Delivered by (Sofaamy)", "Received by (Client)"],
            ["\n\nName: ____________________\n\nSignature: _______________\n\nDate: ____________",
             "\n\nName: ____________________\n\nSignature: _______________\n\nDate: ____________"]]
    t = Table(rows, colWidths=[83 * mm, 83 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("FONTSIZE", (0, 1), (-1, -1), 8.5),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(t)

    sub = (f"Job {job['job_number']} · {job['client']} · "
           f"value {ghs(job['value'])} · paid {job['paid']} · {datetime.now():%d %b %Y}")
    return _build("DELIVERY NOTE", sub, flow)

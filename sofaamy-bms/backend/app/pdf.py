"""Sofaamy-branded quotation PDF (reportlab).

Amounts rendered as "GHS 1,234.56" — the cedi glyph (₵) is not in the
built-in Helvetica fonts.
"""
from datetime import datetime, timedelta
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

NAVY = colors.HexColor("#122a46")
GOLD = colors.HexColor("#c9a227")
INK = colors.HexColor("#22303e")
MUTED = colors.HexColor("#68788a")
LINE = colors.HexColor("#d8dfe6")

PAGE_W, PAGE_H = A4
M = 18 * mm  # page margin

FRAME_COLOUR_LABELS = {
    "mill": "Mill Finish",
    "white": "White",
    "bronze": "Bronze",
    "black": "Matte Black",
    "charcoal": "Charcoal Grey",
    "wood": "Wood Grain",
}
FINISH_LABELS = {
    "powder": "Powder Coating",
    "anodized": "Anodized",
    "pvdf": "PVDF Coating",
    "wood": "Wood-Finish Coating",
    "lamination": "Lamination",
}


def ghs(n: float) -> str:
    return f"GHS {n:,.2f}"


def _clip(value, length=54):
    value = str(value or "—")
    return value if len(value) <= length else value[:length - 1] + "…"


def _profile_colour(design: dict | None) -> str:
    """Resolve the customer-facing colour even for older saved projects."""
    d = design or {}
    custom = d.get("custom_frame_color") or d.get("customFrameColor")
    if custom:
        return f"Custom colour ({custom})"
    frame = d.get("frame")
    if frame in FRAME_COLOUR_LABELS:
        return FRAME_COLOUR_LABELS[frame]
    explicit = d.get("colour_description") or d.get("colourDescription")
    if explicit:
        return explicit
    finish = d.get("finish_type") or d.get("finishType")
    return FINISH_LABELS.get(finish, finish or "—")


def quote_pdf(quote_number: str, client_name: str, design_name: str,
              width_mm: int, height_mm: int, result: dict,
              design: dict | None = None) -> bytes:
    buf = BytesIO()
    c = Canvas(buf, pagesize=A4)

    # ── header band ──
    c.setFillColor(NAVY)
    c.rect(0, PAGE_H - 34 * mm, PAGE_W, 34 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(M, PAGE_H - 16 * mm, "SOFAAMY CO. LTD")
    c.setFont("Helvetica", 9)
    c.setFillColor(colors.HexColor("#b9c6d4"))
    c.drawString(M, PAGE_H - 22 * mm, "Glass & Aluminium Fabrication · Accra, Ghana")
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(PAGE_W - M, PAGE_H - 16 * mm, "QUOTATION")
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawRightString(PAGE_W - M, PAGE_H - 22 * mm, quote_number)

    # ── meta block ──
    today = datetime.now()
    valid_days = max(1, int((design or {}).get("quote_valid_days") or 3))
    valid_until = today + timedelta(days=valid_days)
    qty = result.get("qty", 1)
    site = (design or {}).get("location") or "—"
    phone = (design or {}).get("client_phone") or "—"
    email = (design or {}).get("client_email") or "—"
    job = (design or {}).get("job_description") or f"Fabrication and installation of {design_name}"
    colour = _profile_colour(design)

    y = PAGE_H - 46 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(M, y, "Client")
    c.drawString(M + 70 * mm, y, "Site / location")
    c.drawRightString(PAGE_W - M, y, "Quote date")
    y -= 4.5 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 10)
    c.drawString(M, y, _clip(client_name or "Walk-in Client", 34))
    c.drawString(M + 70 * mm, y, _clip(site, 29))
    c.drawRightString(PAGE_W - M, y, today.strftime("%d %b %Y"))
    y -= 4.5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(M, y, "Contact")
    c.drawString(M + 70 * mm, y, "Design ref")
    c.drawRightString(PAGE_W - M, y, "Valid until")
    y -= 4.5 * mm
    c.setFillColor(INK); c.setFont("Helvetica", 9)
    c.drawString(M, y, _clip(phone if phone != "—" else email, 34))
    c.drawString(M + 70 * mm, y, _clip((design or {}).get("ref") or quote_number, 29))
    c.drawRightString(PAGE_W - M, y, valid_until.strftime("%d %b %Y"))
    y -= 4.5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(M, y, "Product / job")
    c.drawString(M + 100 * mm, y, "Profile / colour")
    y -= 4.5 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 9)
    c.drawString(M, y, _clip(job, 54))
    c.drawString(M + 100 * mm, y, _clip(colour, 21))
    y -= 4.5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    if result.get("manual_quote"):
        meta = (
            f"Custom technical scope · approved extraction "
            f"E{result.get('extraction_revision', '—')} · final dimensions per approved drawing")
    elif result.get("total_kg") is not None:   # frameless
        meta = (f"{result['sections']} toughened panel(s) · {result['area']} m² · "
                f"{result['total_kg']} kg glass per unit")
    elif (result.get("fabrication") or {}).get("system") == "trialco":
        f = result["fabrication"]
        meta = (f"Trialco bay · frame {f['frame']['w_mm']} × {f['frame']['h_mm']} mm · "
                f"{f['leaf']['qty']} leaves · {result['area']} m² · "
                f"{result['profile_len']} m profile / {result['piece_count']} pieces per unit")
    else:
        meta = (f"{result['sections']} section(s) · {result['area']} m² · "
                f"{result['profile_len']} m profile / {result['piece_count']} pieces per unit")
    c.drawString(M, y, _clip(meta, 100))

    # elevation drawing on the quote (SmartGlazier/EvA-style)
    if design is not None and design.get("category") == "frameless":
        from reportlab.graphics import renderPDF
        from .reports import _fl_elevation
        from .pricing import frameless_breakdown
        try:
            drawing = _fl_elevation(design, frameless_breakdown(design), width_pt=150 * mm)
            dh = drawing.height
            y -= dh + 6 * mm
            renderPDF.draw(drawing, c, (PAGE_W - 150 * mm) / 2, y)
            y += 2 * mm
        except Exception:
            pass  # never let the drawing break quote issuance

    # ── client-facing spreadsheet-style line items ──
    y -= 12 * mm
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9)
    c.drawString(M, y, "DESCRIPTION")
    if result.get("commercial_quote"):
        c.drawString(M + 78 * mm, y, "QTY")
        c.drawString(M + 98 * mm, y, "UNIT")
        c.drawRightString(M + 142 * mm, y, "RATE")
    else:
        c.drawString(M + 45 * mm, y, "W × H")
        c.drawString(M + 78 * mm, y, "QTY")
        c.drawString(M + 91 * mm, y, "M²")
        c.drawString(M + 108 * mm, y, "UNIT")
    c.drawRightString(PAGE_W - M, y, "TOTAL")
    y -= 2.5 * mm
    c.setStrokeColor(NAVY); c.setLineWidth(1)
    c.line(M, y, PAGE_W - M, y)

    client_lines = result.get("client_lines") or []
    if client_lines:
        for line in client_lines:
            y -= 7 * mm
            c.setFillColor(INK); c.setFont("Helvetica", 7.8)
            c.drawString(M, y, str(line.get("description", "Frame item"))[:40])
            if result.get("commercial_quote"):
                c.drawString(M + 80 * mm, y, f"{line.get('quantity', 1):g}")
                c.drawString(M + 98 * mm, y, str(line.get("unit") or "item")[:12])
                c.drawRightString(M + 142 * mm, y, ghs(line.get("unit_price", 0)))
            else:
                c.drawString(M + 45 * mm, y, f"{line.get('width_mm', 0)} × {line.get('height_mm', 0)}")
                c.drawString(M + 80 * mm, y, str(line.get("qty", 1)))
                c.drawRightString(M + 104 * mm, y, f"{line.get('m2', 0):,.2f}")
                c.drawRightString(M + 132 * mm, y, ghs(line.get("unit_price", 0)))
            c.drawRightString(PAGE_W - M, y, ghs(line.get("total", 0)))
            c.setStrokeColor(LINE); c.setLineWidth(0.4)
            c.line(M, y - 2.2 * mm, PAGE_W - M, y - 2.2 * mm)
    else:
        y -= 9 * mm
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10)
        c.drawString(M, y, "Fabrication and installation")
        c.drawRightString(PAGE_W - M, y, ghs(result.get("grand_total", result["total"])))
        c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
        detail = (
            "Bundled customer quotation · fabrication and installation to approved technical drawings"
            if result.get("manual_quote")
            else f"{result['area']} m² · bundled client quotation · {result['sections']} section(s)")
        c.drawString(M, y - 3.8 * mm, detail)
        y -= 4.5 * mm
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.line(M, y - 1.5 * mm, PAGE_W - M, y - 1.5 * mm)

    # ── totals ──
    y -= 10 * mm
    if client_lines:
        totals = [
            ("Priced lines", result.get(
                "priced_lines",
                result.get("client_subtotal", result.get("grand_total", result["total"])))),
        ]
        if result.get("service_charge_percent", 0) or result.get("service_charge_amount", 0):
            totals.append((
                f"Service charge ({result.get('service_charge_percent', 0):.0f}%)",
                result.get("service_charge_amount", 0)))
        totals.append((
            "Subtotal",
            result.get("client_subtotal", result.get("grand_total", result["total"]))))
        if result.get("discount_percent", 0):
            totals.append((f"Discount ({result['discount_percent']:.0f}%)", -result.get("discount_amount", 0)))
        totals.extend([
            (f"GETF + NHIS ({result.get('getf_nhis_percent', 5):.0f}%)", result.get("getf_nhis", 0)),
            (f"VAT ({result.get('vat_percent', 15):.0f}%)", result.get("vat", 0)),
        ])
        for label, amount in totals:
            c.setFillColor(MUTED); c.setFont("Helvetica", 9)
            c.drawString(PAGE_W - M - 70 * mm, y, label)
            c.setFillColor(INK)
            c.drawRightString(PAGE_W - M, y, ghs(amount))
            y -= 5.5 * mm
        if qty > 1:
            c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
            c.drawString(PAGE_W - M - 70 * mm, y, f"Unit total × {qty}")
            c.setFillColor(INK)
            c.drawRightString(PAGE_W - M, y, ghs(result.get("total", 0)))
            y -= 6 * mm
    else:
        if qty > 1:
            c.setFillColor(MUTED)
            c.drawString(PAGE_W - M - 70 * mm, y, f"Unit total × {qty}")
            c.setFillColor(INK)
            c.drawRightString(PAGE_W - M, y, ghs(result["total"]))
            y -= 8 * mm
        else:
            y -= 2 * mm
    # Keep the total banner clear of the final tax/unit line. The previous
    # spacing was small enough for the banner to cover VAT in one-page quotes.
    y -= 7 * mm
    c.setFillColor(NAVY)
    c.rect(PAGE_W - M - 75 * mm, y - 3 * mm, 75 * mm, 10 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 11)
    c.drawString(PAGE_W - M - 70 * mm, y, "TOTAL")
    c.drawRightString(PAGE_W - M - 3 * mm, y, ghs(result.get("grand_total", result["total"])))
    y -= 10 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawRightString(PAGE_W - M, y, "Grand total includes the tax lines shown above · Ghana Cedi (GHS)")

    # ── terms ──
    y -= 14 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 9.5)
    c.drawString(M, y, "Payment Terms")
    c.setFillColor(MUTED); c.setFont("Helvetica", 9)
    deposit = max(0, min(100, float((design or {}).get("deposit_percent", 80))))
    balance = 100 - deposit
    c.drawString(M, y - 5 * mm,
                 f"{deposit:.0f}% deposit before fabrication · {balance:.0f}% balance before completion.")
    c.drawString(M, y - 10 * mm,
                 f"Installation is scheduled after deposit confirmation. This quotation is valid for {valid_days} working days.")
    c.drawString(M, y - 15 * mm,
                 "Payment: cash, cheque, mobile money or bank transfer; an official receipt is issued for each payment.")
    c.drawString(M, y - 20 * mm,
                 "Final dimensions are subject to site verification before fabrication. Prices may change after the validity period.")

    # ── footer ──
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.line(M, 18 * mm, PAGE_W - M, 18 * mm)
    c.setFillColor(MUTED); c.setFont("Helvetica", 8)
    c.drawString(M, 13 * mm, "Sofaamy Co. Ltd · Accra, Ghana")
    c.drawRightString(PAGE_W - M, 13 * mm, "Powered by Veloxa")

    c.showPage()
    c.save()
    return buf.getvalue()


def project_quote_summary_pdf(project: dict) -> bytes:
    """Consolidated client-facing quotation for all items in one project.

    The first page is the commercial roll-up. Each following item page carries
    a small elevation preview, identifying metadata and that item's amount so
    the client can connect the quoted line to the drawing.
    """
    from reportlab.graphics import renderPDF
    from .reports import any_elevation

    buf = BytesIO()
    c = Canvas(buf, pagesize=A4)
    margin = M
    y = PAGE_H - 18 * mm

    def header():
        nonlocal y
        c.setFillColor(NAVY)
        c.rect(0, PAGE_H - 34 * mm, PAGE_W, 34 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 20)
        c.drawString(margin, PAGE_H - 16 * mm, "SOFAAMY CO. LTD")
        c.setFont("Helvetica", 9); c.setFillColor(colors.HexColor("#b9c6d4"))
        c.drawString(margin, PAGE_H - 22 * mm, "Glass & Aluminium Fabrication · Accra, Ghana")
        c.setFillColor(GOLD); c.setFont("Helvetica-Bold", 13)
        c.drawRightString(PAGE_W - margin, PAGE_H - 16 * mm, "PROJECT QUOTATION")
        c.setFillColor(colors.white); c.setFont("Helvetica", 10)
        c.drawRightString(PAGE_W - margin, PAGE_H - 22 * mm,
                          project.get("project_quote_number") or project.get("project_number", "—"))
        y = PAGE_H - 47 * mm

    def footer():
        c.setStrokeColor(LINE); c.setLineWidth(.5)
        c.line(margin, 18 * mm, PAGE_W - margin, 18 * mm)
        c.setFillColor(MUTED); c.setFont("Helvetica", 8)
        c.drawString(margin, 13 * mm, "Sofaamy Co. Ltd · Accra, Ghana")
        c.drawRightString(PAGE_W - margin, 13 * mm, "Powered by Veloxa")

    header()
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(margin, y, "Client")
    c.drawString(margin + 72 * mm, y, "Project / site")
    c.drawRightString(PAGE_W - margin, y, "Quote date")
    y -= 5 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, y, _clip(project.get("client_name") or "Walk-in Client", 34))
    c.drawString(margin + 72 * mm, y, _clip(project.get("name"), 43))
    c.drawRightString(PAGE_W - margin, y, datetime.now().strftime("%d %b %Y"))
    y -= 5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(margin + 72 * mm, y, _clip(project.get("location") or "—", 43))
    y -= 12 * mm

    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9)
    c.drawString(margin, y, "ITEM / PROFILE")
    c.drawString(margin + 72 * mm, y, "SIZE")
    c.drawString(margin + 112 * mm, y, "QTY")
    c.drawRightString(PAGE_W - margin, y, "TOTAL")
    y -= 2.5 * mm; c.setStrokeColor(NAVY); c.setLineWidth(1)
    c.line(margin, y, PAGE_W - margin, y)
    for item in project.get("items", []):
        if y < 42 * mm:
            footer(); c.showPage(); header()
            c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9)
            c.drawString(margin, y, "ITEM / PROFILE (continued)")
            y -= 5 * mm
        y -= 7 * mm
        design = item.get("design") or {}
        c.setFillColor(INK); c.setFont("Helvetica", 8.5)
        c.drawString(margin, y, _clip(item.get("name"), 28))
        c.drawString(margin + 72 * mm, y, f"{design.get('width', 0)} × {design.get('height', 0)} mm")
        c.drawString(margin + 112 * mm, y, str(item.get("qty") or design.get("qty") or 1))
        c.drawRightString(PAGE_W - margin, y, ghs(item.get("total", 0)))
        c.setFillColor(MUTED); c.setFont("Helvetica", 7.5)
        c.drawString(margin, y - 3.7 * mm, _clip(
            f"{item.get('ref') or '—'} · {design.get('system') or design.get('category') or '—'} · {item.get('location') or '—'}", 82))
        c.setStrokeColor(LINE); c.setLineWidth(.4)
        c.line(margin, y - 6.2 * mm, PAGE_W - margin, y - 6.2 * mm)
        y -= 4 * mm

    y -= 10 * mm
    totals = [
        ("Subtotal", project.get("client_subtotal", 0)),
        (f"Discount ({project.get('effective_discount_percent', 0):g}%)", -project.get("discount_amount", 0)),
        (f"GETF + NHIS ({project.get('effective_getf_nhis_percent', 0):g}%)", project.get("getf_nhis", 0)),
        (f"VAT ({project.get('effective_vat_percent', 0):g}%)", project.get("vat", 0)),
    ]
    for label, amount in totals:
        c.setFillColor(MUTED); c.setFont("Helvetica", 9)
        c.drawString(PAGE_W - margin - 70 * mm, y, label)
        c.setFillColor(INK); c.drawRightString(PAGE_W - margin, y, ghs(amount))
        y -= 5.5 * mm
    c.setFillColor(NAVY)
    c.rect(PAGE_W - margin - 78 * mm, y - 3 * mm, 78 * mm, 11 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 11)
    c.drawString(PAGE_W - margin - 73 * mm, y, "PROJECT TOTAL")
    c.drawRightString(PAGE_W - margin - 3 * mm, y, ghs(project.get("client_grand_total", 0)))
    y -= 15 * mm
    deposit = project.get("deposit_percent", 80)
    deposit_amount = project.get("client_grand_total", 0) * deposit / 100
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(PAGE_W - margin - 70 * mm, y, f"Deposit ({deposit:.0f}%)")
    c.setFillColor(INK); c.drawRightString(PAGE_W - margin, y, ghs(deposit_amount))
    y -= 5.5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(PAGE_W - margin - 70 * mm, y, f"Balance ({100 - deposit:.0f}%)")
    c.setFillColor(INK); c.drawRightString(PAGE_W - margin, y,
                                            ghs(project.get("client_grand_total", 0) - deposit_amount))
    y -= 12 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 9.5)
    c.drawString(margin, y, "Project items and drawings")
    y -= 5 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawString(margin, y, "Each following page shows a small drawing and the quoted item it represents.")
    c.drawString(margin, y - 5 * mm, "Final dimensions remain subject to site verification before fabrication.")
    footer(); c.showPage()

    # Item detail pages: customer-facing visual previews, not factory cut lists.
    for index, item in enumerate(project.get("items", []), start=1):
        header()
        design = item.get("design") or {}
        result = item.get("result") or {}
        c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 12)
        c.drawString(margin, y, f"ITEM {index} OF {len(project.get('items', []))}")
        y -= 8 * mm
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 14)
        c.drawString(margin, y, _clip(item.get("name"), 55))
        y -= 6 * mm
        c.setFillColor(MUTED); c.setFont("Helvetica", 9)
        c.drawString(margin, y, _clip(
            f"Ref: {item.get('ref') or '—'} · {design.get('system') or design.get('category') or '—'} · "
            f"{design.get('width', 0)} × {design.get('height', 0)} mm · Qty {item.get('qty') or design.get('qty') or 1}", 105))
        y -= 9 * mm

        try:
            drawing = any_elevation(design, width_pt=78 * mm, max_h=42 * mm)
            box_x, box_top = margin, y
            box_w, box_h = 82 * mm, 66 * mm
            c.setStrokeColor(LINE); c.setFillColor(colors.HexColor("#f7fafc"))
            c.roundRect(box_x, box_top - box_h, box_w, box_h, 3 * mm, stroke=1, fill=1)
            draw_x = box_x + (box_w - drawing.width) / 2
            draw_y = box_top - 4 * mm - drawing.height
            renderPDF.draw(drawing, c, draw_x, draw_y)
        except Exception:
            c.setFillColor(MUTED); c.setFont("Helvetica-Oblique", 9)
            c.drawString(margin + 8 * mm, y - 30 * mm, "Drawing preview unavailable")

        info_x = margin + 92 * mm
        info_y = y - 5 * mm
        for label, value in (
            ("Project location", project.get("location") or "—"),
            ("Item location", item.get("location") or "—"),
            ("System", design.get("system") or design.get("category") or "—"),
            ("Dimensions", f"{design.get('width', 0)} × {design.get('height', 0)} mm"),
            ("Quantity", str(item.get("qty") or design.get("qty") or 1)),
        ):
            c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
            c.drawString(info_x, info_y, label)
            c.setFillColor(INK); c.setFont("Helvetica-Bold", 9)
            c.drawString(info_x, info_y - 4.2 * mm, _clip(value, 34))
            info_y -= 13 * mm

        c.setStrokeColor(LINE); c.line(margin, y - 73 * mm, PAGE_W - margin, y - 73 * mm)
        total_y = y - 83 * mm
        c.setFillColor(MUTED); c.setFont("Helvetica", 9)
        c.drawString(PAGE_W - margin - 70 * mm, total_y, "Quoted item total")
        c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 13)
        c.drawRightString(PAGE_W - margin, total_y,
                          ghs(item.get("total", result.get("client_grand_total", 0))))
        c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
        c.drawString(margin, total_y - 10 * mm,
                     "The drawing is a client reference image. Fabrication dimensions are issued separately in the production documents.")
        footer(); c.showPage()

    c.save()
    return buf.getvalue()

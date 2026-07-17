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
    if result.get("total_kg") is not None:   # frameless
        meta = (f"{result['sections']} toughened panel(s) · {result['area']} m² · "
                f"{result['total_kg']} kg glass per unit")
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
            c.drawString(M, y, str(line.get("description", "Frame item"))[:25])
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
        c.drawString(M, y - 3.8 * mm,
                     f"{result['area']} m² · bundled client quotation · {result['sections']} section(s)")
        y -= 4.5 * mm
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.line(M, y - 1.5 * mm, PAGE_W - M, y - 1.5 * mm)

    # ── totals ──
    y -= 10 * mm
    if client_lines:
        totals = [
            ("Subtotal", result.get("client_subtotal", result.get("grand_total", result["total"]))),
        ]
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

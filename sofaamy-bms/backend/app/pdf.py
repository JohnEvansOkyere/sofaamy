"""Sofaamy-branded quotation PDF (reportlab).

Amounts rendered as "GHS 1,234.56" — the cedi glyph (₵) is not in the
built-in Helvetica fonts.
"""
from datetime import datetime
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


def ghs(n: float) -> str:
    return f"GHS {n:,.2f}"


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
    y = PAGE_H - 46 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 9)
    c.drawString(M, y, "Client")
    c.drawString(M + 70 * mm, y, "Product")
    c.drawRightString(PAGE_W - M, y, "Date")
    y -= 5 * mm
    qty = result.get("qty", 1)
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 11)
    c.drawString(M, y, client_name or "Walk-in Client")
    prod = f"{design_name} — {width_mm} × {height_mm} mm" + (f"  ×{qty} units" if qty > 1 else "")
    if len(prod) > 40:   # keep clear of the date column
        prod = prod[:38] + "…"
    c.drawString(M + 70 * mm, y, prod)
    c.drawRightString(PAGE_W - M, y, datetime.now().strftime("%d %b %Y"))
    y -= 4 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 9)
    if result.get("total_kg") is not None:   # frameless
        meta = (f"{result['sections']} toughened panel(s) · {result['area']} m² · "
                f"{result['total_kg']} kg glass per unit")
    else:
        meta = (f"{result['sections']} section(s) · {result['area']} m² · "
                f"{result['profile_len']} m profile / {result['piece_count']} pieces per unit")
    c.drawString(M + 70 * mm, y, meta)

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

    # ── line items ──
    y -= 12 * mm
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 9)
    c.drawString(M, y, "DESCRIPTION")
    c.drawRightString(PAGE_W - M, y, "AMOUNT")
    y -= 2.5 * mm
    c.setStrokeColor(NAVY); c.setLineWidth(1)
    c.line(M, y, PAGE_W - M, y)

    for line in result["lines"]:
        y -= 9 * mm
        c.setFillColor(INK); c.setFont("Helvetica-Bold", 10)
        c.drawString(M, y, line["key"])
        c.drawRightString(PAGE_W - M, y, ghs(line["amount"]))
        c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
        c.drawString(M, y - 3.8 * mm, line["detail"])
        y -= 4.5 * mm
        c.setStrokeColor(LINE); c.setLineWidth(0.5)
        c.line(M, y - 1.5 * mm, PAGE_W - M, y - 1.5 * mm)

    # ── totals ──
    y -= 10 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 10)
    c.drawString(PAGE_W - M - 70 * mm, y, "Subtotal (per unit)")
    c.setFillColor(INK)
    c.drawRightString(PAGE_W - M, y, ghs(result["subtotal"]))
    y -= 6 * mm
    c.setFillColor(MUTED)
    c.drawString(PAGE_W - M - 70 * mm, y, f"Margin ({result['margin_pct']:.0f}%)")
    c.setFillColor(INK)
    c.drawRightString(PAGE_W - M, y, ghs(result["margin"]))
    if qty > 1:
        y -= 6 * mm
        c.setFillColor(MUTED)
        c.drawString(PAGE_W - M - 70 * mm, y, f"Unit total × {qty}")
        c.setFillColor(INK)
        c.drawRightString(PAGE_W - M, y, ghs(result["total"]))
    y -= 9 * mm
    c.setFillColor(NAVY)
    c.rect(PAGE_W - M - 75 * mm, y - 3 * mm, 75 * mm, 10 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 11)
    c.drawString(PAGE_W - M - 70 * mm, y, "TOTAL")
    c.drawRightString(PAGE_W - M - 3 * mm, y, ghs(result.get("grand_total", result["total"])))
    y -= 10 * mm
    c.setFillColor(MUTED); c.setFont("Helvetica", 8.5)
    c.drawRightString(PAGE_W - M, y, "VAT exclusive · all amounts in Ghana Cedi (GHS)")

    # ── terms ──
    y -= 14 * mm
    c.setFillColor(INK); c.setFont("Helvetica-Bold", 9.5)
    c.drawString(M, y, "Payment Terms")
    c.setFillColor(MUTED); c.setFont("Helvetica", 9)
    c.drawString(M, y - 5 * mm, "50% deposit before production · 50% balance on delivery.")
    c.drawString(M, y - 10 * mm, "Quotation valid for 14 days from date of issue.")

    # ── footer ──
    c.setStrokeColor(LINE); c.setLineWidth(0.5)
    c.line(M, 18 * mm, PAGE_W - M, 18 * mm)
    c.setFillColor(MUTED); c.setFont("Helvetica", 8)
    c.drawString(M, 13 * mm, "Sofaamy Co. Ltd · Accra, Ghana")
    c.drawRightString(PAGE_W - M, 13 * mm, "Powered by Veloxa")

    c.showPage()
    c.save()
    return buf.getvalue()

"""System material catalogue used to bootstrap the inventory store.

Prices and opening balances in this file are provisional working values.  The
bootstrap is additive: once a material exists, later supplier pricing and
physical stock counts entered by Sofaamy are never overwritten on startup.
"""
from .pricing import (
    FL_GLASS,
    FL_HARDWARE,
    FRAME_GLASS,
    FRAME_SOURCE_ACCESSORIES,
    FRAME_SOURCE_PROFILES,
    GLASS_LABELS,
    TRIALCO_GLASS_SHEET_M2,
    TRIALCO_MATERIAL_PRICES,
)


def _opening_stock(unit: str) -> tuple[float, float]:
    """Return a generous working opening balance and its reorder level."""
    normalized = unit.lower().replace("²", "2").replace(" ", "")
    if "bar" in normalized:
        return 100.0, 20.0
    if "sheet" in normalized:
        return 50.0, 10.0
    if normalized == "m2":
        return 500.0, 100.0
    if normalized == "m":
        return 2_000.0, 400.0
    if normalized == "tube":
        return 200.0, 40.0
    if normalized == "set":
        return 100.0, 20.0
    return 1_000.0, 200.0


def _system_materials() -> list[tuple[str, str, str, str, float, float, float]]:
    rows: dict[str, tuple[str, str, str, str, float, float, float]] = {}

    def add(code: str, name: str, category: str, unit: str, price: float,
            stock: float | None = None, reorder: float | None = None) -> None:
        code = code.strip()
        if not code or code in rows:
            return
        default_stock, default_reorder = _opening_stock(unit)
        rows[code] = (
            code, name.strip(), category, unit, round(float(price), 2),
            default_stock if stock is None else float(stock),
            default_reorder if reorder is None else float(reorder),
        )

    # Exact codes and units emitted by the current Trialco material sheet.
    trialco_names = {
        "frame": "Trialco frame",
        "leaf": "Trialco leaf",
        "net": "Trialco net",
        "interlock": "Trialco interlock",
        "kit": "Trialco kits",
        "corner": "0404 corners",
        "rollers": "Trialco rollers",
        "locks": "Metal locks",
        "net_corners": "Net corners",
        "net_handle": "Net handle",
        "net_fibre": "Net fibre",
        "glazing": "Glazing rubber",
        "net_rubber": "Net rubber",
        "screws": "Installation screws",
        "wall_plugs": "Wall plugs",
        "drain_caps": "Water drain cap",
        "pvc_covers": "PVC hole cover",
        "silicone": "Silicone",
        "brush": "Italian brush",
    }
    for key, meta in TRIALCO_MATERIAL_PRICES.items():
        category = (
            "Profile" if key in {"frame", "leaf", "net", "interlock"}
            else "Accessory")
        add(meta["code"], trialco_names[key], category, meta["unit"],
            meta["unit_price"])

    # All glass choices the frame configurator can place in a Trialco sheet.
    sheet_unit = f"{TRIALCO_GLASS_SHEET_M2}m² sheet"
    for code, price_per_m2 in FRAME_GLASS.items():
        add(
            code,
            f"Glass — {GLASS_LABELS.get(code, code)}",
            "Glass",
            sheet_unit,
            price_per_m2 * TRIALCO_GLASS_SHEET_M2,
        )

    # Every profile and accessory exposed by the frame system catalogue.
    for profiles in FRAME_SOURCE_PROFILES.values():
        for name, code, stock_mm, listed_price in profiles:
            add(code, name.title(), "Profile", f"{stock_mm / 1000:g}m bar",
                listed_price)
    for accessories in FRAME_SOURCE_ACCESSORIES.values():
        for item in accessories:
            add(item["code"], item["name"].title(), "Accessory", "pcs",
                item["listed_value"])

    # This current E2 item was added through the project material editor.
    add("ACCIk SDK", "Italian sliding nail", "Accessory", "pcs", 8.0)

    # Generic frame roles can still be emitted by non-Trialco provisional
    # extractions until their profile-to-cut-role mapping is confirmed.
    add("frame_outer", "Outer frame member (mapping pending)", "Profile", "m", 85)
    add("frame_internal", "Internal frame member (mapping pending)", "Profile", "m", 85)
    add("frame_opening", "Opening frame member (mapping pending)", "Profile", "m", 85)
    add("CW-MULLION", "Curtain Wall Mullion", "Profile", "m", 140)
    add("CW-TRANSOM", "Curtain Wall Transom", "Profile", "m", 130)

    # Frameless glass and hardware codes emitted by generated extractions.
    frameless_glass_codes = {
        "temp8": "GL-TMP-8",
        "temp10": "GL-TMP-10",
        "temp12": "GL-TMP-12",
        "frost10": "GL-FRST-10",
        "lam13": "GL-LAM-13",
    }
    for key, code in frameless_glass_codes.items():
        meta = FL_GLASS[key]
        add(code, meta["label"], "Glass", "m2", meta["price"])
    for code, meta in FL_HARDWARE.items():
        # Generated frameless extraction rows currently issue each fitting or
        # packaged system as a countable piece.
        add(code, meta["desc"].replace(" — PLACEHOLDER code", ""),
            "Hardware", "pcs", meta["price"])

    # Legacy demo materials are also part of the visible store catalogue.
    add("AL-PRO-40", "Aluminium Profile 40mm", "Profile", "m", 85, 420, 200)
    add("AL-PRO-60", "Aluminium Profile 60mm", "Profile", "m", 110, 180, 200)
    add("GL-CLR-6", "Clear Glass 6mm", "Glass", "m2", 120, 64, 40)
    add("HW-HNG-01", "Casement Hinge", "Hardware", "pcs", 45, 120, 40)
    add("AC-GSK-01", "EPDM Rubber Gasket", "Accessory", "m", 6, 800, 300)

    return list(rows.values())


SYSTEM_MATERIALS = _system_materials()

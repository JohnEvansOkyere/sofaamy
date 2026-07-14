"""GHS pricing engine — server-side mirror of the frontend engine."""
PROFILE_PER_M = 85.0
LABOUR_PER_M2 = 95.0
INSTALL_PER_M2 = 45.0
MARGIN_PCT = 20.0

# per-profile prices/m — PLACEHOLDERS until Sofaamy's material list arrives
PROFILE_PRICES = {"mollium": 85.0, "transum": 85.0, "sash": 95.0,
                  "cwmullion": 140.0, "cwtransom": 130.0}
PROFILE_LABELS = {"mollium": "Mollium", "transum": "Transum", "sash": "Sash",
                  "cwmullion": "CW Mullion", "cwtransom": "CW Transom"}

GLASS = {"clear":120,"frosted":160,"tinted":175,"reflective":210,
         "tempered":230,"laminated":275,"double":340}
HARDWARE = {"fixed":80,"casement":180,"sliding":240,"awning":200,"louvre":320,
            "single":260,"double":420,"pivot":520}
GLASS_LABELS = {"clear":"Clear","frosted":"Frosted","tinted":"Tinted (Grey)",
                "reflective":"Reflective","tempered":"Tempered",
                "laminated":"Laminated","double":"Double Glazed"}


def calc_quote(width_mm: int, height_mm: int, panels: int, opening: str, glass: str) -> dict:
    w, h = width_mm / 1000, height_mm / 1000
    area = w * h
    profile_len = 2 * (w + h) + max(0, panels - 1) * h

    profile = profile_len * PROFILE_PER_M
    glass_cost = area * GLASS.get(glass, 120)
    hardware = HARDWARE.get(opening, 80) * panels
    labour = area * LABOUR_PER_M2
    install = area * INSTALL_PER_M2

    subtotal = profile + glass_cost + hardware + labour + install
    margin = subtotal * (MARGIN_PCT / 100)
    total = subtotal + margin
    return {
        "area": round(area, 3),
        "profile_len": round(profile_len, 2),
        "subtotal": round(subtotal, 2),
        "margin": round(margin, 2),
        "margin_pct": MARGIN_PCT,
        "total": round(total, 2),
        "currency": "GHS",
    }


# ── design-aware engine (mirror of frontend lib/pieces.js + lib/pricing.js) ──

def _col_widths(design: dict) -> list[float]:
    cw = design.get("col_widths") or []
    if len(cw) == design["cols"]:
        return cw
    return [design["width"] / design["cols"]] * design["cols"]


def _row_heights(design: dict) -> list[float]:
    rh = design.get("row_heights") or []
    if len(rh) == design["rows"]:
        return rh
    return [design["height"] / design["rows"]] * design["rows"]


# Fabrication deduction rules — PLACEHOLDERS until Sofaamy's system
# specs arrive. Mirrors frontend lib/products.js FAB (formulas there).
FAB = {"frame_depth": 50, "interlock": 30, "track_clear": 30,
       "glass_deduct_fixed": 70, "glass_deduct_sash": 60}


def design_breakdown(design: dict) -> dict:
    """One unit's full fabrication breakdown: every profile piece with
    position, deducted length and cut angles, plus glass cut sizes."""
    w, h = design["width"], design["height"]
    cols, rows = design["cols"], design["rows"]
    cw, rh = _col_widths(design), _row_heights(design)
    profiles: list[dict] = []
    glass: list[dict] = []

    def P(position, profile, member, length_mm, qty, cuts):
        profiles.append({"position": position, "profile": profile, "member": member,
                         "length_mm": round(length_mm), "qty": qty, "cuts": cuts})

    P("Frame head", "transum", "Head", w, 1, "45°/45°")
    P("Frame sill", "transum", "Sill", w, 1, "45°/45°")
    P("Frame jambs (L+R)", "mollium", "Jamb", h, 2, "45°/45°")
    for j in range(1, cols):
        P(f"Mullion {j}", "mollium", "Mullion", h - 2 * FAB["frame_depth"], 1, "90°/90°")
    for r in range(1, rows):
        for c in range(cols):
            P(f"Transom {r}.{c + 1}", "transum", "Transom",
              cw[c] - 2 * FAB["frame_depth"], 1, "90°/90°")

    for i, cell in enumerate(design["cells"]):
        sec_w, sec_h = cw[i % cols], rh[i // cols]
        tag = f"F{i + 1}"
        if cell["opening"] == "fixed":
            glass.append({"section": tag, "glass": cell["glass"],
                          "w_mm": round(sec_w - FAB["glass_deduct_fixed"]),
                          "h_mm": round(sec_h - FAB["glass_deduct_fixed"]),
                          "qty": 1, "note": "fixed lite"})
        else:
            n = cell.get("panels") or 1
            sash_w = sec_w / n + (FAB["interlock"] / 2 if n > 1 else 0)
            sash_h = sec_h - FAB["track_clear"]
            cuts = "45°/45°" if cell["opening"] in ("casement", "awning") else "90°/90°"
            P(f"{tag} sash rails (top+btm)", "sash", "Sash rail", sash_w, 2 * n, cuts)
            P(f"{tag} sash stiles", "sash", "Sash stile", sash_h, 2 * n, cuts)
            glass.append({"section": tag, "glass": cell["glass"],
                          "w_mm": round(sash_w - FAB["glass_deduct_sash"]),
                          "h_mm": round(sash_h - FAB["glass_deduct_sash"]),
                          "qty": n, "note": f"{n} sash panel(s)"})
    return {"profiles": profiles, "glass": glass}


def extract_pieces(design: dict) -> list[dict]:
    """Flat one-unit cut list for the optimizer (merged identical cuts)."""
    merged: dict[tuple, dict] = {}
    for p in design_breakdown(design)["profiles"]:
        k = (p["profile"], p["member"], p["length_mm"])
        if k in merged:
            merged[k]["qty"] += p["qty"]
        else:
            merged[k] = {"profile": p["profile"], "member": p["member"],
                         "length_mm": p["length_mm"], "qty": p["qty"]}
    return sorted(merged.values(), key=lambda p: (p["profile"], -p["length_mm"]))


def calc_design_quote(design: dict) -> dict:
    """Divider-aware quote for a configurator design (amounts in GHS)."""
    w, h = design["width"] / 1000, design["height"] / 1000
    area = w * h
    sections = design["cols"] * design["rows"]
    qty = design.get("qty") or 1
    cw, rh = _col_widths(design), _row_heights(design)

    pieces = extract_pieces(design)
    metres: dict[str, float] = {}
    for p in pieces:
        metres[p["profile"]] = metres.get(p["profile"], 0) + p["length_mm"] * p["qty"] / 1000
    profile_len = sum(metres.values())
    piece_count = sum(p["qty"] for p in pieces)

    profile = sum(m * PROFILE_PRICES.get(pid, PROFILE_PER_M) for pid, m in metres.items())
    glass_cost = sum(
        (cw[i % design["cols"]] * rh[i // design["cols"]] / 1e6) * GLASS.get(c["glass"], 120)
        for i, c in enumerate(design["cells"]))
    hardware = sum(
        HARDWARE.get(c["opening"], 80) * (1 if c["opening"] == "fixed" else (c.get("panels") or 1))
        for c in design["cells"])
    labour = area * LABOUR_PER_M2
    install = area * INSTALL_PER_M2

    subtotal = profile + glass_cost + hardware + labour + install
    margin = subtotal * (MARGIN_PCT / 100)
    return {
        "area": round(area, 2),
        "sections": sections,
        "profile_len": round(profile_len, 2),
        "piece_count": piece_count,
        "pieces": pieces,
        "lines": [
            {"key": "Aluminium profile", "detail": f"{profile_len:.2f} m · {piece_count} cut pieces", "amount": round(profile, 2)},
            {"key": "Glass", "detail": f"{area:.2f} m² · {sections} section(s)", "amount": round(glass_cost, 2)},
            {"key": "Hardware & fittings", "detail": f"{sections} section(s)", "amount": round(hardware, 2)},
            {"key": "Fabrication labour", "detail": f"{area:.2f} m² × GHS {LABOUR_PER_M2:.0f}/m²", "amount": round(labour, 2)},
            {"key": "Installation", "detail": f"{area:.2f} m² × GHS {INSTALL_PER_M2:.0f}/m²", "amount": round(install, 2)},
        ],
        "subtotal": round(subtotal, 2),
        "margin": round(margin, 2),
        "margin_pct": MARGIN_PCT,
        "total": round(subtotal + margin, 2),
        "qty": qty,
        "grand_total": round((subtotal + margin) * qty, 2),
        "currency": "GHS",
    }


# ════════════════════════════════════════════════════════════
# FRAMELESS (toughened glass) — mirror of frontend lib/frameless.js
# Hardware codes + GHS prices are REAL (Sofaamy's SmartGlazier
# hardware list, job SGP/4462-26A). Glass ₵/m² are placeholders.
# ════════════════════════════════════════════════════════════

FL_GLASS = {
    "temp10":  {"label": "10mm Clear Tempered",    "thickness": 10,    "price": 480.0},
    "temp12":  {"label": "12mm Clear Tempered",    "thickness": 12,    "price": 620.0},
    "temp8":   {"label": "8mm Clear Tempered",     "thickness": 8,     "price": 390.0},
    "frost10": {"label": "10mm Frosted Tempered",  "thickness": 10,    "price": 540.0},
    "lam13":   {"label": "13.52mm Clear Laminated","thickness": 13.52, "price": 750.0},
}

FL_HARDWARE = {
    "BL 203":        {"desc": "Glass clamp (fixed panels)",            "finish": "Stainless Steel", "price": 36.0},
    "CSM-50W":       {"desc": "Patch lock c/w floor strike",           "finish": "Stainless Steel", "price": 185.0},
    "JQ 104(900MM)": {"desc": "Pull handle 900 mm, back-to-back pair", "finish": "Stainless Steel", "price": 262.0},
    "KL-HD 203-6":   {"desc": "Floor spring / pivot set",              "finish": "Stainless Steel", "price": 470.0},
    "KL-M102/T":     {"desc": "Bottom door patch",                     "finish": "Stainless Steel", "price": 110.0},
    "KL-M202":       {"desc": "Top door patch",                        "finish": "Stainless Steel", "price": 110.0},
    "KL-M402":       {"desc": "Over-panel / transom patch",            "finish": "Stainless Steel", "price": 185.0},
    "SH-90":         {"desc": "Shower hinge, glass-to-wall — PLACEHOLDER code", "finish": "Chrome", "price": 150.0},
    "SH-KNOB":       {"desc": "Shower knob / towel bar — PLACEHOLDER code",     "finish": "Chrome", "price": 60.0},
    "SL-ROLLER":     {"desc": "Sliding roller set — PLACEHOLDER code", "finish": "Stainless Steel", "price": 220.0},
    "SL-TRACK":      {"desc": "Top sliding track, per m — PLACEHOLDER code", "finish": "Aluminium", "price": 180.0},
    # swing-system alternatives from Sofaamy's frameless list — PLACEHOLDER prices
    "ND-SET":        {"desc": "Non-digging spring door set (top+bottom patch, no floor cut) — PLACEHOLDER price", "finish": "Stainless Steel", "price": 690.0},
    "SANHE-SET":     {"desc": "San He patch fitting set — PLACEHOLDER price",   "finish": "Stainless Steel", "price": 650.0},
    "SPIDER-SET":    {"desc": "Spider fitting door set — PLACEHOLDER price",    "finish": "Stainless Steel", "price": 780.0},
    "SCL SET":       {"desc": "SCL sliding set — track, rollers, guides — PLACEHOLDER price", "finish": "Stainless Steel", "price": 950.0},
    "SH005 SET":     {"desc": "SH005 sliding set — track, rollers, guides — PLACEHOLDER price", "finish": "Stainless Steel", "price": 850.0},
}

FL_SETS = {
    "fixed":  [("BL 203", 5)],
    "door":   [("KL-M102/T", 1), ("KL-M202", 1), ("KL-HD 203-6", 1),
               ("JQ 104(900MM)", 1), ("CSM-50W", 1)],
    "hinged": [("SH-90", 2), ("SH-KNOB", 1)],
    "slider": [("SL-ROLLER", 1)],
}
FL_OVERPANEL_SET = [("BL 203", 2), ("KL-M402", 2)]

# hardware SYSTEM options (mirror of frontend FL_SYSTEMS): the docx's
# bracket choices swap the pivot/roller part of the set; handle+lock stay.
FL_SYSTEM_SETS = {
    "klpatches":  FL_SETS["door"],
    "nondigging": [("ND-SET", 1), ("JQ 104(900MM)", 1), ("CSM-50W", 1)],
    "sanhe":      [("SANHE-SET", 1), ("JQ 104(900MM)", 1), ("CSM-50W", 1)],
    "spider":     [("SPIDER-SET", 1), ("JQ 104(900MM)", 1), ("CSM-50W", 1)],
    "scl":        [("SCL SET", 1)],
    "sh005":      [("SH005 SET", 1)],
}


def _fl_panel_set(design: dict, ty: str):
    if ty == "door":
        return FL_SYSTEM_SETS.get(design.get("fl_system") or "", FL_SETS["door"])
    if ty == "slider":
        return FL_SYSTEM_SETS.get(design.get("slide_system") or "", FL_SETS["slider"])
    return FL_SETS.get(ty, FL_SETS["fixed"])

# gap rules derived from Sofaamy's real job SGP/4462-26A
FL_FAB = {"joint": 5, "door_gap": 8, "floor_gap": 10, "over_gap": 10,
          "slide_overlap": 50, "slide_track": 60, "kg_per_m2_per_mm": 2.5}

FL_PANEL_LABELS = {"fixed": "Fixed Panel", "door": "Swing Door",
                   "hinged": "Hinged Door", "slider": "Sliding Panel", "over": "Over-panel"}


def _is_leaf(t: str) -> bool:
    return t in ("door", "hinged")


def frameless_breakdown(design: dict) -> dict:
    """Panel schedule (cut sizes, weights, processing) + hardware list."""
    g = FL_GLASS.get(design.get("glass_id") or "temp10", FL_GLASS["temp10"])
    F = FL_FAB
    cw = _col_widths(design)
    cells = design["cells"]
    panels: list[dict] = []
    hw: dict[str, int] = {}

    def add_hw(items):
        for code, n in items:
            hw[code] = hw.get(code, 0) + n

    full_h = design["height"] - F["floor_gap"]
    # fanlight spans the leaf bays — or the slider bays when no leaves
    leaf_idx = [i for i, c in enumerate(cells) if _is_leaf(c.get("type") or "fixed")]
    slider_idx = [i for i, c in enumerate(cells) if (c.get("type") or "fixed") == "slider"]
    over_idx = (leaf_idx or slider_idx) if design.get("over_panel") else []
    door_h = design.get("door_h") or 2100
    has_over = bool(over_idx)
    leaf_h = door_h if has_over else full_h - F["joint"]

    for i, cell in enumerate(cells):
        bay = cw[i % design["cols"]]
        ty = cell.get("type") or "fixed"
        if ty == "fixed":
            panels.append({"mark": f"P{i + 1}", "type": ty, "w_mm": round(bay - F["joint"]),
                           "h_mm": round(full_h),
                           "holes": "4 × ø18 corner + 1 × ø18 mid (clamps)"})
            add_hw(_fl_panel_set(design, ty))
        elif _is_leaf(ty):
            panels.append({"mark": f"P{i + 1}", "type": ty, "w_mm": round(bay - F["door_gap"]),
                           "h_mm": round(door_h if has_over else leaf_h),
                           "holes": "2 × ø16 handle · patch cutouts top+bottom · lock notch 80×60"
                           if ty == "door" else "2 hinge cutouts · 1 × ø12 knob"})
            add_hw(_fl_panel_set(design, ty))
        else:
            slide_h = (door_h if has_over and i in over_idx else full_h) - F["slide_track"]
            panels.append({"mark": f"P{i + 1}", "type": "slider",
                           "w_mm": round(bay + F["slide_overlap"]),
                           "h_mm": round(slide_h),
                           "holes": "2 × ø14 roller fixings"})
            add_hw(_fl_panel_set(design, ty))

    if has_over:
        span = sum(cw[i % design["cols"]] for i in over_idx)
        over_h = design["height"] - F["floor_gap"] - door_h - F["over_gap"]
        if over_h > 60:
            panels.append({"mark": "TRN1", "type": "over",
                           "w_mm": round(span - F["joint"] * 2), "h_mm": round(over_h),
                           "holes": "2 × ø18 clamps top · 2 patch cutouts bottom corners"})
            add_hw(FL_OVERPANEL_SET)

    for p in panels:
        p["area_m2"] = round(p["w_mm"] * p["h_mm"] / 1e6, 2)
        p["kg"] = round(p["area_m2"] * g["thickness"] * F["kg_per_m2_per_mm"], 1)

    hardware = [{"code": code, "qty": n, **FL_HARDWARE[code]}
                for code, n in hw.items() if n > 0]
    return {"panels": panels, "hardware": hardware, "glass": g,
            "total_area": round(sum(p["area_m2"] for p in panels), 2),
            "total_kg": round(sum(p["kg"] for p in panels), 1)}


def calc_frameless_quote(design: dict) -> dict:
    bd = frameless_breakdown(design)
    qty = design.get("qty") or 1
    area = bd["total_area"]

    glass_cost = area * bd["glass"]["price"]
    hardware = sum(h["qty"] * h["price"] for h in bd["hardware"])
    processing = len(bd["panels"]) * 55.0     # holes/cutouts/polish — PLACEHOLDER
    labour = area * LABOUR_PER_M2
    install = area * INSTALL_PER_M2

    subtotal = glass_cost + hardware + processing + labour + install
    margin = subtotal * (MARGIN_PCT / 100)
    return {
        "area": area, "sections": len(bd["panels"]), "profile_len": 0.0,
        "piece_count": 0, "pieces": [], "total_kg": bd["total_kg"],
        "lines": [
            {"key": f"Glass — {bd['glass']['label']}",
             "detail": f"{area:.2f} m² · {len(bd['panels'])} panel(s) · {bd['total_kg']} kg",
             "amount": round(glass_cost, 2)},
            {"key": "Hardware & fittings",
             "detail": " · ".join(f"{h['qty']}× {h['code']}" for h in bd["hardware"]) or "—",
             "amount": round(hardware, 2)},
            {"key": "Processing — holes, cutouts, polish",
             "detail": f"{len(bd['panels'])} panel(s)", "amount": round(processing, 2)},
            {"key": "Fabrication labour", "detail": f"{area:.2f} m² × GHS {LABOUR_PER_M2:.0f}/m²",
             "amount": round(labour, 2)},
            {"key": "Installation", "detail": f"{area:.2f} m² × GHS {INSTALL_PER_M2:.0f}/m²",
             "amount": round(install, 2)},
        ],
        "subtotal": round(subtotal, 2), "margin": round(margin, 2),
        "margin_pct": MARGIN_PCT, "total": round(subtotal + margin, 2),
        "qty": qty, "grand_total": round((subtotal + margin) * qty, 2),
        "currency": "GHS",
    }


# ════════════════════════════════════════════════════════════
# CURTAIN WALL (stick system) — mirror of frontend lib/curtainwall.js
# Mullions run CONTINUOUS full height; transoms cut between them.
# All values PLACEHOLDERS pending Sofaamy's CW system specs.
# ════════════════════════════════════════════════════════════

CW_FAB = {"mullion_face": 50, "glass_deduct": 20, "plate_per_m": 35.0,
          "gasket_per_m": 12.0, "anchor_each": 120.0, "vent_hardware": 260.0,
          "spandrel_per_m2": 260.0}
CW_TYPE_LABELS = {"vision": "Vision Glass", "spandrel": "Spandrel Panel", "vent": "Openable Vent"}


def cw_breakdown(design: dict) -> dict:
    cw = _col_widths(design)
    rh = _row_heights(design)
    cols, rows = design["cols"], design["rows"]
    profiles: list[dict] = []
    glass: list[dict] = []

    profiles.append({"position": "Mullions (all grid lines)", "profile": "cwmullion",
                     "member": "Mullion", "length_mm": round(design["height"]),
                     "qty": cols + 1, "cuts": "90°/90°"})
    for c in range(cols):
        profiles.append({"position": f"Transoms — bay {c + 1} (× {rows + 1} lines)",
                         "profile": "cwtransom", "member": "Transom",
                         "length_mm": round(cw[c] - CW_FAB["mullion_face"]),
                         "qty": rows + 1, "cuts": "90°/90°"})

    for i, cell in enumerate(design["cells"]):
        bay_w, bay_h = cw[i % cols], rh[i // cols]
        t = cell.get("type") if cell.get("type") in CW_TYPE_LABELS else "vision"
        glass.append({"section": f"B{i + 1}", "glass": cell.get("glass") or "reflective",
                      "type": t, "w_mm": round(bay_w - CW_FAB["glass_deduct"]),
                      "h_mm": round(bay_h - CW_FAB["glass_deduct"]), "qty": 1,
                      "note": CW_TYPE_LABELS[t].lower()})
    return {"profiles": profiles, "glass": glass}


def calc_cw_quote(design: dict) -> dict:
    bd = cw_breakdown(design)
    qty = design.get("qty") or 1
    area = (design["width"] / 1000) * (design["height"] / 1000)

    metres: dict[str, float] = {}
    for p in bd["profiles"]:
        metres[p["profile"]] = metres.get(p["profile"], 0) + p["length_mm"] * p["qty"] / 1000
    grid_len = sum(metres.values())
    profile = sum(m * PROFILE_PRICES.get(pid, 130.0) for pid, m in metres.items())
    plates = grid_len * CW_FAB["plate_per_m"] + grid_len * CW_FAB["gasket_per_m"]

    vision_cost = spandrel_cost = vision_area = spandrel_area = 0.0
    vents = 0
    for g in bd["glass"]:
        a = g["w_mm"] * g["h_mm"] / 1e6
        if g["type"] == "spandrel":
            spandrel_cost += a * CW_FAB["spandrel_per_m2"]
            spandrel_area += a
        else:
            vision_cost += a * GLASS.get(g["glass"], 210)
            vision_area += a
            if g["type"] == "vent":
                vents += 1
    vent_cost = vents * CW_FAB["vent_hardware"]
    anchors = (design["cols"] + 1) * 2
    anchor_cost = anchors * CW_FAB["anchor_each"]
    labour = area * LABOUR_PER_M2
    install = area * INSTALL_PER_M2 * 1.5    # facade access premium — PLACEHOLDER

    subtotal = profile + plates + vision_cost + spandrel_cost + vent_cost + anchor_cost + labour + install
    margin = subtotal * (MARGIN_PCT / 100)
    piece_count = sum(p["qty"] for p in bd["profiles"])
    lines = [
        {"key": "Aluminium grid — mullions & transoms",
         "detail": f"{grid_len:.2f} m · {piece_count} pieces", "amount": round(profile, 2)},
        {"key": "Pressure plates & cover caps", "detail": f"{grid_len:.2f} m", "amount": round(plates, 2)},
        {"key": "Vision glass", "detail": f"{vision_area:.2f} m²", "amount": round(vision_cost, 2)},
    ]
    if spandrel_area:
        lines.append({"key": "Spandrel panels", "detail": f"{spandrel_area:.2f} m²",
                      "amount": round(spandrel_cost, 2)})
    if vents:
        lines.append({"key": "Openable vents", "detail": f"{vents} vent(s)", "amount": round(vent_cost, 2)})
    lines += [
        {"key": "Slab anchors & brackets", "detail": f"{anchors} bracket(s)", "amount": round(anchor_cost, 2)},
        {"key": "Fabrication & installation", "detail": f"{area:.2f} m² (facade access incl.)",
         "amount": round(labour + install, 2)},
    ]
    return {
        "area": round(area, 2), "sections": design["cols"] * design["rows"],
        "profile_len": round(grid_len, 2), "piece_count": piece_count, "pieces": [],
        "lines": lines,
        "subtotal": round(subtotal, 2), "margin": round(margin, 2),
        "margin_pct": MARGIN_PCT, "total": round(subtotal + margin, 2),
        "qty": qty, "grand_total": round((subtotal + margin) * qty, 2),
        "currency": "GHS",
    }


# ── category dispatchers — one call site for any product family ──

def any_breakdown(design: dict) -> dict:
    cat = design.get("category") or "frame"
    if cat == "curtainwall":
        return cw_breakdown(design)
    if cat == "frameless":
        return {"profiles": [], "glass": []}
    return design_breakdown(design)


def extract_pieces_any(design: dict) -> list[dict]:
    merged: dict[tuple, dict] = {}
    for p in any_breakdown(design)["profiles"]:
        k = (p["profile"], p["member"], p["length_mm"])
        if k in merged:
            merged[k]["qty"] += p["qty"]
        else:
            merged[k] = {"profile": p["profile"], "member": p["member"],
                         "length_mm": p["length_mm"], "qty": p["qty"]}
    return sorted(merged.values(), key=lambda p: (p["profile"], -p["length_mm"]))


def calc_any_quote(design: dict) -> dict:
    cat = design.get("category") or "frame"
    if cat == "frameless":
        return calc_frameless_quote(design)
    if cat == "curtainwall":
        return calc_cw_quote(design)
    return calc_design_quote(design)

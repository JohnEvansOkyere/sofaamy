"""GHS pricing engine — server-side mirror of the frontend engine."""
PROFILE_PER_M = 85.0
LABOUR_PER_M2 = 95.0
INSTALL_PER_M2 = 45.0
MARGIN_PCT = 20.0

# per-profile prices/m — PLACEHOLDERS until Sofaamy's material list arrives
PROFILE_PRICES = {"frame_outer": 85.0, "frame_internal": 85.0, "frame_opening": 85.0,
                  "cwmullion": 140.0, "cwtransom": 130.0}
PROFILE_LABELS = {"frame_outer": "Outer frame member (mapping pending)",
                  "frame_internal": "Internal member (mapping pending)",
                  "frame_opening": "Opening member (mapping pending)",
                  "cwmullion": "CW Mullion", "cwtransom": "CW Transom"}

# Exact Frame catalogue identities copied from the supplied profile workbook.
# This is catalogue data only: it does not claim which profile is consumed by
# each cut role until Sofaamy confirms the system rules.
FRAME_SOURCE_PROFILES = {
    "trialco": [
        ("TRIALCO FRAME WITH COVER", "TF053N", 5800, 636),
        ("TRIALCO FRAME WITHOUT COVER", "TF073N", 5800, 608),
        ("FLAT LEAF", "TF065N", 5800, 466),
        ("NET ITALIAN", "TF223N", 5800, 171),
        ("INTERLOCK ADOPTOR", "TF224N", 5800, 171),
    ],
    "ks50": [
        ("KS - 50 FRAME WITH COVER", "MA0032", 5800, 494),
        ("KS - 50 FRAME WITHOUT COVER", "MA0035", 5800, 437),
        ("FLAT LEAF", "MA0033", 5800, 342),
        ("NET LEAF ITALIAN", "AF2142N", 5800, 152),
        ("INTERLOCK ADOPTOR", "MA0034", 5800, 152),
    ],
    "italian": [
        ("ITALIAN FRAME WITH COVER", "AF2227N", 5800, 342),
        ("ITALIAN FRAME WITHOUT COVER", "AF2237N", 5800, 309),
        ("FLAT LEAF", "AF2136", 5800, 247),
        ("NET LEAF ITALIAN", "AF2142N", 5800, 124),
        ("INTERLOCK ADOPTOR", "AF2162N", 5800, 124),
    ],
    "fdt_casement": [
        ("SMALL L-OUTER", "SML", 5800, 262), ("FLAT BEADING", "AF2158N", 5800, 124),
        ("BIG T", "AF2235", 5800, 423), ("NET TRUCK", "NT02", 5800, 170),
        ("ITALIAN NET LEAF", "AF2142N", 5800, 124),
    ],
    "fdt_projected": [
        ("SMALL L-OUTER", "SML", 5800, 262), ("FLAT BEADING", "AF2158N", 5800, 124),
        ("BIG T", "AF2235", 5800, 423), ("NET TRUCK", "NT02", 5800, 170),
        ("ITALIAN NET LEAF", "AF2142N", 5800, 124),
    ],
    "fdt_fixed": [
        ("SMALL L-OUTER / SWINGLOCKSTILE", "SML / SP-LS", 5800, 418),
        ("FLAT BEADING", "AF2158N", 5800, 124), ("BIG T", "AF2235", 5800, 423),
    ],
    "fdt_hinge": [
        ("SWINGLOCKSTILE", "SP-LS", 5800, 418), ("FLAT BEADING", "AF2158N", 5800, 124),
        ("SWING BOTTOM DIVISION", "SP007", 5800, 637),
        ("DOUBLE HINGE ADOPTOR", "JA061", 5800, 323),
        ("BIG Z / HINGE LOCKSTILE", "AF2156", 5800, 447), ("BIG T", "AF2235", 5800, 423),
    ],
    "fdt_swing": [
        ("SWINGLOCKSTILE", "SP-LS", 5800, 418), ("FLAT BEADING", "AF2158N", 5800, 124),
        ("SWING BOTTOM DIVISION", "SP007", 5800, 637),
        ("SWING BRUSH ADOPTOR", "AF2376R", 5800, 162), ("BIG T", "AF2235", 5800, 423),
    ],
}


def frame_source_profiles(design: dict) -> list[dict]:
    return [{"description": n, "code": c, "stock_mm": stock, "listed_price": price}
            for n, c, stock, price in FRAME_SOURCE_PROFILES.get(design.get("system"), [])]


def _acc(name, code, value, note=""):
    return {"name": name, "code": code, "listed_value": value, "note": note}


FRAME_SOURCE_ACCESSORIES = {
    "trialco": [
        _acc("0404 CORNERS", "ACC04C", 6.5), _acc("TRIALCO KIT", "ACC", 38),
        _acc("NET CORNERS", "IT01NC", 1), _acc("TRIALCO ROLLERS", "TRIAL-R1", 15),
        _acc("METAL LOCKS", "ACCML", 35), _acc("NET HANDLE", "ACCNH", 3),
        _acc("NET FIBRE", "ACCNF", 280), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("NET RUBBER", "ACCNRB", 60), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("WALL PLUGS", "ACCWPL", 54), _acc("WATER DRAIN CAP", "ACCWDC", 4.5),
        _acc("PVC HOLE COVER", "ACCPVC", 6), _acc("SILICONE", "SIL", 30),
        _acc("ITALIAN BRUSH", "ACCITB", 65),
        _acc("ITALIAN SLIDING LOCK WITH KEY", "ACCIT SLK", 40, "Sliding doors only"),
        _acc("ITALIAN SLIDING DOOR HANDLE", "ACCIT SDH", 38, "Sliding doors only"),
    ],
    "ks50": [
        _acc("0404 CORNERS", "ACC04C", 6.5), _acc("NET CORNERS", "ACCNC", 1),
        _acc("KS-50 ROLLERS", "ACC50R", 10), _acc("METAL LOCKS", "ACCML", 35),
        _acc("NET HANDLE", "ACCNH", 3), _acc("NET FIBRE", "ACCNF", 280),
        _acc("GLAZING RUBBER", "ACCGRB", 128), _acc("NET RUBBER", "ACCNRB", 60),
        _acc("INSTALLATION SCREWS", "ACCITS", 55), _acc("WALL PLUGS", "ACCWPL", 54),
        _acc("WATER DRAIN CAP", "ACCWDC", 4.5), _acc("PVC HOLE COVER", "ACCPVC", 6),
        _acc("SILICONE", "SIL", 30), _acc("ITALIAN BRUSH", "ACCITB", 65),
        _acc("ITALIAN SLIDING LOCK WITH KEY", "ACCIT SLK", 40, "Sliding doors only"),
        _acc("ITALIAN SLIDING DOOR HANDLE", "ACCIT SDH", 38, "Sliding doors only"),
    ],
    "italian": [
        _acc("FRAME CORNERS", "IT22FC", 5), _acc("LEAF CORNERS", "IT213LC", 5),
        _acc("NET CORNERS", "IT01NC", 1), _acc("ITALIAN ROLLERS", "IT02RL", 6),
        _acc("METAL LOCKS", "ACCML", 35), _acc("NET HANDLE", "ACCNH", 3),
        _acc("NET FIBRE", "ACCNF", 280), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("NET RUBBER", "ACCNRB", 60), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("WALL PLUGS", "ACCWPL", 54), _acc("WATER DRAIN CAP", "ACCWDC", 4.5),
        _acc("PVC HOLE COVER", "ACCPVC", 6), _acc("SILICONE", "SIL", 30),
        _acc("ITALIAN BRUSH", "ACCITB", 65),
        _acc("ITALIAN SLIDING LOCK WITH KEY", "ACCIT SLK", 40, "Sliding doors only"),
        _acc("ITALIAN SLIDING DOOR HANDLE", "ACCIT SDH", 38, "Sliding doors only"),
    ],
    "fdt_casement": [
        _acc("45 DOOR CORNERS", "ACC45C", 13), _acc("NET TRUCK CORNERS", "ACCNTC", 7),
        _acc("NET CORNERS", "ACCNC", 1), _acc("SUPERIOR PROJECT. HANDLE", "JQ106B", 46),
        _acc("CASEMENT STOPPER", "13C3", 35), _acc("HEAVY DUTY HINGES", "HD/206", 35),
        _acc("NET HANDLE", "ACCNH", 3), _acc("NET FIBRE", "ACCNF", 280),
        _acc("GLAZING RUBBER", "ACCGRB", 128), _acc("NET RUBBER", "ACCNRB", 60),
        _acc("FRAME RUBBER", "ACC FRRB", 54), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("WALL PLUGS", "ACCWPL", 4.5), _acc("WATER DRAIN CAP", "ACCWDC", 6),
        _acc("PVC HOLE COVER", "ACCPVC", 46), _acc("SILICONE", "SIL", 30),
    ],
    "fdt_projected": [
        _acc("45 DOOR CORNERS", "ACC45C", 13), _acc("NET TRUCK CORNERS", "ACCNTC", 7),
        _acc("NET CORNERS", "ACCNC", 1), _acc("SUPERIOR PROJECT. HANDLE", "JQ106B", 46),
        _acc("HEAVY DUTY PROJECTED HINGES", "HD/206", 70), _acc("NET HANDLE", "ACCNH", 3),
        _acc("NET FIBRE", "ACCNF", 280), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("NET RUBBER", "ACCNRB", 60), _acc("FRAME RUBBER", "ACC FRRB", 54),
        _acc("INSTALLATION SCREWS", "ACCITS", 55), _acc("WALL PLUGS", "ACCWPL", 4.5),
        _acc("WATER DRAIN CAP", "ACCWDC", 6), _acc("PVC HOLE COVER", "ACCPVC", 46),
        _acc("SILICONE", "SIL", 30),
    ],
    "fdt_fixed": [
        _acc("45 DOOR CORNERS", "ACC45C", 13), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("FRAME RUBBER", "ACC FRRB", 54), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("WALL PLUGS", "ACCWPL", 4.5), _acc("WATER DRAIN CAP", "ACCWDC", 6),
        _acc("PVC HOLE COVER", "ACCPVC", 46), _acc("SILICONE", "SIL", 30),
    ],
    "fdt_hinge": [
        _acc("45 DOOR CORNERS", "ACC45C", 13), _acc("CEGO BRUSH", "AF2017", 46),
        _acc("FRAME RUBBER", "ACC FRRB", 54), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("ROLLER LOCK (30MM)", "RL30", 105, "1 for both double or single"),
        _acc("CHROME HANDLE (SMALL)", "CHROME-H", 150), _acc("HINGE STRICKER", "HS 02", 3.5, "1 for both double or single"),
        _acc("TOP CLOSER", "KDZ 202", 230), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("SILICONE", "SIL", 30), _acc("FLASH BOLT", "FBLT", 12, "2 for double swing doors"),
    ],
    "fdt_swing": [
        _acc("45 DOOR CORNERS", "ACC45C", 13), _acc("CEGO BRUSH", "AF2017", 46),
        _acc("FRAME RUBBER", "ACC FRRB", 54), _acc("GLAZING RUBBER", "ACCGRB", 128),
        _acc("ROLLER LOCK (30MM)", "RL30", 105, "1 for both double or single"),
        _acc("CHROME HANDLE (SMALL)", "CHROME-H", 150), _acc("HINGE STRICKER", "HS 02", 3.5, "1 for both double or single"),
        _acc("DOWN CLOSER", "KL-HD203/6", 450), _acc("INSTALLATION SCREWS", "ACCITS", 55),
        _acc("SILICONE", "SIL", 30), _acc("FLASH BOLT", "FBLT", 12, "2 for double swing doors"),
    ],
}


def frame_accessory_rows(design: dict) -> list[dict]:
    source = FRAME_SOURCE_ACCESSORIES.get(design.get("system"), [])
    cells = design.get("cells") or []
    project_qty = max(1, int(design.get("qty") or 1))
    opening_count = max(1, sum(max(1, int(c.get("item_qty") or 1)) for c in cells))
    moving = [c for c in cells if c.get("opening") != "fixed"]
    moving_panels = max(1, sum(max(1, int(c.get("panels") or 1)) * max(1, int(c.get("item_qty") or 1)) for c in moving))
    doors = [c for c in cells if c.get("opening") in ("single", "double")]
    double_doors = sum(max(1, int(c.get("item_qty") or 1)) for c in doors if c.get("opening") == "double")
    has_sliding_door = any(c.get("opening") == "sliding" for c in cells)
    rows = []
    for a in source:
        k = f"{a['name']} {a['code']}".lower()
        qty, rule = opening_count * project_qty, "one working allowance per project opening"
        if "sliding doors only" in a.get("note", "").lower() and not has_sliding_door:
            qty, rule = 0, "only for sliding doors"
        elif any(x in k for x in ("roller", "wheel", "truck")):
            qty, rule = moving_panels * 2 * project_qty, "2 per moving panel"
        elif "corner" in k:
            qty, rule = moving_panels * 4 * project_qty, "4 per moving panel"
        elif "hinge" in k:
            qty, rule = max(1, len(doors)) * 2 * project_qty, "2 per door leaf"
        elif "flash bolt" in k:
            qty, rule = max(1, len(doors)) * project_qty + double_doors * project_qty, "1 per door + 1 extra per double door"
        elif any(x in k for x in ("handle", "lock", "closer", "stopper", "stricker")):
            qty, rule = max(1, len(moving)) * project_qty, "1 per opening/door leaf"
        rows.append({**a, "qty": qty, "suggested_qty": qty, "rule": rule,
                     "source": "catalogue + working recipe", "unit_price": a["listed_value"]})
    overrides = {x.get("code", f"custom:{x.get('name','item')}"): x for x in design.get("accessory_overrides", [])}
    out = []
    for row in rows:
        o = overrides.get(row["code"])
        item = {**row, **o} if o else row
        if not item.get("removed") and float(item.get("qty", 0) or 0) > 0:
            out.append(item)
    known = {r["code"] for r in rows}
    for o in design.get("accessory_overrides", []):
        if o.get("custom") and not o.get("removed") and o.get("code") not in known and float(o.get("qty", 0) or 0) > 0:
            out.append({**o, "source": "custom project item", "rule": "manual project addition",
                        "unit_price": float(o.get("unit_price", 0) or 0)})
    return out

GLASS = {"clear":120,"frosted":160,"tinted":175,"reflective":210,
         "tempered":230,"laminated":275,"double":340}
HARDWARE = {"fixed":80,"casement":180,"sliding":240,"awning":200,"louvre":320,
            "single":260,"double":420,"pivot":520}
GLASS_LABELS = {"clear":"Clear","frosted":"Frosted","tinted":"Tinted (Grey)",
                "reflective":"Reflective","tempered":"Tempered",
                "laminated":"Laminated","double":"Double Glazed",
                "5CF":"5mm Plain","6CF":"6mm Plain","8CF":"8mm Plain",
                "10CF":"10mm Plain","12CF":"12mm Plain","3.3PL":"3mm + 3mm Laminated",
                "3.3BZL":"3mm Bronze + 3mm Bronze Laminated","4.4PL":"4mm + 4mm Laminated",
                "5.5PL":"5mm + 5mm Laminated","4.4BZL":"4mm Bronze + 4mm Bronze Laminated",
                "5BR":"5mm Blue Reflective","5GR":"5mm Green Reflective",
                "5BZR":"5mm Bronze Reflective","6MBR":"6mm Mexican Blue Reflective",
                "5BR-BLACK":"5mm Black Reflective","5DBR":"5mm Deep Black Reflective",
                "6SMBR":"6mm Superior Mexican Blue Reflective","5BT":"5mm Deep Black Glass",
                "5BZT":"5mm Bronze Tinted","6BZT":"6mm Bronze Tinted","6BT":"6mm Deep Black Glass",
                "6SMBT":"6mm Superior Mexican Blue Tinted"}

# Starting values observed in Sofaamy's supplied quotation screenshots. These
# are editable quote inputs, not a confirmed universal rate card.
FRAME_QUOTE_RATES = {"slidingDoor": 1700.0, "slidingWindow": 1500.0,
                     "projected": 2350.0, "casement": 2350.0,
                     "fixed": 1900.0, "swingDoor": 1900.0,
                     "hingeDoor": 1900.0}
FRAME_RATE_KEYS = {"sliding": "slidingWindow", "awning": "projected",
                   "casement": "casement", "fixed": "fixed",
                   "single": "swingDoor", "double": "hingeDoor"}
OPENING_LABELS = {"fixed": "Fixed", "casement": "Casement", "sliding": "Sliding Window",
                  "awning": "Projected", "single": "Single Door", "double": "Double Door"}
FRAME_GLASS = {
    "5CF": 310.0, "6CF": 310.3, "8CF": 331.99, "10CF": 403.77, "12CF": 437.44,
    "3.3PL": 381.82, "3.3BZL": 400.0, "4.4PL": 402.69, "5.5PL": 471.7,
    "4.4BZL": 436.36, "5BR": 200.0, "5GR": 219.8, "5BZR": 200.0,
    "6MBR": 312.46, "5BR-BLACK": 235.69, "5DBR": 288.48, "6SMBR": 361.25,
    "5BT": 214.55, "5BZT": 206.06, "6BZT": 250.51, "6BT": 320.54,
    "6SMBT": 252.96,
}


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
       "glass_deduct_fixed": 70, "glass_deduct_opening": 60}


def design_breakdown(design: dict) -> dict:
    """One unit's full fabrication breakdown: every profile piece with
    position, deducted length and cut angles, plus glass cut sizes."""
    w, h = design["width"], design["height"]
    cols, rows = design["cols"], design["rows"]
    cw, rh = _col_widths(design), _row_heights(design)
    profiles: list[dict] = []
    glass: list[dict] = []

    def P(position, profile, member, length_mm, qty, cuts, source_mm=None, adjustment_mm=None, note=""):
        source = length_mm if source_mm is None else source_mm
        adjustment = length_mm - source if adjustment_mm is None else adjustment_mm
        profiles.append({"position": position, "profile": profile, "member": member,
                         "source_mm": round(source), "adjustment_mm": round(adjustment),
                         "length_mm": round(length_mm), "qty": qty, "cuts": cuts, "note": note})

    P("Frame head", "frame_outer", "Outer frame member — head", w, 1, "45°/45°", w, 0)
    P("Frame sill", "frame_outer", "Outer frame member — sill", w, 1, "45°/45°", w, 0)
    P("Frame left jamb", "frame_outer", "Outer frame member — jamb", h, 1, "45°/45°", h, 0)
    P("Frame right jamb", "frame_outer", "Outer frame member — jamb", h, 1, "45°/45°", h, 0)
    for j in range(1, cols):
        P(f"Internal vertical {j}", "frame_internal", "Internal member — vertical",
          h - 2 * FAB["frame_depth"], 1, "90°/90°", h, -2 * FAB["frame_depth"])
    for r in range(1, rows):
        for c in range(cols):
            P(f"Internal horizontal {r}.{c + 1}", "frame_internal", "Internal member — horizontal",
              cw[c] - 2 * FAB["frame_depth"], 1, "90°/90°", cw[c], -2 * FAB["frame_depth"])

    for i, cell in enumerate(design["cells"]):
        sec_w, sec_h = cw[i % cols], rh[i // cols]
        tag = f"F{i + 1}"
        if cell["opening"] == "fixed":
            glass.append({"section": tag, "glass": cell["glass"],
                          "source_w_mm": round(sec_w), "source_h_mm": round(sec_h),
                          "adjustment_w_mm": -FAB["glass_deduct_fixed"],
                          "adjustment_h_mm": -FAB["glass_deduct_fixed"],
                          "w_mm": round(sec_w - FAB["glass_deduct_fixed"]),
                          "h_mm": round(sec_h - FAB["glass_deduct_fixed"]),
                          "qty": 1, "note": "fixed lite"})
        else:
            n = 2 if cell["opening"] == "double" else max(1, cell.get("panels") or 1)
            panel_w = sec_w / n
            rail_adjustment = FAB["interlock"] / 2 if n > 1 else 0
            opening_w = panel_w + rail_adjustment
            opening_h = sec_h - FAB["track_clear"]
            cuts = "45°/45°" if cell["opening"] in ("casement", "awning") else "90°/90°"
            for leaf in range(1, n + 1):
                P(f"{tag} leaf {leaf} top rail", "frame_opening", "Opening member — rail",
                  opening_w, 1, cuts, panel_w, rail_adjustment)
                P(f"{tag} leaf {leaf} bottom rail", "frame_opening", "Opening member — rail",
                  opening_w, 1, cuts, panel_w, rail_adjustment)
                P(f"{tag} leaf {leaf} left stile", "frame_opening", "Opening member — stile",
                  opening_h, 1, cuts, sec_h, -FAB["track_clear"])
                P(f"{tag} leaf {leaf} right stile", "frame_opening", "Opening member — stile",
                  opening_h, 1, cuts, sec_h, -FAB["track_clear"])
            glass.append({"section": tag, "glass": cell["glass"],
                          "source_w_mm": round(panel_w), "source_h_mm": round(sec_h),
                          "adjustment_w_mm": round(rail_adjustment - FAB["glass_deduct_opening"]),
                          "adjustment_h_mm": -FAB["glass_deduct_opening"],
                          "w_mm": round(opening_w - FAB["glass_deduct_opening"]),
                          "h_mm": round(opening_h - FAB["glass_deduct_opening"]),
                          "qty": n, "note": f"{n} opening panel(s)"})
    for index, piece in enumerate(design.get("custom_cut_pieces") or []):
        source = float(piece.get("source_mm") or piece.get("length_mm") or 0)
        adjustment = float(piece.get("adjustment_mm") or 0)
        length = float(piece.get("length_mm") or source + adjustment)
        if length <= 0:
            continue
        P(piece.get("position") or f"Custom piece {index + 1}",
          piece.get("profile") or "frame_outer", piece.get("member") or "Manual fabrication piece",
          length, max(1, int(piece.get("qty") or 1)), piece.get("cuts") or "SPECIAL / TEMPLATE",
          source, adjustment, piece.get("note") or "")
    return {"profiles": profiles, "glass": glass}


def extract_pieces(design: dict) -> list[dict]:
    """Flat one-unit cut list for the optimizer (merged identical cuts)."""
    merged: dict[tuple, dict] = {}
    for p in design_breakdown(design)["profiles"]:
        # Preserve the originating fabrication position even when lengths
        # match; optimizer bars must remain traceable to the drawing.
        k = (p["profile"], p["member"], p["length_mm"], p["position"])
        if k in merged:
            merged[k]["qty"] += p["qty"]
        else:
            merged[k] = {"profile": p["profile"], "member": p["member"],
                         "position": p["position"], "length_mm": p["length_mm"], "qty": p["qty"]}
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
        (cw[i % design["cols"]] * rh[i // design["cols"]] / 1e6) *
        FRAME_GLASS.get(c.get("glass"), GLASS.get(c.get("glass"), 120))
        for i, c in enumerate(design["cells"]))
    accessories = frame_accessory_rows(design)
    accessory_project_cost = sum(float(a.get("qty", 0) or 0) * float(a.get("unit_price", 0) or 0)
                                  for a in accessories)
    hardware = accessory_project_cost / qty
    labour = area * LABOUR_PER_M2
    install = area * INSTALL_PER_M2

    subtotal = profile + glass_cost + hardware + labour + install
    margin = subtotal * (MARGIN_PCT / 100)
    internal_total = subtotal + margin

    client_lines = []
    for i, cell in enumerate(design["cells"]):
        sec_w = cw[i % design["cols"]]
        sec_h = rh[i // design["cols"]]
        rate_key = cell.get("rate_key") or FRAME_RATE_KEYS.get(cell.get("opening"), "fixed")
        rate = cell.get("rate_per_m2")
        if not isinstance(rate, (int, float)):
            rate = FRAME_QUOTE_RATES.get(rate_key, FRAME_QUOTE_RATES["fixed"])
        row_area = sec_w * sec_h / 1e6
        row_qty = max(1, int(cell.get("item_qty") or 1)) * qty
        row_total = row_area * row_qty * rate
        client_lines.append({
            "description": OPENING_LABELS.get(cell.get("opening"), cell.get("opening", "Frame item")),
            "width_mm": round(sec_w), "height_mm": round(sec_h), "qty": row_qty,
            "m2": round(row_area * row_qty, 2), "unit_price": rate,
            "total": round(row_total, 2), "rate_key": rate_key,
        })
    client_subtotal = sum(row["total"] for row in client_lines)
    discount_percent = max(0, float(design.get("discount_percent", 0) or 0))
    getf_nhis_percent = max(0, float(design.get("getf_nhis_percent", 5) or 0))
    vat_percent = max(0, float(design.get("vat_percent", 15) or 0))
    discount_amount = client_subtotal * discount_percent / 100
    client_net = client_subtotal - discount_amount
    getf_nhis = client_net * getf_nhis_percent / 100
    vat = client_net * vat_percent / 100
    client_grand_total = client_net + getf_nhis + vat
    calculated_floor = subtotal * qty
    floor_override = max(0, float(design.get("cost_floor_override", 0) or 0))
    internal_floor = floor_override if floor_override > 0 else calculated_floor
    floor_gap = client_net - internal_floor
    return {
        "area": round(area, 2),
        "sections": sections,
        "profile_len": round(profile_len, 2),
        "piece_count": piece_count,
        "pieces": pieces,
        "profile_catalog": frame_source_profiles(design),
        "profile_mapping_status": "catalogue loaded; cut-role mapping pending Sofaamy confirmation",
        "accessories": accessories,
        "lines": [
            {"key": "Aluminium profile", "detail": f"{profile_len:.2f} m · {piece_count} cut pieces", "amount": round(profile, 2)},
            {"key": "Glass", "detail": f"{area:.2f} m² · {sections} section(s)", "amount": round(glass_cost, 2)},
            {"key": "Hardware & accessories", "detail": f"{len(accessories)} catalogue/custom line(s)", "amount": round(hardware, 2)},
            {"key": "Fabrication labour", "detail": f"{area:.2f} m² × GHS {LABOUR_PER_M2:.0f}/m²", "amount": round(labour, 2)},
            {"key": "Installation", "detail": f"{area:.2f} m² × GHS {INSTALL_PER_M2:.0f}/m²", "amount": round(install, 2)},
        ],
        "subtotal": round(subtotal, 2),
        "margin": round(margin, 2),
        "margin_pct": MARGIN_PCT,
        "total": round(client_grand_total / qty, 2),
        "qty": qty,
        "grand_total": round(client_grand_total, 2),
        "internal_total": round(internal_total, 2),
        "material_cost_per_unit": round(profile + glass_cost + hardware, 2),
        "labour_cost_per_unit": round(labour, 2),
        "installation_cost_per_unit": round(install, 2),
        "internal_floor_per_unit": round(internal_floor / qty, 2),
        "internal_floor": round(internal_floor, 2),
        "calculated_internal_floor": round(calculated_floor, 2),
        "cost_floor_override": round(floor_override, 2),
        "cost_floor_source": "approved project BOQ / material sheet" if floor_override > 0 else "working estimate",
        "client_net": round(client_net, 2),
        "floor_gap": round(floor_gap, 2),
        "floor_status": "OK" if floor_gap >= -0.01 else "BELOW FLOOR",
        "client_lines": client_lines,
        "client_subtotal": round(client_subtotal, 2),
        "discount_percent": discount_percent,
        "discount_amount": round(discount_amount, 2),
        "getf_nhis_percent": getf_nhis_percent,
        "getf_nhis": round(getf_nhis, 2),
        "vat_percent": vat_percent,
        "vat": round(vat, 2),
        "client_grand_total": round(client_grand_total, 2),
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
        "material_cost_per_unit": round(glass_cost + hardware + processing, 2),
        "labour_cost_per_unit": round(labour, 2),
        "installation_cost_per_unit": round(install, 2),
        "internal_floor_per_unit": round(subtotal, 2),
        "internal_floor": round(subtotal * qty, 2),
        "calculated_internal_floor": round(subtotal * qty, 2),
        "cost_floor_override": 0,
        "cost_floor_source": "working estimate",
        "client_net": round((subtotal + margin) * qty, 2),
        "floor_gap": round(((subtotal + margin) - subtotal) * qty, 2),
        "floor_status": "OK",
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
        "material_cost_per_unit": round(profile + plates + vision_cost + spandrel_cost + vent_cost + anchor_cost, 2),
        "labour_cost_per_unit": round(labour, 2),
        "installation_cost_per_unit": round(install, 2),
        "internal_floor_per_unit": round(subtotal, 2),
        "internal_floor": round(subtotal * qty, 2),
        "calculated_internal_floor": round(subtotal * qty, 2),
        "cost_floor_override": 0,
        "cost_floor_source": "working estimate",
        "client_net": round((subtotal + margin) * qty, 2),
        "floor_gap": round(((subtotal + margin) - subtotal) * qty, 2),
        "floor_status": "OK",
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

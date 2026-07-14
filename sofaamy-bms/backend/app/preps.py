"""GLASS PREP LIBRARY — the parametric heart of the fabrication drawings.

Every frameless hardware part carries a "prep": the holes/cutouts it
needs in the toughened glass, dimensioned relative to a panel corner
or edge. Attaching hardware to a panel instantiates its preps at the
panel's actual size — so ANY project, ANY panel size, gets a correct
fabrication drawing with zero manual drafting (this is exactly how
SmartGlazier generates theirs).

Geometry calibrated from Sofaamy's own SmartGlazier print (job
SGP/4462-26A): clamp holes ø18 at 200 mm in / 20 mm down; handle
ø16 pair at 700 mm centres, 100 mm off the stile; patch cutout
templates A/B with r80/r55; lock notch 80 × 60. Shower/slider prep
values are PLACEHOLDERS pending Sofaamy's catalog.

Coordinates are panel-local mm, origin TOP-LEFT (x right, y down).
Feature kinds:
  hole   {dia, x, y, code}
  cutout {template: 'A'|'B', corner: 'TL'|'TR'|'BL'|'BR', code}
  notch  {w, h, corner: 'BL'|'BR', off, code}   (off = from stile edge)
"""

# Patch cutout templates — dims straight from the print's page 7.
# run: length eaten along the edge; depth: max depth at the corner;
# lead: straight section before the S-curve; hole at (hole_x, hole_y).
TEMPLATES = {
    "A": {"codes": "KL-M102/T · KL-M202", "run": 135.5, "lead": 42.5,
          "depth": 37, "rise": 36, "r1": 80, "r2": 55,
          "hole_dia": 20, "hole_x": 122.5, "hole_y": 18},
    "B": {"codes": "KL-M402", "run": 155.5, "lead": 62.5,
          "depth": 37, "rise": 36, "r1": 80, "r2": 55,
          "hole_dia": 20, "hole_x": 142.5, "hole_y": 18},
}

CLAMP = {"dia": 18, "inset": 200, "edge": 20}        # BL 203 on full panels
CLAMP_OVER = {"dia": 18, "inset": 250, "edge": 20}   # BL 203 on over-panels
HANDLE = {"dia": 16, "off_stile": 100, "half_crs": 350}   # JQ 104(900MM)
LOCK_NOTCH = {"w": 80, "h": 60, "off": 100}          # CSM-50W keep
PIVOT_MATE = {"dia": 20, "off_edge": 25, "y1": 73, "gap": 32}  # into adjacent fixed
HINGE_NOTCH = {"w": 30, "h": 60, "end": 150}         # PLACEHOLDER (shower)
KNOB = {"dia": 12, "off": 60}                        # PLACEHOLDER (shower)
ROLLER = {"dia": 14, "inset": 150, "edge": 30}       # PLACEHOLDER (slider)


def _is_leaf(t: str) -> bool:
    return t in ("door", "hinged")


def _fixed_features(w, h, wall_side, door_side):
    f = [{"kind": "hole", "dia": CLAMP["dia"], "x": x, "y": y, "code": "BL 203"}
         for x in (CLAMP["inset"], w - CLAMP["inset"])
         for y in (CLAMP["edge"], h - CLAMP["edge"])]
    if wall_side:  # mid-height clamp on the wall-side edge
        f.append({"kind": "hole", "dia": CLAMP["dia"],
                  "x": CLAMP["edge"] if wall_side == "left" else w - CLAMP["edge"],
                  "y": h / 2, "code": "BL 203"})
    if door_side:  # top-pivot mate holes on the door-facing edge
        x = PIVOT_MATE["off_edge"] if door_side == "left" else w - PIVOT_MATE["off_edge"]
        f += [{"kind": "hole", "dia": PIVOT_MATE["dia"], "x": x,
               "y": PIVOT_MATE["y1"] + i * PIVOT_MATE["gap"], "code": "pivot"}
              for i in (0, 1)]
    return f


def _door_features(w, h, pivot):
    stile = "right" if pivot == "left" else "left"   # meeting/leading edge
    sx = (lambda off: w - off) if stile == "right" else (lambda off: off)
    f = [
        {"kind": "cutout", "template": "A", "corner": "TL" if pivot == "left" else "TR",
         "code": "KL-M202"},
        {"kind": "cutout", "template": "A", "corner": "BL" if pivot == "left" else "BR",
         "code": "KL-M102/T"},
        {"kind": "notch", "w": LOCK_NOTCH["w"], "h": LOCK_NOTCH["h"],
         "corner": "BL" if stile == "left" else "BR", "off": LOCK_NOTCH["off"],
         "code": "CSM-50W"},
    ]
    f += [{"kind": "hole", "dia": HANDLE["dia"], "x": sx(HANDLE["off_stile"]),
           "y": h / 2 + s * HANDLE["half_crs"], "code": "JQ 104"}
          for s in (-1, 1)]
    return f


def _hinged_features(w, h, pivot):
    hx = HINGE_NOTCH["w"] / 2 if pivot == "left" else w - HINGE_NOTCH["w"] / 2
    f = [{"kind": "notch", "w": HINGE_NOTCH["w"], "h": HINGE_NOTCH["h"],
          "corner": ("TL" if pivot == "left" else "TR") if top else
                    ("BL" if pivot == "left" else "BR"),
          "off": 0, "y_end": HINGE_NOTCH["end"], "code": "SH-90"}
         for top in (True, False)]
    kx = w - KNOB["off"] if pivot == "left" else KNOB["off"]
    f.append({"kind": "hole", "dia": KNOB["dia"], "x": kx, "y": h / 2, "code": "SH-KNOB"})
    return f


def _slider_features(w, h):
    return [{"kind": "hole", "dia": ROLLER["dia"], "x": x, "y": ROLLER["edge"],
             "code": "SL-ROLLER"}
            for x in (ROLLER["inset"], w - ROLLER["inset"])]


def _over_features(w, h):
    f = [{"kind": "hole", "dia": CLAMP_OVER["dia"], "x": x, "y": CLAMP_OVER["edge"],
          "code": "BL 203"}
         for x in (CLAMP_OVER["inset"], w - CLAMP_OVER["inset"])]
    f += [{"kind": "cutout", "template": "B", "corner": c, "code": "KL-M402"}
          for c in ("BL", "BR")]
    return f


def pivot_side(cells: list[dict], i: int) -> str:
    """A leaf pivots away from its meeting edge: left unless the
    previous bay is also a leaf (double doors meet in the middle)."""
    prev = cells[i - 1].get("type") if i > 0 else None
    return "right" if (prev and _is_leaf(prev)) else "left"


def panel_features(design: dict, panels: list[dict]) -> list[dict]:
    """Instantiate preps for every panel in a frameless breakdown.
    Returns [{mark, features, pivot, stamp}] aligned with `panels`
    (breakdown order: run panels first, over-panel last)."""
    cells = design["cells"]
    out = []
    run = [p for p in panels if p["type"] != "over"]
    for j, p in enumerate(run):
        ty = p["type"]
        w, h = p["w_mm"], p["h_mm"]
        if ty == "fixed":
            wall = "left" if j == 0 else ("right" if j == len(run) - 1 else None)
            door = None
            if j + 1 < len(cells) and _is_leaf(cells[j + 1].get("type") or ""):
                door = "right"
            elif j > 0 and _is_leaf(cells[j - 1].get("type") or ""):
                door = "left"
            feats, piv = _fixed_features(w, h, wall, door), None
        elif ty == "door":
            piv = pivot_side(cells, j)
            feats = _door_features(w, h, piv)
        elif ty == "hinged":
            piv = pivot_side(cells, j)
            feats = _hinged_features(w, h, piv)
        else:
            feats, piv = _slider_features(w, h), None
        # stamp sits by the pivot-side patch (doors) or the wall edge
        # (side panels) — matches the SGP/4462-26A print convention
        side = piv or ("left" if j == 0 else "right")
        stamp = "Bottom Left Corner" if side == "left" else "Bottom Right Corner"
        out.append({"mark": p["mark"], "features": feats, "pivot": piv, "stamp": stamp})
    for p in panels:
        if p["type"] == "over":
            out.append({"mark": p["mark"], "features": _over_features(p["w_mm"], p["h_mm"]),
                        "pivot": None, "stamp": "Bottom Right Corner"})
    return out


def templates_used(feature_sets: list[dict]) -> list[str]:
    seen = []
    for fs in feature_sets:
        for f in fs["features"]:
            if f["kind"] == "cutout" and f["template"] not in seen:
                seen.append(f["template"])
    return sorted(seen)

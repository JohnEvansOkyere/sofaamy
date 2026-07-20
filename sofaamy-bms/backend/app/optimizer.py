"""1D cutting-stock optimizer — first-fit-decreasing with kerf.

Server-side mirror of the frontend engine (lib/optimize.js).
Each profile group is nested separately: different stock lengths,
and finishes can't share a bar.

Stock lengths confirmed from Sofaamy's cutting-optimizer screen
(meeting 2026-07-10). Kerf is a PLACEHOLDER until Sofaamy confirms.
"""

STOCK_MM = {"frame_outer": 5800, "frame_internal": 5800, "frame_opening": 5800,
            "trialco_frame": 5800, "trialco_leaf": 5800, "trialco_interlock": 5800,
            "cwmullion": 5800, "cwtransom": 5800}
DEFAULT_STOCK_MM = 6000
DEFAULT_KERF_MM = 5


def optimize(pieces: list[dict], kerf_mm: int = DEFAULT_KERF_MM) -> dict:
    """pieces: [{profile, member, length_mm, qty}] -> nested cut plan."""
    by_profile: dict[str, list[dict]] = {}
    for p in pieces:
        by_profile.setdefault(p["profile"], []).append(p)

    groups = []
    for profile, plist in by_profile.items():
        stock_mm = STOCK_MM.get(profile, DEFAULT_STOCK_MM)

        cuts = [
            {"member": p.get("member", ""), "position": p.get("position", p.get("member", "")),
             "length_mm": p["length_mm"]}
            for p in plist for _ in range(p.get("qty", 1))
        ]
        cuts.sort(key=lambda c: -c["length_mm"])

        bars: list[dict] = []
        oversized: list[dict] = []
        for c in cuts:
            need = c["length_mm"] + kerf_mm
            if need > stock_mm:
                oversized.append({**c, "reason": f"{c['length_mm']} mm + {kerf_mm} mm kerf exceeds {stock_mm} mm stock"})
                continue
            bar = next((b for b in bars if stock_mm - b["used_mm"] >= need), None)
            if bar is None:
                bar = {"cuts": [], "used_mm": 0}
                bars.append(bar)
            bar["cuts"].append(c)
            bar["used_mm"] += need
        for b in bars:
            b["waste_mm"] = stock_mm - b["used_mm"]

        total_stock = len(bars) * stock_mm
        total_cut = sum(c["length_mm"] for c in cuts if c["length_mm"] + kerf_mm <= stock_mm)
        groups.append({
            "profile": profile,
            "stock_mm": stock_mm,
            "bars": bars,
            "oversized": oversized,
            "total_mm": total_cut,
            "waste_mm": total_stock - total_cut,
            "utilization": round(100 * total_cut / total_stock, 1) if total_stock else 0,
        })

    stock_sum = sum(g["stock_mm"] * len(g["bars"]) for g in groups)
    cut_sum = sum(g["total_mm"] for g in groups)
    return {
        "groups": groups,
        "total_bars": sum(len(g["bars"]) for g in groups),
        "overall_utilization": round(100 * cut_sum / stock_sum, 1) if stock_sum else 0,
        "kerf_mm": kerf_mm,
    }

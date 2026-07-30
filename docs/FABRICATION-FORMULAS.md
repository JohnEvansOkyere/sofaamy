# Sofaamy Fabrication Formula Register

This document stores the fabrication formulas used by Sofaamy's aluminium and
glass products. Formulas are recorded here before they are implemented in the
configurator, quotation engine, BOM, or cutting list.

## Status and rules

- **Units:** millimetres unless stated otherwise.
- **Scope:** formulas are applied per measured bay/opening.
- **Working rule:** a formula marked `Working assumption` must be confirmed by
  Sofaamy before it becomes a production rule.
- **Important:** a site measurement, a finished outer-frame size, and an
  individual profile cut length are not automatically the same thing. Mitres,
  butt joints, profile depth, tracks, gaskets, and clearances may change the
  final cut list.

## Terminology

| Term | Meaning in this register |
|---|---|
| Bay | One complete measured opening or unit at a building location |
| Frame | The fixed outer Trialco frame around one bay |
| Leaf | One sliding sash inside the frame |
| Net | The insect-screen panel associated with a leaf |
| Interlock | The vertical meeting profile between sliding leaves |
| Glass | The glass panel fitted inside a leaf |
| H | Height |
| W | Width |

## Trialco sliding system

### Working interpretation

The current interpretation is that **one bay is one measured opening**, and that
each bay contains **two sliding leaves**. Different bays may have different site
measurements, so the formulas must run independently for Bay 1, Bay 2, and so
on.

This interpretation is based on the supplied two-leaf rule:

```text
Leaf W = Frame W / 2
```

If Sofaamy uses “two bays” to mean two leaves inside one opening, this model
must be revised. The terms `bay` and `leaf` must remain separate in the system.

### Inputs

For each bay, capture:

```text
Frame H = measured frame/opening height
Frame W = measured frame/opening width
Leaf count = 2 (working assumption)
```

### Dimension formulas

| Part | Width formula | Height/length formula | Working interpretation |
|---|---|---|---|
| Frame | `Frame W` | `Frame H` | Site measurement supplied for the bay |
| Leaf | `Frame W / 2` | `Frame H - 70` | Two equal sliding leaves per bay |
| Net | `Leaf W` | `Leaf H - 10` | Net follows leaf width with a 10 mm height clearance |
| Interlock | Not a meaningful geometric width here | `Leaf H` | Vertical profile cut to leaf height |
| Glass | `Leaf W - 112` | `Leaf H - 112` | Glass clearance inside each leaf |

In formula notation:

```text
leaf_w   = frame_w / 2
leaf_h   = frame_h - 70

net_w    = leaf_w
net_h    = leaf_h - 10

interlock_length = leaf_h

glass_w  = leaf_w - 112
glass_h  = leaf_h - 112
```

### Example

For a bay measured at `1800 W × 2000 H`:

```text
Frame       = 1800 W × 2000 H
Each leaf   =  900 W × 1930 H
Each net    =  900 W × 1920 H
Interlock   = 1930 mm long
Each glass  =  788 W × 1818 H
```

The example calculates dimensions only. It does not yet determine the exact
number of profile lengths, corners, rollers, locks, handles, rubber, or other
accessories.

### Current implementation quantities

Until the fabricator confirms the production schedule, the system currently
uses these working quantities for one two-leaf bay:

```text
Leaves      = 2
Net panels  = 1 (the net covers one sliding side)
Interlocks  = 2 (one meeting profile per leaf)
Glass       = 2 (one panel inside each leaf)
0404 corners = 12 (4 outer-frame corners + 4 per leaf × 2 leaves)
```

These quantities are deliberately visible in the formula check and cutting
list so they can be compared with Sofaamy's existing calculation tomorrow.

### Two-leaf sliding opening behavior

A two-leaf sliding bay does not open by sending both glass leaves away from
each other. One leaf remains standing while the other slides across it:

- **Left to right:** the left leaf moves across and overlaps the stationary
  right leaf.
- **Right to left:** the right leaf moves across and overlaps the stationary
  left leaf.

The exposed side is occupied by the single net panel for the bay, so the
opening can ventilate while the insect screen remains in place. The 3D and
wall visuals use this rule for the opening animation; it does not change the
Trialco material quantities above.

### Trialco internal material-cost quantities

When Frame W, Frame H, and project quantity are entered, the system also
populates the internal material-cost sheet. Profile quantities are rounded up
to complete 5.8 m stock bars; accessory quantities are calculated from the
working two-leaf recipe and multiplied by project quantity.

| Material | Working quantity rule | Unit-price rule |
|---|---|---|
| Frame | First-fit stock-bar nesting of the four frame cuts per bay, with 5 mm kerf | Fixed Trialco sheet rate |
| Leaf | First-fit stock-bar nesting of the four cuts per leaf, with 5 mm kerf | Fixed Trialco sheet rate |
| Net | First-fit stock-bar nesting of the four net-frame cuts for one net per bay, with 5 mm kerf | Fixed Trialco sheet rate |
| Interlock | First-fit stock-bar nesting of the two interlock cuts per bay, with 5 mm kerf | Fixed Trialco sheet rate |
| Glass cut estimate | `2 × Glass W × Glass H × project qty` converted to m² | Fabrication reference only |
| Glass purchase | `Frame W × Frame H × project qty` converted to m², divided by 7.2 m²/sheet and rounded up to the next 0.5 sheet | Selected glass catalogue rate × 7.2 m²/sheet |
| Rubber / brush | Calculated from the relevant glass or net perimeter | Fixed Trialco sheet rate |
| 0404 corners | `4 outer-frame corners + (4 × 2 leaves)` per bay × project quantity | Fixed Trialco sheet rate |
| Metal locks | `1 per bay × project quantity` | Fixed Trialco sheet rate |
| Hardware / consumables | Working per-bay recipe × project quantity | Fixed Trialco sheet rate |

The material rows are shown in the configurator, internal price breakdown,
cutting list, internal BOQ, and factory work-order workflow. Material cost is
the sum of line totals; installation is calculated as **30% of material cost**.
These are internal production controls and do not replace the customer-facing
bundled quote.

### Current internal Trialco rates

The following working unit prices were transcribed from the supplied Trialco
costing-sheet image. Glass remains linked to the selected glass catalogue
because the image's glass unit-price cell is not legible enough to treat as a
confirmed fixed rate.

```text
Frame 775       Leaf 570          Net 210           Interlock 210
Trialco kits 38 Glass: catalogue  0404 corners 6.50 Trialco rollers 15
Metal locks 41  Net corners 1     Net handle 3      Net fibre 280 / m²
Glazing rubber 128 / m   Net rubber 60 / m          Installation screw 55
Wall plugs 4.50          Water drain cap 7          PVC hole cover 46
Silicone 25               Italian brush 65 / m
```

The rates are intentionally kept separate from customer selling rates and
from the source workbook catalogue values so changing a selling price does not
silently change the internal Trialco costing sheet.

### Glass-sheet purchasing rule

Sofaamy's recorded calculation purchases glass by standard sheet rather than by
the exact glass-cut area. The current working sheet size is **7.2 m²** and
purchases are rounded up to half-sheet increments.

For the example `1,250 W × 1,500 H`, quantity 5:

```text
Frame-area basis = 1.25 × 1.50 × 5 = 9.375 m²
Sheet count      = 9.375 ÷ 7.2 = 1.3021 sheets
Purchase qty     = 1.5 sheets (rounded up to the next 0.5)
```

The physical glass-cut estimate remains separate:

```text
10 panels × 513 × 1,318 mm = 6.76 m² cut area
```

The material-cost sheet uses **1.5 sheets** for procurement costing. The
cutting list uses `513 × 1,318 mm` for each of the ten physical panels.

### Additional project materials

The configurator's **Project accessories** editor is the extension point for
materials that vary by job. It supports catalogue items and custom rows with a
name, code, quantity, and unit price. For Trialco:

- sliding-door-only catalogue items, such as the Italian sliding lock with key
  and sliding door handle, appear for Trialco doors only;
- ordinary Trialco sliding windows do not receive those door-only rows; and
- custom materials can be added to either a Trialco window or door and are
  included in the internal material total, installation calculation, BOQ,
  price breakdown, and work-order reports.

The customer quotation remains a bundled selling-price document. The added
materials update the internal production cost and floor check; they are not
printed as internal line items on the customer-facing quotation.

### Quantity assumptions still requiring confirmation

The dimensions above do not prove the production quantities. Confirm these
items with the fabricator:

1. Whether every Trialco bay has exactly two leaves.
2. Whether one net covering one sliding side is the approved Trialco recipe.
3. Whether the interlock quantity is one or two vertical profiles per bay.
4. Whether each leaf receives one glass panel, and whether the two panels are
   identical.
5. Whether one metal lock per bay is the approved Trialco lock recipe.
6. Whether `112 mm` is deducted from both sides of both dimensions, or is a
   complete system allowance already covering all sides.
7. Whether `0404 corners = 4 outer-frame + 4 per leaf` is the approved corner
   recipe.
8. Whether the 7.2 m² sheet size and half-sheet rounding apply to every glass
   type.
9. Whether the `70 mm` leaf-height deduction includes the complete track and
   frame clearance.
10. Whether the measured frame size is the final outer-frame size or the wall
   opening before installation clearance.
11. Whether frame and leaf members are mitred or butt-cut, and whether the
   profile manufacturer's cutting sheet adds further deductions.

## Existing generic formulas in the application

The current application contains generic placeholder fabrication rules for
several frame systems. Those values must not be silently mixed with the
Trialco recipe above:

```text
Generic working frame depth       = 50 mm
Generic interlock allowance       = 30 mm
Generic track clearance           = 30 mm
Generic fixed-glass deduction     = 70 mm
Generic opening-glass deduction   = 60 mm
```

The Trialco rules in this document are more specific and should replace the
generic values only after Sofaamy confirms them. The implementation should
identify the formula set by system (`trialco`, `ks50`, etc.) rather than using
one universal deduction table.

## Formula change log

| Date | System | Change | Status |
|---|---|---|---|
| 2026-07-20 | Trialco | Added two-leaf bay formulas from today's fabrication explanation | Working assumption; pending confirmation |
| 2026-07-23 | Trialco | Added outer-frame 0404 corners and 7.2 m² glass-sheet purchasing rule from team calculation | Team-provided working rule; verify against approved costing sheet |
| 2026-07-23 | Trialco | Changed metal locks to one per complete bay/window | Team-provided working rule; verify against approved accessory recipe |
| 2026-07-23 | Trialco | Changed net recipe to one net covering one sliding side per bay | Team-provided working rule; verify net perimeter and brush coverage |

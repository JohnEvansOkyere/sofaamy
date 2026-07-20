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
Net panels  = 2 (one associated with each leaf)
Interlocks  = 2 (one meeting profile per leaf)
Glass       = 2 (one panel inside each leaf)
```

These quantities are deliberately visible in the formula check and cutting
list so they can be compared with Sofaamy's existing calculation tomorrow.

### Trialco internal material-cost quantities

When Frame W, Frame H, and project quantity are entered, the system also
populates the internal material-cost sheet. Profile quantities are rounded up
to complete 5.8 m stock bars; accessory quantities are calculated from the
working two-leaf recipe and multiplied by project quantity.

| Material | Working quantity rule | Unit-price rule |
|---|---|---|
| Frame | First-fit stock-bar nesting of the four frame cuts per bay, with 5 mm kerf | Fixed Trialco sheet rate |
| Leaf | First-fit stock-bar nesting of the four cuts per leaf, with 5 mm kerf | Fixed Trialco sheet rate |
| Net | First-fit stock-bar nesting of the four net-frame cuts per net, with 5 mm kerf | Fixed Trialco sheet rate |
| Interlock | First-fit stock-bar nesting of the two interlock cuts per bay, with 5 mm kerf | Fixed Trialco sheet rate |
| Glass | `2 × Glass W × Glass H × project qty` converted to m² | Selected glass catalogue rate |
| Rubber / brush | Calculated from the relevant glass or net perimeter | Fixed Trialco sheet rate |
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
2. Whether one bay requires one net or two nets.
3. Whether the interlock quantity is one or two vertical profiles per bay.
4. Whether each leaf receives one glass panel, and whether the two panels are
   identical.
5. Whether `112 mm` is deducted from both sides of both dimensions, or is a
   complete system allowance already covering all sides.
6. Whether the `70 mm` leaf-height deduction includes the complete track and
   frame clearance.
7. Whether the measured frame size is the final outer-frame size or the wall
   opening before installation clearance.
8. Whether frame and leaf members are mitred or butt-cut, and whether the
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

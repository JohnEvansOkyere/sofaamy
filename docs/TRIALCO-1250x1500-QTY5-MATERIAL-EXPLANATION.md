# Trialco Sliding Window Material Explanation

## Example used

This document explains how Sofaamy's current Trialco calculation obtains each
material quantity for a two-leaf sliding window with:

```text
Frame width   = 1,250 mm
Frame height  = 1,500 mm
Design qty    = 5 complete identical bays
Opening qty   = not used
Glass         = 5 mm Plain (5CF)
```

The calculation treats one bay as one complete outer frame containing two
sliding leaves. `Design qty = 5` means the complete bay recipe is repeated five
times.

These are the current working Trialco rules. They must still be checked against
Sofaamy's approved fabrication calculation before the list is released to the
factory.

## 1. Dimensions calculated for one bay

The current formulas are:

```text
Leaf W       = Frame W / 2
Leaf H       = Frame H - 70
Net W        = Leaf W
Net H        = Leaf H - 10
Interlock    = Leaf H
Glass W      = Leaf W - 112
Glass H      = Leaf H - 112
```

For this example:

| Part | Calculation | Result per bay |
|---|---|---:|
| Outer frame | 1,250 W × 1,500 H | 1,250 × 1,500 mm |
| Each sliding leaf | 1,250 ÷ 2; 1,500 − 70 | 625 × 1,430 mm |
| Each net | 625 W; 1,430 − 10 | 625 × 1,420 mm |
| Each interlock | Leaf H | 1,430 mm long |
| Each glass panel | 625 − 112; 1,430 − 112 | 513 × 1,318 mm |

## 2. Quantity logic

The calculation first builds the material recipe for **one bay**, then repeats
that recipe five times.

```text
Total project quantity = per-bay quantity × design qty
                       = per-bay quantity × 5
```

The exception is aluminium profile: profile pieces are converted into complete
5.8 m stock bars using 5 mm kerf nesting. Therefore, profile quantities are
not simply raw metres divided by 5.8 m; the actual cut pieces must fit together
inside each stock bar.

## 3. Profile materials

### Frame — TF053N / TF073N

One bay needs four outer-frame cuts:

```text
1,250 + 1,250 + 1,500 + 1,500 = 5,500 mm per bay
5,500 × 5 bays = 27,500 mm = 27.50 m required
```

The current first-fit nesting uses **5 stock bars**. One 5.8 m bar can hold
the four cuts for one bay with the current 5 mm kerf rule.

```text
Quantity: 5 bars
```

### Leaf — TF065N

Each leaf needs two rails and two stiles:

```text
2 × 625 + 2 × 1,430 = 4,110 mm per leaf
4,110 × 2 leaves = 8,220 mm per bay
8,220 × 5 bays = 41,100 mm = 41.10 m required
```

After nesting all leaf cuts with 5 mm kerf:

```text
Quantity: 8 bars
```

### Net — TF223N

The one net needs two horizontal and two vertical frame cuts:

```text
2 × 625 + 2 × 1,420 = 4,090 mm per net
4,090 × 1 net = 4,090 mm per bay
4,090 × 5 bays = 20,450 mm = 20.45 m required
```

After nesting:

```text
Quantity: 4 bars
```

### Interlock — TF224N

There are two interlocks per bay:

```text
1,430 × 2 = 2,860 mm per bay
2,860 × 5 bays = 14,300 mm = 14.30 m required
```

After nesting the ten 1,430 mm cuts:

```text
Quantity: 3 bars
```

## 4. Glass and net materials

### Glass

There are two glass panels per bay, so the project needs:

```text
2 panels × 5 bays = 10 panels
```

The fabrication cut estimate remains 10 panels at 513 × 1,318 mm:

```text
513 × 1,318 ÷ 1,000,000 = 0.676134 m² per panel
0.676134 × 10 panels = 6.76134 m² cut area
```

The team's purchasing method uses the full frame area as the glass buying
basis, then converts that area into standard 7.2 m² sheets:

```text
1,250 × 1,500 ÷ 1,000,000 × 5 = 9.375 m² frame-area basis
9.375 ÷ 7.2 = 1.3021 sheets
1.3021 rounded up to the next 0.5 sheet = 1.5 sheets
```

```text
Purchase quantity: 1.5 sheets
Sheet size: 7.2 m² per sheet
Purchase-area basis: 9.375 m²
Cut estimate: 6.76 m²
Panel size: 513 × 1,318 mm
Panel count: 10
```

The material cost uses the purchased sheet quantity. The cut estimate remains
visible as a fabrication reference and is not used as the purchase quantity.

### Net fibre

There is one net panel per bay:

```text
1 × 625 × 1,420 ÷ 1,000,000 = 0.8875 m² per bay
0.8875 × 5 bays = 4.4375 m²
```

```text
Quantity: 4.44 m²
```

## 5. Hardware and consumables

| Material | Per-bay rule | Calculation for 5 bays | Project quantity |
|---|---:|---:|---:|
| Trialco kits | 1 per bay | 1 × 5 | 5 sets |
| 0404 corners | 4 outer frame + 4 per leaf × 2 leaves | 12 × 5 | 60 pcs |
| Trialco rollers | 2 per leaf × 2 leaves | 4 × 5 | 20 pcs |
| Metal locks | 1 per complete bay/window | 1 × 5 | 5 pcs |
| Net corners | 4 per net × 1 net | 4 × 5 | 20 pcs |
| Net handles | 1 per net × 1 net | 1 × 5 | 5 pcs |
| Installation screws | 4 per bay | 4 × 5 | 20 pcs |
| Wall plugs | 4 per bay | 4 × 5 | 20 pcs |
| Water drain caps | 2 per bay | 2 × 5 | 10 pcs |
| PVC hole covers | 2 per bay | 2 × 5 | 10 pcs |
| Silicone | 1 tube per bay | 1 × 5 | 5 tubes |

## 6. Perimeter materials

### Glazing rubber

The glass perimeter is calculated from the two glass panels in each bay:

```text
2 × 2 × (513 + 1,318) ÷ 1,000 = 7.324 m per bay
7.324 × 5 bays = 36.62 m
```

```text
Quantity: 36.62 m
```

### Net rubber and Italian brush

The net perimeter is calculated from the one net panel in each bay:

```text
2 × (625 + 1,420) ÷ 1,000 = 4.09 m per bay
4.09 × 5 bays = 20.45 m
```

Both materials use this same perimeter quantity:

```text
Net rubber:   20.45 m
Italian brush: 20.45 m
```

## 7. Complete project material list

| Material | Code | Quantity | Unit |
|---|---|---:|---|
| Trialco frame | TF053N / TF073N | 5 | 5.8 m bars |
| Trialco leaf | TF065N | 8 | 5.8 m bars |
| Trialco net | TF223N | 4 | 5.8 m bars |
| Trialco interlock | TF224N | 3 | 5.8 m bars |
| Trialco kits | ACC | 5 | sets |
| 5 mm Plain glass | 5CF | 1.5 | 7.2 m² sheets |
| 0404 corners | ACC04C | 60 | pcs |
| Trialco rollers | TRIAL-R1 | 20 | pcs |
| Metal locks | ACCML | 5 | pcs |
| Net corners | IT01NC | 20 | pcs |
| Net handles | ACCNH | 5 | pcs |
| Net fibre | ACCNF | 4.44 | m² |
| Glazing rubber | ACCGRB | 36.62 | m |
| Net rubber | ACCNRB | 20.45 | m |
| Installation screws | ACCITS | 20 | pcs |
| Wall plugs | ACCWPL | 20 | pcs |
| Water drain caps | ACCWDC | 10 | pcs |
| PVC hole covers | ACCPVC | 10 | pcs |
| Silicone | SIL | 5 | tubes |
| Italian brush | ACCITB | 20.45 | m |

## 8. Current internal costing output

Using the current internal Trialco rates and the selected 5CF glass catalogue
rate, the application produces:

| Cost item | Amount |
|---|---:|
| Material cost for 5 bays | GHS 24,704.11 |
| Installation allowance, 30% | GHS 7,411.23 |
| Total internal cost | GHS 32,115.34 |
| Internal cost per bay | GHS 6,423.07 |

These are internal costing figures. They are separate from the customer-facing
selling price.

## 9. Where the calculation lives in the codebase

The calculation is implemented in these paths:

1. `frontend/src/lib/trialco.js` calculates the bay dimensions and creates the
   four frame cuts, eight leaf cuts, eight net cuts, two interlock cuts, and
   two glass panels for one bay.
2. `frontend/src/lib/trialcoMaterials.js` repeats the one-bay recipe five times,
   nests profile cuts into 5.8 m bars with 5 mm kerf, converts the full
   frame-area glass basis into 7.2 m² sheets rounded to 0.5, and creates the
   material rows.
3. `frontend/src/lib/pricing.js` uses the material rows for internal costing
   and the design quantity for the project quote.
4. `backend/app/pricing.py` mirrors the same formulas for server-side quotes,
   BOQs, and reports.
5. `backend/app/reports.py` prints the formula summary, material list, and
   cutting schedule.

The only project multiplier in this calculation is now `design.qty = 5`.

## 10. Production-check items

Before treating this as an approved factory list, Sofaamy should confirm:

- whether two interlocks are required per bay;
- whether every leaf receives one lock and two rollers;
- whether the 70 mm, 10 mm, and 112 mm deductions are complete system
  allowances;
- whether the frame measurement is the finished outer-frame size or the wall
  opening size; and
- whether the team's stock-bar nesting and kerf practice matches the current
  5.8 m / 5 mm working rule; and
- whether every glass type uses 7.2 m² sheets and half-sheet purchasing
  increments.

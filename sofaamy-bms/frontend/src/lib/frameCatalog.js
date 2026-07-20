// ============================================================
// SOFAAMY FRAME CATALOGUE
// Normalised from the supplied Frame source workbooks:
//   - FINAL.xlsx
//   - PROFILES, CODES, PRICE,BAR LENGHT,ACCESSORIES PER SYSTEM.xlsx
//   - PROFILES AND ACCESORIES (2).xlsx
//
// This is catalogue/master data, not a fabrication-rule engine. The supplied
// files identify the systems, parts, codes, stock lengths and listed values,
// but do not establish per-opening consumption or cut deductions. Those rules
// remain explicit pending Sofaamy confirmation.
// ============================================================

const profile = (name, code, listedPrice, colours = 'White, Grey & Black') => ({
  name, code, lengthMm: 5800, colours, listedPrice,
})

// Accessory values are kept as `listedValue` rather than `price`: the source
// workbook does not consistently label whether each number is a unit price,
// pack price, or standard quantity/allowance.
const accessory = (name, code, listedValue, note = '') => ({
  name, code, listedValue, note,
})

const slidingAccessories = (rollerName, rollerCode, rollerValue, cornerName = '0404 Corners', cornerCode = 'ACC04C', cornerValue = 6.5) => [
  accessory(cornerName, cornerCode, cornerValue),
  accessory('Net corners', 'ACCNC', 1),
  accessory(rollerName, rollerCode, rollerValue),
  accessory('Metal locks', 'ACCML', 35),
  accessory('Net handle', 'ACCNH', 3),
  accessory('Net fibre', 'ACCNF', 280),
  accessory('Glazing rubber', 'ACCGRB', 128),
  accessory('Net rubber', 'ACCNRB', 60),
  accessory('Installation screws', 'ACCITS', 55),
  accessory('Wall plugs', 'ACCWPL', 54),
  accessory('Water drain cap', 'ACCWDC', 4.5),
  accessory('PVC hole cover', 'ACCPVC', 6),
  accessory('Silicone', 'SIL', 30),
  accessory('Italian brush', 'ACCITB', 65),
  accessory('Italian sliding lock with key', 'ACCIT SLK', 40, 'Sliding doors only'),
  accessory('Italian sliding door handle', 'ACCIT SDH', 38, 'Sliding doors only'),
]

const fdtWindowAccessories = ({ projected = false, fixed = false } = {}) => {
  if (fixed) return [
    accessory('45 door corners', 'ACC45C', 13),
    accessory('Glazing rubber', 'ACCGRB', 128),
    accessory('Frame rubber', 'ACC FRRB', 54),
    accessory('Installation screws', 'ACCITS', 55),
    accessory('Wall plugs', 'ACCWPL', 4.5),
    accessory('PVC hole cover', 'ACCPVC', 46),
    accessory('Silicone', 'SIL', 30),
  ]
  return [
    accessory('45 door corners', 'ACC45C', 13),
    accessory('Net truck corners', 'ACCNTC', 7),
    accessory('Net corners', 'ACCNC', 1),
    accessory('Superior projected handle', 'JQ106B', 46),
    accessory(projected ? 'Heavy duty projected hinges' : 'Casement stopper', projected ? 'HD/206' : '13C3', projected ? 70 : 35),
    ...(projected ? [] : [accessory('Heavy duty hinges', 'HD/206', 35)]),
    accessory('Net handle', 'ACCNH', 3),
    accessory('Net fibre', 'ACCNF', 280),
    accessory('Glazing rubber', 'ACCGRB', 128),
    accessory('Net rubber', 'ACCNRB', 60),
    accessory('Frame rubber', 'ACC FRRB', 54),
    accessory('Installation screws', 'ACCITS', 55),
    accessory('Wall plugs', 'ACCWPL', 4.5),
    accessory('Water drain cap', 'ACCWDC', 6),
    accessory('PVC hole cover', 'ACCPVC', 46),
    accessory('Silicone', 'SIL', 30),
  ]
}

const fdtDoorAccessories = (swing = false) => [
  accessory('45 door corners', 'ACC45C', 13),
  accessory('Cego brush', 'AF2017', 46),
  accessory('Frame rubber', 'ACC FRRB', 54),
  accessory('Glazing rubber', 'ACCGRB', 128),
  accessory('Roller lock (30 mm)', 'RL30', 105, 'One for both double or single'),
  accessory('Chrome handle (small)', 'CHROME-H', 150),
  accessory('Hinge striker', 'HS 02', 3.5, 'One for both double or single'),
  accessory(swing ? 'Down closer' : 'Top closer', swing ? 'KL-HD203/6' : 'KDZ 202', swing ? 450 : 230),
  accessory('Installation screws', 'ACCITS', 55),
  accessory('Silicone', 'SIL', 30),
  accessory('Flash bolt', 'FBLT', 12, 'Two for double swing doors'),
]

const system = (id, label, productTypes, profiles, accessories, sourceSheet) => ({
  id, label, productTypes, profiles, accessories, sourceSheet,
  status: 'catalogue-data',
  rulesStatus: 'pending-confirmation',
})

export const FRAME_SYSTEMS = {
  trialco: system(
    'trialco', 'Trialco Sliding System', ['Sliding Door', 'Sliding Window'],
    [
      profile('Trialco frame with cover', 'TF053N', 636),
      profile('Trialco frame without cover', 'TF073N', 608),
      profile('Trialco flat leaf', 'TF065N', 466),
      profile('Net Italian', 'TF223N', 171),
      profile('Trialco interlock adaptor', 'TF224N', 171),
    ],
    [
      accessory('Trialco corners', 'ACC04C', 6.5),
      accessory('Trialco kit', 'ACC', 38),
      ...slidingAccessories('Trialco rollers', 'TRIAL-R1', 15).slice(1).map(a =>
        a.name === 'Net corners' ? { ...a, code:'IT01NC' } : a),
    ],
    'PROFILE SYSTEM / TRIALCO; FINAL.xlsx / TRIALCO SLIDING DOOR & WINDOW',
  ),
  ks50: system(
    'ks50', 'KS-50 Sliding System', ['Sliding Door', 'Sliding Window'],
    [
      profile('KS-50 frame with cover', 'MA0032', 494, 'White, Black, Grey & Champagne'),
      profile('KS-50 frame without cover', 'MA0035', 437, 'White, Black, Grey & Champagne'),
      profile('KS-50 flat leaf', 'MA0033', 342, 'White, Black, Grey & Champagne'),
      profile('KS-50 net leaf Italian', 'AF2142N', 152, 'White, Black, Grey & Champagne'),
      profile('KS-50 interlock adaptor', 'MA0034', 152, 'White, Black, Grey & Champagne'),
    ],
    [
      accessory('0404 corners', 'ACC04C', 6.5),
      accessory('Net corners', 'ACCNC', 1),
      accessory('KS-50 rollers', 'ACC50R', 10),
      accessory('Metal locks', 'ACCML', 35),
      accessory('Net handle', 'ACCNH', 3),
      accessory('Net fibre', 'ACCNF', 280),
      accessory('Glazing rubber', 'ACCGRB', 128),
      accessory('Net rubber', 'ACCNRB', 60),
      accessory('Installation screws', 'ACCITS', 55),
      accessory('Wall plugs', 'ACCWPL', 54),
      accessory('Water drain cap', 'ACCWDC', 4.5),
      accessory('PVC hole cover', 'ACCPVC', 6),
      accessory('Silicone', 'SIL', 30),
      accessory('Italian brush', 'ACCITB', 65),
      accessory('Italian sliding lock with key', 'ACCIT SLK', 40, 'Sliding doors only'),
      accessory('Italian sliding door handle', 'ACCIT SDH', 38, 'Sliding doors only'),
    ],
    'PROFILE SYSTEM / KS-50; FINAL.xlsx / KS-50 SLIDING DOOR & WINDOW',
  ),
  italian: system(
    'italian', 'Italian Sliding System', ['Sliding Door', 'Sliding Window'],
    [
      profile('Italian frame with cover', 'AF2227N', 342, 'White, Black, Grey & Champagne'),
      profile('Italian frame without cover', 'AF2237N', 309, 'White, Black, Grey & Champagne'),
      profile('Italian flat leaf', 'AF2136', 247, 'White, Black, Grey & Champagne'),
      profile('Italian net leaf', 'AF2142N', 124, 'White, Black, Grey & Champagne'),
      profile('Italian interlock adaptor', 'AF2162N', 124, 'White, Black, Grey & Champagne'),
    ],
    [
      accessory('Frame corners', 'IT22FC', 5),
      accessory('Leaf corners', 'IT213LC', 5),
      accessory('Net corners', 'IT01NC', 1),
      accessory('Italian rollers', 'IT02RL', 6),
      accessory('Metal locks', 'ACCML', 35),
      accessory('Net handle', 'ACCNH', 3),
      accessory('Net fibre', 'ACCNF', 280),
      accessory('Glazing rubber', 'ACCGRB', 128),
      accessory('Net rubber', 'ACCNRB', 60),
      accessory('Installation screws', 'ACCITS', 55),
      accessory('Wall plugs', 'ACCWPL', 54),
      accessory('Water drain cap', 'ACCWDC', 4.5),
      accessory('PVC hole cover', 'ACCPVC', 6),
      accessory('Silicone', 'SIL', 30),
      accessory('Italian brush', 'ACCITB', 65),
      accessory('Italian sliding lock with key', 'ACCIT SLK', 40, 'Sliding doors only'),
      accessory('Italian sliding door handle', 'ACCIT SDH', 38, 'Sliding doors only'),
    ],
    'PROFILE SYSTEM / ITALIAN; FINAL.xlsx / ITALIAN SLIDING DOOR & WINDOW',
  ),
  fdt_casement: system(
    'fdt_casement', 'FDT Casement Window', ['Casement Window'],
    [
      profile('Small L-outer', 'SML', 262, 'White, Black, Grey & Champagne'),
      profile('Flat beading', 'AF2158N', 124, 'White, Black, Grey & Champagne'),
      profile('Big T', 'AF2235', 423, 'White, Black, Grey & Champagne'),
      profile('Net truck', 'NT02', 170, 'White, Black, Grey & Champagne'),
      profile('Italian net leaf', 'AF2142N', 124, 'White, Black, Grey & Champagne'),
    ], fdtWindowAccessories(),
    'PROFILE SYSTEM / FDT CASEMENT; FINAL.xlsx / CASEMENT WINDOW',
  ),
  fdt_projected: system(
    'fdt_projected', 'FDT Projected Window', ['Projected Window'],
    [
      profile('Small L-outer', 'SML', 262, 'White, Black, Grey & Champagne'),
      profile('Flat beading', 'AF2158N', 124, 'White, Black, Grey & Champagne'),
      profile('Big T', 'AF2235', 423, 'White, Black, Grey & Champagne'),
      profile('Net truck', 'NT02', 170, 'White, Black, Grey & Champagne'),
      profile('Italian net leaf', 'AF2142N', 124, 'White, Black, Grey & Champagne'),
    ], fdtWindowAccessories({ projected: true }),
    'PROFILE SYSTEM / FDT PROJECTED; FINAL.xlsx / PROJECTED WINDOW',
  ),
  fdt_fixed: system(
    'fdt_fixed', 'FDT Fixed Window', ['Fixed Window'],
    [
      profile('Small L-outer / Swinglockstile', 'SML / SP-LS', 418, 'White, Black, Grey & Champagne'),
      profile('Flat beading', 'AF2158N', 124, 'White, Black, Grey & Champagne'),
      profile('Big T', 'AF2235', 423, 'White, Black, Grey & Champagne'),
    ], fdtWindowAccessories({ fixed: true }),
    'PROFILE SYSTEM / FDT FIXED; FINAL.xlsx / FIXED WINDOW',
  ),
  fdt_hinge: system(
    'fdt_hinge', 'FDT Hinge Door', ['Single Hinge Door', 'Double Hinge Door'],
    [
      profile('Swinglockstile', 'SP-LS', 418, 'White, Black, Grey & Champagne'),
      profile('Flat beading', 'AF2158N', 124, 'White, Black, Grey & Champagne'),
      profile('Swing bottom division', 'SP007', 637, 'White, Black, Grey & Champagne'),
      profile('Double hinge adaptor', 'JA061', 323, 'White, Black, Grey & Champagne'),
      profile('Big Z / hinge lockstile', 'AF2156', 447, 'White, Black, Grey & Champagne'),
      profile('Big T', 'AF2235', 423, 'White, Black, Grey & Champagne'),
    ], fdtDoorAccessories(),
    'PROFILE SYSTEM / FDT HINGE; FINAL.xlsx / HINGE DOOR',
  ),
  fdt_swing: system(
    'fdt_swing', 'FDT Swing Door', ['Swing Door'],
    [
      profile('Swinglockstile', 'SP-LS', 418, 'White, Black, Grey & Champagne'),
      profile('Flat beading', 'AF2158N', 124, 'White, Black, Grey & Champagne'),
      profile('Swing bottom division', 'SP007', 637, 'White, Black, Grey & Champagne'),
      profile('Swing brush adaptor', 'AF2376R', 162, 'White, Black, Grey & Champagne'),
      profile('Big T', 'AF2235', 423, 'White, Black, Grey & Champagne'),
    ], fdtDoorAccessories(true),
    'PROFILE SYSTEM / FDT SWING; FINAL.xlsx / SWING DOOR',
  ),
  legacy: {
    id: 'legacy', label: 'Legacy demo catalogue', productTypes: [], profiles: [], accessories: [],
    sourceSheet: 'Existing saved designs', status: 'legacy', rulesStatus: 'placeholder',
  },
}

export const FRAME_SYSTEM_ORDER = [
  'trialco', 'ks50', 'italian', 'fdt_casement', 'fdt_projected',
  'fdt_fixed', 'fdt_hinge', 'fdt_swing',
]

// Rates observed in the supplied quotation sheet. They remain editable per
// opening and should be confirmed against the current approved price list.
export const FRAME_QUOTE_RATES = {
  slidingDoor: 1900,
  slidingWindow: 1900,
  projected: 2350,
  casement: 2350,
  fixed: 1900,
  swingDoor: 1900,
  hingeDoor: 1900,
}

export const FRAME_RATE_SOURCES = {
  slidingDoor: 'Supplied quotation sheet: GHS 1,900/m²',
  slidingWindow: 'Supplied quotation sheet: GHS 1,900/m²',
  projected: 'Supplied detailed quote example: GHS 2,350/m²',
  casement: 'Starting reference based on the supplied projected-window rate; confirm with team',
  fixed: 'Starting reference based on the supplied detailed sliding rate; confirm with team',
  swingDoor: 'Starting reference based on the supplied detailed door rate; confirm with team',
  hingeDoor: 'Starting reference based on the supplied detailed door rate; confirm with team',
}

// GLASS ONLY FINAL.xlsx — material catalogue and processing services.
// Prices are GHS per m² unless explicitly marked as a service.
export const FRAME_GLASS_CATALOG = [
  { code:'5CF', label:'5mm Plain', pricePerM2:310, family:'Float / non-tempered' },
  { code:'6CF', label:'6mm Plain', pricePerM2:310.3, family:'Float / non-tempered' },
  { code:'8CF', label:'8mm Plain', pricePerM2:331.99, family:'Float / non-tempered' },
  { code:'10CF', label:'10mm Plain', pricePerM2:403.77, family:'Float / non-tempered' },
  { code:'12CF', label:'12mm Plain', pricePerM2:437.44, family:'Float / non-tempered' },
  { code:'3.3PL', label:'3mm Plain + 3mm Plain Laminated', pricePerM2:381.82, family:'Laminated' },
  { code:'3.3BZL', label:'3mm Bronze + 3mm Bronze Laminated', pricePerM2:400, family:'Laminated' },
  { code:'4.4PL', label:'4mm Plain + 4mm Plain Laminated', pricePerM2:402.69, family:'Laminated' },
  { code:'5.5PL', label:'5mm Plain + 5mm Plain Laminated', pricePerM2:471.7, family:'Laminated' },
  { code:'4.4BZL', label:'4mm Bronze + 4mm Bronze Laminated', pricePerM2:436.36, family:'Laminated' },
  { code:'5BR', label:'5mm Blue Reflective', pricePerM2:200, family:'Reflective' },
  { code:'5GR', label:'5mm Green Reflective', pricePerM2:219.8, family:'Reflective' },
  { code:'5BZR', label:'5mm Bronze Reflective', pricePerM2:200, family:'Reflective' },
  { code:'6MBR', label:'6mm Mexican Blue Reflective', pricePerM2:312.46, family:'Reflective' },
  { code:'5BR-BLACK', label:'5mm Black Reflective', pricePerM2:235.69, family:'Reflective' },
  { code:'5DBR', label:'5mm Deep Black Reflective', pricePerM2:288.48, family:'Reflective' },
  { code:'6SMBR', label:'6mm Superior Mexican Blue Reflective', pricePerM2:361.25, family:'Reflective' },
  { code:'5BT', label:'5mm Deep Black Glass', pricePerM2:214.55, family:'Tinted / special' },
  { code:'5BZT', label:'5mm Bronze Tinted', pricePerM2:206.06, family:'Tinted / special' },
  { code:'6BZT', label:'6mm Bronze Tinted', pricePerM2:250.51, family:'Tinted / special' },
  { code:'6BT', label:'6mm Deep Black Glass', pricePerM2:320.54, family:'Tinted / special' },
  { code:'6SMBT', label:'6mm Superior Mexican Blue Tinted', pricePerM2:252.96, family:'Tinted / special' },
]

export const FRAME_GLASS_SERVICES = [
  { code:'TEMP-5CF', label:'Tempering 5mm Plain', pricePerM2:306.96 },
  { code:'TEMP-6CF', label:'Tempering 6mm Plain', pricePerM2:465 },
  { code:'TEMP-8CF', label:'Tempering 8mm Plain', pricePerM2:566.84 },
  { code:'TEMP-10CF', label:'Tempering 10mm Plain', pricePerM2:674.98 },
  { code:'TEMP-12CF', label:'Tempering 12mm Plain', pricePerM2:751.28 },
  { code:'TEMP-5BR', label:'Tempering 5mm Blue Reflective', pricePerM2:388.23 },
  { code:'TEMP-5GR', label:'Tempering 5mm Green Reflective', pricePerM2:394.7 },
  { code:'TEMP-5BZR', label:'Tempering 5mm Bronze Reflective', pricePerM2:355.91 },
  { code:'TEMP-6MBR', label:'Tempering 6mm Mexican Blue Reflective', pricePerM2:510.91 },
  { code:'TEMP-5BLACK', label:'Tempering 5mm Black Reflective', pricePerM2:505.91 },
  { code:'TEMP-5DBR', label:'Tempering 5mm Deep Black Reflective', pricePerM2:470.21 },
  { code:'TEMP-6SMBR', label:'Tempering 6mm Superior Mexican Blue Reflective', pricePerM2:438.57 },
  { code:'TEMP-5DEEP', label:'Tempering 5mm Deep Black Glass', pricePerM2:443.18 },
  { code:'TEMP-5BZT', label:'Tempering 5mm Bronze Tinted', pricePerM2:344.66 },
  { code:'TEMP-6BZT', label:'Tempering 6mm Bronze Tinted', pricePerM2:416.52 },
  { code:'TEMP-6BT', label:'Tempering 6mm Deep Black Glass', pricePerM2:535.92 },
  { code:'TEMP-6SMBT', label:'Tempering 6mm Superior Mexican Blue Tinted', pricePerM2:438.57 },
  { code:'DOUBLE-GLAZING', label:'Double glazing service', pricePerM2:150 },
  { code:'LAM-2PLY', label:'2-ply lamination service', pricePerM2:230 },
  { code:'LAM-3PLY', label:'3-ply lamination service', pricePerM2:231 },
]

// Additional names from the standalone `FDT PROFILES` worksheet. These are
// retained as reference catalogue rows until the team confirms which product
// recipes consume them.
export const FRAME_PROFILE_REFERENCE_LIST = [
  'Small L-outer', 'Flat beading', 'Big T', 'Net truck', 'Italian net leaf',
  'Swinglockstile', 'Swing bottom division', 'Swing brush adaptor',
  'Double hinge adaptor', 'Big Z', 'Eco L-outer', 'Small T', 'Swing bottom',
  'Eco small T', 'Eco beading', '40×40', '40×80', '40 round',
]

export function frameGlassByCode(code) {
  return FRAME_GLASS_CATALOG.find(g => g.code === code) || null
}

export const FRAME_PRODUCT_GROUPS = [
  { group:'Sliding Systems', items:[
    { id:'trialco-sliding-door', name:'Trialco Sliding Door', system:'trialco', rateKey:'slidingDoor', cols:2, rows:1, opening:'sliding', w:2000, h:2200 },
    { id:'trialco-sliding-window', name:'Trialco Sliding Window', system:'trialco', rateKey:'slidingWindow', cols:2, rows:1, opening:'sliding', w:1500, h:1250 },
    { id:'ks50-sliding-door', name:'KS-50 Sliding Door', system:'ks50', rateKey:'slidingDoor', cols:2, rows:1, opening:'sliding', w:2000, h:2200 },
    { id:'ks50-sliding-window', name:'KS-50 Sliding Window', system:'ks50', rateKey:'slidingWindow', cols:2, rows:1, opening:'sliding', w:1500, h:1250 },
    { id:'italian-sliding-door', name:'Italian Sliding Door', system:'italian', rateKey:'slidingDoor', cols:2, rows:1, opening:'sliding', w:2000, h:2200 },
    { id:'italian-sliding-window', name:'Italian Sliding Window', system:'italian', rateKey:'slidingWindow', cols:2, rows:1, opening:'sliding', w:1500, h:1250 },
  ]},
  { group:'FDT Windows', items:[
    { id:'fdt-casement-window', name:'FDT Casement Window', system:'fdt_casement', rateKey:'casement', cols:1, rows:1, opening:'casement', w:1200, h:1200 },
    { id:'fdt-projected-window', name:'FDT Projected Window', system:'fdt_projected', rateKey:'projected', cols:1, rows:1, opening:'awning', w:1200, h:900 },
    { id:'fdt-fixed-window', name:'FDT Fixed Window', system:'fdt_fixed', rateKey:'fixed', cols:1, rows:1, opening:'fixed', w:1200, h:1200 },
  ]},
  { group:'FDT Doors', items:[
    { id:'fdt-swing-door', name:'FDT Swing Door', system:'fdt_swing', rateKey:'swingDoor', cols:1, rows:1, opening:'single', w:900, h:2100 },
    { id:'fdt-single-hinge-door', name:'FDT Single Hinge Door', system:'fdt_hinge', rateKey:'hingeDoor', cols:1, rows:1, opening:'single', w:900, h:2100 },
    { id:'fdt-double-hinge-door', name:'FDT Double Hinge Door', system:'fdt_hinge', rateKey:'hingeDoor', cols:2, rows:1, opening:'double', w:1800, h:2100 },
  ]},
]

export function frameRateForRateKey(rateKey) {
  return FRAME_QUOTE_RATES[rateKey] || FRAME_QUOTE_RATES.fixed
}

export function frameRateKeyForOpening(opening) {
  return {
    sliding:'slidingWindow', awning:'projected', casement:'casement',
    fixed:'fixed', single:'swingDoor', double:'hingeDoor',
  }[opening] || 'fixed'
}

export function frameSystemForTemplate(template) {
  if (template?.system) return template.system
  const id = template?.id || ''
  if (id.includes('slide')) return 'trialco'
  if (id.includes('casement')) return 'fdt_casement'
  if (id.includes('awning')) return 'fdt_projected'
  if (id.includes('single') || id.includes('double')) return 'fdt_hinge'
  if (id.includes('door')) return 'fdt_swing'
  return 'fdt_fixed'
}

export function frameSystemForDesign(design) {
  return FRAME_SYSTEMS[design?.system] ? design.system : 'legacy'
}

export function frameSystemSummary(id) {
  const s = FRAME_SYSTEMS[id] || FRAME_SYSTEMS.legacy
  return `${s.profiles.length} profile references · ${s.accessories.length} accessory references`
}

// ── PROJECT ACCESSORY RECIPE ──────────────────────────────────────────────
// The workbooks identify compatible accessories and, for some door items,
// give quantity notes. They do not provide a complete formula for every
// opening. This recipe therefore produces an editable working BOM: the user
// can change, remove or add any row on the project.
const accessoryKind = (a) => `${a.name} ${a.code}`.toLowerCase()
const isDoorCell = (c) => ['single', 'double'].includes(c?.opening)

export function frameAccessoryRows(d) {
  const system = FRAME_SYSTEMS[d?.system]
  const cells = d?.cells || []
  if (!system) return (d?.accessoryOverrides || []).filter(x => !x.removed)

  const projectQty = Math.max(1, Number(d.qty || 1))
  const openingCount = Math.max(1, cells.reduce((n, c) => n + Math.max(1, Number(c.itemQty || 1)), 0))
  const openingCells = cells.filter(c => c.opening !== 'fixed')
  const movingPanels = Math.max(1, openingCells.reduce((n, c) => n + Math.max(1, Number(c.panels || 1)) * Math.max(1, Number(c.itemQty || 1)), 0))
  const doors = cells.filter(isDoorCell)
  const doubleDoors = doors.reduce((n, c) => n + (c.opening === 'double' ? Math.max(1, Number(c.itemQty || 1)) : 0), 0)
  const hasSlidingDoor = cells.some(c => c.opening === 'sliding' &&
    (c.rateKey === 'slidingDoor' || /sliding\s+door/i.test(d?.name || '')))

  const rows = system.accessories.map(a => {
    const k = accessoryKind(a)
    let qty = openingCount * projectQty
    let rule = 'one working allowance per project opening'
    if (/sliding doors only/.test((a.note || '').toLowerCase()) && !hasSlidingDoor) { qty = 0; rule = 'only for sliding doors' }
    else if (/roller|wheel|truck/.test(k)) { qty = movingPanels * 2 * projectQty; rule = '2 per moving panel' }
    else if (/corner/.test(k)) { qty = movingPanels * 4 * projectQty; rule = '4 per moving panel' }
    else if (/hinge/.test(k)) { qty = Math.max(1, doors.length) * 2 * projectQty; rule = '2 per door leaf' }
    else if (/flash bolt/.test(k)) { qty = Math.max(1, doors.length) * projectQty + doubleDoors * projectQty; rule = '1 per door + 1 extra per double door' }
    else if (/handle|lock|closer|stopper|stricker/.test(k)) { qty = Math.max(1, openingCells.length) * projectQty; rule = '1 per opening/door leaf' }
    return { ...a, qty, suggestedQty:qty, rule, source:'catalogue + working recipe', unitPrice:Number(a.listedValue || 0) }
  })

  const overrides = Object.fromEntries((d.accessoryOverrides || []).map(x => [x.code || `custom:${x.name}`, x]))
  const merged = rows.map(row => {
    const o = overrides[row.code]
    if (!o) return row
    return { ...row, ...o, name:o.name || row.name, unitPrice:o.unitPrice ?? row.unitPrice,
      qty:Number(o.qty ?? row.qty), edited:true }
  }).filter(row => !row.removed && row.qty > 0)
  const known = new Set(rows.map(r => r.code))
  ;(d.accessoryOverrides || []).filter(o => o.custom && !o.removed && !known.has(o.code)).forEach(o => {
    merged.push({ ...o, qty:Number(o.qty || 0), suggestedQty:0, source:'custom project item', rule:'manual project addition', unitPrice:Number(o.unitPrice || 0), custom:true })
  })
  return merged
}

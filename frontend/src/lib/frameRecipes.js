// ============================================================
// FRAME RECIPES — which profile code goes on which piece
//
// The supplied workbooks give three of the four things a cutting
// list needs: the parts per product (FINAL.xlsx), their codes and
// bar prices (PROFILES, CODES, PRICE…), and the current price sheet.
// They never state which part plays which fabrication role.
//
// This file states it. Trialco is derived from Sofaamy's own costing
// sheet and is marked `confirmed`. The rest are WORKING ASSUMPTIONS
// read from each product's parts list, marked `provisional` so the
// team can correct them in Settings without touching code.
//
// Role keys match the geometry groups produced by lib/pieces.js:
//   frame_outer     head, sill and jambs of the outer frame
//   frame_internal  mullions, transoms and division members
//   frame_opening   the moving leaf / sash members
//   meeting         the member where two leaves close on each other
//   bead            glazing bead around every glazed light
//   net_frame       insect-screen frame
//   net_leaf        insect-screen leaf / mesh carrier
// ============================================================

// A recipe role resolves to one catalogue code. `codeByVariant` lets a
// design choose between two real parts (frame with or without cover);
// everything else is fixed by the system.
const role = (code, member, cuts, { provisional = true, note = '' } = {}) =>
  ({ code, member, cuts, provisional, note })

const variantRole = (codeByVariant, member, cuts, opts = {}) =>
  ({ ...role(null, member, cuts, opts), codeByVariant })

export const FRAME_RECIPES = {
  // ── Sliding systems ──────────────────────────────────────
  // Derived from Sofaamy's Trialco costing sheet: frame, flat leaf,
  // net and interlock with stated deductions. lib/trialco.js owns the
  // geometry; this entry keeps the code mapping in one place.
  trialco: {
    label: 'Trialco Sliding System',
    status: 'confirmed',
    variants: [{ key: 'frameCover', label: 'Frame', default: 'with',
      options: [{ value: 'with', label: 'With cover' }, { value: 'without', label: 'Without cover' }] }],
    roles: {
      frame_outer: variantRole({ with: 'TF053N', without: 'TF073N' },
        'Trialco frame', '45°/45°', { provisional: false }),
      frame_opening: role('TF065N', 'Trialco flat leaf', '90°/90°', { provisional: false }),
      meeting: role('TF224N', 'Trialco interlock adaptor', '90°/90°', { provisional: false }),
      net_leaf: role('TF223N', 'Net Italian', '90°/90°', { provisional: false }),
      frame_internal: role('TF224N', 'Trialco division member', '90°/90°',
        { note: 'Divided sliding frames are not in the supplied sheet' }),
      bead: role('AF2158N', 'Flat beading', '45°/45°',
        { note: 'Bead not listed for sliding systems — confirm whether the leaf is directly glazed' }),
    },
  },

  ks50: {
    label: 'KS-50 Sliding System',
    status: 'provisional',
    variants: [{ key: 'frameCover', label: 'Frame', default: 'with',
      options: [{ value: 'with', label: 'With cover' }, { value: 'without', label: 'Without cover' }] }],
    roles: {
      frame_outer: variantRole({ with: 'MA0032', without: 'MA0035' }, 'KS-50 frame', '45°/45°'),
      frame_opening: role('MA0033', 'KS-50 flat leaf', '90°/90°'),
      meeting: role('MA0034', 'KS-50 interlock adaptor', '90°/90°'),
      net_leaf: role('AF2142N', 'Net leaf Italian', '90°/90°'),
      frame_internal: role('MA0034', 'KS-50 division member', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
    },
  },

  italian: {
    label: 'Italian Sliding System',
    status: 'provisional',
    variants: [{ key: 'frameCover', label: 'Frame', default: 'with',
      options: [{ value: 'with', label: 'With cover' }, { value: 'without', label: 'Without cover' }] }],
    roles: {
      frame_outer: variantRole({ with: 'AF2227N', without: 'AF2237N' }, 'Italian frame', '45°/45°'),
      frame_opening: role('AF2136', 'Italian flat leaf', '90°/90°'),
      meeting: role('AF2162N', 'Italian interlock adaptor', '90°/90°'),
      net_leaf: role('AF2142N', 'Net leaf Italian', '90°/90°'),
      frame_internal: role('AF2162N', 'Italian division member', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
    },
  },

  // ── FDT windows ──────────────────────────────────────────
  // Assumption on both window systems: the outer frame and the opening
  // sash are cut from the same Small L-outer section, Big T divides the
  // frame, and every glazed light is beaded. Confirm with the team.
  fdt_casement: {
    label: 'FDT Casement Window',
    status: 'provisional',
    variants: [],
    roles: {
      frame_outer: role('SML', 'Small L-outer — frame', '45°/45°'),
      frame_opening: role('SML', 'Small L-outer — casement sash', '45°/45°',
        { note: 'Sash section not named in the parts list; assumed same as the frame' }),
      frame_internal: role('AF2235', 'Big T — division', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
      net_frame: role('NT02', 'Net truck', '90°/90°'),
      net_leaf: role('AF2142N', 'Italian net leaf', '90°/90°'),
    },
  },

  fdt_projected: {
    label: 'FDT Projected Window',
    status: 'provisional',
    variants: [],
    roles: {
      frame_outer: role('SML', 'Small L-outer — frame', '45°/45°'),
      frame_opening: role('SML', 'Small L-outer — projected sash', '45°/45°',
        { note: 'Sash section not named in the parts list; assumed same as the frame' }),
      frame_internal: role('AF2235', 'Big T — division', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
      net_frame: role('NT02', 'Net truck', '90°/90°'),
      net_leaf: role('AF2142N', 'Italian net leaf', '90°/90°'),
    },
  },

  // The parts list reads "SMALL L-OUTER/SWINGLOCKSTILE" — one row, two
  // real parts. It is a choice, so it is modelled as one.
  fdt_fixed: {
    label: 'FDT Fixed Window',
    status: 'provisional',
    variants: [{ key: 'fixedOuter', label: 'Outer frame', default: 'sml',
      options: [{ value: 'sml', label: 'Small L-outer' }, { value: 'swing', label: 'Swinglockstile' }] }],
    roles: {
      frame_outer: variantRole({ sml: 'SML', swing: 'SP-LS' }, 'Fixed window frame', '45°/45°'),
      frame_internal: role('AF2235', 'Big T — division', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
    },
  },

  // ── FDT doors ────────────────────────────────────────────
  // Assumption on both door systems: Big T is the outer door frame,
  // the leaf is built from Swinglockstile with a Swing bottom division
  // as its bottom rail, and the meeting member differs by product —
  // Big Z on a single hinge leaf, Double hinge adaptor between two
  // hinge leaves, Swing brush adaptor on a swing leaf.
  fdt_hinge: {
    label: 'FDT Hinge Door',
    status: 'provisional',
    variants: [],
    roles: {
      frame_outer: role('AF2235', 'Big T — door frame', '45°/45°'),
      frame_opening: role('SP-LS', 'Swinglockstile — leaf stile / top rail', '45°/45°'),
      bottom_rail: role('SP007', 'Swing bottom division — leaf bottom rail', '45°/45°'),
      meeting: role('AF2156', 'Big Z / hinge lockstile', '90°/90°'),
      meeting_double: role('JA061', 'Double hinge adaptor', '90°/90°',
        { note: 'Double hinge doors only — FINAL.xlsx lists it on the double sheet alone' }),
      frame_internal: role('AF2235', 'Big T — division', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
    },
  },

  fdt_swing: {
    label: 'FDT Swing Door',
    status: 'provisional',
    variants: [],
    roles: {
      frame_outer: role('AF2235', 'Big T — door frame', '45°/45°'),
      frame_opening: role('SP-LS', 'Swinglockstile — leaf stile / top rail', '45°/45°'),
      bottom_rail: role('SP007', 'Swing bottom division — leaf bottom rail', '45°/45°'),
      meeting: role('AF2376R', 'Swing brush adaptor', '90°/90°'),
      frame_internal: role('AF2235', 'Big T — division', '90°/90°'),
      bead: role('AF2158N', 'Flat beading', '45°/45°'),
    },
  },
}

// Working geometry group → recipe role. lib/pieces.js emits the groups;
// the recipe turns each one into a real catalogue part.
export const GROUP_ROLE = {
  frame_outer: 'frame_outer',
  frame_internal: 'frame_internal',
  frame_opening: 'frame_opening',
  trialco_frame: 'frame_outer',
  trialco_leaf: 'frame_opening',
  trialco_net: 'net_leaf',
  trialco_interlock: 'meeting',
}

export const recipeFor = (systemId) => FRAME_RECIPES[systemId] || null

// The variant a design has chosen for a recipe key, falling back to the
// recipe's own default so an untouched design still resolves.
export function variantValue(design, recipe, key) {
  const variant = (recipe?.variants || []).find(v => v.key === key)
  if (!variant) return null
  const chosen = design?.[key]
  return variant.options.some(o => o.value === chosen) ? chosen : variant.default
}

// → { code, member, cuts, provisional, note } or null when the system has
// no part in that role (a fixed window has no opening member).
export function resolveRole(design, roleKey) {
  const recipe = recipeFor(design?.system)
  const entry = recipe?.roles?.[roleKey]
  if (!entry) return null
  if (!entry.codeByVariant) return { ...entry, role: roleKey }
  // the variant whose options are this role's alternatives
  const options = Object.keys(entry.codeByVariant)
  const variant = (recipe.variants || []).find(v =>
    v.options.every(o => options.includes(o.value)))
  const chosen = variant ? variantValue(design, recipe, variant.key) : options[0]
  return { ...entry, role: roleKey, variantKey: variant?.key,
    code: entry.codeByVariant[chosen] || entry.codeByVariant[options[0]] }
}

// Which role a variant actually swaps, so the picker can show the part and
// price behind each option.
export function roleForVariant(systemId, variantKey) {
  const recipe = recipeFor(systemId)
  const variant = (recipe?.variants || []).find(v => v.key === variantKey)
  if (!variant) return null
  const options = variant.options.map(o => o.value)
  return Object.keys(recipe.roles).find(key => {
    const byVariant = recipe.roles[key].codeByVariant
    return byVariant && options.every(o => o in byVariant)
  }) || null
}

// The group a cut piece was extracted under → its catalogue part.
export function resolveGroup(design, group) {
  return resolveRole(design, GROUP_ROLE[group] || group)
}

// Every catalogue part a system can consume, for the material editor
// and for procurement's "what does this product use" question.
export function recipeParts(design) {
  const recipe = recipeFor(design?.system)
  if (!recipe) return []
  return Object.keys(recipe.roles)
    .map(key => resolveRole(design, key))
    .filter(Boolean)
}

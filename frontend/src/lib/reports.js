// Only documents with working generators belong on the Reports page.
// Project, item and job documents are presented separately by the page so a
// department sees the correct scope before downloading anything.

export const ITEM_REPORT_GROUPS = [
  {
    id:'technical',
    department:'Technical & Estimation',
    title:'Technical documents',
    sub:'Approved design information and internal costing for the selected item.',
    reports:[
      {
        name:'Elevation drawing',
        desc:'Dimensioned design drawing for technical review.',
        kinds:'elevation',
      },
      {
        name:'Internal BOQ & cost sheet',
        desc:'Materials, internal cost and price floor. Not for clients.',
        kinds:{ frame:'internal-boq', curtainwall:'internal-boq', frameless:'price-breakdown' },
      },
    ],
  },
  {
    id:'factory',
    department:'Production / Factory',
    title:'Factory documents',
    sub:'Documents the factory uses to cut, prepare and assemble the selected item.',
    reports:[
      {
        name:'Cutting list & optimization',
        desc:'Profile cuts, stock-bar nesting, kerf, offcut and waste.',
        kinds:{ frame:'cutting-list', curtainwall:'cutting-list' },
      },
      {
        name:'Glass order drawings',
        desc:'Panel sizes, holes, cutouts and preparation drawings.',
        kinds:{ frameless:'glass-order' },
      },
      {
        name:'Hardware list',
        desc:'Fittings and hardware required for the selected glass item.',
        kinds:{ frameless:'hardware-list' },
      },
      {
        name:'Factory work order',
        desc:'Production stages, item details and factory sign-off.',
        kinds:'work-order',
      },
    ],
  },
  {
    id:'site',
    department:'Installation',
    title:'Site document',
    sub:'Installation dimensions, hardware checks and handover notes.',
    reports:[
      {
        name:'Installation sheet',
        desc:'Panel layout, centreline dimensions, hardware checklist and comments.',
        kinds:{ frameless:'installation' },
      },
    ],
  },
]

export function reportKind(report, category) {
  const kinds = report.kinds
  if (!kinds) return null
  return typeof kinds === 'string' ? kinds : (kinds[category] || null)
}

export function availableReportGroups(category) {
  return ITEM_REPORT_GROUPS
    .map(group => ({
      ...group,
      reports:group.reports.filter(report => reportKind(report, category)),
    }))
    .filter(group => group.reports.length)
}

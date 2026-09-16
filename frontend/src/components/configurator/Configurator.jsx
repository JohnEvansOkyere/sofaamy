import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DesignCanvas from './DesignCanvas.jsx'
import FramelessCanvas from './FramelessCanvas.jsx'
import CurtainWallCanvas from './CurtainWallCanvas.jsx'
import GlassOrder from './GlassOrder.jsx'
import '../../styles/ops.css'

// 3D views are heavy (three.js) — loaded only when first opened
const Design3D = lazy(() => import('./Design3D.jsx'))
const Frameless3D = lazy(() => import('./Frameless3D.jsx'))
import { DESIGN_GROUPS, DIVIDER_LAYOUTS, MIN_SECTION_MM, templateById, buildDesign, resizeGrid, setLocalDivider, setSize, setSectionSize, moveDivider, designLayout } from '../../lib/designs.js'
import { FL_GROUPS, flTemplateById, buildFrameless } from '../../lib/frameless.js'
import { CW_GROUPS, cwTemplateById, buildCurtainWall } from '../../lib/curtainwall.js'
import { CATEGORIES, OPENINGS, OPENING_DESIGNS, openingDesignById, GLASS, FRAMES, FINISH_TYPES, FL_GLASS, FL_PANEL_TYPES, FL_FAB, FL_SYSTEMS, FL_SYSTEM_CHOICES, CW_CELL_TYPES } from '../../lib/products.js'
import { FRAME_SYSTEMS, FRAME_SYSTEM_ORDER, FRAME_PRODUCT_GROUPS, FRAME_GLASS_CATALOG, frameRateForRateKey, frameRateKeyForOpening, frameOpeningsForDesign, frameColoursForSystem } from '../../lib/frameCatalog.js'
import { recipeFor, variantValue, resolveRole, roleForVariant } from '../../lib/frameRecipes.js'
import { priceFor } from '../../lib/frameMaterials.js'
import { calcQuote, GHS } from '../../lib/pricing.js'
import { saveDesign, listDesigns, listProjects, createProject as createProjectApi, deleteProject, deleteDesign } from '../../lib/api.js'
import { useLiveRefresh } from '../../lib/live.js'
import { IconCube, IconCheck, IconPlus, IconLayers, IconCopy, IconTrash } from '../icons.jsx'
import './configurator.css'

// mini SVG preview of a framed template's grid
function Thumb({ cols, rows }) {
  const W = 46, H = 34, p = 3, gap = 1.5
  const cw = (W - p*2 - gap*(cols-1)) / cols
  const ch = (H - p*2 - gap*(rows-1)) / rows
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="1" y="1" width={W-2} height={H-2} rx="2" fill="#e7eef5" stroke="#9db3c6"/>
      {Array.from({ length: cols*rows }).map((_,i) => {
        const c = i % cols, r = Math.floor(i/cols)
        return <rect key={i} x={p+c*(cw+gap)} y={p+r*(ch+gap)} width={cw} height={ch} rx="1" fill="#cfe6f2"/>
      })}
    </svg>
  )
}

// mini preview of a frameless panel run (doors get a handle tick,
// over-panel shows as a top band over the leaf bays)
function FlThumb({ panels, overPanel }) {
  const W = 46, H = 34, p = 3, gap = 1.5
  const n = panels.length
  const pw = (W - p*2 - gap*(n-1)) / n
  const isLeaf = (t) => t === 'door' || t === 'hinged'
  const overTop = overPanel && panels.some(isLeaf)
  const bandH = overTop ? 7 : 0
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="1" y="1" width={W-2} height={H-2} rx="2" fill="#eef4f1" stroke="#8fb3a6"/>
      {panels.map((t, k) => {
        const x = p + k*(pw+gap)
        const top = isLeaf(t) && overTop ? p + bandH + 1.5 : p
        return (
          <g key={k}>
            <rect x={x} y={top} width={pw} height={H-p-top} rx="1" fill={t==='fixed' ? '#cfe6de' : '#bfe0d4'}/>
            {isLeaf(t) && <rect x={x+pw-3.5} y={H/2-4} width="2" height="8" rx="1" fill="#41695c"/>}
            {t === 'slider' && <path d={`M${x+2} ${H/2} L${x+pw-2} ${H/2} M${x+pw-4.5} ${H/2-2.5} L${x+pw-2} ${H/2} L${x+pw-4.5} ${H/2+2.5}`} stroke="#41695c" strokeWidth="1.2" fill="none"/>}
          </g>
        )
      })}
      {overTop && (() => {
        const first = panels.findIndex(isLeaf)
        let last = first
        panels.forEach((t, k) => { if (isLeaf(t)) last = k })
        const x0 = p + first*(pw+gap), x1 = p + last*(pw+gap) + pw
        return <rect x={x0} y={p} width={x1-x0} height={bandH} rx="1" fill="#a8cfc2"/>
      })()}
    </svg>
  )
}

// mini preview of a curtain wall grid (continuous mullions, spandrel rows)
function CwThumb({ cols, rows, spandrelRows = [] }) {
  const W = 46, H = 34, p = 3
  const cw = (W - p*2) / cols, ch = (H - p*2) / rows
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="1" y="1" width={W-2} height={H-2} rx="2" fill="#f0ecf5" stroke="#a894c0"/>
      {Array.from({ length: cols*rows }).map((_,i) => {
        const c = i % cols, r = Math.floor(i/cols)
        return <rect key={i} x={p+c*cw+1} y={p+r*ch+1} width={cw-2} height={ch-2}
          fill={spandrelRows.includes(r) ? '#4d5a66' : '#c9d9ec'}/>
      })}
      {Array.from({ length: cols+1 }).map((_,c) =>
        <line key={c} x1={p+c*cw} y1={p-1.5} x2={p+c*cw} y2={H-p+1.5} stroke="#7d6a94" strokeWidth="1.6"/>)}
    </svg>
  )
}

// category-aware thumbnail for a saved design
function SavedThumb({ d }) {
  if (d.category === 'frameless')
    return <FlThumb panels={(d.cells || []).map(c => c.type || 'fixed')} overPanel={d.overPanel}/>
  if (d.category === 'curtainwall') {
    const sp = []
    ;(d.cells || []).forEach((c, i) => {
      if (c.type === 'spandrel') { const r = Math.floor(i / d.cols); if (!sp.includes(r)) sp.push(r) }
    })
    return <CwThumb cols={d.cols} rows={d.rows} spandrelRows={sp}/>
  }
  return <Thumb cols={d.cols} rows={d.rows}/>
}

// mini glyph for an openable design (casement V, sliding arrows, panels)
function OpeningThumb({ opening, panels }) {
  const W = 46, H = 34, p = 3
  const pw = (W - p*2) / panels
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x="1" y="1" width={W-2} height={H-2} rx="2" fill="#e7eef5" stroke="#9db3c6"/>
      {Array.from({ length: panels }).map((_, k) => {
        const x = p + k*pw
        return (
          <g key={k}>
            <rect x={x+1} y={p} width={pw-2} height={H-p*2} fill="#cfe6f2" stroke="#9db3c6" strokeWidth="0.8"/>
            {opening === 'casement' && <path d={`M${x+pw-3} ${p+2} L${x+3} ${H/2} L${x+pw-3} ${H-p-2}`} fill="none" stroke="#5a7891" strokeWidth="1" strokeDasharray="2.5 2"/>}
            {opening === 'awning' && <path d={`M${x+3} ${H-p-2} L${x+pw/2} ${p+2} L${x+pw-3} ${H-p-2}`} fill="none" stroke="#5a7891" strokeWidth="1" strokeDasharray="2.5 2"/>}
            {opening === 'sliding' && <path d={k%2===0 ? `M${x+5} ${H/2} L${x+pw-5} ${H/2} M${x+pw-8} ${H/2-3} L${x+pw-5} ${H/2} L${x+pw-8} ${H/2+3}` : `M${x+pw-5} ${H/2} L${x+5} ${H/2} M${x+8} ${H/2-3} L${x+5} ${H/2} L${x+8} ${H/2+3}`} fill="none" stroke="#5a7891" strokeWidth="1.2"/>}
            {opening === 'louvre' && [10,16,22].map(y => <line key={y} x1={x+4} y1={y} x2={x+pw-4} y2={y+2} stroke="#5a7891" strokeWidth="1.4"/>)}
            {opening === 'pivot' && <line x1={x+pw/2} y1={p+2} x2={x+pw/2} y2={H-p-2} stroke="#5a7891" strokeWidth="1" strokeDasharray="3 2"/>}
            {(opening === 'single' || opening === 'double') && <rect x={k%2===0 ? x+pw-6 : x+3} y={H/2-4} width="2.5" height="8" rx="1" fill="#5a7891"/>}
          </g>
        )
      })}
    </svg>
  )
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div className="flex between items-center" style={{ marginBottom:10 }}>
      <span style={{ fontSize:12.5, fontWeight:600, color:'var(--ink-2)' }}>{label}</span>
      <div className="stepper">
        <button disabled={value<=min} onClick={() => onChange(value-1)}>−</button>
        <span>{value}</span>
        <button disabled={value>=max} onClick={() => onChange(value+1)}>+</button>
      </div>
    </div>
  )
}

function sectionDimensionMax(design, axis, index) {
  const sizes = axis === 'col' ? design.colWidths : design.rowHeights
  if (sizes.length <= 1) return sizes[0]
  const neighbour = index < sizes.length - 1 ? index + 1 : index - 1
  return sizes[index] + sizes[neighbour] - MIN_SECTION_MM
}

function SectionDimensionInput({ value, max, disabled, onCommit }) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const entered = Number(draft)
    if (!Number.isFinite(entered) || entered <= 0) {
      setDraft(String(value))
      return
    }
    const next = Math.round(
      Math.min(max, Math.max(MIN_SECTION_MM, entered)))
    setDraft(String(next))
    onCommit(next)
  }

  return (
    <input
      type="number"
      min={MIN_SECTION_MM}
      max={max}
      value={draft}
      disabled={disabled}
      onFocus={event => event.currentTarget.select()}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

// Resize camera originals in the browser before persisting them with the
// JSON-backed project record. This keeps site evidence useful without making
// each save unnecessarily heavy.
function fileToSiteImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error(`${file.name} is not an image`)); return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error(`Could not prepare ${file.name}`))
      image.onload = () => {
        const max = 1600
        const scale = Math.min(1, max / image.width, max / image.height)
        const width = Math.max(1, Math.round(image.width * scale))
        const height = Math.max(1, Math.round(image.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height)
        ctx.drawImage(image, 0, 0, width, height)
        resolve({
          id:`site-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name:file.name, type:'image/jpeg', dataUrl:canvas.toDataURL('image/jpeg', 0.82),
          caption:'', width, height, createdAt:new Date().toISOString(),
        })
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

// ── category plumbing ──
const LIBS = { frame: FRAME_PRODUCT_GROUPS, frameless: FL_GROUPS, curtainwall: CW_GROUPS }

// Door / Window split inside a category: when a category carries both (e.g.
// Sliding Systems), the user picks Windows or Doors first and then sees every
// design of that kind — across all systems.
const kindOfTemplate = (t) => /\bdoor/i.test(t.name || '') ? 'Doors' : /\bwindow/i.test(t.name || '') ? 'Windows' : null
const groupKinds = (g) => {
  if (!g) return null
  const present = ['Windows', 'Doors'].filter(k => g.items.some(t => kindOfTemplate(t) === k))
  if (present.length < 2) return null
  if (g.items.some(t => !kindOfTemplate(t))) present.push('Other designs')
  return present
}
const itemsOfKind = (g, kind) => g.items.filter(t => (kindOfTemplate(t) || 'Other designs') === kind)

// family glyphs for the library drill-down (A3 — icon-first navigation)
function CatGlyph({ cat }) {
  const accent = CATEGORIES[cat]?.accent || '#1a5276'
  if (cat === 'frameless') return (
    <svg width="34" height="30" viewBox="0 0 34 30">
      <rect x="3" y="3" width="12" height="24" rx="1" fill={accent} opacity=".25"/>
      <rect x="19" y="3" width="12" height="24" rx="1" fill={accent} opacity=".4"/>
      <rect x="27" y="12" width="2" height="7" rx="1" fill={accent}/>
    </svg>)
  if (cat === 'curtainwall') return (
    <svg width="34" height="30" viewBox="0 0 34 30">
      <rect x="2" y="2" width="30" height="26" rx="1" fill={accent} opacity=".18"/>
      {[10, 18, 26].map(x => <rect key={x} x={x} y="2" width="2" height="26" fill={accent}/>)}
      <rect x="2" y="13" width="30" height="2" fill={accent} opacity=".6"/>
    </svg>)
  return (
    <svg width="34" height="30" viewBox="0 0 34 30">
      <rect x="2" y="2" width="30" height="26" rx="2" fill="none" stroke={accent} strokeWidth="3"/>
      <rect x="15.5" y="4" width="3" height="22" fill={accent}/>
    </svg>)
}

// glyphs for the panel's vertical tool rail (library / dividers / openings)
function ToolGlyph({ k }) {
  const s = { width:17, height:17, viewBox:'0 0 16 16' }
  if (k === 'dividers') return (
    <svg {...s} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.5"/>
      <line x1="8" y1="1.8" x2="8" y2="14.2"/><line x1="1.8" y1="8" x2="14.2" y2="8"/>
    </svg>)
  if (k === 'openings') return (
    <svg {...s} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.8" y="1.8" width="12.4" height="12.4" rx="1.5"/>
      <path d="M12.6 3.4 4 8l8.6 4.6" strokeDasharray="2.4 1.8"/>
    </svg>)
  if (k === 'measure') return (
    <svg {...s} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.6 10.2 10.2 1.6l4.2 4.2L5.8 14.4z"/>
      <path d="M4.6 7.2v1.8M6.8 5v1.8M9 2.8v1.8"/>
    </svg>)
  if (k === 'pieces') return (
    <svg {...s} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 4.2h12M2 8h8M2 11.8h5"/>
      <circle cx="12.6" cy="11.4" r="2.2"/>
    </svg>)
  if (k === 'materials') return (
    <svg {...s} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.7 14.3 5 8 8.3 1.7 5z"/>
      <path d="M1.7 8 8 11.3 14.3 8M1.7 11 8 14.3 14.3 11"/>
    </svg>)
  return (
    <svg {...s}>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".9"/>
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".5"/>
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".5"/>
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".28"/>
    </svg>)
}

// which library group holds the open design (drill straight to its designs)
function groupForDesign(d) {
  const groups = LIBS[d.category || 'frame'] || []
  for (const g of groups) if (g.items.some(t => t.id === d.templateId)) return g.group
  if ((d.category || 'frame') === 'frame' && FRAME_SYSTEMS[d.system]?.productTypes.length)
    for (const g of groups) if (g.items.some(t => t.system === d.system)) return g.group
  return null
}
const CUT_PROFILE_OPTIONS = [
  ['frame_outer', 'Outer frame member'],
  ['frame_internal', 'Internal member'],
  ['frame_opening', 'Opening / leaf member'],
]

const frameProductById = (id) => {
  for (const g of FRAME_PRODUCT_GROUPS) {
    const item = g.items.find(i => i.id === id)
    if (item) return { ...item, group:g.group }
  }
  return null
}

const anyTemplateById = (id) => {
  if (id.startsWith('fl-')) { const t = flTemplateById(id); return t && { cat:'frameless', t } }
  if (id.startsWith('cw-')) { const t = cwTemplateById(id); return t && { cat:'curtainwall', t } }
  const t = frameProductById(id) || templateById(id); return t && { cat:'frame', t }
}
const buildFor = (cat, t) =>
  cat === 'frameless' ? buildFrameless(t) : cat === 'curtainwall' ? buildCurtainWall(t) : buildDesign(t)

const designIssues = (d) => {
  if (!d) return ['Choose a product design']
  const issues = []
  if (!String(d.ref || '').trim()) issues.push('Give the item a label/reference')
  if (!(Number(d.width) > 0) || !(Number(d.height) > 0)) issues.push('Enter valid width and height')
  if (d.category === 'frame') {
    const expected = Number(d.cols || 0) * Number(d.rows || 0)
    if (!expected || d.cells?.length !== expected) issues.push('Complete every frame section')
    const allowed = frameOpeningsForDesign(d)
    const invalid = allowed && (d.cells || []).find(cell => !allowed.includes(cell.opening))
    if (invalid) issues.push(`${OPENINGS[invalid.opening]?.label || invalid.opening} is not valid for this system`)
  }
  return issues
}

const itemKind = item => /door/i.test(item?.name || item?.design?.name || '')
  ? 'Door' : /window/i.test(item?.name || item?.design?.name || '') ? 'Window' : 'Item'

const withAutoColour = (d) => d.customFrameColor
  ? { ...d, colourDescription:d.colourDescription || `Custom colour (${d.customFrameColor})` }
  : FRAMES[d.frame] ? { ...d, colourDescription:FRAMES[d.frame].label }
  : d

// ── CATALOGUE — every Sofaamy design on one page ──────────────────────
// A spacious grid narrowed by search and family chips, rather than a cramped
// panel you drill through. Each card carries the drawing, the design name and
// its product family, with one action.
function CatalogueGrid({ onSelect }) {
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('all')

  const all = useMemo(() => Object.entries(LIBS).flatMap(([cat, groups]) =>
    (groups || []).flatMap(group =>
      (group.items || []).map(t => ({ cat, group:group.group, t })))), [])

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    return all.filter(row =>
      (family === 'all' || row.cat === family) &&
      (!term || `${row.t.name} ${row.group}`.toLowerCase().includes(term)))
  }, [all, family, query])

  return <div className="catalogue">
    <div className="catalogue-bar">
      <div className="catalogue-chips">
        <button className={family === 'all' ? 'on' : ''} onClick={() => setFamily('all')}>
          All <span>{all.length}</span>
        </button>
        {Object.entries(CATEGORIES).map(([key, category]) => (
          <button key={key} className={family === key ? 'on' : ''} onClick={() => setFamily(key)}>
            {category.label} <span>{all.filter(row => row.cat === key).length}</span>
          </button>
        ))}
      </div>
      <input className="register-search" value={query} placeholder="Search designs…"
        onChange={event => setQuery(event.target.value)}/>
    </div>

    <div className="catalogue-grid">
      {shown.map(row => (
        <article key={`${row.cat}-${row.t.id}`} className="catalogue-card">
          <div className="catalogue-thumb"><LibThumb cat={row.cat} t={row.t}/></div>
          <div className="catalogue-meta">
            <b>{row.t.name}</b>
            <small>{CATEGORIES[row.cat]?.label} · {row.group}</small>
          </div>
          <button onClick={() => onSelect(row.t.id)}>Select design</button>
        </article>
      ))}
      {!shown.length && <div className="catalogue-empty">
        No design matches “{query}”. Clear the search or pick another family.
      </div>}
    </div>
  </div>
}

const LibThumb = ({ cat, t }) =>
  cat === 'frameless' ? <FlThumb panels={t.panels} overPanel={t.overPanel}/>
  : cat === 'curtainwall' ? <CwThumb cols={t.cols} rows={t.rows} spandrelRows={t.spandrelRows}/>
  : <Thumb cols={t.cols} rows={t.rows}/>

// `projectId` is passed when the configurator is mounted as the Design area of
// a project workspace; standalone it falls back to the ?project= query param.
// `embedded` drops the project-browser chrome (title, stepper, create/delete,
// cross-links) because the workspace header already carries all of that.
export default function Configurator({ projectId = null, embedded = false }) {
  const [searchParams] = useSearchParams()
  const [design, setDesign] = useState(null)   // null = empty slate
  const [cat, setCat] = useState(null)         // category chosen on the slate
  const [selected, setSelected] = useState(null)
  const [client, setClient] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState(null)
  const [tool, setTool] = useState('library')  // active panel tool: library | dividers | openings | measure | pieces
  const [editIdent, setEditIdent] = useState(false) // design card: ref / qty / location
  const [extraMaterial, setExtraMaterial] = useState({ code:'', name:'', qty:'', unitPrice:'' })
  const [addPath, setAddPath] = useState({ group:null, kind:null }) // category (+ windows/doors) the quick-add popover is scoped to
  const [libShowAll, setLibShowAll] = useState(false) // lift the system scope on the shapes library
  const [libPath, setLibPath] = useState({ cat:null, group:null, kind:null }) // drill-down position: family → category → (windows/doors) → designs
  const [showAddItem, setShowAddItem] = useState(false) // quick-add popover on the item rail
  const [view, setView] = useState('2d')       // 2d | 3d
  const [wall, setWall] = useState(false)      // 3d wall view
  const [showNew, setShowNew] = useState(false)
  const [projectHomeId, setProjectHomeId] = useState(
    projectId || searchParams.get('project') || null)
  const [projectBrowse, setProjectBrowse] = useState('all')
  const [designTab, setDesignTab] = useState('project') // embedded Design area: project | catalog
  const [openItemGroup, setOpenItemGroup] = useState(null) // product group expanded in the project detail
  useEffect(() => { setOpenItemGroup(null) }, [projectHomeId])
  const [clientHomeName, setClientHomeName] = useState(null)
  const [showLib, setShowLib] = useState(true)     // left design-tools panel
  const [showProps, setShowProps] = useState(false) // contextual overlay, opened by a canvas selection
  const [pan, setPan] = useState({ x:0, y:0 })
  const [focusMode, setFocusMode] = useState(false)
  const undoStack = useRef([])
  const designRef = useRef(null)
  const [newForm, setNewForm] = useState({ qty:1, location:'', clientName:'', projectId:'', projectName:'', cat:'frame', templateId:'trialco-sliding-window' })
  const [customPiece, setCustomPiece] = useState({ position:'', profile:'frame_outer', sourceMm:'', adjustmentMm:0, qty:1, cuts:'90°/90°', note:'' })
  const [siteImageBusy, setSiteImageBusy] = useState(false)
  useEffect(() => { designRef.current = design }, [design])
  // A3: whenever an item opens, focus the library on that item's
  // family → category → designs; the user can still drill back up freely
  const focusLibraryOn = (d) => {
    const group = d ? groupForDesign(d) : null
    const g = group ? (LIBS[d.category || 'frame'] || []).find(x => x.group === group) : null
    const kind = groupKinds(g) ? (kindOfTemplate(d) || 'Other designs') : null
    setLibPath(d ? { cat:d.category || 'frame', group, kind } : { cat:null, group:null, kind:null })
    setLibShowAll(false)
    setTool('library')
  }
  useEffect(() => {
    if (!focusMode) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setFocusMode(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusMode])
  // library + hints follow the user's explicit pick; falls back to the
  // open design's family (load()/openSaved() keep `cat` in sync)
  const activeCat = cat || design?.category
  const cloneDesign = (value) => value ? JSON.parse(JSON.stringify(value)) : value
  const rememberUndo = () => {
    if (!designRef.current) return
    undoStack.current = [...undoStack.current, cloneDesign(designRef.current)].slice(-50)
  }
  const commitDesign = (updater) => {
    const current = designRef.current
    if (!current) return
    const next = typeof updater === 'function' ? updater(current) : updater
    if (!next || next === current) return
    rememberUndo()
    designRef.current = next
    setDesign(next)
  }
  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) return
    designRef.current = previous
    setDesign(previous)
    setCat(previous.category)
    setSelected(current => Math.min(current ?? 0, Math.max(0, (previous.cells?.length || 1) - 1)))
    fire('↶ Last change undone')
  }
  const load = (fcat, t, extra = {}) => {
    const d = withAutoColour({ ...buildFor(fcat, t), ...extra })
    if (designRef.current) rememberUndo()
    designRef.current = d
    setDesign(d); setCat(fcat); setSelected(0); setView('2d'); setPan({ x:0, y:0 })
    focusLibraryOn(d)
  }
  const newDesign = () => {
    setNewForm(f => ({ ...f, projectId:activeProject?.id || f.projectId, projectName:'', clientName:activeProject?.client_name || client }))
    setShowNew(true)
  }

  const createProject = async () => {
    const m = anyTemplateById(newForm.templateId)
    if (!m) return
    try {
      let project = projects.find(p => String(p.id) === String(newForm.projectId))
      if (!project) {
        if (!newForm.projectName.trim()) { fire('Enter a project name or select an existing project'); return }
        const productFamily = m.t.id === 'fl-balust'
          ? 'balustrade'
          : m.cat === 'curtainwall' ? 'other' : m.cat
        project = await createProjectApi({
          name:newForm.projectName.trim(), client_name:newForm.clientName,
          location:newForm.location, product_family:productFamily,
        })
      }
      const refBase = (project.name || m.t.name || 'DESIGN').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'DESIGN'
      const ref = `${refBase}-${Date.now().toString(36).slice(-5).toUpperCase()}`
      load(m.cat, m.t, { ref, qty:Math.max(1, +newForm.qty || 1), location:newForm.location || project.location, projectId:project.id })
      setClient(project.client_name || newForm.clientName || '')
      setShowNew(false)
      refreshSaved()
    } catch (e) { apiFail(e) }
  }

  // drop an openable design (EvA: drag "Double Door" into F2) onto a section — frame only
  const applyOpening = (od, idx) => {
    if (od == null || idx == null || !design || design.category !== 'frame') return
    if (allowedOpenings && !allowedOpenings.includes(od.opening)) {
      fire(`${od.label} is not available on ${FRAME_SYSTEMS[design.system]?.label || 'this system'}`); return
    }
    commitDesign(d => ({ ...d, cells: d.cells.map((c, i) =>
      i === idx ? { ...c, opening: od.opening, panels: od.panels,
        rateKey: frameRateKeyForOpening(od.opening),
        ratePerM2: frameRateForRateKey(frameRateKeyForOpening(od.opening)) } : c) }))
    setSelected(idx)
    setShowProps(true)
    fire(`${od.label} → section F${idx + 1}`)
  }

  const selectDesignPart = (index) => {
    setSelected(index)
    setShowProps(index != null)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const data = e.dataTransfer.getData('text')
    if (data.startsWith('divider:')) {
      if (!design) { fire('Load a design before dropping a divider layout'); return }
      const layout = DIVIDER_LAYOUTS.find(item => item.id === data.slice('divider:'.length))
      if (layout) {
        applyDividerLayout(layout)
      }
      return
    }
    if (data.startsWith('o:')) {
      if (!design || design.category !== 'frame') return
      if (view !== '2d') { fire('Switch to 2D view to edit sections'); return }
      const canvas = wrapRef.current?.querySelector('canvas')
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      const idx = designLayout(design, dims.w, dims.h).cellAt(e.clientX - r.left - pan.x, e.clientY - r.top - pan.y)
      applyOpening(openingDesignById(data.slice(2)), idx)
      return
    }
    const templateId = data.startsWith('shape:') ? data.slice('shape:'.length) : data
    const m = anyTemplateById(templateId)
    if (!m) return
    // Picking a design while a project is open adds it to that project (like
    // "+ Add item") instead of load()'s bare, project-less design — dropping
    // a shape mid-job must never feel like starting a new project.
    if (activeProject) quickAddItem(m.t.id)
    else load(m.cat, m.t)
  }

  const applyDividerLayout = (layout) => {
    if (!design) return
    if (selected != null && design.category === 'frame') {
      commitDesign(d => setLocalDivider(d, selected, layout.cols, layout.rows))
      fire(`${layout.label} divider applied to section F${selected + 1}`)
    } else {
      setGrid(layout.cols, layout.rows)
      setSelected(0)
      fire(`${layout.label} divider layout applied to the full frame`)
    }
  }

  const patch = (u) => commitDesign(d => {
    const next = { ...d, ...u }
    if (Object.prototype.hasOwnProperty.call(u, 'frame') && FRAMES[u.frame]) {
      next.colourDescription = FRAMES[u.frame].label
    }
    if (Object.prototype.hasOwnProperty.call(u, 'customFrameColor') && u.customFrameColor) {
      next.colourDescription = `Custom colour (${u.customFrameColor})`
    }
    return next
  })
  const updateCustomPiece = (index, changes) => commitDesign(d => ({
    ...d, customCutPieces:(d.customCutPieces || []).map((piece, i) => i === index ? { ...piece, ...changes } : piece),
  }))
  const removeCustomPiece = (index) => commitDesign(d => ({
    ...d, customCutPieces:(d.customCutPieces || []).filter((_, i) => i !== index),
  }))

  // Material take-off corrections that apply to THIS item only. A price every
  // job should use belongs in Inventory, not here.
  const overrideAccessory = (row, changes) => commitDesign(d => {
    const list = d.accessoryOverrides || []
    const key = row.code || `custom:${row.name}`
    const existing = list.find(o => (o.code || `custom:${o.name}`) === key) || {}
    const next = { code:row.code, name:row.name, unit:row.unit,
      qty:row.qty, unitPrice:row.unitPrice, ...existing, ...changes }
    if (next.qty !== undefined && next.qty !== '') next.qty = Number(next.qty)
    if (next.unitPrice !== undefined && next.unitPrice !== '') next.unitPrice = Number(next.unitPrice)
    return { ...d, accessoryOverrides:[
      ...list.filter(o => (o.code || `custom:${o.name}`) !== key), next] }
  })

  const addExtraMaterial = () => {
    const code = extraMaterial.code.trim().toUpperCase()
    if (!code) return
    commitDesign(d => ({ ...d, accessoryOverrides:[
      ...(d.accessoryOverrides || []).filter(o => o.code !== code),
      { code, name:extraMaterial.name.trim() || code, custom:true, unit:'pcs',
        qty:Number(extraMaterial.qty) || 1, unitPrice:Number(extraMaterial.unitPrice) || 0 }] }))
    setExtraMaterial({ code:'', name:'', qty:'', unitPrice:'' })
    fire(`✓ ${code} added to this item`)
  }
  const addCustomPiece = () => {
    const sourceMm = Math.max(0, Number(customPiece.sourceMm || 0))
    if (!customPiece.position.trim() || !sourceMm) {
      fire('Enter a piece position and input measurement first'); return
    }
    commitDesign(d => ({ ...d, customCutPieces:[...(d.customCutPieces || []), {
      ...customPiece, position:customPiece.position.trim(), sourceMm,
      adjustmentMm:Number(customPiece.adjustmentMm || 0), qty:Math.max(1, Number(customPiece.qty || 1)),
    }] }))
    setCustomPiece({ position:'', profile:'frame_outer', sourceMm:'', adjustmentMm:0, qty:1, cuts:'90°/90°', note:'' })
    fire('Fabrication piece added to the production breakdown')
  }
  const updateSiteImage = (id, changes) => commitDesign(d => ({
    ...d, siteImages:(d.siteImages || []).map(image => image.id === id ? { ...image, ...changes } : image),
  }))
  const removeSiteImage = (id) => commitDesign(d => ({
    ...d, siteImages:(d.siteImages || []).filter(image => image.id !== id),
  }))
  const onSiteImages = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const existing = design?.siteImages || []
    const remaining = Math.max(0, 12 - existing.length)
    if (!remaining) { fire('Maximum 12 site images per project'); return }
    setSiteImageBusy(true)
    try {
      const prepared = await Promise.all(files.slice(0, remaining).map(fileToSiteImage))
      commitDesign(d => ({ ...d, siteImages:[...(d.siteImages || []), ...prepared] }))
      fire(`${prepared.length} site image${prepared.length === 1 ? '' : 's'} added — save the project to keep them`)
    } catch (err) {
      console.error(err); fire(err.message || 'Could not add site image')
    } finally { setSiteImageBusy(false) }
  }
  const setDim = (k, v) => commitDesign(d => setSize(d, k, v))
  const setGrid = (cols, rows) => commitDesign(d => resizeGrid(d, cols, rows))
  const onDividerMove = (axis, boundary, deltaMm) => commitDesign(d => moveDivider(d, axis, boundary, deltaMm))
  const setSectionDim = (axis, index, mm) => commitDesign(d => setSectionSize(d, axis, index, mm))
  const setCell = (k, v) => commitDesign(d => {
    const cells = d.cells.map((c,i) => {
      if (i !== selected) return c
      if (k === 'opening') {
        const rateKey = frameRateKeyForOpening(v)
        return { ...c, opening:v, rateKey, ratePerM2:frameRateForRateKey(rateKey) }
      }
      return { ...c, [k]:v }
    }); return { ...d, cells }
  })
  const applyAll = (k, v) => commitDesign(d => ({ ...d, cells: d.cells.map(c => ({ ...c, [k]:v })) }))

  // frameless: change panel count, keeping existing panel types
  const setPanelCount = (n) => commitDesign(d => {
    const cells = Array.from({ length: n }, (_, i) =>
      d.cells[i] ? { ...d.cells[i] } : { type:'fixed', glass:'clear', opening:'fixed', panels:1 })
    const base = Math.floor(d.width / n)
    const colWidths = Array.from({ length: n }, (_, i) => i < n - 1 ? base : d.width - base * (n - 1))
    return { ...d, cols:n, cells, colWidths }
  })

  const quote = useMemo(() => design && calcQuote(design), [design])
  const sel   = design && selected != null ? design.cells[selected] : null

  // A1 (demo-1 feedback): scope every choice to what the design's system
  // supports — a Trialco sliding project never offers casement anywhere.
  const allowedOpenings = design?.category === 'frame' ? frameOpeningsForDesign(design) : null
  const openingAllowed = (o) => !allowedOpenings || allowedOpenings.includes(o)
  const scopedOpeningDesigns = allowedOpenings
    ? OPENING_DESIGNS.map(g => ({ ...g, items:g.items.filter(od => openingAllowed(od.opening)) })).filter(g => g.items.length)
    : OPENING_DESIGNS
  const libScopeSystem = activeCat === 'frame' && design && FRAME_SYSTEMS[design.system]?.productTypes.length
    ? design.system : null
  const frameCatalog = design?.category === 'frame'
    ? (FRAME_SYSTEMS[design.system] || FRAME_SYSTEMS.legacy)
    : null
  // only the colours this system is stocked in; a design saved on an older
  // colour keeps showing it so nothing silently changes underneath
  const systemColours = useMemo(() => {
    const stocked = frameColoursForSystem(design?.system) || Object.keys(FRAMES).filter(k => !FRAMES[k].legacy)
    return stocked.includes(design?.frame) || !design?.frame
      ? stocked : [...stocked, design.frame]
  }, [design?.system, design?.frame])
  // real alternatives inside one system (frame with or without cover, and the
  // fixed window's outer section) — a genuine choice, so it is asked
  const systemVariants = design?.category === 'frame'
    ? (recipeFor(design.system)?.variants || []) : []

  const wrapRef = useRef(null)
  const [dims, setDims] = useState({ w: 720, h: 480 })
  // re-attach when the workspace mounts — on first render the Projects home
  // is up and wrapRef is null, so observing only on mount never measures
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({
      w: Math.max(320, e.contentRect.width - 20),
      h: Math.max(480, e.contentRect.height - 20),
    }))
    ro.observe(el); return () => ro.disconnect()
  }, [!!design])
  const fire = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  const apiFail = (e) => {
    console.error(e)
    const detail = String(e?.message || e || '').replace(/^API \d+: /, '')
    fire(detail ? `⚠️ API request failed — ${detail}` : '⚠️ Cannot reach the API — confirm it is running on 127.0.0.1:8000')
  }
  const onSaveDesign = async () => {
    const issues = designIssues(design)
    if (issues.length) { fire(`⚠️ ${issues[0]}`); return }
    try {
      const r = await saveDesign(client, design)
      setDesign(d => ({ ...d, savedItemId:r.id, projectId:r.project_id || d.projectId || null }))
      refreshSaved()
      fire(r.quote_number
        ? `💾 Measurements saved · draft ${r.quote_number} updated automatically`
        : `💾 Item "${r.ref || r.name}" saved — find it in Projects`)
    } catch (e) { apiFail(e) }
  }
  const [saved, setSaved] = useState([])
  const [projects, setProjects] = useState([])
  const deepLinkedItemOpened = useRef(false)
  // With a design open its own project wins; on the project/Design screen with
  // nothing open yet, the project being viewed is the active one — otherwise
  // adding the first item from the catalogue has no project to attach to.
  const activeProject = projects.find(p =>
    String(p.id) === String(design ? design.projectId : projectHomeId))
  const projectItems = activeProject?.items || []
  const refreshSaved = () => Promise.all([listDesigns(), listProjects()])
    .then(([designs, projectRows]) => {
      setSaved(designs); setProjects(projectRows)
      const itemId = searchParams.get('item')
      const target = itemId && designs.find(item => String(item.id) === String(itemId))
      if (target && !deepLinkedItemOpened.current) {
        deepLinkedItemOpened.current = true
        setProjectHomeId(null)
        openSaved(target)
      }
    })
    .catch(() => {})
  useEffect(() => { refreshSaved() }, [])
  useLiveRefresh(refreshSaved)
  const copyShareLink = async (s, e) => {
    e?.stopPropagation()
    if (!s.share_token) { fire('No shareable link for this item yet'); return }
    const url = `${window.location.origin}/share/${s.share_token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this link:', url)
      return
    }
    fire('Client share link copied')
  }
  const openSaved = (s) => {
    const next = withAutoColour({ ...s.design, ref:s.ref, qty:s.qty, location:s.location, projectId:s.project_id || null, savedItemId:s.id })
    undoStack.current = []
    designRef.current = next
    setDesign(next)
    setClient(s.client_name || '')
    setCat(s.design.category || 'frame')
    setSelected(0); setView('2d'); setPan({ x:0, y:0 })
    focusLibraryOn(next)
    fire(`Opened saved design "${s.ref || s.name}"`)
  }
  // Clicking a product group in the project view jumps straight into editing
  // — the group already IS the project's items for that product, reachable
  // from inside the editor via the item rail, so there is no separate
  // "expand, then Open item" step for the common case of just getting to work.
  const openGroupFirstItem = (g) => {
    const item = g.items.find(x => x.saved)
    if (!item) { fire('This item has not finished loading — try again in a moment'); return }
    setProjectHomeId(null)
    openSaved(item.saved)
  }
  // Duplicate = one more item in the SAME project, carrying the original's
  // configuration. It is saved straight away so it exists as its own project
  // item (a second sliding window, different sizes), then opened for editing.
  const duplicateSaved = async (s, e) => {
    e?.stopPropagation()
    const baseRef = (s.ref || s.name || 'DESIGN').replace(/-[A-Z0-9]{5}$/i, '').replace(/-COPY$/i, '')
    const copyRef = `${baseRef}-${Date.now().toString(36).slice(-5).toUpperCase()}`
    const copy = withAutoColour({ ...s.design, ref:copyRef, qty:s.qty, location:s.location, projectId:s.project_id || null, savedItemId:null })
    try {
      const r = await saveDesign(s.client_name || client, copy)
      const next = { ...copy, savedItemId:r.id, projectId:r.project_id || copy.projectId }
      undoStack.current = []
      designRef.current = next
      setDesign(next)
      setClient(s.client_name || '')
      setCat(s.design.category || 'frame')
      setSelected(0); setView('2d'); setPan({ x:0, y:0 })
      focusLibraryOn(next)
      refreshSaved()
      fire(`Copied "${s.ref || s.name}" into this project as "${copyRef}" — edit its measurements and save`)
    } catch (err) { apiFail(err) }
  }

  // A2 (demo-1 feedback): all of a project's windows/doors live inside the
  // one open configurator. Switching items auto-saves the current one first,
  // so a 22-window job is measured item by item without leaving the canvas.
  const switchToItem = async (item) => {
    if (design?.savedItemId && String(design.savedItemId) === String(item.id)) return
    const target = saved.find(s => String(s.id) === String(item.id))
    if (!target) { fire('This item has not finished loading — try again in a moment'); return }
    const issues = designIssues(designRef.current)
    if (issues.length) { fire(`⚠️ Finish this item before switching — ${issues[0]}`); return }
    try {
      if (designRef.current) await saveDesign(client, designRef.current)
    } catch (e) { apiFail(e); return }
    openSaved(target)
    refreshSaved()
  }

  // Adds the next window/door to the SAME open project — no modal, no
  // Duplicate & Edit. Current edits are saved before the new item opens.
  const quickAddItem = async (templateId) => {
    const m = anyTemplateById(templateId)
    const project = activeProject
    if (!m || !project) { setShowAddItem(false); newDesign(); return }
    // only guard an item that is actually open — with nothing on the canvas
    // this would otherwise block adding the project's first item
    const issues = designRef.current ? designIssues(designRef.current) : []
    if (issues.length) { fire(`⚠️ Finish this item before adding another — ${issues[0]}`); return }
    try {
      if (designRef.current) await saveDesign(client, designRef.current)
      const refBase = (project.name || m.t.name || 'DESIGN').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase().slice(0, 24) || 'DESIGN'
      const ref = `${refBase}-${Date.now().toString(36).slice(-5).toUpperCase()}`
      const d = withAutoColour({ ...buildFor(m.cat, m.t), ref, qty:1, location:project.location || '', projectId:project.id })
      const r = await saveDesign(project.client_name || client, d)
      const next = { ...d, savedItemId:r.id, projectId:r.project_id || d.projectId }
      undoStack.current = []
      designRef.current = next
      setDesign(next); setCat(m.cat); setSelected(0); setView('2d'); setPan({ x:0, y:0 })
      setShowAddItem(false)
      focusLibraryOn(next)
      refreshSaved()
      fire(`${m.t.name} added as item ${projectItems.length + 1} — set its measurements`)
    } catch (e) { apiFail(e) }
  }

  const removeSaved = async (s, e) => {
    e?.stopPropagation()
    if (!window.confirm(`Delete item "${s.ref || s.name}" from this project? This cannot be undone.`)) return
    try {
      await deleteDesign(s.id)
      await refreshSaved()
      fire(`Item "${s.ref || s.name}" deleted`)
    } catch (err) { apiFail(err) }
  }

  const removeProject = async (p) => {
    const itemCount = Number(p.item_count || 0)
    if (!window.confirm(
      `Delete project "${p.name}" (${p.project_number})?\n\n` +
      `${itemCount} technical item${itemCount === 1 ? '' : 's'} and every quotation, extraction and drawing under it will be deleted. This cannot be undone.`)) return
    try {
      await deleteProject(p.id)
      setProjectHomeId(null)
      await refreshSaved()
      fire(`Project "${p.name}" deleted`)
    } catch (err) { apiFail(err) }
  }

  const newProjectModal = showNew && (
    <NewProjectModal newForm={newForm} setNewForm={setNewForm}
      projects={projects} setShowNew={setShowNew} createProject={createProject}
      lockedClientName={projectBrowse === 'clients' ? clientHomeName : ''}/>
  )

  const clientGroups = Object.entries(projects.reduce((groups, project) => {
    const clientName = project.client_name || 'Walk-in Client'
    if (!groups[clientName]) groups[clientName] = []
    groups[clientName].push(project)
    return groups
  }, {})).sort(([a], [b]) => a.localeCompare(b))

  const projectCard = p => (
    <div className="project-home-card" key={p.id} role="button" tabIndex={0}
      onClick={() => setProjectHomeId(p.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setProjectHomeId(p.id) } }}>
      <div><b>{p.name}</b><span>{p.project_number} · {p.client_name || 'Walk-in Client'}</span><small>{p.item_count} technical item{p.item_count === 1 ? '' : 's'}</small></div>
      <button className="project-home-action" onClick={e => { e.stopPropagation(); setNewForm(f => ({ ...f, projectId:String(p.id), projectName:'', clientName:p.client_name || '', location:p.location || '' })); setShowNew(true) }}>Add item</button>
    </div>
  )

  const clientSummaryCard = ([clientName, clientProjects]) => {
    const itemCount = clientProjects.reduce((sum, project) => sum + Number(project.item_count || 0), 0)
    return <button type="button" className="project-client-card" key={clientName} onClick={() => setClientHomeName(clientName)}>
      <div className="project-client-card-main"><b>{clientName}</b><span>{clientProjects.length} project{clientProjects.length === 1 ? '' : 's'} · {itemCount} item{itemCount === 1 ? '' : 's'}</span></div>
      <div className="project-client-card-side"><span>View projects →</span></div>
    </button>
  }

  // ── PROJECTS HOME — the first screen: saved designs + create new ──
  if (!design) return (
    <>
      <div className={`cfg-home${embedded ? ' cfg-home-embedded' : ''}`}>
        {!embedded && <>
          <div className="cfg-home-head">
            <div>
              <div className="cfg-eyebrow">Fabra project workspace</div>
              <div className="t">Projects</div>
              <div className="s">Create a client project, measure its openings, configure each item, and save the approved technical scope.</div>
            </div>
            <button className="btn btn-primary" onClick={() => { setNewForm(f => ({ ...f, projectId:'', projectName:'', clientName:'' })); setShowNew(true) }}><IconPlus/> Create New Project</button>
          </div>
          <div className="cfg-workflow cfg-workflow-home" aria-label="Project workflow">
            <div className="cfg-workflow-step done"><span>1</span><div><b>Project</b><small>Client and job</small></div></div>
            <div className="cfg-workflow-line" />
            <div className="cfg-workflow-step"><span>2</span><div><b>Design</b><small>Measure and configure</small></div></div>
            <div className="cfg-workflow-line" />
            <div className="cfg-workflow-step"><span>3</span><div><b>Technical handoff</b><small>Save scope and outputs</small></div></div>
          </div>
        </>}
        {projects.length > 0 && <>
          {!embedded && <div className="cfg-section-heading"><div><b>Client projects</b><span>Keep every door, window and glass item under the correct job.</span></div><span>{projects.length} project{projects.length === 1 ? '' : 's'}</span></div>}
          {!projectHomeId ? <>
            <div className="project-browser-toolbar" aria-label="Project views">
              <div className="project-browser-tabs">
                <button className={`project-browser-tab ${projectBrowse === 'all' ? 'on' : ''}`} onClick={() => { setProjectBrowse('all'); setClientHomeName(null) }}>All Projects <span>{projects.length}</span></button>
                <button className={`project-browser-tab ${projectBrowse === 'clients' ? 'on' : ''}`} onClick={() => { setProjectBrowse('clients'); setClientHomeName(null) }}>Clients <span>{clientGroups.length}</span></button>
              </div>
              <span className="project-browser-help">{projectBrowse === 'all' ? 'Every project in the workspace' : clientHomeName ? 'Projects for this client' : 'Choose a client to view their projects'}</span>
            </div>
            {projectBrowse === 'all'
              ? <div className="project-home-grid">{projects.map(projectCard)}</div>
              : !clientHomeName
                ? <div className="project-client-cards">{clientGroups.map(clientSummaryCard)}</div>
                : (() => {
                    const group = clientGroups.find(([name]) => name === clientHomeName)
                    if (!group) return null
                    const [clientName, clientProjects] = group
                    return <div className="project-client-drilldown">
                      <button className="project-back" onClick={() => setClientHomeName(null)}>← All clients</button>
                      <div className="project-client-drilldown-head">
                        <div><b>{clientName}</b><span>{clientProjects.length} project{clientProjects.length === 1 ? '' : 's'} for this client</span></div>
                        <div className="project-client-drilldown-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => { setNewForm(f => ({ ...f, projectId:'', projectName:'', clientName, location:'' })); setShowNew(true) }}><IconPlus/> New project</button>
                        </div>
                      </div>
                      <div className="project-home-grid">{clientProjects.map(projectCard)}</div>
                    </div>
                  })()}
          </> : (() => {
            const project = projects.find(p => String(p.id) === String(projectHomeId))
            if (!project) return null
            const projectItems = (project.items || []).map(item => ({
              ...item,
              saved: saved.find(s => String(s.id) === String(item.id)),
            }))
            const addItem = () => { setNewForm(f => ({ ...f, projectId:String(project.id), projectName:'', clientName:project.client_name || '', location:project.location || '' })); setShowNew(true) }
            return <div className="project-detail-panel">
              {!embedded && <div className="project-detail-head">
                <div>
                  <button className="project-back" onClick={() => setProjectHomeId(null)}>← {projectBrowse === 'clients' ? 'Client projects' : 'All projects'}</button>
                  <div className="t">{project.name}</div>
                  <div className="s">{project.project_number} · {project.client_name || 'Walk-in Client'}{project.location ? ` · ${project.location}` : ''}</div>
                </div>
                <div className="project-detail-actions">
                  <button className="btn btn-ghost btn-sm" onClick={addItem}><IconPlus/> Add item</button>
                  <Link className="btn btn-primary btn-sm" to={`/projects/${project.id}`}>Project overview</Link>
                  <Link className="btn btn-ghost btn-sm" to={`/technical-workflow?project=${project.id}`}>Technical workflow</Link>
                  <Link className="btn btn-ghost btn-sm" to={`/quotations?project=${project.id}`}>Open quotation desk</Link>
                  <button className="btn btn-ghost btn-sm project-danger" onClick={() => removeProject(project)}><IconTrash/> Delete project</button>
                </div>
              </div>}
              {embedded && <div className="design-subtabs">
                <button className={designTab === 'project' ? 'on' : ''} onClick={() => setDesignTab('project')}>
                  Project <span>{projectItems.length}</span>
                </button>
                <button className={designTab === 'catalog' ? 'on' : ''} onClick={() => setDesignTab('catalog')}>
                  Catalogue
                </button>
              </div>}
              {embedded && designTab === 'catalog'
                ? <CatalogueGrid onSelect={id => { setDesignTab('project'); quickAddItem(id) }}/>
                : <>
              {embedded
                ? <div className="design-area-bar">
                    <span>{projectItems.length} item{projectItems.length === 1 ? '' : 's'} in this project</span>
                    {!!projectItems.length && <button className="btn btn-primary btn-sm" onClick={addItem}><IconPlus/> Add item</button>}
                  </div>
                : <div className="project-detail-total"><span>{projectItems.length} technical item{projectItems.length === 1 ? '' : 's'} in this project</span></div>}
              {!projectItems.length
                ? (embedded
                  // EvA's empty Design area: two full-width choices, not a modal
                  ? <div className="design-start">
                      <section>
                        <h2>Select a design from templates</h2>
                        <p>Choose from your saved window, door, frameless and curtain-wall designs.</p>
                        <button className="btn btn-primary" onClick={() => setDesignTab('catalog')}>Choose from catalogue</button>
                      </section>
                      <section className="alt">
                        <h2>Create new design</h2>
                        <p>Start a new typology for this client — its own system, colour and technical specification.</p>
                        <button className="btn btn-ghost" onClick={addItem}>Create design</button>
                      </section>
                    </div>
                  : <div className="project-detail-empty">No saved items yet. Add the first window, door or glass item to this project.</div>)
                : (() => {
                  // Group the project's items by product so a 50-window job
                  // reads as a handful of product rows, not 50 flat cards.
                  // Click a product to see its items inside.
                  const itemGroups = []
                  projectItems.forEach(item => {
                    const label = item.name || 'Other items'
                    let g = itemGroups.find(x => x.label === label)
                    if (!g) { g = { label, items:[] }; itemGroups.push(g) }
                    g.items.push(item)
                  })
                  const openGroup = openItemGroup
                  return <div className="item-group-list">{itemGroups.map(g => {
                    const open = g.label === openGroup
                    const firstDesign = g.items[0]?.saved?.design
                    const category = CATEGORIES[firstDesign?.category || 'frame'] || CATEGORIES.frame
                    const totalQty = g.items.reduce((sum, item) => sum + Number(item.qty || 1), 0)
                    return <div key={g.label} className={`item-group ${open ? 'open' : ''}`}>
                      <div className="item-group-row">
                        <button className="item-group-head" onClick={() => openGroupFirstItem(g)} title={`Open ${g.label} — every item is reachable from inside`}>
                          <span className="item-group-thumb">{firstDesign ? <SavedThumb d={firstDesign}/> : <IconCube/>}</span>
                          <div>
                            <b>{g.label}</b>
                            <span>{category.label} · {g.items.length} item{g.items.length === 1 ? '' : 's'}{totalQty !== g.items.length ? ` · total qty ${totalQty}` : ''}</span>
                          </div>
                        </button>
                        <button className="item-group-manage" title="Delete, duplicate or copy a share link for one item" onClick={() => setOpenItemGroup(open ? null : g.label)}>
                          {open ? 'Hide items' : 'Manage items'}<em>{open ? '▾' : '›'}</em>
                        </button>
                      </div>
                      {open && <div className="project-item-grid">{g.items.map(item => {
                        const s = item.saved
                        const designItem = s?.design
                        return <div className="project-detail-item" key={item.id}>
                          <div className="project-detail-thumb">{designItem ? <SavedThumb d={designItem}/> : <IconCube/>}</div>
                          <div className="project-detail-item-body">
                            <b>{item.ref || item.name}</b>
                            <span>{item.name}</span>
                            <small>{designItem ? `${designItem.width} × ${designItem.height} mm` : 'Saved design'}</small>
                            <small>Qty {item.qty}{item.location ? ` · ${item.location}` : ''}</small>
                          </div>
                          {s && <div className="project-detail-item-actions">
                            <div className="flex gap-sm">
                              <button className="project-copy-link" title="Copy client share link" onClick={e => copyShareLink(s, e)}><IconCopy/></button>
                              <button className="project-copy-link project-item-delete" title="Delete this item" onClick={e => removeSaved(s, e)}><IconTrash/></button>
                            </div>
                            <div className="flex gap-sm">
                              <button className="project-home-action" onClick={() => { setProjectHomeId(null); openSaved(s) }}>Open item</button>
                              <button className="project-home-action" title="Add another item to this project with the same configuration" onClick={() => { setProjectHomeId(null); duplicateSaved(s) }}>Duplicate & Edit</button>
                            </div>
                          </div>}
                        </div>
                      })}</div>}
                    </div>
                  })}</div>
                })()}
              {!embedded && <div className="project-detail-note">The Quotations page receives the approved project scope and handles all pricing and client terms.</div>}
              </>}
            </div>
          })()}
        </>}
        {!projectHomeId && projectBrowse === 'all' && saved.length > 0 && <div className="cfg-section-heading saved-items-heading"><div><b>Saved design items</b><span>Individual doors, windows and glass designs across all projects.</span></div><span>{saved.length} item{saved.length === 1 ? '' : 's'}</span></div>}
        {!projectHomeId && projectBrowse === 'all' && (saved.length === 0
          ? <div className="cfg-home-empty">
              <IconCube style={{ width:40, height:40, opacity:.3 }}/>
              <p>No saved items yet — create your first client project.</p>
              <button className="btn btn-primary" onClick={() => { setNewForm(f => ({ ...f, projectId:'', projectName:'', clientName:'' })); setShowNew(true) }}><IconPlus/> Create First Project</button>
            </div>
          : <div className="cfg-home-grid">
              {saved.map(s => {
                const c = CATEGORIES[s.design.category || 'frame'] || CATEGORIES.frame
                return (
                  <div key={s.id} className="proj-card" onClick={() => openSaved(s)}>
                    <SavedThumb d={s.design}/>
                    <div className="proj-meta">
                      <b>{s.ref || s.name}</b>
                      <span>{s.name}</span>
                      <span className="proj-client">Client: {s.client_name || 'Walk-in Client'}</span>
                      <span className="proj-sub">
                        {s.design.width} × {s.design.height} mm
                        {s.qty > 1 ? ` · ×${s.qty}` : ''}{s.location ? ` · ${s.location}` : ''}
                        {(s.design.siteImages || []).length ? ` · ${(s.design.siteImages || []).length} site photo${(s.design.siteImages || []).length === 1 ? '' : 's'}` : ''}
                      </span>
                    </div>
                    <div className="proj-right">
                      <span className="proj-cat" style={{ background:c.accent }}>{c.label}</span>
                      <button className="proj-duplicate" onClick={e => duplicateSaved(s, e)}>Duplicate & Edit</button>
                    </div>
                  </div>
                )
              })}
            </div>)}
      </div>
      {newProjectModal}
      {toast && <div className="toast">{toast}</div>}
    </>
  )

  return (
    <>
    <div className={`cfg ${showLib ? '' : 'no-lib'} ${showProps ? '' : 'no-props'} ${focusMode ? 'focus-mode' : ''}`}>
      {/* ── TOOL PANELS ── */}
      {showLib && <div className="cfg-panel cfg-lib">
        <h4><IconLayers style={{ width:16, height:16, color:'var(--navy-600)' }} /> <span><small className="panel-step">STEP 1</small>Choose a product</span>
          <button className="panel-x" title="Hide the design library — more room to draw" onClick={() => setShowLib(false)}>«</button>
        </h4>

        {/* Icon tool rail + one-level-at-a-time drill-down: the panel body only
            ever shows the level being worked in (family icons → that family's
            categories → that category's designs). Divider / opening tools sit
            on the vertical rail so they never crowd the product picker. */}
        <div className="cfg-lib-cols">
          <div className="cfg-tool-rail">
            <button className={`rail-tool ${tool === 'library' ? 'on' : ''}`} title="Product library"
              onClick={() => setTool('library')}><ToolGlyph k="library"/><span>Products</span></button>
            {(activeCat === 'frame' || activeCat === 'curtainwall') && (
              <button className={`rail-tool ${tool === 'dividers' ? 'on' : ''}`} title="Divider layouts — split the frame or a section"
                onClick={() => setTool('dividers')}><ToolGlyph k="dividers"/><span>Divider</span></button>
            )}
            {activeCat === 'frame' && (
              <button className={`rail-tool ${tool === 'openings' ? 'on' : ''}`} title="Opening designs — drop into a section"
                onClick={() => setTool('openings')}><ToolGlyph k="openings"/><span>Designs</span></button>
            )}
            {/* site record and factory extras are their own tools — Properties
                stays about the design itself, the way EvA's panel does */}
            {activeCat === 'frame' && (
              <button className={`rail-tool ${tool === 'measure' ? 'on' : ''}`} title="Site measurement record and site photos"
                onClick={() => setTool('measure')}><ToolGlyph k="measure"/><span>Measure</span></button>
            )}
            {activeCat === 'frame' && (
              <button className={`rail-tool ${tool === 'pieces' ? 'on' : ''}`} title="Special production pieces — curves, templates, site members"
                onClick={() => setTool('pieces')}><ToolGlyph k="pieces"/><span>Pieces</span></button>
            )}
            {activeCat === 'frame' && (
              <button className={`rail-tool ${tool === 'materials' ? 'on' : ''}`} title="Material take-off — every part this item consumes"
                onClick={() => setTool('materials')}><ToolGlyph k="materials"/><span>Materials</span></button>
            )}
          </div>

          <div className="cfg-lib-main">
            {tool === 'library' && (!libPath.cat ? <>
              <div className="cfg-lib-hint">Choose a product family — only what you pick will show.</div>
              <div className="lib-cat-tiles">
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <button key={k} className="lib-cat-tile" style={{ '--cat-accent':c.accent }}
                    onClick={() => { setLibPath({ cat:k, group:null, kind:null }); setCat(k) }}>
                    <CatGlyph cat={k}/>
                    <div><b>{c.label}</b><span>{c.sub}</span></div>
                    <em>›</em>
                  </button>
                ))}
              </div>
            </> : !libPath.group ? <>
              <button className="lib-back" onClick={() => setLibPath({ cat:null, group:null, kind:null })}>‹ All product families</button>
              <div className="cfg-lib-hint">{CATEGORIES[libPath.cat]?.label} — choose a category to open its designs.</div>
              <div className="lib-group-list">
                {(LIBS[libPath.cat] || []).map(g => (
                  <button key={g.group} className="lib-group-row" onClick={() => { setLibPath(p => ({ ...p, group:g.group, kind:null })); setLibShowAll(false) }}>
                    <b>{g.group}</b><span>{g.items.length} design{g.items.length === 1 ? '' : 's'}</span><em>›</em>
                  </button>
                ))}
              </div>
            </> : (() => {
              const group = (LIBS[libPath.cat] || []).find(g => g.group === libPath.group)
              if (!group) return null
              const kinds = groupKinds(group)
              if (kinds && !libPath.kind) return <>
                <button className="lib-back" onClick={() => { setLibPath(p => ({ ...p, group:null, kind:null })); setLibShowAll(false) }}>‹ {CATEGORIES[libPath.cat]?.label} categories</button>
                <div className="cfg-lib-hint">{group.group} — windows or doors?</div>
                <div className="lib-group-list">
                  {kinds.map(k => (
                    <button key={k} className="lib-group-row" onClick={() => setLibPath(p => ({ ...p, kind:k }))}>
                      <b>{k}</b><span>{itemsOfKind(group, k).length} design{itemsOfKind(group, k).length === 1 ? '' : 's'}</span><em>›</em>
                    </button>
                  ))}
                </div>
              </>
              // with a Windows/Doors pick, every design of that kind shows —
              // across systems; otherwise the A1 system scope applies as before
              const canScope = !kinds && libPath.cat === 'frame' && libScopeSystem && group.items.some(t => t.system === libScopeSystem)
              const sysScope = canScope && !libShowAll
              const items = kinds ? itemsOfKind(group, libPath.kind)
                : sysScope ? group.items.filter(t => t.system === libScopeSystem) : group.items
              return <>
                <button className="lib-back" onClick={() => { setLibPath(p => kinds ? { ...p, kind:null } : { ...p, group:null, kind:null }); setLibShowAll(false) }}>
                  ‹ {kinds ? group.group : `${CATEGORIES[libPath.cat]?.label} categories`}</button>
                {canScope && (
                  <div className="lib-scope-row">
                    <span>{sysScope ? `${FRAME_SYSTEMS[libScopeSystem].label} only` : `All ${group.group}`}</span>
                    <button onClick={() => setLibShowAll(v => !v)}>
                      {sysScope ? `Show all ${group.group}` : `‹ ${FRAME_SYSTEMS[libScopeSystem].label} only`}
                    </button>
                  </div>
                )}
                <div className="cfg-lib-hint">Drag a design onto the canvas, or click it.</div>
                <div className="cfg-lib-scroll">
                  <div className="lib-group">{kinds ? `${group.group} · ${libPath.kind}` : group.group}</div>
                  <div className="lib-grid">
                    {items.map(t => (
                      <div key={t.id} className="lib-item" draggable
                        onDragStart={e => e.dataTransfer.setData('text', `shape:${t.id}`)}
                        onClick={() => activeProject ? quickAddItem(t.id) : load(libPath.cat, t)} title={t.name}>
                        <LibThumb cat={libPath.cat} t={t}/>
                        <span>{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            })())}

            {tool === 'dividers' && <>
              <div className="cfg-lib-hint">{design ? 'Select a section, then drag a layout onto the canvas to divide only that section. With nothing selected, it applies to the full frame.' : 'Load a shape first, then split it with dividers.'}</div>
              <div className="cfg-lib-scroll">
                <div className="lib-group">Divider Layouts</div>
                <div className="lib-grid">
                  {DIVIDER_LAYOUTS.map(l => (
                    <div key={l.id} className={`lib-item ${!design?'disabled':''}`} draggable={!!design}
                      onDragStart={e => e.dataTransfer.setData('text', `divider:${l.id}`)}
                      onClick={() => design && applyDividerLayout(l)} title={l.label}>
                      <Thumb cols={l.cols} rows={l.rows} />
                      <span>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>}

            {tool === 'openings' && activeCat === 'frame' && <>
              <div className="cfg-lib-hint">{design ? 'Drag a design into a section on the canvas (or click to apply to the selected section).' : 'Load a shape first, then drop designs into its sections.'}</div>
              {allowedOpenings && <div className="lib-scope-row"><span>Designs valid for {FRAME_SYSTEMS[design.system]?.label || 'this system'}</span></div>}
              <div className="cfg-lib-scroll">
                {scopedOpeningDesigns.map(g => (
                  <div key={g.group}>
                    <div className="lib-group">{g.group}</div>
                    <div className="lib-grid">
                      {g.items.map(od => (
                        <div key={od.id} className={`lib-item ${!design?'disabled':''}`} draggable={!!design}
                          onDragStart={e => e.dataTransfer.setData('text', `o:${od.id}`)}
                          onClick={() => design && applyOpening(od, selected ?? 0)}
                          title={`${od.label} — drag into a section`}>
                          <OpeningThumb opening={od.opening} panels={od.panels} />
                          <span>{od.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>}

            {tool === 'materials' && (!design
              ? <div className="cfg-lib-hint">Load a design first — the take-off is generated from what it is made of.</div>
              : <div className="cfg-lib-scroll cfg-tool-form">
                <div className="takeoff-summary">
                  <div><small>Material cost</small><b>{GHS(quote.materialCost || 0)}</b></div>
                  <div><small>Lines</small><b>{(quote.materialRows || []).length}</b></div>
                  <div><small>From Inventory</small><b>{quote.materialFromInventory ?? 0}</b></div>
                </div>
                {!!quote.materialUnpriced?.length && <div className="takeoff-warn">
                  No price yet: {quote.materialUnpriced.join(', ')} — set it in Inventory.
                </div>}
                {['Profile', 'Glass', 'Accessory'].map(group => {
                  const rows = (quote.materialRows || []).filter(r => r.category === group)
                  if (!rows.length) return null
                  return <div className="takeoff-group" key={group}>
                    <div className="cfg-label">{group}</div>
                    {rows.map(r => <div className="takeoff-row" key={`${group}-${r.code}`}>
                      <div className="takeoff-id">
                        <b>{r.code}</b><span>{r.name}</span>
                        <em>{r.note}{r.priceSource === 'workbook' ? ' · workbook price' : r.priceSource === 'item override' ? ' · edited on this item' : ''}</em>
                      </div>
                      {group === 'Accessory' ? <div className="takeoff-edit">
                        <input type="number" min="0" step="0.01" title="Quantity" value={r.qty}
                          onChange={e => overrideAccessory(r, { qty:e.target.value })}/>
                        <span>{r.unit}</span>
                        <input type="number" min="0" step="0.01" title="Unit price" value={r.unitPrice}
                          onChange={e => overrideAccessory(r, { unitPrice:e.target.value })}/>
                        <button className="accessory-remove" title="Remove from this item"
                          onClick={() => overrideAccessory(r, { removed:true })}>×</button>
                      </div> : <div className="takeoff-qty">
                        <b>{r.qty}</b><span>{r.unit}</span><em>× {GHS(r.unitPrice)}</em>
                      </div>}
                      <strong>{GHS(r.total)}</strong>
                    </div>)}
                  </div>
                })}
                <div className="takeoff-add">
                  <div className="cfg-label" style={{ marginTop:0 }}>Add a material to this item</div>
                  <div className="takeoff-add-grid">
                    <input placeholder="Code" value={extraMaterial.code}
                      onChange={e => setExtraMaterial(m => ({ ...m, code:e.target.value }))}/>
                    <input placeholder="Description" value={extraMaterial.name}
                      onChange={e => setExtraMaterial(m => ({ ...m, name:e.target.value }))}/>
                    <input type="number" min="0" placeholder="Qty" value={extraMaterial.qty}
                      onChange={e => setExtraMaterial(m => ({ ...m, qty:e.target.value }))}/>
                    <input type="number" min="0" placeholder="Unit price" value={extraMaterial.unitPrice}
                      onChange={e => setExtraMaterial(m => ({ ...m, unitPrice:e.target.value }))}/>
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={!extraMaterial.code.trim()}
                    onClick={addExtraMaterial}>Add to this item</button>
                  <div className="cut-note">Item-only. A part every job uses belongs in Inventory instead.</div>
                </div>
              </div>)}

            {tool === 'measure' && (!design
              ? <div className="cfg-lib-hint">Load a design first, then record how it was measured on site.</div>
              : <div className="cfg-lib-scroll cfg-tool-form">
                <div className="cfg-label" style={{ marginTop:0 }}>Measurement Record</div>
                <select className="cfg-select" value={design.measurementStatus || 'preliminary'} onChange={e => patch({ measurementStatus:e.target.value })}>
                  <option value="preliminary">Preliminary measurement — for quotation</option>
                  <option value="final">Final measurement — production basis</option>
                  <option value="client-provided">Client-provided measurement</option>
                </select>
                <select className="cfg-select" value={design.measurementSource || ''} onChange={e => patch({ measurementSource:e.target.value })}>
                  <option value="">Measurement source</option>
                  <option value="sofaamy-site-rep">Site representative</option>
                  <option value="client">Client-provided</option>
                  <option value="architect-drawing">Architect/drawing</option>
                </select>
                <div className="ref-row">
                  <input placeholder="Measured by" value={design.measuredBy || ''} onChange={e => patch({ measuredBy:e.target.value })}/>
                  <input type="date" value={design.measurementDate || ''} onChange={e => patch({ measurementDate:e.target.value })}/>
                </div>
                <textarea className="loc-input" rows="2" placeholder="Site notes, access, levels, deductions, or measurement comments"
                  value={design.siteNotes || ''} onChange={e => patch({ siteNotes:e.target.value })}/>
                <div className="site-evidence">
                  <div className="flex between items-center">
                    <div>
                      <div className="cfg-label" style={{ margin:0 }}>Site images / evidence</div>
                      <div className="cut-note">Opening, wall, access route, existing frame, or measurement-book photos.</div>
                    </div>
                    <label className={`btn btn-ghost btn-sm site-image-upload ${siteImageBusy ? 'disabled' : ''}`}>
                      {siteImageBusy ? 'Preparing…' : '+ Add images'}
                      <input type="file" accept="image/*" multiple disabled={siteImageBusy} onChange={onSiteImages}/>
                    </label>
                  </div>
                  {(design.siteImages || []).length > 0 && <div className="site-image-grid">
                    {(design.siteImages || []).map(image => (
                      <div className="site-image-card" key={image.id}>
                        <img src={image.dataUrl} alt={image.caption || image.name || 'Site evidence'} />
                        <div className="site-image-name" title={image.name}>{image.name}</div>
                        <input className="site-image-caption" placeholder="Caption (optional)"
                          value={image.caption || ''} onChange={e => updateSiteImage(image.id, { caption:e.target.value })}/>
                        <button className="site-image-remove" title="Remove this image" onClick={() => removeSiteImage(image.id)}>Remove</button>
                      </div>
                    ))}
                  </div>}
                  <div className="site-image-count">{(design.siteImages || []).length}/12 attached · save the project to keep them</div>
                </div>
              </div>)}

            {tool === 'pieces' && (!design
              ? <div className="cfg-lib-hint">Load a design first, then add the special pieces the factory must cut.</div>
              : <div className="cfg-lib-scroll cfg-tool-form">
                <div className="cfg-label" style={{ marginTop:0 }}>Production piece additions</div>
                <div className="cut-note">Add a curve, template, special member, or any site-specific piece. Measurements are per unit and flow into the cutting list and work order.</div>
                {(design.customCutPieces || []).map((piece, index) => (
                  <div className="piece-edit-row" key={`${piece.position}-${index}`}>
                    <div className="piece-row-head">
                      <b>{piece.position || `Special piece ${index + 1}`}</b>
                      <button className="accessory-remove" title="Remove production piece" onClick={() => removeCustomPiece(index)}>×</button>
                    </div>
                    <div className="piece-field-grid">
                      <label className="piece-field wide"><span>Piece / position</span><input placeholder="e.g. F1 curved head" value={piece.position || ''} onChange={e => updateCustomPiece(index, { position:e.target.value })}/></label>
                      <label className="piece-field wide"><span>Profile member</span><select value={piece.profile || 'frame_outer'} onChange={e => updateCustomPiece(index, { profile:e.target.value })}>
                        {CUT_PROFILE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select></label>
                      <label className="piece-field"><span>Input length (mm)</span><input type="number" min="0" placeholder="0" value={piece.sourceMm || ''} onChange={e => updateCustomPiece(index, { sourceMm:e.target.value })}/></label>
                      <label className="piece-field"><span>Adjustment (mm)</span><input type="number" placeholder="0" value={piece.adjustmentMm ?? 0} onChange={e => updateCustomPiece(index, { adjustmentMm:e.target.value })}/></label>
                      <label className="piece-field"><span>Quantity</span><input type="number" min="1" value={piece.qty || 1} onChange={e => updateCustomPiece(index, { qty:e.target.value })}/></label>
                      <label className="piece-field"><span>Cut type</span><select value={piece.cuts || 'SPECIAL / TEMPLATE'} onChange={e => updateCustomPiece(index, { cuts:e.target.value })}>
                        <option>90°/90°</option><option>45°/45°</option><option>CURVE / TEMPLATE</option><option>SPECIAL / TEMPLATE</option>
                      </select></label>
                    </div>
                    <label className="piece-field wide"><span>Note / radius / template reference</span><input value={piece.note || ''} onChange={e => updateCustomPiece(index, { note:e.target.value })}/></label>
                  </div>
                ))}
                <div className="piece-add-row">
                  <div className="piece-row-head"><b>Add a special piece</b></div>
                  <div className="piece-field-grid">
                    <label className="piece-field wide"><span>Piece / position</span><input placeholder="e.g. F1 curved head" value={customPiece.position} onChange={e => setCustomPiece(p => ({ ...p, position:e.target.value }))}/></label>
                    <label className="piece-field wide"><span>Profile member</span><select value={customPiece.profile} onChange={e => setCustomPiece(p => ({ ...p, profile:e.target.value }))}>
                      {CUT_PROFILE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select></label>
                    <label className="piece-field"><span>Input length (mm)</span><input type="number" min="0" placeholder="0" value={customPiece.sourceMm} onChange={e => setCustomPiece(p => ({ ...p, sourceMm:e.target.value }))}/></label>
                    <label className="piece-field"><span>Adjustment (mm)</span><input type="number" placeholder="0" value={customPiece.adjustmentMm} onChange={e => setCustomPiece(p => ({ ...p, adjustmentMm:e.target.value }))}/></label>
                    <label className="piece-field"><span>Quantity</span><input type="number" min="1" value={customPiece.qty} onChange={e => setCustomPiece(p => ({ ...p, qty:e.target.value }))}/></label>
                    <label className="piece-field"><span>Cut type</span><select value={customPiece.cuts} onChange={e => setCustomPiece(p => ({ ...p, cuts:e.target.value }))}>
                      <option>90°/90°</option><option>45°/45°</option><option>CURVE / TEMPLATE</option><option>SPECIAL / TEMPLATE</option>
                    </select></label>
                  </div>
                  <label className="piece-field wide"><span>Note / radius / template reference</span><input value={customPiece.note} onChange={e => setCustomPiece(p => ({ ...p, note:e.target.value }))}/></label>
                  <button className="btn btn-ghost btn-sm piece-add-action" onClick={addCustomPiece}>Add production piece</button>
                </div>
              </div>)}
          </div>
        </div>
      </div>}

      {/* ── CANVAS ── */}
      <div className="cfg-stage">
        <div className="cfg-stage-head">
          {/* the design card: reference, quantity and location live here with
              their own pencil, not in Properties */}
          <div className="cfg-ident">
            <div>
              <div className="t">{design ? design.name : 'New Design'}</div>
              <div className="s">{design
                ? `Ref: ${design.ref || 'not set'} · Qty: ${design.qty} · ${design.width} × ${design.height} mm${design.location ? ` · ${design.location}` : ''}`
                : 'Empty canvas — choose a product family, then drop a design'}</div>
            </div>
            {design && <button className={`cfg-ident-pen ${editIdent ? 'on' : ''}`} onClick={() => setEditIdent(v => !v)}
              title="Edit reference, quantity and location" aria-label="Edit reference, quantity and location">✎</button>}
          </div>
          {/* window controls only — save, minimise the tool panels, full screen,
              close. Everything else belongs on the drawing surface itself. */}
          <div className="cfg-win-actions">
            <button className="btn btn-gold btn-sm cfg-save-action" onClick={onSaveDesign}><IconCheck/> Save</button>
            <button className="cfg-win" title="Undo the last design change" aria-label="Undo"
              disabled={!undoStack.current.length} onClick={undo}>↶</button>
            <button className="cfg-win" title={showLib || showProps ? 'Hide the side panels' : 'Show the design tools'}
              aria-label="Minimise the side panels"
              onClick={() => { if (showLib || showProps) { setShowLib(false); setShowProps(false) } else setShowLib(true) }}>–</button>
            <button className="cfg-win" title={focusMode ? 'Exit full screen (Esc)' : 'Full screen'} aria-label="Full screen"
              onClick={() => setFocusMode(v => { const next = !v; if (next) setPan({ x:0, y:0 }); return next })}>{focusMode ? '⤡' : '⛶'}</button>
            <button className="cfg-win close" title="Close this drawing" aria-label="Close this drawing"
              onClick={() => { undoStack.current = []; designRef.current = null; setFocusMode(false); setDesign(null); setSelected(null); refreshSaved() }}>✕</button>
          </div>
        </div>

        {design && editIdent && <div className="cfg-ident-edit">
          <label>Design ref
            <input autoFocus placeholder="Window 1, Door 1 or site reference"
              value={design.ref} onChange={e => patch({ ref:e.target.value })}/>
          </label>
          <label>Qty
            <input type="number" min={1} max={999} value={design.qty}
              onChange={e => patch({ qty:Math.max(1, +e.target.value||1) })}/>
          </label>
          <label>Location
            <input placeholder="First floor, master bedroom"
              value={design.location} onChange={e => patch({ location:e.target.value })}/>
          </label>
          <button className="cfg-win" title="Done" aria-label="Done" onClick={() => setEditIdent(false)}>✓</button>
        </div>}

        {/* A2: every item of the open project, one click apart */}
        {activeProject && (
          <div className="cfg-item-rail">
            <span className="rail-label">{projectItems.length} item{projectItems.length === 1 ? '' : 's'} in this project</span>
            <div className="rail-items">
              {projectItems.map((item, i) => {
                const active = design?.savedItemId && String(design.savedItemId) === String(item.id)
                const kind = itemKind(item)
                const kindNumber = projectItems.slice(0, i + 1).filter(row => itemKind(row) === kind).length
                const savedItem = saved.find(row => String(row.id) === String(item.id))
                const complete = savedItem ? designIssues({ ...savedItem.design, ref:savedItem.ref }).length === 0 : false
                return (
                  <button key={item.id} className={`rail-item ${active ? 'on' : ''}`} title={`${item.name}${item.location ? ` · ${item.location}` : ''}`}
                    onClick={() => switchToItem(item)}>
                    <b>{i + 1}</b><span><strong>{kind} {kindNumber}</strong><small>{item.ref || item.name}</small></span>
                    <i className={complete ? 'complete' : 'needs-details'} title={complete ? 'Item details complete' : 'Item needs required details'}/>
                  </button>
                )
              })}
              {design && !design.savedItemId && (
                <button className="rail-item on unsaved" title="Saved automatically when you switch item or press Save design">
                  <b>{projectItems.length + 1}</b><span>{design.ref || 'New item'}</span>
                </button>
              )}
              <div className="rail-add-wrap">
                <button className="rail-add" onClick={() => setShowAddItem(v => {
                  const next = !v
                  // open scoped to what is being worked on (a sliding-window
                  // project offers sliding WINDOWS first, not doors)
                  if (next) {
                    const groupName = design ? groupForDesign(design) : null
                    const g = groupName ? (LIBS[activeCat || 'frame'] || []).find(x => x.group === groupName) : null
                    const kind = groupKinds(g) ? (kindOfTemplate(design) || 'Other designs') : null
                    setAddPath({ group:groupName, kind })
                  }
                  return next
                })}>{showAddItem ? '× Close' : '+ Add item'}</button>
                {showAddItem && (() => {
                  const groupsAll = LIBS[activeCat || 'frame'] || []
                  const g = addPath.group ? groupsAll.find(x => x.group === addPath.group) : null
                  const kinds = g ? groupKinds(g) : null
                  return <div className="rail-add-pop">
                    {g && (!kinds || addPath.kind) ? (() => {
                      const items = kinds ? itemsOfKind(g, addPath.kind) : g.items
                      return <>
                        <div className="rail-add-head">Add another <b>{kinds ? `${g.group} · ${addPath.kind}` : g.group}</b> item — current edits are saved automatically.</div>
                        <div className="rail-add-grid">
                          {items.map(t => (
                            <button key={t.id} className={`rail-add-item ${libScopeSystem && t.system === libScopeSystem ? 'same-system' : ''}`}
                              onClick={() => quickAddItem(t.id)}>
                              <LibThumb cat={activeCat || 'frame'} t={t}/><span>{t.name}</span>
                            </button>
                          ))}
                        </div>
                        <button className="lib-back rail-add-back" onClick={() => kinds ? setAddPath(p => ({ ...p, kind:null })) : setAddPath({ group:null, kind:null })}>
                          ‹ {kinds ? `${g.group} — windows or doors` : 'Other categories'}</button>
                      </>
                    })() : g && kinds ? <>
                      <div className="rail-add-head"><b>{g.group}</b> — windows or doors?</div>
                      <div className="lib-group-list">
                        {kinds.map(k => (
                          <button key={k} className="lib-group-row" onClick={() => setAddPath(p => ({ ...p, kind:k }))}>
                            <b>{k}</b><span>{itemsOfKind(g, k).length} design{itemsOfKind(g, k).length === 1 ? '' : 's'}</span><em>›</em>
                          </button>
                        ))}
                      </div>
                      <button className="lib-back rail-add-back" onClick={() => setAddPath({ group:null, kind:null })}>‹ Other categories</button>
                    </> : <>
                      <div className="rail-add-head">Choose a category, then the item to add — current edits are saved automatically.</div>
                      <div className="lib-group-list">
                        {groupsAll.map(x => (
                          <button key={x.group} className="lib-group-row" onClick={() => setAddPath({ group:x.group, kind:null })}>
                            <b>{x.group}</b><span>{x.items.length} design{x.items.length === 1 ? '' : 's'}</span><em>›</em>
                          </button>
                        ))}
                      </div>
                    </>}
                    <div className="rail-add-foot">Need a different product family? Open the Products panel and go back to all families.</div>
                  </div>
                })()}
              </div>
            </div>
          </div>
        )}

        <div ref={wrapRef}
          className={`cfg-canvas-wrap ${dragOver?'drop-over':''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}>
          {focusMode && <div className={`focus-canvas-hint ${dragOver ? 'on' : ''}`}>Drag the drawing here to reposition it</div>}
          {view === '2d'
            ? (design.category === 'frameless'
                ? <FramelessCanvas design={design} stageW={dims.w} stageH={dims.h} pan={pan} onPanChange={setPan} selected={selected} onSelect={selectDesignPart} onDividerMove={onDividerMove} setDim={setDim} setSectionDim={setSectionDim} />
                : design.category === 'curtainwall'
                  ? <CurtainWallCanvas design={design} stageW={dims.w} stageH={dims.h} pan={pan} onPanChange={setPan} selected={selected} onSelect={selectDesignPart} onDividerMove={onDividerMove} setDim={setDim} setSectionDim={setSectionDim} />
                  : <DesignCanvas design={design} stageW={dims.w} stageH={dims.h} pan={pan} onPanChange={setPan} selected={selected} onSelect={selectDesignPart} onDividerMove={onDividerMove} setDim={setDim} setSectionDim={setSectionDim} />)
            : <div style={{ width: dims.w, height: dims.h }}>
                <Suspense fallback={<div className="drop-zone"><div className="dz-title">Loading 3D…</div></div>}>
                  {design.category === 'frameless'
                    ? <Frameless3D design={design} scene={wall} />
                    : <Design3D design={design} wall={wall} onDesignPatch={patch} fabricationDefault />}
                </Suspense>
              </div>}

          {design && (design.category === 'frame' || design.category === 'frameless') && (
            <div className="view-switch">
              <button className={view==='2d'?'on':''} onClick={() => setView('2d')}>2D</button>
              <button className={view==='3d'&&!wall?'on':''} onClick={() => { setView('3d'); setWall(false) }}>3D</button>
              <button className={view==='3d'&&wall?'on':''} onClick={() => { setView('3d'); setWall(true) }}>
                {design.category === 'frameless' ? 'Real' : 'Wall'}</button>
            </div>
          )}
        </div>

        {design && (
          <div className="cfg-tags">
            <span className="chip" style={{ background:CATEGORIES[design.category]?.accent, color:'#fff' }}>{CATEGORIES[design.category]?.label}</span>
            <span className="chip">{design.category === 'frameless' ? (FL_GLASS[design.glassId]?.label || '') : FRAMES[design.frame].label}</span>
            <span className="chip">{quote.area} m²</span>
            <span className="chip">{quote.sections} {design.category === 'frameless' ? 'panel(s)' : 'section(s)'}</span>
            {design.category !== 'frameless' && <span className="chip">{quote.profileLen} m profile</span>}
            {design.category === 'frameless' && quote.totalKg != null && <span className="chip">{quote.totalKg} kg glass</span>}
            {selected!=null && <span className="chip on">{design.category === 'curtainwall' ? 'Bay' : design.category === 'frameless' ? 'Panel' : 'Section'} {selected+1} selected</span>}
          </div>
        )}
      </div>

      {/* ── PROPERTIES + QUOTE ── */}
      {showProps && <div className="cfg-props">
        <div className="cfg-panel">
          <h4><span>{selected == null ? 'Design details' : `${design?.category === 'curtainwall' ? 'Bay' : design?.category === 'frameless' ? 'Panel' : 'Section'} ${selected + 1}`}</span>
            <button className="panel-x" title="Close properties" aria-label="Close properties"
              onClick={() => { setShowProps(false); setSelected(null) }}>×</button>
          </h4>
          <div className="cfg-body">
            {!design && <div className="prop-empty">Drop a design on the canvas and its properties will appear here.</div>}

            {design && <>
              <div className="cfg-label" style={{ marginTop:0 }}>Overall Size</div>
              {[['width','Width',400,design.category==='curtainwall'?8000:6000],['height','Height',400,design.category==='curtainwall'?6000:4000]].map(([k,lbl,min,max]) => (
                <div className="dim-row" key={k}>
                  <label>{lbl}</label>
                  <input type="range" min={min} max={max} step={10} value={design[k]} onChange={e => setDim(k, +e.target.value)}/>
                  <span className="dim-val"><input type="number" value={design[k]} onChange={e => setDim(k, +e.target.value||min)}/><span>mm</span></span>
                </div>
              ))}

              {design.category === 'frame' && <div className="section-config">
                <div className="divider"/>
                <div className="cfg-label" style={{ marginTop:0 }}>Section {selected!=null ? selected+1 : ''}</div>
                {sel ? <>
                  <div className="prop-sub">Section Size (drag the divider on the canvas, or type)</div>
                  <div className="sec-size">
                    <label>W</label>
                    <SectionDimensionInput
                      key={`frame-col-${selected % design.cols}`}
                      value={design.colWidths[selected % design.cols]}
                      max={sectionDimensionMax(design, 'col', selected % design.cols)}
                      onCommit={value => setSectionDim('col', selected % design.cols, value)}
                      disabled={design.cols === 1}
                    />
                    <label>H</label>
                    <SectionDimensionInput
                      key={`frame-row-${Math.floor(selected / design.cols)}`}
                      value={design.rowHeights[Math.floor(selected / design.cols)]}
                      max={sectionDimensionMax(design, 'row', Math.floor(selected / design.cols))}
                      onCommit={value => setSectionDim('row', Math.floor(selected / design.cols), value)}
                      disabled={design.rows === 1}
                    />
                    <span className="muted" style={{ fontSize:11 }}>mm</span>
                  </div>
                  <div className="prop-sub">Opening Type</div>
                  <div className="seg">
                    {Object.keys(OPENINGS).filter(o => openingAllowed(o) || sel.opening === o).map(o => (
                      <button key={o} className={sel.opening===o?'on':''} onClick={() => setCell('opening', o)}>{OPENINGS[o].label}</button>
                    ))}
                  </div>
                  {sel.opening !== 'fixed' &&
                    <Stepper label="Opening panels in section" value={sel.panels || 1} min={1} max={4}
                      onChange={v => setCell('panels', v)} />}
                  <div className="prop-sub">Glass</div>
                  <select className="cfg-select" value={sel.glass} onChange={e => setCell('glass', e.target.value)}>
                    {FRAME_GLASS_CATALOG.map(g => <option key={g.code} value={g.code}>{g.label}</option>)}
                  </select>
                  <div className="flex gap-sm" style={{ marginTop:12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => applyAll('opening', sel.opening)}>Apply opening to all</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => applyAll('glass', sel.glass)}>Apply glass to all</button>
                  </div>
                </> : <div className="prop-empty">Click a section on the canvas to edit its glass and opening.</div>}
              </div>}

              {/* ── FRAME properties ── */}
              {design.category === 'frame' && <>
                <div className="cfg-label">Dividers</div>
                <Stepper label="Vertical dividers"   value={design.cols-1} min={0} max={7} onChange={v => setGrid(v+1, design.rows)} />
                <Stepper label="Horizontal dividers" value={design.rows-1} min={0} max={3} onChange={v => setGrid(design.cols, v+1)} />

                <div className="cfg-label">Profile System</div>
                {FRAME_SYSTEMS[design.system]
                  ? <div className="profile-system-context">
                      <b>{frameCatalog.label}</b>
                      <span>Selected with the product type during project-item creation.</span>
                    </div>
                  : <select className="cfg-select" value={design.system} onChange={e => patch({ system:e.target.value })}>
                      <option value={design.system}>Existing saved system ({design.system})</option>
                      {FRAME_SYSTEM_ORDER.map(k => <option key={k} value={k}>{FRAME_SYSTEMS[k].label}</option>)}
                    </select>}
                {systemVariants.map(v => {
                  const chosen = variantValue(design, recipeFor(design.system), v.key)
                  return <div key={v.key}>
                    <div className="cfg-label">{v.label}</div>
                    <div className="seg">
                      {v.options.map(o => {
                        const part = resolveRole({ ...design, [v.key]:o.value }, roleForVariant(design.system, v.key))
                        return <button key={o.value} className={chosen === o.value ? 'on' : ''}
                          title={part?.code ? `${part.code} · ₵${priceFor(part.code).unitPrice}/bar` : ''}
                          onClick={() => patch({ [v.key]:o.value })}>{o.label}</button>
                      })}
                    </div>
                  </div>
                })}

                <div className="cfg-label">Surface Finish</div>
                <select className="cfg-select" value={design.finishType} onChange={e => patch({ finishType:e.target.value })}>
                  {Object.entries(FINISH_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="cfg-label">Profile / colour</div>
                <div className="swatches">
                  {systemColours.map(k => (
                    <div key={k} title={FRAMES[k].label} className={`swatch ${design.frame===k?'on':''}`}
                      style={{ background:FRAMES[k].color }} onClick={() => patch({ frame:k, customFrameColor:'' })}/>
                  ))}
                </div>
                <div className="cut-note" style={{ marginTop:6 }}>
                  {systemColours.map(k => FRAMES[k].label).join(' · ')} — stocked for {frameCatalog.label}
                </div>

              </>}

              {/* ── FRAMELESS properties ── */}
              {design.category === 'frameless' && <>
                <div className="cfg-label">Glass Specification</div>
                <select className="cfg-select" value={design.glassId} onChange={e => patch({ glassId:e.target.value })}>
                  {Object.entries(FL_GLASS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>

                {/* hardware system options — from Sofaamy's frameless list */}
                {design.cells.some(c => c.type === 'door') && <>
                  <div className="cfg-label">Swing System</div>
                  <select className="cfg-select" value={design.flSystem || 'klpatches'}
                    onChange={e => patch({ flSystem:e.target.value })}>
                    {FL_SYSTEM_CHOICES.door.map(k => <option key={k} value={k}>{FL_SYSTEMS[k].label}</option>)}
                  </select>
                </>}
                {design.cells.some(c => c.type === 'slider') && <>
                  <div className="cfg-label">Sliding System</div>
                  <select className="cfg-select" value={design.slideSystem || 'scl'}
                    onChange={e => patch({ slideSystem:e.target.value })}>
                    {FL_SYSTEM_CHOICES.slider.map(k => <option key={k} value={k}>{FL_SYSTEMS[k].label}</option>)}
                  </select>
                </>}

                <div className="cfg-label">Panels</div>
                <Stepper label="Panels in run" value={design.cols} min={1} max={8} onChange={setPanelCount} />
                <label className="check-row">
                  <input type="checkbox" checked={design.overPanel}
                    onChange={e => patch({ overPanel:e.target.checked })}/>
                  <span>Fanlight above doors (over-panel)</span>
                </label>

                <div className="cfg-label">Layout</div>
                <select className="cfg-select" value={design.cornerAfter >= 0 ? design.cornerAfter : -1}
                  onChange={e => patch({ cornerAfter:+e.target.value })}>
                  <option value={-1}>Straight run</option>
                  {Array.from({ length: design.cols - 1 }).map((_, k) =>
                    <option key={k} value={k}>L-shape — corner after P{k + 1}</option>)}
                </select>
                <select className="cfg-select" value={design.scene || 'shopfront'}
                  onChange={e => patch({ scene:e.target.value })} title="Context used by the Real 3D view">
                  <option value="shopfront">Real view: Shopfront / building</option>
                  <option value="bathroom">Real view: Bathroom / shower room</option>
                </select>
                {design.overPanel && (
                  <div className="dim-row">
                    <label>Door height</label>
                    <input type="range" min={1900} max={2600} step={10} value={design.doorH} onChange={e => patch({ doorH:+e.target.value })}/>
                    <span className="dim-val"><input type="number" value={design.doorH} onChange={e => patch({ doorH:+e.target.value||FL_FAB.defaultDoorH })}/><span>mm</span></span>
                  </div>
                )}

                <div className="divider"/>
                <div className="cfg-label" style={{ marginTop:0 }}>Panel {selected!=null ? `P${selected+1}` : ''}</div>
                {sel ? <>
                  <div className="prop-sub">Bay Width (drag the joint on the canvas, or type)</div>
                  <div className="sec-size">
                    <label>W</label>
                    <SectionDimensionInput
                      key={`frameless-col-${selected % design.cols}`}
                      value={design.colWidths[selected % design.cols]}
                      max={sectionDimensionMax(design, 'col', selected % design.cols)}
                      onCommit={value => setSectionDim('col', selected % design.cols, value)}
                      disabled={design.cols === 1}
                    />
                    <span className="muted" style={{ fontSize:11 }}>mm</span>
                  </div>
                  <div className="prop-sub">Panel Type</div>
                  <div className="seg">
                    {Object.entries(FL_PANEL_TYPES).map(([k,v]) => (
                      <button key={k} className={sel.type===k?'on':''} onClick={() => setCell('type', k)}>{v.label}</button>
                    ))}
                  </div>
                  <div className="cut-note" style={{ marginTop:10 }}>
                    Hardware attaches automatically: swing doors get patches + floor spring + handle + lock;
                    fixed panels get clamps — Sofaamy's own codes and prices.
                  </div>
                </> : <div className="prop-empty">Click a panel on the canvas to set its type and width.</div>}
              </>}

              {/* ── CURTAIN WALL properties ── */}
              {design.category === 'curtainwall' && <>
                <div className="cfg-label">Grid</div>
                <Stepper label="Mullion bays"  value={design.cols} min={1} max={10} onChange={v => setGrid(v, design.rows)} />
                <Stepper label="Transom rows"  value={design.rows} min={1} max={6}  onChange={v => setGrid(design.cols, v)} />

                <div className="cfg-label">Cap / Finish Colour</div>
                <div className="swatches">
                  {Object.entries(FRAMES).map(([k,v]) => (
                    <div key={k} title={v.label} className={`swatch ${design.frame===k?'on':''}`} style={{ background:v.color }} onClick={() => patch({ frame:k, customFrameColor:'' })}/>
                  ))}
                </div>

                <div className="divider"/>
                <div className="cfg-label" style={{ marginTop:0 }}>Bay {selected!=null ? `B${selected+1}` : ''}</div>
                {sel ? <>
                  <div className="prop-sub">Bay Size (drag a grid line on the canvas, or type)</div>
                  <div className="sec-size">
                    <label>W</label>
                    <SectionDimensionInput
                      key={`curtain-col-${selected % design.cols}`}
                      value={design.colWidths[selected % design.cols]}
                      max={sectionDimensionMax(design, 'col', selected % design.cols)}
                      onCommit={value => setSectionDim('col', selected % design.cols, value)}
                      disabled={design.cols === 1}
                    />
                    <label>H</label>
                    <SectionDimensionInput
                      key={`curtain-row-${Math.floor(selected / design.cols)}`}
                      value={design.rowHeights[Math.floor(selected / design.cols)]}
                      max={sectionDimensionMax(design, 'row', Math.floor(selected / design.cols))}
                      onCommit={value => setSectionDim('row', Math.floor(selected / design.cols), value)}
                      disabled={design.rows === 1}
                    />
                    <span className="muted" style={{ fontSize:11 }}>mm</span>
                  </div>
                  <div className="prop-sub">Bay Type</div>
                  <div className="seg">
                    {Object.entries(CW_CELL_TYPES).map(([k,v]) => (
                      <button key={k} className={sel.type===k?'on':''} onClick={() => setCell('type', k)}>{v.label}</button>
                    ))}
                  </div>
                  {sel.type !== 'spandrel' && <>
                    <div className="prop-sub">Glass</div>
                    <div className="seg">
                      {Object.entries(GLASS).map(([k,v]) => (
                        <button key={k} className={sel.glass===k?'on':''} onClick={() => setCell('glass', k)}>{v.label}</button>
                      ))}
                    </div>
                  </>}
                  <div className="flex gap-sm" style={{ marginTop:12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => applyAll('type', sel.type)}>Apply type to all</button>
                  </div>
                </> : <div className="prop-empty">Click a bay on the canvas to set vision / spandrel / vent.</div>}
              </>}
            </>}
          </div>
        </div>

      </div>}

      {toast && <div className="toast">{toast}</div>}
    </div>

    {design && design.category === 'frameless' && <GlassOrder design={design} />}

    {newProjectModal}
    </>
  )
}

function NewProjectModal({ newForm, setNewForm, projects, setShowNew, createProject, lockedClientName }) {
  const groups = LIBS[newForm.cat] || []
  const selectedTemplate = groups.flatMap(g => g.items).find(t => t.id === newForm.templateId)
  const selectedCategory = CATEGORIES[newForm.cat]

  return (
      <div className="modal-back" onClick={() => setShowNew(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-eyebrow">STEP 1 · PROJECT SETUP</div>
          <h4>Create a project item</h4>
          <p className="modal-intro">Enter the client and item basics. You can fine-tune measurements, openings and fabrication details on the canvas.</p>
          <div className="modal-section-label">1. Choose the product family</div>
          <div className="new-category-tabs">
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} className={newForm.cat===k?'on':''}
                onClick={() => setNewForm(f => ({ ...f, cat:k, templateId:LIBS[k][0].items[0].id }))}>{c.label}</button>
            ))}
          </div>
          <div className="new-category-help">
            <b>{selectedCategory?.label}</b>
            <span>{selectedCategory?.sub}</span>
            <em>{groups.reduce((n, g) => n + g.items.length, 0)} product options</em>
          </div>
          <label className="modal-full">2. Client project
            {lockedClientName
              ? <div className="new-project-context">{newForm.projectId
                  ? `Adding this item to ${projects.find(p => String(p.id) === String(newForm.projectId))?.name || 'the selected project'}`
                  : `Creating a new project for ${lockedClientName}`}</div>
              : <select value={newForm.projectId} onChange={e => setNewForm(f => ({ ...f, projectId:e.target.value }))}>
                  <option value="">Create a new client project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name} · {p.client_name || 'Walk-in Client'}</option>)}
                </select>}
          </label>
          {!newForm.projectId && <label className="modal-full">New project name <span className="req">*</span>
            <input autoFocus placeholder="e.g. Mr Yaw Residence" value={newForm.projectName}
              onChange={e => setNewForm(f => ({ ...f, projectName:e.target.value }))}/>
          </label>}
          <label className="modal-full">3. Quantity <span className="req">*</span>
            <input type="number" min={1} max={999} value={newForm.qty}
              onChange={e => setNewForm(f => ({ ...f, qty:e.target.value }))}/>
          </label>
          <label className="modal-full">Client name{lockedClientName ? ' (selected client)' : ''}
            <input placeholder="e.g. RGA Special Gardens" value={lockedClientName || newForm.clientName}
              readOnly={Boolean(lockedClientName)}
              onChange={e => setNewForm(f => ({ ...f, clientName:e.target.value }))}/>
            {lockedClientName && <small className="new-client-lock-note">This project will be saved under {lockedClientName}.</small>}
          </label>
          <label className="modal-full">Location
            <input placeholder="e.g. First floor, master bedroom" value={newForm.location}
              onChange={e => setNewForm(f => ({ ...f, location:e.target.value }))}/>
          </label>
          <label className="modal-full">Product type <span className="req">*</span>
            <select value={newForm.templateId} onChange={e => setNewForm(f => ({ ...f, templateId:e.target.value }))}>
              {groups.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {selectedTemplate && <div className="new-product-summary">
            <LibThumb cat={newForm.cat} t={selectedTemplate}/>
            <div>
              <b>{selectedTemplate.name}</b>
              <span>{selectedTemplate.use || selectedTemplate.system || selectedCategory?.label}</span>
              <span>{selectedTemplate.w} × {selectedTemplate.h} mm</span>
            </div>
          </div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createProject}>Create & Open Canvas</button>
          </div>
        </div>
      </div>
  )
}

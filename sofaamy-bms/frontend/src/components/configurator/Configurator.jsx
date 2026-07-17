import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import DesignCanvas from './DesignCanvas.jsx'
import FramelessCanvas from './FramelessCanvas.jsx'
import CurtainWallCanvas from './CurtainWallCanvas.jsx'
import CutPlan from './CutPlan.jsx'
import GlassOrder from './GlassOrder.jsx'
import WhatsAppModal from '../WhatsAppModal.jsx'
import { quoteMessage } from '../../lib/whatsapp.js'
import '../../styles/ops.css'

// 3D views are heavy (three.js) — loaded only when first opened
const Design3D = lazy(() => import('./Design3D.jsx'))
const Frameless3D = lazy(() => import('./Frameless3D.jsx'))
import { DESIGN_GROUPS, DIVIDER_LAYOUTS, templateById, buildDesign, resizeGrid, setSize, setSectionSize, moveDivider, designLayout } from '../../lib/designs.js'
import { FL_GROUPS, flTemplateById, buildFrameless } from '../../lib/frameless.js'
import { CW_GROUPS, cwTemplateById, buildCurtainWall } from '../../lib/curtainwall.js'
import { CATEGORIES, OPENINGS, OPENING_DESIGNS, openingDesignById, GLASS, FRAMES, FINISH_TYPES, FL_GLASS, FL_PANEL_TYPES, FL_FAB, FL_SYSTEMS, FL_SYSTEM_CHOICES, CW_CELL_TYPES } from '../../lib/products.js'
import { FRAME_SYSTEMS, FRAME_SYSTEM_ORDER, FRAME_PRODUCT_GROUPS, FRAME_GLASS_CATALOG, frameSystemSummary, frameAccessoryRows, frameRateForRateKey, frameRateKeyForOpening, FRAME_RATE_SOURCES } from '../../lib/frameCatalog.js'
import { calcQuote, designBOMAny, GHS } from '../../lib/pricing.js'
import { downloadQuotePdf, createJobFromDesign, downloadReport, saveDesign, listDesigns } from '../../lib/api.js'
import { IconCube, IconDownload, IconWhatsApp, IconCheck, IconFile, IconPlus, IconLayers } from '../icons.jsx'
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

const withAutoColour = (d) => d.customFrameColor
  ? { ...d, colourDescription:d.colourDescription || `Custom colour (${d.customFrameColor})` }
  : FRAMES[d.frame] ? { ...d, colourDescription:FRAMES[d.frame].label }
  : d

const LibThumb = ({ cat, t }) =>
  cat === 'frameless' ? <FlThumb panels={t.panels} overPanel={t.overPanel}/>
  : cat === 'curtainwall' ? <CwThumb cols={t.cols} rows={t.rows} spandrelRows={t.spandrelRows}/>
  : <Thumb cols={t.cols} rows={t.rows}/>

export default function Configurator() {
  const [design, setDesign] = useState(null)   // null = empty slate
  const [cat, setCat] = useState(null)         // category chosen on the slate
  const [selected, setSelected] = useState(null)
  const [client, setClient] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [toast, setToast] = useState(null)
  const [tool, setTool] = useState('shapes')   // shapes | dividers | designs
  const [view, setView] = useState('2d')       // 2d | 3d
  const [wall, setWall] = useState(false)      // 3d wall view
  const [showNew, setShowNew] = useState(false)
  const [showLib, setShowLib] = useState(true)     // left design-tools panel
  const [showProps, setShowProps] = useState(true) // right properties/quote column
  const [newForm, setNewForm] = useState({ ref:'', qty:1, location:'', clientName:'', cat:'frame', templateId:'trialco-sliding-window' })
  const [customAccessory, setCustomAccessory] = useState({ name:'', code:'', qty:1, unitPrice:0 })
  const [customPiece, setCustomPiece] = useState({ position:'', profile:'frame_outer', sourceMm:'', adjustmentMm:0, qty:1, cuts:'90°/90°', note:'' })
  const [siteImageBusy, setSiteImageBusy] = useState(false)

  // library + hints follow the user's explicit pick; falls back to the
  // open design's family (load()/openSaved() keep `cat` in sync)
  const activeCat = cat || design?.category
  const load = (fcat, t, extra = {}) => {
    const d = withAutoColour({ ...buildFor(fcat, t), ...extra })
    setDesign(d); setCat(fcat); setSelected(0); setView('2d'); setTool('shapes')
  }
  const newDesign = () => setShowNew(true)

  const createProject = () => {
    const m = anyTemplateById(newForm.templateId)
    if (m) { load(m.cat, m.t, { ref:newForm.ref, qty:Math.max(1, +newForm.qty || 1), location:newForm.location }); setClient(newForm.clientName || '') }
    setShowNew(false)
  }

  // drop an openable design (EvA: drag "Double Door" into F2) onto a section — frame only
  const applyOpening = (od, idx) => {
    if (od == null || idx == null || !design || design.category !== 'frame') return
    setDesign(d => ({ ...d, cells: d.cells.map((c, i) =>
      i === idx ? { ...c, opening: od.opening, panels: od.panels,
        rateKey: frameRateKeyForOpening(od.opening),
        ratePerM2: frameRateForRateKey(frameRateKeyForOpening(od.opening)) } : c) }))
    setSelected(idx)
    fire(`${od.label} → section F${idx + 1}`)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const data = e.dataTransfer.getData('text')
    if (data.startsWith('divider:')) {
      if (!design) { fire('Load a design before dropping a divider layout'); return }
      const layout = DIVIDER_LAYOUTS.find(item => item.id === data.slice('divider:'.length))
      if (layout) {
        setGrid(layout.cols, layout.rows)
        setSelected(0)
        fire(`${layout.label} divider layout applied`)
      }
      return
    }
    if (data.startsWith('o:')) {
      if (!design || design.category !== 'frame') return
      if (view !== '2d') { fire('Switch to 2D view to edit sections'); return }
      const canvas = wrapRef.current?.querySelector('canvas')
      if (!canvas) return
      const r = canvas.getBoundingClientRect()
      const idx = designLayout(design, dims.w, dims.h).cellAt(e.clientX - r.left, e.clientY - r.top)
      applyOpening(openingDesignById(data.slice(2)), idx)
      return
    }
    const templateId = data.startsWith('shape:') ? data.slice('shape:'.length) : data
    const m = anyTemplateById(templateId)
    if (m) load(m.cat, m.t)
  }

  const patch = (u) => setDesign(d => {
    const next = { ...d, ...u }
    if (Object.prototype.hasOwnProperty.call(u, 'frame') && FRAMES[u.frame]) {
      next.colourDescription = FRAMES[u.frame].label
    }
    if (Object.prototype.hasOwnProperty.call(u, 'customFrameColor') && u.customFrameColor) {
      next.colourDescription = `Custom colour (${u.customFrameColor})`
    }
    return next
  })
  const accessoryOverride = (row, changes) => setDesign(d => {
    const current = (d.accessoryOverrides || []).filter(x => x.code !== row.code)
    return { ...d, accessoryOverrides:[...current, { code:row.code, name:row.name, unitPrice:row.unitPrice, ...changes }] }
  })
  const addCatalogueAccessory = (code) => {
    const a = frameCatalog?.accessories.find(x => x.code === code)
    if (!a) return
    accessoryOverride(a, { qty:1, removed:false })
    fire(`${a.name} added to this project`)
  }
  const addCustomAccessory = () => {
    const name = customAccessory.name.trim()
    if (!name) return
    const code = customAccessory.code.trim() || `CUSTOM-${Date.now()}`
    setDesign(d => ({ ...d, accessoryOverrides:[...(d.accessoryOverrides || []).filter(x => x.code !== code), {
      code, name, qty:Math.max(1, Number(customAccessory.qty || 1)), unitPrice:Math.max(0, Number(customAccessory.unitPrice || 0)), custom:true, removed:false,
    }] }))
    setCustomAccessory({ name:'', code:'', qty:1, unitPrice:0 })
    fire(`${name} added to this project`)
  }
  const updateCustomPiece = (index, changes) => setDesign(d => ({
    ...d, customCutPieces:(d.customCutPieces || []).map((piece, i) => i === index ? { ...piece, ...changes } : piece),
  }))
  const removeCustomPiece = (index) => setDesign(d => ({
    ...d, customCutPieces:(d.customCutPieces || []).filter((_, i) => i !== index),
  }))
  const addCustomPiece = () => {
    const sourceMm = Math.max(0, Number(customPiece.sourceMm || 0))
    if (!customPiece.position.trim() || !sourceMm) {
      fire('Enter a piece position and input measurement first'); return
    }
    setDesign(d => ({ ...d, customCutPieces:[...(d.customCutPieces || []), {
      ...customPiece, position:customPiece.position.trim(), sourceMm,
      adjustmentMm:Number(customPiece.adjustmentMm || 0), qty:Math.max(1, Number(customPiece.qty || 1)),
    }] }))
    setCustomPiece({ position:'', profile:'frame_outer', sourceMm:'', adjustmentMm:0, qty:1, cuts:'90°/90°', note:'' })
    fire('Fabrication piece added to the production breakdown')
  }
  const updateSiteImage = (id, changes) => setDesign(d => ({
    ...d, siteImages:(d.siteImages || []).map(image => image.id === id ? { ...image, ...changes } : image),
  }))
  const removeSiteImage = (id) => setDesign(d => ({
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
      setDesign(d => ({ ...d, siteImages:[...(d.siteImages || []), ...prepared] }))
      fire(`${prepared.length} site image${prepared.length === 1 ? '' : 's'} added — save the project to keep them`)
    } catch (err) {
      console.error(err); fire(err.message || 'Could not add site image')
    } finally { setSiteImageBusy(false) }
  }
  const setDim = (k, v) => setDesign(d => setSize(d, k, v))
  const setGrid = (cols, rows) => setDesign(d => resizeGrid(d, cols, rows))
  const onDividerMove = (axis, boundary, deltaMm) => setDesign(d => moveDivider(d, axis, boundary, deltaMm))
  const setSectionDim = (axis, index, mm) => setDesign(d => setSectionSize(d, axis, index, mm))
  const setCell = (k, v) => setDesign(d => {
    const cells = d.cells.map((c,i) => {
      if (i !== selected) return c
      if (k === 'opening') {
        const rateKey = frameRateKeyForOpening(v)
        return { ...c, opening:v, rateKey, ratePerM2:frameRateForRateKey(rateKey) }
      }
      return { ...c, [k]:v }
    }); return { ...d, cells }
  })
  const applyAll = (k, v) => setDesign(d => ({ ...d, cells: d.cells.map(c => ({ ...c, [k]:v })) }))

  // frameless: change panel count, keeping existing panel types
  const setPanelCount = (n) => setDesign(d => {
    const cells = Array.from({ length: n }, (_, i) =>
      d.cells[i] ? { ...d.cells[i] } : { type:'fixed', glass:'clear', opening:'fixed', panels:1 })
    const base = Math.floor(d.width / n)
    const colWidths = Array.from({ length: n }, (_, i) => i < n - 1 ? base : d.width - base * (n - 1))
    return { ...d, cols:n, cells, colWidths }
  })

  const quote = useMemo(() => design && calcQuote(design), [design])
  const bom   = useMemo(() => design && designBOMAny(design), [design])
  const accessoryRows = useMemo(() => design?.category === 'frame' ? frameAccessoryRows(design) : [], [design])
  const sel   = design && selected != null ? design.cells[selected] : null
  const frameCatalog = design?.category === 'frame'
    ? (FRAME_SYSTEMS[design.system] || FRAME_SYSTEMS.legacy)
    : null

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
    fire('⚠️ Backend unreachable — start it: cd sofaamy-bms/backend && .venv/bin/uvicorn app.main:app')
  }
  const onDownloadPdf = async () => {
    try { const qn = await downloadQuotePdf(client, design); fire(`📄 Quote ${qn} downloaded`) }
    catch (e) { apiFail(e) }
  }
  const onSaveJob = async () => {
    try {
      const r = await createJobFromDesign(client, design)
      refreshSaved()
      fire(`💾 Job ${r.job_number} created · Quote ${r.quote_number} · ${GHS(r.total)} — see Production board`)
    } catch (e) { apiFail(e) }
  }
  const onSaveDesign = async () => {
    try {
      const r = await saveDesign(client, design)
      refreshSaved()
      fire(`💾 Design "${r.ref || r.name}" saved — find it under Shapes → Saved Projects`)
    } catch (e) { apiFail(e) }
  }
  const onReport = async (kind, label) => {
    try { await downloadReport(kind, client, design); fire(`📄 ${label} downloaded`) }
    catch (e) { apiFail(e) }
  }
  // save + copy a public client link (2D/3D/Real viewer) — the thing
  // Sofaamy WhatsApps to their customer
  const onShareLink = async () => {
    try {
      const r = await saveDesign(client, design)
      refreshSaved()
      const url = `${window.location.origin}/share/${r.share_token}`
      try {
        await navigator.clipboard.writeText(url)
        fire('🔗 Client link copied — paste it into WhatsApp')
      } catch {
        window.prompt('Client link — copy it:', url)
      }
    } catch (e) { apiFail(e) }
  }
  // full WhatsApp send: save design → share link → composed quote message
  const [wa, setWa] = useState(null)
  const onWhatsApp = async () => {
    try {
      const r = await saveDesign(client, design)
      refreshSaved()
      setWa({
          message: quoteMessage({
            client: client || 'there', product: design.name,
            quoteNumber: r.ref || design.ref || design.name, total: quote.grandTotal,
            shareUrl: `${window.location.origin}/share/${r.share_token}`,
            depositPercent: design.depositPercent ?? 80,
          }),
        link: `${window.location.origin}/share/${r.share_token}`,
      })
    } catch (e) { apiFail(e) }
  }

  const [saved, setSaved] = useState([])
  const refreshSaved = () => listDesigns().then(setSaved).catch(() => {})
  useEffect(() => { refreshSaved() }, [])
  const openSaved = (s) => {
    setDesign(withAutoColour({ ...s.design, ref:s.ref, qty:s.qty, location:s.location }))
    setClient(s.client_name || '')
    setCat(s.design.category || 'frame')
    setSelected(0); setView('2d')
    fire(`Opened saved design "${s.ref || s.name}"`)
  }
  const duplicateSaved = (s, e) => {
    e.stopPropagation()
    const baseRef = s.ref || s.name || 'DESIGN'
    const copyRef = `${baseRef}-COPY`
    setDesign(withAutoColour({ ...s.design, ref:copyRef, name:`${s.design.name} (Copy)`, qty:s.qty, location:s.location }))
    setClient(s.client_name || '')
    setCat(s.design.category || 'frame')
    setSelected(0); setView('2d'); setTool('shapes')
    fire(`Duplicated "${s.ref || s.name}" — edit the copy, then save it`)
  }

  // per-category production report buttons
  const REPORT_BTNS = design?.category === 'frameless'
    ? [['glass-order','Glass Order PDF (fabrication drawings)'],['hardware-list','Hardware List PDF'],
       ['installation','Installation Sheet PDF'],['work-order','Factory Work Order PDF']]
    : [['cutting-list','Cutting List PDF'],['work-order','Factory Work Order PDF'],['internal-boq','Internal BOQ & Cost Floor PDF']]

  const toolTabs = activeCat === 'frameless'
    ? [['shapes','Designs']]
    : activeCat === 'curtainwall'
      ? [['shapes','Grids'],['dividers','Divider']]
      : [['shapes','Shapes'],['dividers','Divider'],['designs','Designs']]

  const newProjectModal = showNew && (
    <NewProjectModal newForm={newForm} setNewForm={setNewForm}
      setShowNew={setShowNew} createProject={createProject}/>
  )

  // ── PROJECTS HOME — the first screen: saved designs + create new ──
  if (!design) return (
    <>
      <div className="cfg-home">
        <div className="cfg-home-head">
          <div>
            <div className="t">Projects</div>
            <div className="s">Open a saved design, or start a new one — Frame, Frameless glass or Curtain Wall.</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowNew(true)}><IconPlus/> Create New Design</button>
        </div>
        {saved.length === 0
          ? <div className="cfg-home-empty">
              <IconCube style={{ width:40, height:40, opacity:.3 }}/>
              <p>No saved designs yet — create your first project.</p>
              <button className="btn btn-primary" onClick={() => setShowNew(true)}><IconPlus/> Create New Design</button>
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
                      <b>{GHS(s.total)}</b>
                      <button className="proj-duplicate" onClick={e => duplicateSaved(s, e)}>Duplicate & Edit</button>
                    </div>
                  </div>
                )
              })}
            </div>}
      </div>
      {newProjectModal}
      {toast && <div className="toast">{toast}</div>}
    </>
  )

  return (
    <>
    <div className={`cfg ${showLib ? '' : 'no-lib'} ${showProps ? '' : 'no-props'}`}>
      {/* ── TOOL PANELS ── */}
      {showLib && <div className="cfg-panel cfg-lib">
        <h4><IconLayers style={{ width:16, height:16, color:'var(--navy-600)' }} /> Design Tools
          <button className="panel-x" title="Hide the design library — more room to draw" onClick={() => setShowLib(false)}>«</button>
        </h4>

        {/* category switch — Sofaamy's three businesses */}
        <div className="tool-tabs" style={{ marginBottom:8 }}>
          {Object.entries(CATEGORIES).map(([k, c]) => (
            <button key={k} className={activeCat===k?'on':''} title={c.sub}
              onClick={() => { setCat(k); setTool('shapes') }}>{c.label}</button>
          ))}
        </div>

        {activeCat && toolTabs.length > 1 && (
          <div className="tool-tabs">
            {toolTabs.map(([k,lbl]) => (
              <button key={k} className={tool===k?'on':''} onClick={() => setTool(k)}>{lbl}</button>
            ))}
          </div>
        )}

        {!activeCat && <div className="cfg-lib-hint">Pick a product family above — Frame, Frameless glass, or Curtain Wall — to open its design library.</div>}

        {activeCat && tool === 'shapes' && <>
          <div className="cfg-lib-hint">
            {activeCat === 'frameless'
              ? 'Toughened-glass products — drag one onto the canvas. Panels carry their hardware sets automatically.'
              : activeCat === 'curtainwall'
                ? 'Stick-system facade grids — mullions run continuous, transoms cut between.'
                : 'Start here — drag a product shape onto the canvas, or click it.'}
          </div>
          <div className="cfg-lib-scroll">
            {LIBS[activeCat].map(g => (
              <div key={g.group}>
                <div className="lib-group">{g.group}</div>
                <div className="lib-grid">
                  {g.items.map(t => (
                    <div key={t.id} className="lib-item" draggable
                      onDragStart={e => e.dataTransfer.setData('text', `shape:${t.id}`)}
                      onClick={() => load(activeCat, t)} title={t.name}>
                      <LibThumb cat={activeCat} t={t}/>
                      <span>{t.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>}

        {activeCat && tool === 'dividers' && <>
          <div className="cfg-lib-hint">{design ? 'Drag a layout onto the canvas or click it. You can also drag any divider on the canvas to resize bays.' : 'Load a shape first, then split it with dividers.'}</div>
          <div className="cfg-lib-scroll">
            <div className="lib-group">Divider Layouts</div>
            <div className="lib-grid">
              {DIVIDER_LAYOUTS.map(l => (
                <div key={l.id} className={`lib-item ${!design?'disabled':''}`} draggable={!!design}
                  onDragStart={e => e.dataTransfer.setData('text', `divider:${l.id}`)}
                  onClick={() => design && setGrid(l.cols, l.rows)} title={l.label}>
                  <Thumb cols={l.cols} rows={l.rows} />
                  <span>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>}

        {activeCat === 'frame' && tool === 'designs' && <>
          <div className="cfg-lib-hint">{design ? 'Drag a design into a section on the canvas (or click to apply to the selected section).' : 'Load a shape first, then drop designs into its sections.'}</div>
          <div className="cfg-lib-scroll">
            {OPENING_DESIGNS.map(g => (
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
      </div>}

      {/* ── CANVAS ── */}
      <div className="cfg-stage">
        <div className="cfg-stage-head">
          <div>
            <div className="t">{design ? `${design.name}${design.ref ? ` · Ref: ${design.ref}` : ''}${design.qty > 1 ? ` · Qty: ${design.qty}` : ''}` : 'New Design'}</div>
            <div className="s">{design
              ? `${CATEGORIES[design.category]?.label || 'Frame'} · ${design.width} × ${design.height} mm · ${quote.sections} ${design.category === 'frameless' ? 'panel(s)' : 'section(s)'}`
              : 'Empty canvas — choose a product family, then drop a design'}</div>
          </div>
          <div className="flex gap-sm">
            <div className="panel-toggle" title="Show / hide the side panels — free up space for the drawing">
              <button className={showLib ? 'on' : ''} onClick={() => setShowLib(v => !v)}>Library</button>
              <button className={showProps ? 'on' : ''} onClick={() => setShowProps(v => !v)}>Properties</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setDesign(null); setSelected(null); refreshSaved() }}>‹ Projects</button>
            <button className="btn btn-ghost btn-sm" onClick={onSaveDesign}><IconCheck/> Save Design</button>
            <button className="btn btn-ghost btn-sm" onClick={newDesign}><IconPlus/> New Design</button>
          </div>
        </div>

        <div ref={wrapRef}
          className={`cfg-canvas-wrap ${dragOver?'drop-over':''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}>
          {view === '2d'
            ? (design.category === 'frameless'
                ? <FramelessCanvas design={design} stageW={dims.w} stageH={dims.h} selected={selected} onSelect={setSelected} onDividerMove={onDividerMove} />
                : design.category === 'curtainwall'
                  ? <CurtainWallCanvas design={design} stageW={dims.w} stageH={dims.h} selected={selected} onSelect={setSelected} onDividerMove={onDividerMove} />
                  : <DesignCanvas design={design} stageW={dims.w} stageH={dims.h} selected={selected} onSelect={setSelected} onDividerMove={onDividerMove} />)
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
      {showProps && <div>
        <div className="cfg-panel">
          <h4><IconCube style={{ width:16, height:16, color:'var(--navy-600)' }} /> Properties
            <button className="panel-x" title="Hide this panel — more room to draw" onClick={() => setShowProps(false)}>»</button>
          </h4>
          <div className="cfg-body">
            {!design && <div className="prop-empty">Drop a design on the canvas and its properties will appear here.</div>}

            {design && <>
              <div className="cfg-label" style={{ marginTop:0 }}>Project Item</div>
              <div className="ref-row">
                <input placeholder="Design ref (e.g. w3)" value={design.ref} onChange={e => patch({ ref:e.target.value })}/>
                <input type="number" min={1} max={999} title="Quantity" value={design.qty}
                  onChange={e => patch({ qty:Math.max(1, +e.target.value||1) })}/>
              </div>
              <input className="loc-input" placeholder="Location (e.g. First floor, master bedroom)"
                value={design.location} onChange={e => patch({ location:e.target.value })}/>

              {design.category === 'frame' && <>
                <div className="cfg-label">Measurement Record</div>
                <select className="cfg-select" value={design.measurementStatus || 'preliminary'} onChange={e => patch({ measurementStatus:e.target.value })}>
                  <option value="preliminary">Preliminary measurement — for quotation</option>
                  <option value="final">Final measurement — production basis</option>
                  <option value="client-provided">Client-provided measurement</option>
                </select>
                <select className="cfg-select" value={design.measurementSource || ''} onChange={e => patch({ measurementSource:e.target.value })}>
                  <option value="">Measurement source</option>
                  <option value="sofaamy-site-rep">Sofaamy site representative</option>
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
              </>}

              <div className="cfg-label">Overall Size</div>
              {[['width','Width',400,design.category==='curtainwall'?8000:6000],['height','Height',400,design.category==='curtainwall'?6000:4000]].map(([k,lbl,min,max]) => (
                <div className="dim-row" key={k}>
                  <label>{lbl}</label>
                  <input type="range" min={min} max={max} step={10} value={design[k]} onChange={e => setDim(k, +e.target.value)}/>
                  <span className="dim-val"><input type="number" value={design[k]} onChange={e => setDim(k, +e.target.value||min)}/><span>mm</span></span>
                </div>
              ))}

              {/* ── FRAME properties ── */}
              {design.category === 'frame' && <>
                <div className="cfg-label">Dividers</div>
                <Stepper label="Vertical dividers"   value={design.cols-1} min={0} max={7} onChange={v => setGrid(v+1, design.rows)} />
                <Stepper label="Horizontal dividers" value={design.rows-1} min={0} max={3} onChange={v => setGrid(design.cols, v+1)} />

                <div className="cfg-label">Profile System</div>
                <select className="cfg-select" value={design.system} onChange={e => patch({ system:e.target.value })}>
                  {FRAME_SYSTEM_ORDER.map(k => <option key={k} value={k}>{FRAME_SYSTEMS[k].label}</option>)}
                  {!FRAME_SYSTEMS[design.system] && <option value={design.system}>Existing saved system ({design.system})</option>}
                </select>
                <div className="cut-note" style={{ marginTop:8 }}>
                  <b>{frameCatalog.label}</b><br/>
                  {frameCatalog.productTypes.length
                    ? `${frameSystemSummary(frameCatalog.id)} · 5800 mm stock references`
                    : 'Legacy saved design — select a current Sofaamy system to use the supplied catalogue.'}
                  <br/><span style={{ color:'var(--ink-3)' }}>Catalogue references are loaded. Per-opening consumption and cutting rules remain pending confirmation.</span>
                </div>
                {frameCatalog.profiles.length > 0 && <details style={{ marginTop:8 }}>
                  <summary className="prop-sub" style={{ cursor:'pointer' }}>View catalogue parts</summary>
                  <div style={{ maxHeight:170, overflow:'auto', marginTop:6 }}>
                    {frameCatalog.profiles.map(p => <div key={`p-${p.code}`} className="q-line">
                      <div><div className="k">{p.name}</div><div className="d">{p.code} · {p.lengthMm} mm · {p.colours}</div></div>
                      <div className="a t-muted">GHS {p.listedPrice}</div>
                    </div>)}
                    {frameCatalog.accessories.map(a => <div key={`a-${a.code}-${a.name}`} className="q-line">
                      <div><div className="k">{a.name}</div><div className="d">{a.code}{a.note ? ` · ${a.note}` : ''}</div></div>
                      <div className="a t-muted">{a.listedValue}</div>
                    </div>)}
                  </div>
                </details>}

                <div className="cfg-label">Surface Finish</div>
                <select className="cfg-select" value={design.finishType} onChange={e => patch({ finishType:e.target.value })}>
                  {Object.entries(FINISH_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="swatches">
                  {Object.entries(FRAMES).map(([k,v]) => (
                    <div key={k} title={v.label} className={`swatch ${design.frame===k?'on':''}`} style={{ background:v.color }} onClick={() => patch({ frame:k, customFrameColor:'' })}/>
                  ))}
                </div>

                <div className="divider"/>
                <div className="cfg-label" style={{ marginTop:0 }}>Section {selected!=null ? selected+1 : ''}</div>
                {sel ? <>
                  <div className="prop-sub">Section Size (drag the divider on the canvas, or type)</div>
                  <div className="sec-size">
                    <label>W</label>
                    <input type="number" value={design.colWidths[selected % design.cols]}
                      onChange={e => setSectionDim('col', selected % design.cols, +e.target.value||0)} disabled={design.cols===1}/>
                    <label>H</label>
                    <input type="number" value={design.rowHeights[Math.floor(selected / design.cols)]}
                      onChange={e => setSectionDim('row', Math.floor(selected / design.cols), +e.target.value||0)} disabled={design.rows===1}/>
                    <span className="muted" style={{ fontSize:11 }}>mm</span>
                  </div>
                  <div className="prop-sub">Opening Type</div>
                  <div className="seg">
                    {Object.keys(OPENINGS).map(o => (
                      <button key={o} className={sel.opening===o?'on':''} onClick={() => setCell('opening', o)}>{OPENINGS[o].label}</button>
                    ))}
                  </div>
                  {sel.opening !== 'fixed' &&
                    <Stepper label="Opening panels in section" value={sel.panels || 1} min={1} max={4}
                      onChange={v => setCell('panels', v)} />}
                  <div className="prop-sub">Opening quantity in quotation</div>
                  <input className="cfg-select" type="number" min="1" max="999" step="1"
                    value={sel.itemQty || 1}
                    onChange={e => setCell('itemQty', Math.max(1, +e.target.value || 1))}/>
                  <div className="prop-sub">Client unit rate (GHS / m²)</div>
                  <input className="cfg-select" type="number" min="0" step="50"
                    value={sel.ratePerM2 || frameRateForRateKey(sel.rateKey || frameRateKeyForOpening(sel.opening))}
                    onChange={e => setCell('ratePerM2', Math.max(0, +e.target.value || 0))}/>
                  <div className="cut-note" style={{ marginTop:6 }}>
                    {FRAME_RATE_SOURCES[sel.rateKey || frameRateKeyForOpening(sel.opening)] || 'Operator-entered rate'}
                  </div>
                  <div className="prop-sub">Glass</div>
                  <select className="cfg-select" value={sel.glass} onChange={e => setCell('glass', e.target.value)}>
                    {FRAME_GLASS_CATALOG.map(g => <option key={g.code} value={g.code}>{g.label} · GHS {g.pricePerM2}/m²</option>)}
                  </select>
                  <div className="flex gap-sm" style={{ marginTop:12 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => applyAll('opening', sel.opening)}>Apply opening to all</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => applyAll('glass', sel.glass)}>Apply glass to all</button>
                  </div>
                </> : <div className="prop-empty">Click a section on the canvas to edit its glass and opening.</div>}
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
                    <input type="number" value={design.colWidths[selected % design.cols]}
                      onChange={e => setSectionDim('col', selected % design.cols, +e.target.value||0)} disabled={design.cols===1}/>
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
                    <input type="number" value={design.colWidths[selected % design.cols]}
                      onChange={e => setSectionDim('col', selected % design.cols, +e.target.value||0)} disabled={design.cols===1}/>
                    <label>H</label>
                    <input type="number" value={design.rowHeights[Math.floor(selected / design.cols)]}
                      onChange={e => setSectionDim('row', Math.floor(selected / design.cols), +e.target.value||0)} disabled={design.rows===1}/>
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

        {design && <>
          <div className="cfg-panel" style={{ marginTop:16 }}>
            <h4><IconFile style={{ width:16, height:16, color:'var(--navy-600)' }} /> Live Quotation</h4>
            <div className="cfg-body">
              <div className="q-total">
                <div className="lbl">{quote.qty > 1 ? `Client quotation — ${quote.qty} units` : 'Client quotation'}</div>
                <div className="amt">{GHS(quote.grandTotal)}</div>
                <div className="sub">{quote.qty > 1 ? `${GHS(quote.total)} per unit · ` : ''}Bundled fabrication and installation · taxes shown separately</div>
              </div>
              <input placeholder="Client name (e.g. Adom Estates Ltd)" value={client} onChange={e => setClient(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--line)', borderRadius:8, marginBottom:12, outline:'none' }}/>
              <div className="quote-contact-row" style={{ marginBottom:10 }}>
                <input placeholder="Client phone (optional)" value={design.clientPhone || ''}
                  onChange={e => patch({ clientPhone:e.target.value })}/>
                <input placeholder="Client email (optional)" value={design.clientEmail || ''}
                  onChange={e => patch({ clientEmail:e.target.value })}/>
              </div>
              <input placeholder="Job description (e.g. fabrication and installation of Trialco windows and doors)"
                value={design.jobDescription || ''} onChange={e => patch({ jobDescription:e.target.value })}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--line)', borderRadius:8, marginBottom:10, outline:'none' }}/>
              <div className="ref-row" style={{ marginBottom:10 }}>
                <label className="prop-sub" style={{ margin:0 }}>Profile / colour
                  <select className="cfg-select" value={design.customFrameColor ? 'custom' : (design.frame || 'mill')}
                    onChange={e => {
                      if (e.target.value === 'custom') patch({ colourDescription:'Custom colour' })
                      else patch({ frame:e.target.value, customFrameColor:'' })
                    }}>
                    {Object.entries(FRAMES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    {design.customFrameColor && <option value="custom">Custom colour</option>}
                  </select>
                </label>
                <label className="prop-sub" style={{ margin:0 }}>Valid days
                  <input className="cfg-select" type="number" min="1" max="30" value={design.quoteValidDays ?? 3}
                    onChange={e => patch({ quoteValidDays:Math.min(30, Math.max(1, +e.target.value || 3)) })}/>
                </label>
              </div>
              {design.category === 'frame' && <div className="ref-row" style={{ marginBottom:10 }}>
                <label className="prop-sub" style={{ margin:0 }}>Discount %
                  <input className="cfg-select" type="number" min="0" max="100" step="1" value={design.discountPercent ?? 0}
                    onChange={e => patch({ discountPercent:Math.min(100, Math.max(0, +e.target.value || 0)) })}/>
                </label>
                <label className="prop-sub" style={{ margin:0 }}>VAT %
                  <input className="cfg-select" type="number" min="0" max="100" step="1" value={design.vatPercent ?? 15}
                    onChange={e => patch({ vatPercent:Math.min(100, Math.max(0, +e.target.value || 0)) })}/>
                </label>
              </div>}
              {design.category === 'frame' && <div className="ref-row" style={{ marginBottom:10 }}>
                <label className="prop-sub" style={{ margin:0 }}>Deposit %
                  <input className="cfg-select" type="number" min="0" max="100" step="5" value={design.depositPercent ?? 80}
                    onChange={e => patch({ depositPercent:Math.min(100, Math.max(0, +e.target.value || 0)) })}/>
                </label>
                <label className="prop-sub" style={{ margin:0 }}>GETF + NHIS %
                  <input className="cfg-select" type="number" min="0" max="100" step="1" value={design.getfNhisPercent ?? 5}
                    onChange={e => patch({ getfNhisPercent:Math.min(100, Math.max(0, +e.target.value || 0)) })}/>
                </label>
              </div>}
              {design.category === 'frame' ? <>
                {(quote.clientLines || []).map((l,i) => (
                  <div className="q-line" key={i}>
                    <div><div className="k">{l.description}</div><div className="d">{l.widthMm} × {l.heightMm} mm · Qty {l.qty} · {l.m2.toFixed(2)} m²</div></div>
                    <div className="a">{GHS(l.total)}<div className="d" style={{ textAlign:'right' }}>{GHS(l.unitPrice)}/m²</div></div>
                  </div>
                ))}
                <div className="q-sum" style={{ marginTop:6 }}><span className="t-muted">Subtotal</span><b>{GHS(quote.clientSubtotal)}</b></div>
                {(quote.discountPercent || 0) > 0 && <div className="q-sum"><span className="t-muted">Discount ({quote.discountPercent}%)</span><b>−{GHS(quote.discountAmount)}</b></div>}
                <div className="q-sum"><span className="t-muted">GETF + NHIS ({quote.getfNhisPercent ?? 5}%)</span><b>{GHS(quote.getfNhis ?? 0)}</b></div>
                <div className="q-sum"><span className="t-muted">VAT ({quote.vatPercent ?? 15}%)</span><b>{GHS(quote.vat ?? 0)}</b></div>
                <div className="q-sum" style={{ borderTop:'2px solid var(--line)', marginTop:4, paddingTop:10, fontSize:15 }}><b>Grand total</b><b style={{ color:'var(--navy-600)' }}>{GHS(quote.grandTotal)}</b></div>
              </> : <>
                <div className="q-line"><div><div className="k">Fabrication and installation</div><div className="d">{quote.area} m² · bundled quotation</div></div><div className="a">{GHS(quote.grandTotal)}</div></div>
                <div className="q-sum" style={{ marginTop:6 }}><span className="t-muted">Internal subtotal</span><b>{GHS(quote.subtotal)}</b></div>
                <div className="q-sum"><span className="t-muted">Working margin ({quote.marginPct}%)</span><b>{GHS(quote.margin)}</b></div>
                <div className="q-sum" style={{ borderTop:'2px solid var(--line)', marginTop:4, paddingTop:10, fontSize:15 }}><b>Total</b><b style={{ color:'var(--navy-600)' }}>{GHS(quote.grandTotal)}</b></div>
              </>}
              <details style={{ marginTop:12 }}>
                <summary className="prop-sub" style={{ cursor:'pointer' }}>Internal working cost breakdown</summary>
                <div className="cut-note" style={{ marginTop:8 }}>
                  This is an internal estimate using the current prototype rules. Profile consumption, labour, wastage, and system deductions remain subject to Sofaamy confirmation.
                </div>
                {quote.lines.map((l,i) => (
                  <div className="q-line" key={i}><div><div className="k">{l.key}</div><div className="d">{l.detail}</div></div><div className="a">{GHS(l.amount)}</div></div>
                ))}
                <div className="q-sum" style={{ marginTop:6 }}><span className="t-muted">Internal subtotal</span><b>{GHS(quote.subtotal)}</b></div>
                <div className="q-sum"><span className="t-muted">Working margin ({quote.marginPct}%)</span><b>{GHS(quote.margin)}</b></div>
                <div className="q-sum"><span className="t-muted">Internal cost floor</span><b>{GHS(quote.internalFloor || 0)}</b></div>
                <div className={`q-floor ${quote.floorStatus === 'OK' ? 'ok' : 'bad'}`}>
                  {quote.floorStatus === 'OK'
                    ? `Floor check passed · ${GHS(quote.floorGap || 0)} headroom before tax`
                    : `REVIEW REQUIRED · ${GHS(Math.abs(quote.floorGap || 0))} below internal floor`}
                </div>
              </details>
              <div className="q-actions">
                <button className="btn btn-gold btn-block" onClick={onWhatsApp}><IconWhatsApp style={{ width:16, height:16 }} /> Send Quote on WhatsApp</button>
                <button className="btn btn-ghost btn-block" onClick={onShareLink}><IconCube style={{ width:16, height:16 }} /> Copy Client Link — 2D/3D view</button>
                <button className="btn btn-ghost btn-block" onClick={onDownloadPdf}><IconDownload style={{ width:16, height:16 }} /> Download Quote PDF</button>
                <button className="btn btn-primary btn-block" onClick={onSaveJob}><IconCheck style={{ width:16, height:16 }} /> Save & Create Job</button>
              </div>
              <div className="cfg-label" style={{ marginTop:14 }}>Production Documents</div>
              <div className="q-actions" style={{ marginTop:0 }}>
                {REPORT_BTNS.map(([kind, label]) => (
                  <button key={kind} className="btn btn-ghost btn-block" onClick={() => onReport(kind, label)}><IconDownload style={{ width:15, height:15 }} /> {label}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="cfg-panel" style={{ marginTop:16 }}>
            <h4>Bill of Materials</h4>
            <div className="cfg-body" style={{ paddingTop:6 }}>
              {design.category === 'frame' && <div className="floor-input">
                <label>Approved internal cost floor (project total, GHS)
                  <input type="number" min="0" step="0.01" placeholder="Optional — enter the confirmed material costing total"
                    value={design.costFloorOverride || ''}
                    onChange={e => patch({ costFloorOverride:Math.max(0, +e.target.value || 0) })}/>
                </label>
                <span>Use the supervisor’s approved material/installation sheet here. Leave blank to use the working estimate.</span>
              </div>}
              {design.category === 'frame' && <div className="accessory-editor">
                <div className="flex between items-center">
                  <div>
                    <div className="cfg-label" style={{ margin:0 }}>Project accessories</div>
                    <div className="cut-note">Derived from the selected system and opening details. Edit this project without changing the master catalogue.</div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => patch({ accessoryOverrides:[] })}>Reset defaults</button>
                </div>
                <div className="accessory-list">
                  {accessoryRows.map(a => (
                    <div className="accessory-row" key={a.code}>
                      <div className="accessory-main">
                        <b>{a.name}</b><span>{a.code} · {a.rule}{a.edited ? ' · edited' : ''}</span>
                      </div>
                      <input type="number" min="0" step="1" value={a.qty}
                        onChange={e => accessoryOverride(a, { qty:Math.max(0, +e.target.value || 0), removed:(+e.target.value || 0) <= 0 })}/>
                      <button className="accessory-remove" title="Remove from this project" onClick={() => accessoryOverride(a, { qty:0, removed:true })}>×</button>
                    </div>
                  ))}
                </div>
                <select className="cfg-select" value="" onChange={e => addCatalogueAccessory(e.target.value)}>
                  <option value="">+ Add catalogue accessory</option>
                  {(frameCatalog?.accessories || []).filter(a => !accessoryRows.some(r => r.code === a.code)).map(a =>
                    <option key={`${a.code}-${a.name}`} value={a.code}>{a.name} ({a.code})</option>)}
                </select>
                <div className="accessory-custom-row">
                  <input placeholder="Custom accessory" value={customAccessory.name} onChange={e => setCustomAccessory(x => ({ ...x, name:e.target.value }))}/>
                  <input placeholder="Code" value={customAccessory.code} onChange={e => setCustomAccessory(x => ({ ...x, code:e.target.value }))}/>
                  <input type="number" min="1" value={customAccessory.qty} onChange={e => setCustomAccessory(x => ({ ...x, qty:e.target.value }))}/>
                  <input type="number" min="0" step="0.01" placeholder="Value" value={customAccessory.unitPrice} onChange={e => setCustomAccessory(x => ({ ...x, unitPrice:e.target.value }))}/>
                  <button className="btn btn-ghost btn-sm" onClick={addCustomAccessory}>Add</button>
                </div>
              </div>}
              {design.category === 'frame' && <div className="piece-editor">
                <div className="cfg-label" style={{ margin:0 }}>Production piece additions</div>
                <div className="cut-note">Add a curve, template, special member, or any site-specific piece. Measurements are per unit and flow into the cutting list and work order.</div>
                {(design.customCutPieces || []).map((piece, index) => (
                  <div className="piece-edit-row" key={`${piece.position}-${index}`}>
                    <input placeholder="Piece position" value={piece.position || ''} onChange={e => updateCustomPiece(index, { position:e.target.value })}/>
                    <select value={piece.profile || 'frame_outer'} onChange={e => updateCustomPiece(index, { profile:e.target.value })}>
                      {CUT_PROFILE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input type="number" min="0" placeholder="Input mm" value={piece.sourceMm || ''} onChange={e => updateCustomPiece(index, { sourceMm:e.target.value })}/>
                    <input type="number" placeholder="Adj. mm" value={piece.adjustmentMm ?? 0} onChange={e => updateCustomPiece(index, { adjustmentMm:e.target.value })}/>
                    <input type="number" min="1" value={piece.qty || 1} onChange={e => updateCustomPiece(index, { qty:e.target.value })}/>
                    <select value={piece.cuts || 'SPECIAL / TEMPLATE'} onChange={e => updateCustomPiece(index, { cuts:e.target.value })}>
                      <option>90°/90°</option><option>45°/45°</option><option>CURVE / TEMPLATE</option><option>SPECIAL / TEMPLATE</option>
                    </select>
                    <button className="accessory-remove" title="Remove production piece" onClick={() => removeCustomPiece(index)}>×</button>
                    <input className="piece-note" placeholder="Note / radius / template reference" value={piece.note || ''} onChange={e => updateCustomPiece(index, { note:e.target.value })}/>
                  </div>
                ))}
                <div className="piece-add-row">
                  <input placeholder="e.g. F1 curved head" value={customPiece.position} onChange={e => setCustomPiece(p => ({ ...p, position:e.target.value }))}/>
                  <select value={customPiece.profile} onChange={e => setCustomPiece(p => ({ ...p, profile:e.target.value }))}>
                    {CUT_PROFILE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input type="number" min="0" placeholder="Input mm" value={customPiece.sourceMm} onChange={e => setCustomPiece(p => ({ ...p, sourceMm:e.target.value }))}/>
                  <input type="number" placeholder="Adj. mm" value={customPiece.adjustmentMm} onChange={e => setCustomPiece(p => ({ ...p, adjustmentMm:e.target.value }))}/>
                  <input type="number" min="1" value={customPiece.qty} onChange={e => setCustomPiece(p => ({ ...p, qty:e.target.value }))}/>
                  <select value={customPiece.cuts} onChange={e => setCustomPiece(p => ({ ...p, cuts:e.target.value }))}>
                    <option>90°/90°</option><option>45°/45°</option><option>CURVE / TEMPLATE</option><option>SPECIAL / TEMPLATE</option>
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={addCustomPiece}>Add</button>
                  <input className="piece-note" placeholder="Note / radius / template reference" value={customPiece.note} onChange={e => setCustomPiece(p => ({ ...p, note:e.target.value }))}/>
                </div>
              </div>}
              <div className="cfg-label" style={{ marginTop:12 }}>Derived materials & catalogue references</div>
              {bom.filter(b => !String(b.item).startsWith('Accessory —')).map((b,i) => (
                <div className="q-line" key={i}><div><div className="k">{b.item}</div><div className="d">{b.note}</div></div><div className="a t-muted" style={{ fontWeight:600 }}>{b.qty}</div></div>
              ))}
            </div>
          </div>
        </>}
      </div>}

      {toast && <div className="toast">{toast}</div>}
    </div>

    {design && (design.category === 'frameless'
      ? <GlassOrder design={design} />
      : <CutPlan design={design} />)}

    {newProjectModal}
    {wa && <WhatsAppModal to={{ phone: '', name: client || 'Client' }}
      message={wa.message} link={wa.link} onClose={() => setWa(null)}/>}
    </>
  )
}

function NewProjectModal({ newForm, setNewForm, setShowNew, createProject }) {
  const groups = LIBS[newForm.cat] || []
  const selectedTemplate = groups.flatMap(g => g.items).find(t => t.id === newForm.templateId)
  const selectedCategory = CATEGORIES[newForm.cat]

  return (
      <div className="modal-back" onClick={() => setShowNew(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h4>New Project Item</h4>
          <div className="modal-section-label">Project category</div>
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
          <div className="modal-grid">
            <label>Design ref <span className="req">*</span>
              <input autoFocus placeholder="e.g. w3" value={newForm.ref}
                onChange={e => setNewForm(f => ({ ...f, ref:e.target.value }))}/>
            </label>
            <label>Quantity <span className="req">*</span>
              <input type="number" min={1} max={999} value={newForm.qty}
                onChange={e => setNewForm(f => ({ ...f, qty:e.target.value }))}/>
            </label>
          </div>
          <label className="modal-full">Client name
            <input placeholder="e.g. RGA Special Gardens" value={newForm.clientName}
              onChange={e => setNewForm(f => ({ ...f, clientName:e.target.value }))}/>
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

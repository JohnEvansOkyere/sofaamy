import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import DesignCanvas from './DesignCanvas.jsx'
import FramelessCanvas from './FramelessCanvas.jsx'
import CurtainWallCanvas from './CurtainWallCanvas.jsx'
import CutPlan from './CutPlan.jsx'
import GlassOrder from './GlassOrder.jsx'

// 3D view is heavy (three.js) — loaded only when first opened
const Design3D = lazy(() => import('./Design3D.jsx'))
import { DESIGN_GROUPS, DIVIDER_LAYOUTS, templateById, buildDesign, resizeGrid, setSize, setSectionSize, moveDivider, designLayout } from '../../lib/designs.js'
import { FL_GROUPS, flTemplateById, buildFrameless } from '../../lib/frameless.js'
import { CW_GROUPS, cwTemplateById, buildCurtainWall } from '../../lib/curtainwall.js'
import { CATEGORIES, OPENINGS, OPENING_DESIGNS, openingDesignById, GLASS, FRAMES, SYSTEMS, FINISH_TYPES, FL_GLASS, FL_PANEL_TYPES, FL_FAB, CW_CELL_TYPES } from '../../lib/products.js'
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

// ── category plumbing ──
const LIBS = { frame: DESIGN_GROUPS, frameless: FL_GROUPS, curtainwall: CW_GROUPS }

const anyTemplateById = (id) => {
  if (id.startsWith('fl-')) { const t = flTemplateById(id); return t && { cat:'frameless', t } }
  if (id.startsWith('cw-')) { const t = cwTemplateById(id); return t && { cat:'curtainwall', t } }
  const t = templateById(id); return t && { cat:'frame', t }
}
const buildFor = (cat, t) =>
  cat === 'frameless' ? buildFrameless(t) : cat === 'curtainwall' ? buildCurtainWall(t) : buildDesign(t)

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
  const [newForm, setNewForm] = useState({ ref:'', qty:1, location:'', cat:'frame', templateId:'w-fixed' })

  // library + hints follow the user's explicit pick; falls back to the
  // open design's family (load()/openSaved() keep `cat` in sync)
  const activeCat = cat || design?.category
  const load = (fcat, t, extra = {}) => {
    const d = { ...buildFor(fcat, t), ...extra }
    setDesign(d); setCat(fcat); setSelected(0); setView('2d'); setTool('shapes')
  }
  const newDesign = () => setShowNew(true)

  const createProject = () => {
    const m = anyTemplateById(newForm.templateId)
    if (m) load(m.cat, m.t, { ref:newForm.ref, qty:Math.max(1, +newForm.qty || 1), location:newForm.location })
    setShowNew(false)
  }

  // drop an openable design (EvA: drag "Double Door" into F2) onto a section — frame only
  const applyOpening = (od, idx) => {
    if (od == null || idx == null || !design || design.category !== 'frame') return
    setDesign(d => ({ ...d, cells: d.cells.map((c, i) =>
      i === idx ? { ...c, opening: od.opening, panels: od.panels } : c) }))
    setSelected(idx)
    fire(`${od.label} → section F${idx + 1}`)
  }

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const data = e.dataTransfer.getData('text')
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
    const m = anyTemplateById(data)
    if (m) load(m.cat, m.t)
  }

  const patch = (u) => setDesign(d => ({ ...d, ...u }))
  const setDim = (k, v) => setDesign(d => setSize(d, k, v))
  const setGrid = (cols, rows) => setDesign(d => resizeGrid(d, cols, rows))
  const onDividerMove = (axis, boundary, deltaMm) => setDesign(d => moveDivider(d, axis, boundary, deltaMm))
  const setSectionDim = (axis, index, mm) => setDesign(d => setSectionSize(d, axis, index, mm))
  const setCell = (k, v) => setDesign(d => {
    const cells = d.cells.map((c,i) => i===selected ? { ...c, [k]:v } : c); return { ...d, cells }
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
  const sel   = design && selected != null ? design.cells[selected] : null

  const wrapRef = useRef(null)
  const [dims, setDims] = useState({ w: 720, h: 480 })
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({ w: Math.max(320, e.contentRect.width - 20), h: 480 }))
    ro.observe(el); return () => ro.disconnect()
  }, [])
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

  const [saved, setSaved] = useState([])
  const refreshSaved = () => listDesigns().then(setSaved).catch(() => {})
  useEffect(() => { refreshSaved() }, [])
  const openSaved = (s) => {
    setDesign({ ...s.design, ref:s.ref, qty:s.qty, location:s.location })
    setCat(s.design.category || 'frame')
    setSelected(0); setView('2d')
    fire(`Opened saved design "${s.ref || s.name}"`)
  }

  // per-category production report buttons
  const REPORT_BTNS = design?.category === 'frameless'
    ? [['glass-order','Glass Order PDF (fabrication drawings)'],['hardware-list','Hardware List PDF'],
       ['installation','Installation Sheet PDF'],['work-order','Factory Work Order PDF']]
    : [['cutting-list','Cutting List PDF'],['work-order','Factory Work Order PDF'],['boq','Bill of Quantities PDF']]

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
                      <span className="proj-sub">
                        {s.design.width} × {s.design.height} mm
                        {s.qty > 1 ? ` · ×${s.qty}` : ''}{s.location ? ` · ${s.location}` : ''}
                      </span>
                    </div>
                    <div className="proj-right">
                      <span className="proj-cat" style={{ background:c.accent }}>{c.label}</span>
                      <b>{GHS(s.total)}</b>
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
    <div className="cfg">
      {/* ── TOOL PANELS ── */}
      <div className="cfg-panel cfg-lib">
        <h4><IconLayers style={{ width:16, height:16, color:'var(--navy-600)' }} /> Design Tools</h4>

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
                      onDragStart={e => e.dataTransfer.setData('text', t.id)}
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
          <div className="cfg-lib-hint">{design ? 'Click a layout to re-split the grid. Drag any divider on the canvas to resize bays.' : 'Load a shape first, then split it with dividers.'}</div>
          <div className="cfg-lib-scroll">
            <div className="lib-group">Divider Layouts</div>
            <div className="lib-grid">
              {DIVIDER_LAYOUTS.map(l => (
                <div key={l.id} className={`lib-item ${!design?'disabled':''}`}
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
      </div>

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
                  <Design3D design={design} wall={wall} />
                </Suspense>
              </div>}

          {design && design.category === 'frame' && (
            <div className="view-switch">
              <button className={view==='2d'?'on':''} onClick={() => setView('2d')}>2D</button>
              <button className={view==='3d'&&!wall?'on':''} onClick={() => { setView('3d'); setWall(false) }}>3D</button>
              <button className={view==='3d'&&wall?'on':''} onClick={() => { setView('3d'); setWall(true) }}>Wall</button>
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
      <div>
        <div className="cfg-panel">
          <h4><IconCube style={{ width:16, height:16, color:'var(--navy-600)' }} /> Properties</h4>
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
                  {Object.entries(SYSTEMS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>

                <div className="cfg-label">Surface Finish</div>
                <select className="cfg-select" value={design.finishType} onChange={e => patch({ finishType:e.target.value })}>
                  {Object.entries(FINISH_TYPES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <div className="swatches">
                  {Object.entries(FRAMES).map(([k,v]) => (
                    <div key={k} title={v.label} className={`swatch ${design.frame===k?'on':''}`} style={{ background:v.color }} onClick={() => patch({ frame:k })}/>
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
                    <Stepper label="Sash panels in section" value={sel.panels || 1} min={1} max={4}
                      onChange={v => setCell('panels', v)} />}
                  <div className="prop-sub">Glass</div>
                  <div className="seg">
                    {Object.entries(GLASS).map(([k,v]) => (
                      <button key={k} className={sel.glass===k?'on':''} onClick={() => setCell('glass', k)}>{v.label}</button>
                    ))}
                  </div>
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

                <div className="cfg-label">Panels</div>
                <Stepper label="Panels in run" value={design.cols} min={1} max={8} onChange={setPanelCount} />
                <label className="check-row">
                  <input type="checkbox" checked={design.overPanel}
                    onChange={e => patch({ overPanel:e.target.checked })}/>
                  <span>Over-panel above doors (transom lite)</span>
                </label>
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
                    <div key={k} title={v.label} className={`swatch ${design.frame===k?'on':''}`} style={{ background:v.color }} onClick={() => patch({ frame:k })}/>
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
                <div className="lbl">{quote.qty > 1 ? `Total — ${quote.qty} units (incl. ${quote.marginPct}% margin)` : `Total (incl. ${quote.marginPct}% margin)`}</div>
                <div className="amt">{GHS(quote.grandTotal)}</div>
                <div className="sub">{quote.qty > 1 ? `${GHS(quote.total)} per unit · ` : ''}VAT exclusive · prices in Ghana Cedi</div>
              </div>
              <input placeholder="Client name (e.g. Adom Estates Ltd)" value={client} onChange={e => setClient(e.target.value)}
                style={{ width:'100%', padding:'9px 12px', border:'1px solid var(--line)', borderRadius:8, marginBottom:12, outline:'none' }}/>
              {quote.lines.map((l,i) => (
                <div className="q-line" key={i}><div><div className="k">{l.key}</div><div className="d">{l.detail}</div></div><div className="a">{GHS(l.amount)}</div></div>
              ))}
              <div className="q-sum" style={{ marginTop:6 }}><span className="t-muted">Subtotal</span><b>{GHS(quote.subtotal)}</b></div>
              <div className="q-sum"><span className="t-muted">Margin ({quote.marginPct}%)</span><b>{GHS(quote.margin)}</b></div>
              <div className="q-sum" style={{ borderTop:'2px solid var(--line)', marginTop:4, paddingTop:10, fontSize:15 }}><b>Total</b><b style={{ color:'var(--navy-600)' }}>{GHS(quote.total)}</b></div>
              <div className="q-actions">
                <button className="btn btn-gold btn-block" onClick={() => fire(`✅ Quote sent to ${client||'client'} on WhatsApp`)}><IconWhatsApp style={{ width:16, height:16 }} /> Send Quote on WhatsApp</button>
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
              {bom.map((b,i) => (
                <div className="q-line" key={i}><div><div className="k">{b.item}</div><div className="d">{b.note}</div></div><div className="a t-muted" style={{ fontWeight:600 }}>{b.qty}</div></div>
              ))}
            </div>
          </div>
        </>}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>

    {design && (design.category === 'frameless'
      ? <GlassOrder design={design} />
      : <CutPlan design={design} />)}

    {newProjectModal}
    </>
  )
}

function NewProjectModal({ newForm, setNewForm, setShowNew, createProject }) {
  return (
      <div className="modal-back" onClick={() => setShowNew(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h4>New Project Item</h4>
          <div className="tool-tabs" style={{ marginBottom:12 }}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} className={newForm.cat===k?'on':''}
                onClick={() => setNewForm(f => ({ ...f, cat:k, templateId:LIBS[k][0].items[0].id }))}>{c.label}</button>
            ))}
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
          <label className="modal-full">Location
            <input placeholder="e.g. First floor, master bedroom" value={newForm.location}
              onChange={e => setNewForm(f => ({ ...f, location:e.target.value }))}/>
          </label>
          <label className="modal-full">Product type
            <select value={newForm.templateId} onChange={e => setNewForm(f => ({ ...f, templateId:e.target.value }))}>
              {LIBS[newForm.cat].map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={createProject}>Create & Open Canvas</button>
          </div>
        </div>
      </div>
  )
}

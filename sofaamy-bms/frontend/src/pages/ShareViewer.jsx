import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useParams } from 'react-router-dom'
import FramelessCanvas from '../components/configurator/FramelessCanvas.jsx'
import DesignCanvas from '../components/configurator/DesignCanvas.jsx'
import CurtainWallCanvas from '../components/configurator/CurtainWallCanvas.jsx'
import { getSharedDesign } from '../lib/api.js'
import { GHS } from '../lib/pricing.js'
import { CATEGORIES, FL_GLASS, FRAMES } from '../lib/products.js'
import '../styles/share.css'

const Design3D = lazy(() => import('../components/configurator/Design3D.jsx'))
const Frameless3D = lazy(() => import('../components/configurator/Frameless3D.jsx'))

// PUBLIC CLIENT VIEW — what Sofaamy's customer opens from the WhatsApp
// link. Read-only: drawing, 3D, realistic view, sizes and the quoted
// total. Sofaamy-branded; no internal costs, no engineering data.
const TYPE_LABELS = { fixed:'Fixed panel', door:'Swing door', hinged:'Hinged door', slider:'Sliding panel', over:'Fanlight' }

export default function ShareViewer() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  const [view, setView] = useState('real')

  useEffect(() => {
    getSharedDesign(token)
      .then(d => {
        setData(d)
        // realistic view only exists for frameless; others open on the drawing
        if (d.design.category !== 'frameless') setView('2d')
      })
      .catch(() => setErr(true))
  }, [token])

  const wrapRef = useRef(null)
  const [dims, setDims] = useState({ w: 720, h: 460 })
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({
      w: Math.max(320, e.contentRect.width - 8),
      h: Math.max(380, Math.min(560, window.innerHeight - 320)),
    }))
    ro.observe(el); return () => ro.disconnect()
  }, [data])

  const d = data?.design
  const noop = useMemo(() => () => {}, [])

  if (err) return (
    <div className="share-page"><ShareHeader/>
      <div className="share-card share-empty">
        <h2>Link not found</h2>
        <p>This design link is invalid or has been removed. Please ask Sofaamy Co. Ltd for a new link.</p>
      </div>
      <ShareFooter/>
    </div>
  )
  if (!data) return (
    <div className="share-page"><ShareHeader/>
      <div className="share-card share-empty"><p>Loading your design…</p></div>
      <ShareFooter/>
    </div>
  )

  const cat = CATEGORIES[d.category] || CATEGORIES.frame
  const isFl = d.category === 'frameless'
  const tabs = isFl
    ? [['real','Real View'],['3d','3D'],['2d','Drawing']]
    : d.category === 'frame' ? [['2d','Drawing'],['3d','3D'],['wall','On the Wall']]
    : [['2d','Drawing']]
  const glassLabel = isFl ? (FL_GLASS[d.glassId]?.label || '') : ''

  return (
    <div className="share-page">
      <ShareHeader/>

      <div className="share-card">
        <div className="share-title">
          <div>
            <h2>{data.ref ? `${data.ref} — ` : ''}{data.name}</h2>
            <div className="share-sub">
              {data.location && <span>{data.location} · </span>}
              Prepared for {data.client_name || 'you'} · {new Date(data.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}
            </div>
          </div>
          <div className="share-chips">
            <span className="chip" style={{ background:cat.accent, color:'#fff' }}>{cat.label}</span>
            <span className="chip">{d.width} × {d.height} mm</span>
            {glassLabel && <span className="chip">{glassLabel}</span>}
            {!isFl && d.frame && <span className="chip">{FRAMES[d.frame]?.label}</span>}
            {data.qty > 1 && <span className="chip">× {data.qty} units</span>}
          </div>
        </div>

        <div className="share-tabs">
          {tabs.map(([k, lbl]) => (
            <button key={k} className={view===k?'on':''} onClick={() => setView(k)}>{lbl}</button>
          ))}
        </div>

        <div className="share-stage" ref={wrapRef}>
          {view === '2d' && (
            isFl ? <FramelessCanvas design={d} stageW={dims.w} stageH={dims.h} selected={null} onSelect={noop} onDividerMove={noop}/>
            : d.category === 'curtainwall'
              ? <CurtainWallCanvas design={d} stageW={dims.w} stageH={dims.h} selected={null} onSelect={noop} onDividerMove={noop}/>
              : <DesignCanvas design={d} stageW={dims.w} stageH={dims.h} selected={null} onSelect={noop} onDividerMove={noop}/>
          )}
          {view !== '2d' && (
            <div style={{ width: dims.w, height: dims.h }}>
              <Suspense fallback={<div className="share-loading">Loading 3D view…</div>}>
                {isFl
                  ? <Frameless3D design={d} scene={view === 'real'}/>
                  : <Design3D design={d} wall={view === 'wall'}/>}
              </Suspense>
            </div>
          )}
        </div>
        {view !== '2d' && <div className="share-hint">Drag to rotate · scroll to zoom</div>}
      </div>

      {isFl && data.panels?.length > 0 && (
        <div className="share-card">
          <h3>What's included</h3>
          <table className="share-table">
            <thead><tr><th>Panel</th><th>Type</th><th>Size (mm)</th><th>Weight</th></tr></thead>
            <tbody>
              {data.panels.map(p => (
                <tr key={p.mark}>
                  <td>{p.mark}</td>
                  <td>{TYPE_LABELS[p.type] || p.type}</td>
                  <td>{p.w_mm} × {p.h_mm}</td>
                  <td>{p.kg} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="share-note">{glassLabel} toughened safety glass · stainless-steel fittings</div>
        </div>
      )}

      <div className="share-card share-price">
        <div>
          <div className="lbl">Your investment{data.qty > 1 ? ` — ${data.qty} units` : ''}</div>
          <div className="amt">{GHS(data.grand_total)}</div>
          <div className="terms">Deposit and balance follow the agreed quotation terms · prices in Ghana Cedi, VAT exclusive</div>
        </div>
        <a className="share-cta" href="https://wa.me/233000000000" target="_blank" rel="noreferrer">
          Chat with us on WhatsApp
        </a>
      </div>

      <ShareFooter/>
    </div>
  )
}

function ShareHeader() {
  return (
    <div className="share-head">
      <div className="share-logo">S</div>
      <div>
        <div className="n">Sofaamy Co. Ltd</div>
        <div className="s">Glass · Aluminium · Fabrication — Accra, Ghana</div>
      </div>
    </div>
  )
}

function ShareFooter() {
  return <div className="share-foot">Powered by Veloxa Technology</div>
}

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Stage, Layer, Rect, Line, Text, Group, Arrow } from 'react-konva'
import './Configurator.css'

// ── PRICING ENGINE ────────────────────────────────────────────────
const MATERIAL_RATES = {
  profilePricePerMetre: 85,       // GHS per metre of aluminium profile
  glassPrices: {
    clear: 120,                   // GHS per m²
    frosted: 160,
    tinted: 175,
    tempered: 220,
    laminated: 260,
  },
  hardwareSets: {
    fixed: 80,
    casement: 180,
    sliding: 240,
    louvre: 320,
  },
  labourPerM2: 95,
  marginPercent: 20,
}

function calcCost(config) {
  const { width, height, panels, openingType, glassType } = config
  const w = width / 1000  // convert mm to metres
  const h = height / 1000
  const area = w * h

  // Profile perimeter + internal dividers
  const perimeter = 2 * (w + h)
  const dividers = (panels - 1) * h
  const totalProfile = perimeter + dividers

  const profileCost  = totalProfile * MATERIAL_RATES.profilePricePerMetre
  const glassCost    = area * (MATERIAL_RATES.glassPrices[glassType] || 120)
  const hardwareCost = MATERIAL_RATES.hardwareSets[openingType] || 80
  const labourCost   = area * MATERIAL_RATES.labourPerM2
  const subtotal     = profileCost + glassCost + hardwareCost + labourCost
  const margin       = subtotal * (MATERIAL_RATES.marginPercent / 100)
  const total        = subtotal + margin

  return {
    profileCost: profileCost.toFixed(2),
    glassCost:   glassCost.toFixed(2),
    hardwareCost:hardwareCost.toFixed(2),
    labourCost:  labourCost.toFixed(2),
    subtotal:    subtotal.toFixed(2),
    margin:      margin.toFixed(2),
    total:       total.toFixed(2),
    area:        area.toFixed(3),
  }
}

// ── GLASS COLOURS ─────────────────────────────────────────────────
const GLASS_FILL = {
  clear:    { fill: '#cce8f4', opacity: 0.55 },
  frosted:  { fill: '#dde8ee', opacity: 0.75 },
  tinted:   { fill: '#4a8a6a', opacity: 0.38 },
  tempered: { fill: '#b8d4e8', opacity: 0.6  },
  laminated:{ fill: '#d0c8e0', opacity: 0.6  },
}

const FRAME_COLOURS = {
  mill:    '#b0b8c1',
  white:   '#f0f0f0',
  bronze:  '#8B6914',
  black:   '#2C2C2C',
  charcoal:'#4A4A4A',
}

const OPENING_LABELS = {
  fixed:    'Fixed',
  casement: 'Casement (Side-hung)',
  sliding:  'Sliding',
  louvre:   'Louvre',
}

// ── CANVAS RENDERER ───────────────────────────────────────────────
function WindowCanvas({ config, canvasW, canvasH }) {
  const { width, height, panels, openingType, glassType, frameColour, frameThickness } = config

  const PADDING    = 70
  const available  = { w: canvasW - PADDING * 2, h: canvasH - PADDING * 2 }
  const scale      = Math.min(available.w / width, available.h / height) * 0.85
  const fw         = width  * scale
  const fh         = height * scale
  const ox         = (canvasW - fw) / 2
  const oy         = (canvasH - fh) / 2
  const ft         = frameThickness * scale
  const glass      = GLASS_FILL[glassType] || GLASS_FILL.clear
  const frameColor = FRAME_COLOURS[frameColour] || FRAME_COLOURS.mill
  const panelW     = (fw - ft * 2 - ft * (panels - 1)) / panels

  // dimension line helpers
  const dimColor  = '#E67E22'
  const dimFont   = Math.max(10, Math.min(13, scale * 18))
  const tickLen   = 8

  const hDimY = oy + fh + 32
  const vDimX = ox - 36

  return (
    <Stage width={canvasW} height={canvasH}>
      <Layer>
        {/* ── OUTER FRAME ── */}
        <Rect
          x={ox} y={oy} width={fw} height={fh}
          fill={frameColor}
          shadowColor="rgba(0,0,0,0.18)" shadowBlur={12} shadowOffsetY={4}
          cornerRadius={2}
        />

        {/* ── GLASS PANELS ── */}
        {Array.from({ length: panels }).map((_, i) => {
          const px = ox + ft + i * (panelW + ft)
          const py = oy + ft
          const pw = panelW
          const ph = fh - ft * 2

          // opening type indicators
          const isCasement = openingType === 'casement'
          const isSliding  = openingType === 'sliding'
          const isLouvre   = openingType === 'louvre'

          return (
            <Group key={i}>
              {/* glass fill */}
              <Rect
                x={px} y={py} width={pw} height={ph}
                fill={glass.fill} opacity={glass.opacity}
                cornerRadius={1}
              />
              {/* glass shimmer */}
              <Rect
                x={px + 4} y={py + 4} width={pw * 0.25} height={ph * 0.18}
                fill="rgba(255,255,255,0.45)"
                cornerRadius={2}
              />

              {/* casement swing arc */}
              {isCasement && (
                <>
                  <Line
                    points={[px + 4, py + 4, px + pw - 4, py + ph - 4]}
                    stroke="rgba(255,255,255,0.4)" strokeWidth={1}
                    dash={[6, 4]}
                  />
                  <Line
                    points={[px + 4, py + 4, px + 4, py + ph * 0.6]}
                    stroke={dimColor} strokeWidth={1.2} dash={[4, 3]}
                  />
                </>
              )}

              {/* sliding arrow */}
              {isSliding && i === 0 && (
                <Arrow
                  points={[px + pw * 0.25, py + ph * 0.5, px + pw * 0.75, py + ph * 0.5]}
                  stroke="rgba(255,255,255,0.5)" strokeWidth={1.5}
                  fill="rgba(255,255,255,0.5)"
                  pointerLength={6} pointerWidth={6}
                />
              )}

              {/* louvre slats */}
              {isLouvre && Array.from({ length: 5 }).map((_, s) => (
                <Line
                  key={s}
                  points={[px + 4, py + (ph / 6) * (s + 1), px + pw - 4, py + (ph / 6) * (s + 1)]}
                  stroke={frameColor} strokeWidth={ft * 0.6}
                  opacity={0.9}
                />
              ))}

              {/* sash border */}
              <Rect
                x={px} y={py} width={pw} height={ph}
                fill="transparent"
                stroke={frameColor} strokeWidth={ft * 0.45}
                cornerRadius={1}
              />
            </Group>
          )
        })}

        {/* panel dividers */}
        {Array.from({ length: panels - 1 }).map((_, i) => (
          <Rect
            key={i}
            x={ox + ft + (i + 1) * panelW + i * ft}
            y={oy + ft}
            width={ft}
            height={fh - ft * 2}
            fill={frameColor}
          />
        ))}

        {/* ── DIMENSION LINES ── */}

        {/* Width dimension */}
        <Line points={[ox, hDimY, ox + fw, hDimY]} stroke={dimColor} strokeWidth={1.2}/>
        <Line points={[ox, hDimY - tickLen, ox, hDimY + tickLen]} stroke={dimColor} strokeWidth={1.2}/>
        <Line points={[ox + fw, hDimY - tickLen, ox + fw, hDimY + tickLen]} stroke={dimColor} strokeWidth={1.2}/>
        <Text
          x={ox} y={hDimY + 6}
          width={fw} align="center"
          text={`${width} mm`}
          fontSize={dimFont} fill={dimColor} fontFamily="Inter" fontStyle="600"
        />

        {/* Height dimension */}
        <Line points={[vDimX, oy, vDimX, oy + fh]} stroke={dimColor} strokeWidth={1.2}/>
        <Line points={[vDimX - tickLen, oy, vDimX + tickLen, oy]} stroke={dimColor} strokeWidth={1.2}/>
        <Line points={[vDimX - tickLen, oy + fh, vDimX + tickLen, oy + fh]} stroke={dimColor} strokeWidth={1.2}/>
        <Text
          x={vDimX - 48} y={oy}
          height={fh} verticalAlign="middle"
          width={40} align="center"
          text={`${height} mm`}
          fontSize={dimFont} fill={dimColor} fontFamily="Inter" fontStyle="600"
          rotation={-90}
          offsetX={-20}
          offsetY={fh / 2}
        />

        {/* frame thickness callout */}
        <Text
          x={ox + fw + 10} y={oy + 2}
          text={`Frame: ${frameThickness}mm`}
          fontSize={Math.max(9, dimFont - 2)}
          fill="#95A5A6"
          fontFamily="Inter"
        />

        {/* opening label */}
        <Text
          x={ox} y={oy - 26}
          width={fw} align="center"
          text={OPENING_LABELS[openingType] || openingType}
          fontSize={Math.max(10, dimFont - 1)}
          fill="#7F8C8D"
          fontFamily="Inter"
          fontStyle="500"
        />

        {/* panel count */}
        {panels > 1 && (
          <Text
            x={ox} y={oy + fh + 50}
            width={fw} align="center"
            text={`${panels}-Panel Configuration`}
            fontSize={Math.max(9, dimFont - 2)}
            fill="#AAB7B8"
            fontFamily="Inter"
          />
        )}
      </Layer>
    </Stage>
  )
}

// ── MAIN CONFIGURATOR ─────────────────────────────────────────────
export default function Configurator() {
  const [config, setConfig] = useState({
    productType:    'window',
    width:          1200,
    height:         1050,
    panels:         2,
    openingType:    'casement',
    glassType:      'clear',
    frameColour:    'mill',
    frameThickness: 45,
  })

  const [activeTab, setActiveTab] = useState('dimensions')
  const canvasRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 480 })

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (let e of entries) {
        const { width, height } = e.contentRect
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
      }
    })
    if (canvasRef.current) obs.observe(canvasRef.current)
    return () => obs.disconnect()
  }, [])

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }))

  const cost = calcCost(config)

  const inputProps = (key, type = 'number', min, max) => ({
    type,
    value: config[key],
    min, max,
    onChange: e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)
  })

  return (
    <div className="configurator">

      {/* ── LEFT PANEL ── */}
      <aside className="ctrl-panel">

        <div className="ctrl-header">
          <div className="ctrl-title">Configure Product</div>
          <div className="ctrl-sub">Adjust settings — canvas updates live</div>
        </div>

        {/* Product type */}
        <div className="ctrl-section">
          <label className="ctrl-label">Product Type</label>
          <div className="type-grid">
            {[
              { key:'window', label:'Window Frame', icon:'⬜' },
              { key:'door',   label:'Door Frame',   icon:'🚪' },
              { key:'frameless', label:'Frameless Glass', icon:'💎' },
            ].map(p => (
              <button
                key={p.key}
                className={`type-btn ${config.productType === p.key ? 'active' : ''}`}
                onClick={() => set('productType', p.key)}
              >
                <span className="type-icon">{p.icon}</span>
                <span className="type-label">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="tab-row">
          {['dimensions', 'glass', 'frame'].map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* DIMENSIONS TAB */}
        {activeTab === 'dimensions' && (
          <div className="tab-content">
            <div className="field-group">
              <label className="field-label">Width (mm)</label>
              <div className="slider-row">
                <input className="range-input" type="range" min={400} max={3000} step={10}
                  value={config.width} onChange={e => set('width', Number(e.target.value))}/>
                <input className="num-input" {...inputProps('width','number',400,3000)}/>
              </div>
              <div className="field-hint">Min 400mm — Max 3000mm</div>
            </div>

            <div className="field-group">
              <label className="field-label">Height (mm)</label>
              <div className="slider-row">
                <input className="range-input" type="range" min={300} max={3500} step={10}
                  value={config.height} onChange={e => set('height', Number(e.target.value))}/>
                <input className="num-input" {...inputProps('height','number',300,3500)}/>
              </div>
              <div className="field-hint">Min 300mm — Max 3500mm</div>
            </div>

            <div className="field-group">
              <label className="field-label">Number of Panels</label>
              <div className="panels-row">
                {[1,2,3,4].map(n => (
                  <button key={n}
                    className={`panel-btn ${config.panels === n ? 'active' : ''}`}
                    onClick={() => set('panels', n)}
                  >{n}</button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Opening Type</label>
              <select className="select-input" {...inputProps('openingType','text')}>
                <option value="fixed">Fixed</option>
                <option value="casement">Casement (Side-hung)</option>
                <option value="sliding">Sliding</option>
                <option value="louvre">Louvre</option>
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">Frame Thickness (mm)</label>
              <div className="slider-row">
                <input className="range-input" type="range" min={25} max={80} step={5}
                  value={config.frameThickness} onChange={e => set('frameThickness', Number(e.target.value))}/>
                <input className="num-input" {...inputProps('frameThickness','number',25,80)}/>
              </div>
            </div>
          </div>
        )}

        {/* GLASS TAB */}
        {activeTab === 'glass' && (
          <div className="tab-content">
            <div className="field-group">
              <label className="field-label">Glass Type</label>
              <div className="glass-grid">
                {Object.entries(GLASS_FILL).map(([key, val]) => (
                  <button
                    key={key}
                    className={`glass-btn ${config.glassType === key ? 'active' : ''}`}
                    onClick={() => set('glassType', key)}
                  >
                    <div className="glass-swatch"
                      style={{ background: val.fill, opacity: val.opacity + 0.3 }}/>
                    <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <span className="glass-price">
                      GHS {MATERIAL_RATES.glassPrices[key]}/m²
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Glass Area</label>
              <div className="stat-chip">
                {cost.area} m²
                <span className="stat-chip-sub">calculated from width × height</span>
              </div>
            </div>
          </div>
        )}

        {/* FRAME TAB */}
        {activeTab === 'frame' && (
          <div className="tab-content">
            <div className="field-group">
              <label className="field-label">Frame / Aluminium Finish</label>
              <div className="colour-grid">
                {Object.entries(FRAME_COLOURS).map(([key, hex]) => (
                  <button
                    key={key}
                    className={`colour-btn ${config.frameColour === key ? 'active' : ''}`}
                    onClick={() => set('frameColour', key)}
                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                  >
                    <div className="colour-swatch" style={{ background: hex }}/>
                    <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── CANVAS AREA ── */}
      <section className="canvas-area">
        <div className="canvas-toolbar">
          <div className="canvas-toolbar-left">
            <span className="canvas-label">Live Design Preview</span>
            <span className="canvas-dims-badge">
              {config.width} × {config.height} mm
            </span>
          </div>
          <div className="canvas-toolbar-right">
            <span className="canvas-hint">Dimensions update in real time</span>
          </div>
        </div>

        <div className="canvas-wrap" ref={canvasRef}>
          <WindowCanvas
            config={config}
            canvasW={canvasSize.w}
            canvasH={canvasSize.h}
          />
        </div>

        {/* spec strip */}
        <div className="spec-strip">
          <div className="spec-item">
            <span className="spec-label">Type</span>
            <span className="spec-val">{OPENING_LABELS[config.openingType]}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Glass</span>
            <span className="spec-val">{config.glassType.charAt(0).toUpperCase() + config.glassType.slice(1)}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Finish</span>
            <span className="spec-val">{config.frameColour.charAt(0).toUpperCase() + config.frameColour.slice(1)}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Panels</span>
            <span className="spec-val">{config.panels}</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Frame</span>
            <span className="spec-val">{config.frameThickness}mm</span>
          </div>
          <div className="spec-item">
            <span className="spec-label">Area</span>
            <span className="spec-val">{cost.area} m²</span>
          </div>
        </div>
      </section>

      {/* ── RIGHT PANEL — COST ── */}
      <aside className="cost-panel">
        <div className="cost-header">
          <div className="cost-title">Cost Estimate</div>
          <div className="cost-sub">Auto-calculated — updates live</div>
        </div>

        <div className="cost-breakdown">
          <div className="cost-row">
            <span className="cost-row-label">Aluminium Profile</span>
            <span className="cost-row-val">GHS {cost.profileCost}</span>
          </div>
          <div className="cost-row">
            <span className="cost-row-label">Glass ({config.glassType})</span>
            <span className="cost-row-val">GHS {cost.glassCost}</span>
          </div>
          <div className="cost-row">
            <span className="cost-row-label">Hardware Set</span>
            <span className="cost-row-val">GHS {cost.hardwareCost}</span>
          </div>
          <div className="cost-row">
            <span className="cost-row-label">Labour</span>
            <span className="cost-row-val">GHS {cost.labourCost}</span>
          </div>
          <div className="cost-divider"/>
          <div className="cost-row subtotal">
            <span className="cost-row-label">Subtotal</span>
            <span className="cost-row-val">GHS {cost.subtotal}</span>
          </div>
          <div className="cost-row">
            <span className="cost-row-label">Margin (20%)</span>
            <span className="cost-row-val">GHS {cost.margin}</span>
          </div>
          <div className="cost-total-box">
            <span className="cost-total-label">Total Estimate</span>
            <span className="cost-total-val">GHS {cost.total}</span>
          </div>
        </div>

        <div className="cost-disclaimer">
          Estimate only. Final quote subject to site survey and current material prices.
        </div>

        <div className="actions">
          <button className="btn-primary" onClick={() => alert('Quote PDF generation — coming in Phase 2')}>
            Generate Quote PDF
          </button>
          <button className="btn-secondary" onClick={() => alert('Spec sheet export — coming in Phase 2')}>
            Export Spec Sheet
          </button>
          <button className="btn-ghost" onClick={() => {
            setConfig({
              productType:'window', width:1200, height:1050,
              panels:2, openingType:'casement', glassType:'clear',
              frameColour:'mill', frameThickness:45
            })
          }}>
            Reset
          </button>
        </div>

        <div className="pipeline-preview">
          <div className="pipeline-label">Job Pipeline Preview</div>
          <div className="pipeline-steps">
            {['Intake','Design ✓','Quote','Approved','Factory','Delivered'].map((s,i) => (
              <div key={i} className={`pip-step ${i === 1 ? 'active' : i < 1 ? 'done' : ''}`}>
                <div className="pip-dot"/>
                <div className="pip-name">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

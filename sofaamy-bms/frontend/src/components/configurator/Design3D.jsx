import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls, Text } from '@react-three/drei'
import { FRAMES, GLASS } from '../../lib/products.js'
import { frameGlassByCode } from '../../lib/frameCatalog.js'
import './configurator.css'

// Client visualizer — the same Frame design record drives the geometry,
// colours, viewpoints, and opening animation. Dimensions remain millimetres
// in the model and are scaled to metres only at the Three.js boundary.
const M = (mm) => mm / 1000
const FACE = 50
const DEPTH = 70
const SASH_FACE = 40
const SASH_DEPTH = 34
const FLOOR_APERTURE = 900
const HARDWARE = '#b9c3ca'

const WALL_PRESETS = [
  { label:'Warm plaster', value:'#ded8cc' },
  { label:'Sofaamy blue', value:'#b9d4e5' },
  { label:'Modern grey', value:'#b7bec5' },
  { label:'White render', value:'#f1f0eb' },
  { label:'Terracotta', value:'#c98567' },
]

function Member({ b, color, metalness = 0.55, roughness = 0.35 }) {
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]}>
      <boxGeometry args={[M(b.w), M(b.h), M(b.d)]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

function Glass({ b, tint }) {
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]}>
      <boxGeometry args={[M(b.w), M(b.h), M(6)]} />
      <meshPhysicalMaterial color={tint} transparent opacity={0.38}
        metalness={0.2} roughness={0.08} transmission={0.05} />
    </mesh>
  )
}

// Shared visual anchor locations for the fabrication overlay. These labels
// describe the mechanism position; exact accessory codes remain system-data
// controlled and are not inferred from this presentation geometry.
function accessoryMarkers(panel) {
  const w = panel.width, h = panel.height
  const z = SASH_DEPTH / 2 + 14
  if (panel.opening === 'sliding') return [
    { kind:'roller', label:'Roller', x:-w * 0.28, y:-h / 2 + 18, z:z - 8 },
    { kind:'roller', label:'Roller', x:w * 0.28, y:-h / 2 + 18, z:z - 8 },
    { kind:'handle', label:'Handle', x:w / 2 - 28, y:0, z:z + 2 },
  ]
  if (panel.opening === 'awning') return [
    { kind:'pivot', label:'Top pivot', x:-w * 0.32, y:h / 2 - 18, z },
    { kind:'pivot', label:'Top pivot', x:w * 0.32, y:h / 2 - 18, z },
    { kind:'handle', label:'Handle', x:0, y:-h / 2 + 24, z:z + 3 },
  ]
  const hingeSide = panel.panelIndex % 2 === 1 ? -1 : 1
  return [
    { kind:'hinge', label:'Hinge', x:hingeSide * (w / 2 - 9), y:-h * 0.3, z },
    { kind:'hinge', label:'Hinge', x:hingeSide * (w / 2 - 9), y:h * 0.3, z },
    { kind:'handle', label:'Handle', x:-hingeSide * (w / 2 - 24), y:0, z:z + 2 },
  ]
}

function FabricationMarker({ marker }) {
  const color = marker.kind === 'handle' ? '#c28a20' : '#b64040'
  const code = marker.kind === 'roller' ? 'R' : marker.kind === 'pivot' ? 'P' : marker.kind === 'hinge' ? 'H' : 'L'
  return (
    <group position={[M(marker.x), M(marker.y), M(marker.z)]}>
      <mesh renderOrder={20}>
        <sphereGeometry args={[M(13), 12, 8]} />
        <meshBasicMaterial color={color} depthTest={false} />
      </mesh>
      <Text position={[0, M(32), M(5)]} fontSize={M(36)} color={color}
        anchorX="center" anchorY="middle" renderOrder={21} depthOffset={-10}
        outlineWidth={M(5)} outlineColor="#ffffff">
        {code}
      </Text>
    </group>
  )
}

function DimensionLine({ start, end, label, offset = 0.04 }) {
  const dx = end[0] - start[0], dy = end[1] - start[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len * offset, ny = dx / len * offset
  const a = [start[0] + nx, start[1] + ny, start[2]]
  const b = [end[0] + nx, end[1] + ny, end[2]]
  const tx = dx / len * 0.035, ty = dy / len * 0.035
  const tickA = [[a[0] - tx, a[1] - ty, a[2]], [a[0] + tx, a[1] + ty, a[2]]]
  const tickB = [[b[0] - tx, b[1] - ty, b[2]], [b[0] + tx, b[1] + ty, b[2]]]
  return (
    <group renderOrder={15}>
      <Line points={[a, b]} color="#b26a1d" lineWidth={1.4} depthTest={false} />
      <Line points={tickA} color="#b26a1d" lineWidth={1.4} depthTest={false} />
      <Line points={tickB} color="#b26a1d" lineWidth={1.4} depthTest={false} />
      <Text position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2] + 0.02]}
        fontSize={0.075} color="#8b5015" anchorX="center" anchorY="middle"
        renderOrder={16} depthOffset={-10} outlineWidth={0.012} outlineColor="#ffffff">
        {label}
      </Text>
    </group>
  )
}

function FabricationDimensions({ d, geometry }) {
  const cw = d.colWidths?.length === d.cols ? d.colWidths : Array.from({ length:d.cols }, () => d.width / d.cols)
  const rh = d.rowHeights?.length === d.rows ? d.rowHeights : Array.from({ length:d.rows }, () => d.height / d.rows)
  const cumX = cw.reduce((a, w) => [...a, a[a.length - 1] + w], [0])
  const cumY = rh.reduce((a, h) => [...a, a[a.length - 1] + h], [0])
  const x0 = -M(d.width / 2), y0 = -M(d.height / 2)
  return (
    <group>
      <DimensionLine start={[x0, y0, 0.08]} end={[M(d.width / 2), y0, 0.08]} label={`Overall W ${Math.round(d.width)} mm`} offset={-0.28} />
      <DimensionLine start={[x0, y0, 0.08]} end={[x0, M(d.height / 2), 0.08]} label={`Overall H ${Math.round(d.height)} mm`} offset={0.28} />
      {cw.map((w, c) => <DimensionLine key={`cw-${c}`} start={[M(cumX[c]) + x0, y0, 0.09]} end={[M(cumX[c + 1]) + x0, y0, 0.09]} label={`${Math.round(w)} mm`} offset={-0.12} />)}
      {rh.map((h, r) => <DimensionLine key={`rh-${r}`} start={[x0, M(cumY[r]) + y0, 0.09]} end={[x0, M(cumY[r + 1]) + y0, 0.09]} label={`${Math.round(h)} mm`} offset={0.12} />)}
      {geometry.panels.map((panel, i) => <group key={`panel-label-${i}`}>
        <Text position={[M(panel.cx), M(panel.cy), 0.08]} fontSize={0.052} maxWidth={Math.max(M(panel.width) - 0.12, 0.28)}
          lineHeight={1.15} textAlign="center" color="#37556c" anchorX="center" anchorY="middle" renderOrder={14} depthOffset={-9}
          outlineWidth={0.012} outlineColor="#ffffff">
          {`${panel.section || `F${i + 1}`}\n${Math.round(panel.width)} × ${Math.round(panel.height)} mm`}
        </Text>
      </group>)}
    </group>
  )
}

// Presentation hardware: these are visual indicators of the operating
// mechanism, not a system-specific fabrication/accessory schedule. They live
// inside the animated sash group so hinges, rollers, and handles travel with
// the opening panel in every viewpoint.
function Hardware({ panel }) {
  const opening = panel.opening
  const w = panel.width
  const h = panel.height
  const z = SASH_DEPTH / 2 + 7
  const metal = <meshStandardMaterial color={HARDWARE} metalness={0.9} roughness={0.2} />

  if (opening === 'sliding') return (
    <>
      {[-1, 1].map((side, i) => <mesh key={`roller-${i}`} position={[M(side * (w * 0.28)), M(-h / 2 + 18), M(z - 8)]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[M(11), M(11), M(8), 16]} />{metal}
      </mesh>)}
      <mesh position={[M(w / 2 - 28), 0, M(z + 4)]}>
        <boxGeometry args={[M(8), M(86), M(9)]} />{metal}
      </mesh>
      <mesh position={[M(w / 2 - 28), 0, M(z + 10)]}>
        <boxGeometry args={[M(18), M(8), M(5)]} />{metal}
      </mesh>
    </>
  )

  if (opening === 'awning') return (
    <>
      {[-1, 1].map((side, i) => <mesh key={`awning-pivot-${i}`} position={[M(side * (w * 0.32)), M(h / 2 - 18), M(z)]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[M(10), M(10), M(34), 16]} />{metal}
      </mesh>)}
      <mesh position={[0, M(-h / 2 + 24), M(z + 5)]}>
        <boxGeometry args={[M(74), M(8), M(8)]} />{metal}
      </mesh>
    </>
  )

  // Side-hinged leaves, swing doors, and pivot-style leaves all get a pair
  // of visible vertical hinge barrels plus a handle on the opposite stile.
  const hingeSide = panel.panelIndex % 2 === 1 ? -1 : 1
  const hingeX = hingeSide * (w / 2 - 9)
  const handleX = -hingeSide * (w / 2 - 24)
  return (
    <>
      {[-0.3, 0.3].map((level, i) => <mesh key={`hinge-${i}`} position={[M(hingeX), M(h * level), M(z)]}>
        <cylinderGeometry args={[M(9), M(9), M(68), 16]} />{metal}
      </mesh>)}
      <mesh position={[M(handleX), 0, M(z + 4)]}>
        <boxGeometry args={[M(8), M(94), M(10)]} />{metal}
      </mesh>
      <mesh position={[M(handleX), 0, M(z + 10)]}>
        <boxGeometry args={[M(20), M(8), M(5)]} />{metal}
      </mesh>
    </>
  )
}

function glassTint(code) {
  const g = frameGlassByCode(code)
  if (g?.family === 'Reflective') return '#6f9eae'
  if (g?.family === 'Tinted / special') return '#697885'
  if (g?.family === 'Laminated') return '#b7c9d8'
  return (GLASS[code] || GLASS.clear).fill || '#a9d3e3'
}

// Design (mm, origin bottom-left) → static frame members, fixed glass, and
// movable panels. Movable panels use local coordinates so they can rotate
// around a hinge or slide along a track without breaking the wall geometry.
function buildGeometry(d) {
  const cw = d.colWidths?.length === d.cols ? d.colWidths : Array.from({ length: d.cols }, () => d.width / d.cols)
  const rh = d.rowHeights?.length === d.rows ? d.rowHeights : Array.from({ length: d.rows }, () => d.height / d.rows)
  const cumX = cw.reduce((a, w) => [...a, a[a.length - 1] + w], [0])
  const cumY = rh.reduce((a, h) => [...a, a[a.length - 1] + h], [0])
  const X = (x) => x - d.width / 2
  const Y = (y) => y - d.height / 2
  const members = [], fixedGlass = [], panels = []

  members.push({ x:X(d.width / 2), y:Y(d.height - FACE / 2), w:d.width, h:FACE, d:DEPTH })
  members.push({ x:X(d.width / 2), y:Y(FACE / 2), w:d.width, h:FACE, d:DEPTH })
  members.push({ x:X(FACE / 2), y:Y(d.height / 2), w:FACE, h:d.height - 2 * FACE, d:DEPTH })
  members.push({ x:X(d.width - FACE / 2), y:Y(d.height / 2), w:FACE, h:d.height - 2 * FACE, d:DEPTH })
  for (let j = 1; j < d.cols; j++)
    members.push({ x:X(cumX[j]), y:Y(d.height / 2), w:FACE, h:d.height - 2 * FACE, d:DEPTH })
  for (let r = 1; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++)
      members.push({ x:X(cumX[c] + cw[c] / 2), y:Y(cumY[r]), w:cw[c] - FACE, h:FACE, d:DEPTH })

  d.cells.forEach((cell, i) => {
    const c = i % d.cols, r = Math.floor(i / d.cols)
    const secW = cw[c], secH = rh[r]
    const cx = cumX[c] + secW / 2, cy = cumY[r] + secH / 2
    const tint = glassTint(cell.glass)
    if (cell.opening === 'fixed') {
      fixedGlass.push({ x:X(cx), y:Y(cy), w:secW - FACE, h:secH - FACE, tint })
      return
    }

    const n = cell.panels || 1
    const sashW = secW / n
    const sashH = secH - FACE
    for (let k = 0; k < n; k++) {
      const z = cell.opening === 'sliding' && n > 1 ? (k % 2 === 0 ? 16 : -16) : 0
      const px = cumX[c] + k * sashW + sashW / 2
      const localMembers = [
        { x:0, y:sashH / 2 - SASH_FACE / 2, w:sashW, h:SASH_FACE, d:SASH_DEPTH },
        { x:0, y:-sashH / 2 + SASH_FACE / 2, w:sashW, h:SASH_FACE, d:SASH_DEPTH },
        { x:-sashW / 2 + SASH_FACE / 2, y:0, w:SASH_FACE, h:sashH - 2 * SASH_FACE, d:SASH_DEPTH },
        { x:sashW / 2 - SASH_FACE / 2, y:0, w:SASH_FACE, h:sashH - 2 * SASH_FACE, d:SASH_DEPTH },
      ]
      panels.push({
        opening:cell.opening, panelIndex:k, panelCount:n,
        slideIndex:c * n + k, slideCount:d.cols * n,
        section:`F${i + 1}${n > 1 ? `-${k + 1}` : ''}`,
        cx:X(px), cy:Y(cy), z, width:sashW, height:sashH,
        tint, members:localMembers,
        glass:{ x:0, y:0, w:sashW - 2 * SASH_FACE, h:sashH - 2 * SASH_FACE, d:6 },
      })
    }
  })
  return { members, fixedGlass, panels }
}

function AnimatedPanel({ panel, frameColor, openAmount, fabrication }) {
  const ref = useRef(null)
  const base = useMemo(() => ({ x:M(panel.cx), y:M(panel.cy), z:M(panel.z) }), [panel])

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = Math.max(0, Math.min(1, openAmount))
    const ease = a * a * (3 - 2 * a)
    const opening = panel.opening
    let x = base.x, y = base.y, z = base.z, rx = 0, ry = 0

    if (opening === 'sliding') {
      // The lead panel moves behind its neighbour; for three panels the last
      // panel opens the other way to make the motion visually legible.
      const direction = panel.slideIndex === 0 ? -1 : panel.slideIndex === panel.slideCount - 1 ? 1 : 0
      x += M(direction * panel.width * 0.44 * ease)
    } else if (opening === 'awning') {
      const angle = -Math.PI / 180 * 52 * ease
      const relY = -M(panel.height / 2)
      y += relY * (Math.cos(angle) - 1)
      z += -relY * Math.sin(angle)
      rx = angle
    } else {
      const angle = Math.PI / 180 * 72 * ease
      const rightHinge = panel.panelIndex % 2 === 1
      const side = rightHinge ? -1 : 1
      const relX = side * M(panel.width / 2)
      x += relX * (Math.cos(angle) - 1)
      z += relX * Math.sin(angle)
      ry = side * angle
    }

    // Lerp positions/rotations in Three's render loop for a smooth demo even
    // when the range control is dragged quickly.
    const speed = Math.min(1, delta * 12)
    ref.current.position.x += (x - ref.current.position.x) * speed
    ref.current.position.y += (y - ref.current.position.y) * speed
    ref.current.position.z += (z - ref.current.position.z) * speed
    ref.current.rotation.x += (rx - ref.current.rotation.x) * speed
    ref.current.rotation.y += (ry - ref.current.rotation.y) * speed
  })

  return (
    <group ref={ref} position={[base.x, base.y, base.z]}>
      {panel.members.map((b, i) => <Member key={i} b={b} color={frameColor} />)}
      <Glass b={panel.glass} tint={panel.tint} />
      <Hardware panel={panel} />
      {fabrication && accessoryMarkers(panel).map((marker, i) => <FabricationMarker key={`marker-${i}`} marker={marker} />)}
    </group>
  )
}

function Wall({ d, wallColor, floorColor }) {
  const t = 150, margin = 900
  const top = d.height / 2 + 500, bot = -d.height / 2 - FLOOR_APERTURE
  const reveal = '#9b978f'
  return (
    <group>
      <Member b={{ x:-d.width / 2 - margin / 2, y:(top + bot) / 2, w:margin, h:top - bot, d:t, z:-110 }} color={wallColor} metalness={0.05} roughness={0.8}/>
      <Member b={{ x:d.width / 2 + margin / 2, y:(top + bot) / 2, w:margin, h:top - bot, d:t, z:-110 }} color={wallColor} metalness={0.05} roughness={0.8}/>
      <Member b={{ x:0, y:d.height / 2 + 250, w:d.width, h:500, d:t, z:-110 }} color={wallColor} metalness={0.05} roughness={0.8}/>
      <Member b={{ x:0, y:-d.height / 2 - FLOOR_APERTURE / 2, w:d.width, h:FLOOR_APERTURE, d:t, z:-110 }} color={wallColor} metalness={0.05} roughness={0.8}/>
      <Member b={{ x:0, y:d.height / 2 - 30, w:70, h:60, d:220, z:-75 }} color={reveal} metalness={0.05} roughness={0.7}/>
      <Member b={{ x:0, y:-d.height / 2 + 30, w:70, h:60, d:220, z:-75 }} color={reveal} metalness={0.05} roughness={0.7}/>
      <mesh position={[0, M(bot), 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[M(d.width) + 4, 4]} />
        <meshStandardMaterial color={floorColor} roughness={0.82} />
      </mesh>
    </group>
  )
}

function CameraRig({ mode, design, wall }) {
  const controls = useRef(null)
  const { camera } = useThree()
  const size = Math.max(design.width, design.height) / 1000

  useEffect(() => {
    const distance = Math.max(size * 2.4, 3.6)
    const positions = {
      orbit: [size * 1.5, size * 0.55, size * 1.9],
      front: [0, 0, distance],
      inside: [0, 0, -distance],
      back: [-distance * 0.75, size * 0.15, -distance],
    }
    const [x, y, z] = positions[mode] || positions.orbit
    camera.position.set(x, y, z)
    camera.lookAt(0, wall ? -M(design.height) * 0.16 : 0, 0)
    if (controls.current) {
      controls.current.target.set(0, wall ? -M(design.height) * 0.16 : 0, 0)
      controls.current.enabled = mode === 'orbit'
      controls.current.update()
    }
  }, [camera, design.height, mode, size, wall])

  return <OrbitControls ref={controls} enableDamping dampingFactor={0.12} enabled={mode === 'orbit'} />
}

function VisualizerControls({ wall, settings, setSetting, hasOpening, maximized, onMaximize }) {
  return (
    <div className="viz-controls">
      <div className="viz-control-group">
        <span className="viz-control-label">View</span>
        {['orbit', 'front', 'inside', 'back'].map(k => <button key={k} className={settings.view === k ? 'on' : ''} onClick={() => setSetting('view', k)}>{k === 'orbit' ? 'Orbit' : k[0].toUpperCase() + k.slice(1)}</button>)}
      </div>
      <div className="viz-control-group">
        <span className="viz-control-label">Wall</span>
        <input type="color" value={settings.wallColor} onChange={e => setSetting('wallColor', e.target.value)} title="Wall colour"/>
        <select value={settings.wallColor} onChange={e => setSetting('wallColor', e.target.value)}>
          {WALL_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="viz-control-group">
        <span className="viz-control-label">Frame</span>
        <input type="color" value={settings.frameColor} onChange={e => setSetting('frameColor', e.target.value)} title="Frame colour"/>
      </div>
      <div className="viz-control-group">
        <button className={settings.fabrication ? 'on' : ''} onClick={() => setSetting('fabrication', !settings.fabrication)}>
          {settings.fabrication ? 'Fabrication' : 'Client view'}
        </button>
        {settings.fabrication && <span className="viz-fab-legend">H hinge · P pivot · R roller · L handle</span>}
      </div>
      {hasOpening && <div className="viz-control-group viz-motion">
        <span className="viz-control-label">Opening</span>
        <button onClick={() => setSetting('openAmount', settings.openAmount > 0.5 ? 0 : 1)}>{settings.openAmount > 0.5 ? 'Close' : 'Open'}</button>
        <input type="range" min="0" max="1" step="0.01" value={settings.openAmount} onChange={e => setSetting('openAmount', +e.target.value)} />
        <span>{Math.round(settings.openAmount * 100)}%</span>
      </div>}
      <div className="viz-control-group viz-display-action">
        <button onClick={onMaximize}>{maximized ? 'Minimize' : 'Maximize'}</button>
      </div>
    </div>
  )
}

export default function Design3D({ design, wall = false, onDesignPatch, fabricationDefault = false }) {
  const geometry = useMemo(() => buildGeometry(design), [design])
  const shellRef = useRef(null)
  const [maximized, setMaximized] = useState(false)
  const defaultFrame = design.customFrameColor || (FRAMES[design.frame] || FRAMES.mill).color
  const [settings, setSettings] = useState({
    view: design.visualView || 'orbit',
    wallColor: design.wallColor || '#ded8cc',
    floorColor: design.floorColor || '#cfd6dc',
    frameColor: defaultFrame,
    openAmount: 0,
    fabrication: fabricationDefault,
  })

  useEffect(() => {
    setSettings(s => ({ ...s, frameColor:design.customFrameColor || (FRAMES[design.frame] || FRAMES.mill).color }))
  }, [design.customFrameColor, design.frame])

  useEffect(() => {
    const onFullscreen = () => setMaximized(document.fullscreenElement === shellRef.current)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => document.removeEventListener('fullscreenchange', onFullscreen)
  }, [])

  const toggleMaximize = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (shellRef.current?.requestFullscreen) await shellRef.current.requestFullscreen()
      else setMaximized(v => !v)
    } catch {
      setMaximized(v => !v)
    }
  }

  const setSetting = (key, value) => {
    setSettings(s => ({ ...s, [key]:value }))
    if (onDesignPatch && ['wallColor', 'floorColor', 'view'].includes(key)) {
      onDesignPatch(key === 'view' ? { visualView:value } : { [key]:value })
    }
    if (onDesignPatch && key === 'frameColor') onDesignPatch({ customFrameColor:value })
  }
  const hasOpening = geometry.panels.length > 0
  const s = Math.max(design.width, design.height) / 1000

  return (
    <div ref={shellRef} className={`viz-shell${maximized ? ' viz-maximized' : ''}`}>
      <Canvas camera={{ position:[s * 1.5, s * 0.55, s * 1.9], fov:45 }}>
        <color attach="background" args={['#dfe8ee']} />
        <fog attach="fog" args={['#dfe8ee', 6, 18]} />
        <hemisphereLight intensity={1.15} color="#ffffff" groundColor="#9aa7ad" />
        <directionalLight position={[4, 6, 5]} intensity={1.35} castShadow />
        <directionalLight position={[-4, 2, -5]} intensity={0.4} />
        <group>
          {wall && <Wall d={design} wallColor={settings.wallColor} floorColor={settings.floorColor} />}
          {geometry.members.map((b, i) => <Member key={i} b={b} color={settings.frameColor} />)}
          {geometry.fixedGlass.map((g, i) => <Glass key={i} b={g} tint={g.tint} />)}
          {geometry.panels.map((p, i) => <AnimatedPanel key={i} panel={p} frameColor={settings.frameColor} openAmount={settings.openAmount} fabrication={settings.fabrication} />)}
          {settings.fabrication && <FabricationDimensions d={design} geometry={geometry} />}
        </group>
        <CameraRig mode={settings.view} design={design} wall={wall} />
      </Canvas>
      <VisualizerControls wall={wall} settings={settings} setSetting={setSetting} hasOpening={hasOpening} maximized={maximized} onMaximize={toggleMaximize} />
      <div className="viz-badge">{wall ? 'Client wall preview' : 'Interactive 3D model'} · {settings.view === 'inside' ? 'Inside view' : settings.view[0].toUpperCase() + settings.view.slice(1)}</div>
    </div>
  )
}

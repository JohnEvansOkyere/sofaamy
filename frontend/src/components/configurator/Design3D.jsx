import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Line, OrbitControls, Text } from '@react-three/drei'
import { DoubleSide, Path, Shape } from 'three'
import { FRAMES, GLASS } from '../../lib/products.js'
import { frameGlassByCode } from '../../lib/frameCatalog.js'
import { PlasterBox, SUN_DIR, TexturedPlane, useSceneEnvironment, useTiled } from '../../lib/viz3d.jsx'
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
// Building shell (mm). The frame sits *inside* the wall opening — outer face
// set back WALL_REVEAL from the render — so reveals, cill, and window board
// read the way an installed window does instead of a panel floating in front.
const WALL_T = 230
const WALL_REVEAL = 40
const WALL_FRONT = DEPTH / 2 + WALL_REVEAL
const WALL_Z = WALL_FRONT - WALL_T / 2
const WALL_BACK = WALL_FRONT - WALL_T
const FACADE_SIDE = 9000
const FACADE_TOP = 2600
const ROOM_DEPTH = 6000
const ROOM_SIDE = 3000
const CEILING = 2900

const WALL_PRESETS = [
  { label:'Warm plaster', value:'#ded8cc' },
  { label:'Sofaamy blue', value:'#b9d4e5' },
  { label:'Modern grey', value:'#b7bec5' },
  { label:'White render', value:'#f1f0eb' },
  { label:'Terracotta', value:'#c98567' },
]

// Powder-coated / anodised aluminium: low metalness with a clearcoat reads far
// closer to a real extrusion than a plain metallic standard material, and the
// sky environment map gives the faces something to reflect.
function Member({ b, color }) {
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]} castShadow receiveShadow>
      <boxGeometry args={[M(b.w), M(b.h), M(b.d)]} />
      <meshPhysicalMaterial color={color} metalness={0.35} roughness={0.42}
        clearcoat={0.5} clearcoatRoughness={0.28} envMapIntensity={1.1} />
    </mesh>
  )
}

// Real glass: refractive transmission plus environment reflections. Panes
// deliberately don't cast shadows — a transmissive pane casting a solid
// rectangle is the single most obvious "this is CAD" giveaway.
function Glass({ b, tint, reflective = false }) {
  const t = b.d || 6
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]} receiveShadow>
      <boxGeometry args={[M(b.w), M(b.h), M(t)]} />
      <meshPhysicalMaterial
        color={tint}
        transmission={reflective ? 0.55 : 0.94}
        thickness={M(t) * 4}
        attenuationColor={tint}
        attenuationDistance={reflective ? 0.35 : 1.4}
        ior={1.52} roughness={0.03}
        metalness={reflective ? 0.4 : 0}
        envMapIntensity={reflective ? 1.6 : 0.85}
        specularIntensity={1} />
    </mesh>
  )
}

function NetScreen({ panel, frameColor, openAmount }) {
  const amount = Math.max(0, Math.min(1, openAmount))
  if (amount <= 0.01) return null

  const w = Math.max(panel.width - SASH_FACE * 2, 80)
  const h = Math.max(panel.height - SASH_FACE * 2 - 10, 80)
  const border = Math.min(22, Math.max(12, SASH_FACE * 0.45))
  const screen = '#5f7778'
  const meshOpacity = 0.08 + amount * 0.2
  const lineOpacity = 0.22 + amount * 0.35
  const lineCount = 7

  return (
    <group position={[M(panel.cx), M(panel.cy), M(-28)]}>
      <mesh position={[0, 0, M(-2)]} renderOrder={4}>
        <planeGeometry args={[M(w - border * 2), M(h - border * 2)]} />
        <meshBasicMaterial color={screen} transparent opacity={meshOpacity} side={DoubleSide} depthWrite={false} />
      </mesh>
      {[
        [0, h / 2 - border / 2, w, border],
        [0, -h / 2 + border / 2, w, border],
        [-w / 2 + border / 2, 0, border, h],
        [w / 2 - border / 2, 0, border, h],
      ].map(([x, y, bw, bh], i) => (
        <mesh key={`net-border-${i}`} position={[M(x), M(y), 0]}>
          <boxGeometry args={[M(bw), M(bh), M(10)]} />
          <meshStandardMaterial color={frameColor} metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {Array.from({ length:lineCount }).map((_, i) => {
        const x = -M((w - border * 2) / 2) + M((w - border * 2) * (i + 1) / (lineCount + 1))
        return <Line key={`net-v-${i}`} points={[[x, -M(h - border * 2) / 2, M(4)], [x, M(h - border * 2) / 2, M(4)]]}
          color={screen} lineWidth={0.6} transparent opacity={lineOpacity} depthTest={false} />
      })}
      {Array.from({ length:lineCount }).map((_, i) => {
        const y = -M((h - border * 2) / 2) + M((h - border * 2) * (i + 1) / (lineCount + 1))
        return <Line key={`net-h-${i}`} points={[[-M(w - border * 2) / 2, y, M(4)], [M(w - border * 2) / 2, y, M(4)]]}
          color={screen} lineWidth={0.6} transparent opacity={lineOpacity} depthTest={false} />
      })}
    </group>
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
  const metal = <meshStandardMaterial color={HARDWARE} metalness={1} roughness={0.16} envMapIntensity={1.4} />

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

function isReflective(code) {
  return frameGlassByCode(code)?.family === 'Reflective'
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
    const reflective = isReflective(cell.glass)
    if (cell.opening === 'fixed') {
      fixedGlass.push({ x:X(cx), y:Y(cy), w:secW - FACE, h:secH - FACE, tint, reflective })
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
        tint, reflective, members:localMembers,
        glass:{ x:0, y:0, w:sashW - 2 * SASH_FACE, h:sashH - 2 * SASH_FACE, d:6 },
      })
    }
  })
  return { members, fixedGlass, panels }
}

function AnimatedPanel({ panel, frameColor, openAmount, fabrication, slideMoving, slideStationary, slideTargetCx }) {
  const ref = useRef(null)
  const base = useMemo(() => ({ x:M(panel.cx), y:M(panel.cy), z:M(panel.z) }), [panel])

  useFrame((_, delta) => {
    if (!ref.current) return
    const a = Math.max(0, Math.min(1, openAmount))
    const ease = a * a * (3 - 2 * a)
    const opening = panel.opening
    let x = base.x, y = base.y, z = base.z, rx = 0, ry = 0

    if (opening === 'sliding' && slideMoving && slideTargetCx != null) {
      // A two-leaf slider opens on one side: one leaf stays in place while
      // the other travels across to overlap it. This leaves the net visible
      // on the side vacated by the moving leaf.
      x += M(slideTargetCx - panel.cx) * ease
      z = base.z * (1 - ease) + M(22) * ease
    } else if (opening === 'sliding' && slideStationary) {
      // Keep the standing leaf behind the moving leaf once the leaves meet.
      z = base.z * (1 - ease) + M(-18) * ease
    } else if (opening === 'sliding') {
      // Preserve the catalogue fallback for single- and three-panel sliders;
      // the confirmed two-leaf behavior is handled by the branches above.
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
      <Glass b={panel.glass} tint={panel.tint} reflective={panel.reflective} />
      <Hardware panel={panel} />
      {fabrication && accessoryMarkers(panel).map((marker, i) => <FabricationMarker key={`marker-${i}`} marker={marker} />)}
    </group>
  )
}

// One continuous extrusion with the opening cut out of it, rather than four
// panels butted around a hole — butted panels leave a texture seam running
// straight off the corner of every window, which reads instantly as fake.
// The extrusion's side walls become the reveals the frame beds into.
function Facade({ d, color }) {
  const shape = useMemo(() => {
    const x = M(d.width / 2 + FACADE_SIDE), y1 = M(d.height / 2 + FACADE_TOP)
    const y0 = M(-d.height / 2 - FLOOR_APERTURE)
    const ox = M(d.width / 2), oy = M(d.height / 2)
    const s = new Shape()
    s.moveTo(-x, y0); s.lineTo(x, y0); s.lineTo(x, y1); s.lineTo(-x, y1); s.closePath()
    const hole = new Path()
    hole.moveTo(-ox, -oy); hole.lineTo(-ox, oy); hole.lineTo(ox, oy); hole.lineTo(ox, -oy); hole.closePath()
    s.holes.push(hole)
    return s
  }, [d.width, d.height])

  // ExtrudeGeometry's world UV generator emits UVs in metres, so a fixed
  // repeat gives constant texel density across the whole facade.
  const maps = useTiled('plaster', 1 / 0.65, 1 / 0.65)

  return (
    <mesh position={[0, 0, M(WALL_FRONT) - M(WALL_T)]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, { depth:M(WALL_T), bevelEnabled:false, curveSegments:1 }]} />
      <meshStandardMaterial {...maps} color={color} roughness={1} metalness={0} normalScale={[0.3, 0.3]} />
    </mesh>
  )
}

// The building the window is fixed into: facade with the opening cut through
// it, cill and window board for exterior/interior depth, and a room behind so
// the inside view is a room rather than a hole.
function Wall({ d, wallColor, floorColor }) {
  const halfW = d.width / 2, halfH = d.height / 2
  const ground = -halfH - FLOOR_APERTURE
  const trim = '#cdc7bb'

  return (
    <group>
      <Facade d={d} color={wallColor} />

      {/* Projecting lintel hood and weathered cill. These two are what throw
          the cast shadows onto the render that make a facade read as built
          rather than drawn, so they project properly rather than token-deep. */}
      <PlasterBox b={{ x:0, y:halfH + 95, w:d.width + 360, h:150, d:WALL_T + 90, z:WALL_Z + 45 }} color={trim} tile={900} />
      <PlasterBox b={{ x:0, y:-halfH - 40, w:d.width + 360, h:80, d:270, z:WALL_FRONT + 110 - 135 }}
        color={trim} tile={700} rotation={[-0.06, 0, 0]} />

      {/* interior window board */}
      <PlasterBox b={{ x:0, y:-halfH - 25, w:d.width + 180, h:40, d:200, z:WALL_BACK - 40 }} color={trim} tile={700} />

      {/* room: floor, ceiling and returns so the inside view is a room, not a
          hole. No back wall — the inside/back cameras sit behind it. */}
      <PlasterBox b={{ x:-halfW - ROOM_SIDE - 60, y:ground + CEILING / 2, w:120, h:CEILING, d:ROOM_DEPTH, z:WALL_BACK - ROOM_DEPTH / 2 }} color={wallColor} />
      <PlasterBox b={{ x:halfW + ROOM_SIDE + 60, y:ground + CEILING / 2, w:120, h:CEILING, d:ROOM_DEPTH, z:WALL_BACK - ROOM_DEPTH / 2 }} color={wallColor} />
      <PlasterBox b={{ x:0, y:ground + CEILING, w:d.width + 2 * (ROOM_SIDE + 120), h:110, d:ROOM_DEPTH, z:WALL_BACK - ROOM_DEPTH / 2 }} color="#f2f0ec" />

      <TexturedPlane position={[0, M(ground), M(WALL_BACK - ROOM_DEPTH / 2)]} rotation={[-Math.PI / 2, 0, 0]}
        size={[M(d.width) + 2 * M(ROOM_SIDE + 120), M(ROOM_DEPTH)]} color={floorColor} kind="tile" tile={600} />
      <TexturedPlane position={[0, M(ground) - 0.002, M(WALL_FRONT) + 9]} rotation={[-Math.PI / 2, 0, 0]}
        size={[40, 18]} color="#a49a8c" kind="paving" tile={1100} />
    </group>
  )
}

function CameraRig({ mode, design, wall }) {
  const controls = useRef(null)
  const { camera } = useThree()
  const size = Math.max(design.width, design.height) / 1000

  useEffect(() => {
    // Wall mode pulls back so the opening reads in the context of the facade,
    // rather than filling the frame the way the product-only view should.
    const ctx = wall ? 1.55 : 1
    const distance = Math.max(size * 2.4, 3.6) * ctx
    const positions = {
      orbit: [size * 1.5 * ctx, size * 0.55 * ctx, size * 1.9 * ctx],
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

  return <OrbitControls ref={controls} enableDamping dampingFactor={0.12} enabled={mode === 'orbit'}
    maxPolarAngle={wall ? Math.PI / 2 - 0.03 : Math.PI} />
}

// Sun + sky rig. The directional light shares SUN_DIR with the sky texture so
// the highlight on the glass sits where the reflected sun is, and the shadow
// frustum is kept tight around the window to keep the reveal shadows crisp.
function Lighting({ size, wall }) {
  useSceneEnvironment({ background: wall ? 'sky' : '#dfe8ee' })
  const reach = Math.max(size * 3, 8)
  const ext = Math.max(size * 1.7, 2.6)
  return (
    <>
      <hemisphereLight intensity={0.15} color="#dceaf6" groundColor="#8d8478" />
      <directionalLight
        position={[SUN_DIR[0] * reach, SUN_DIR[1] * reach, SUN_DIR[2] * reach]}
        intensity={2.4} color="#fff5e2" castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006} shadow-normalBias={0.02}
        shadow-camera-near={0.5} shadow-camera-far={reach * 2.5}
        shadow-camera-left={-ext} shadow-camera-right={ext}
        shadow-camera-top={ext} shadow-camera-bottom={-ext} />
      {/* interior bounce so the inside view isn't a black room */}
      {wall && <pointLight position={[0, -0.7, -2.8]} intensity={1.3} distance={8} decay={2} color="#fff1de" />}
    </>
  )
}

function VisualizerControls({ wall, settings, setSetting, hasOpening, hasSliding, maximized, onMaximize }) {
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
      {hasSliding && <div className="viz-control-group">
        <span className="viz-control-label">Slide</span>
        <button className={settings.slideDirection === 'left-to-right' ? 'on' : ''}
          onClick={() => setSetting('slideDirection', 'left-to-right')}
          title="Move the left leaf across to the right leaf">L → R</button>
        <button className={settings.slideDirection === 'right-to-left' ? 'on' : ''}
          onClick={() => setSetting('slideDirection', 'right-to-left')}
          title="Move the right leaf across to the left leaf">R → L</button>
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
    slideDirection: design.visualSlideDirection || 'left-to-right',
    fabrication: fabricationDefault,
  })

  useEffect(() => {
    setSettings(s => ({ ...s, frameColor:design.customFrameColor || (FRAMES[design.frame] || FRAMES.mill).color }))
  }, [design.customFrameColor, design.frame])

  useEffect(() => {
    if (design.visualSlideDirection) setSettings(s => ({ ...s, slideDirection:design.visualSlideDirection }))
  }, [design.visualSlideDirection])

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
    if (onDesignPatch && key === 'slideDirection') onDesignPatch({ visualSlideDirection:value })
  }
  const hasOpening = geometry.panels.length > 0
  const slidingPanels = geometry.panels.filter(panel => panel.opening === 'sliding').sort((a, b) => a.cx - b.cx)
  const hasSliding = slidingPanels.length > 0
  const movingSlideIndex = settings.slideDirection === 'right-to-left' ? slidingPanels.length - 1 : 0
  const stationarySlideIndex = slidingPanels.length === 2
    ? (movingSlideIndex === 0 ? 1 : 0)
    : null
  const s = Math.max(design.width, design.height) / 1000

  return (
    <div ref={shellRef} className={`viz-shell${maximized ? ' viz-maximized' : ''}`}>
      <VisualizerControls wall={wall} settings={settings} setSetting={setSetting} hasOpening={hasOpening} hasSliding={hasSliding} maximized={maximized} onMaximize={toggleMaximize} />
      <div className="viz-canvas">
      <Canvas shadows="soft" dpr={[1, 2]} camera={{ position:[s * 1.5, s * 0.55, s * 1.9], fov:42 }}
        gl={{ antialias:true, powerPreference:'high-performance' }}
        onCreated={({ gl }) => { gl.toneMappingExposure = 0.95 }}>
        <fog attach="fog" args={wall ? ['#dfe4e6', 16, 70] : ['#dfe8ee', 6, 18]} />
        <Lighting size={s} wall={wall} />
        {!wall && <ContactShadows position={[0, -M(design.height) / 2 - 0.02, 0]} scale={s * 6}
          resolution={1024} blur={2.8} opacity={0.55} far={1.6} />}
        <group>
          {wall && <Wall d={design} wallColor={settings.wallColor} floorColor={settings.floorColor} />}
          {geometry.members.map((b, i) => <Member key={i} b={b} color={settings.frameColor} />)}
          {geometry.fixedGlass.map((g, i) => <Glass key={i} b={g} tint={g.tint} reflective={g.reflective} />)}
          {stationarySlideIndex != null && <NetScreen panel={slidingPanels[movingSlideIndex]} frameColor={settings.frameColor} openAmount={settings.openAmount} />}
          {geometry.panels.map((p, i) => {
            const slideIndex = slidingPanels.indexOf(p)
            const isTwoLeafSlider = slideIndex >= 0 && slidingPanels.length === 2
            return <AnimatedPanel key={i} panel={p} frameColor={settings.frameColor} openAmount={settings.openAmount} fabrication={settings.fabrication}
              slideMoving={isTwoLeafSlider && slideIndex === movingSlideIndex}
              slideStationary={isTwoLeafSlider && slideIndex === stationarySlideIndex}
              slideTargetCx={isTwoLeafSlider ? slidingPanels[stationarySlideIndex]?.cx : null} />
          })}
          {settings.fabrication && <FabricationDimensions d={design} geometry={geometry} />}
        </group>
        <CameraRig mode={settings.view} design={design} wall={wall} />
      </Canvas>
      <div className="viz-badge">{wall ? 'Client wall preview' : 'Interactive 3D model'} · {settings.view === 'inside' ? 'Inside view' : settings.view[0].toUpperCase() + settings.view.slice(1)}</div>
      </div>
    </div>
  )
}

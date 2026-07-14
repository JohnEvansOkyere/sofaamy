import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { FRAMES, GLASS } from '../../lib/products.js'

// 3D view — built from the SAME design record as the 2D canvas, the
// quote and the cutting list. All geometry in mm, scaled to metres.
// Wall view places the window in a wall, sill 900 mm above the floor
// (EvA's "Floor Aperture Distance").
const M = (mm) => mm / 1000
const FACE = 50        // frame member visible face
const DEPTH = 70       // window depth
const SASH_FACE = 40
const SASH_DEPTH = 34
const FLOOR_APERTURE = 900

function Member({ b, color }) {
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]}>
      <boxGeometry args={[M(b.w), M(b.h), M(b.d)]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
    </mesh>
  )
}

function Glass({ b, tint }) {
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]}>
      <boxGeometry args={[M(b.w), M(b.h), M(6)]} />
      <meshPhysicalMaterial color={tint} transparent opacity={0.35}
        metalness={0.1} roughness={0.05} />
    </mesh>
  )
}

// design (mm, origin bottom-left) → member + glass box lists, centered on origin
function buildGeometry(d) {
  const cw = d.colWidths?.length === d.cols ? d.colWidths : Array.from({ length: d.cols }, () => d.width / d.cols)
  const rh = d.rowHeights?.length === d.rows ? d.rowHeights : Array.from({ length: d.rows }, () => d.height / d.rows)
  const cumX = cw.reduce((a, w) => [...a, a[a.length - 1] + w], [0])
  const cumY = rh.reduce((a, h) => [...a, a[a.length - 1] + h], [0])
  const X = (x) => x - d.width / 2, Y = (y) => y - d.height / 2   // center on origin

  const members = [], glass = []
  // outer frame
  members.push({ x: X(d.width / 2), y: Y(d.height - FACE / 2), w: d.width, h: FACE, d: DEPTH })
  members.push({ x: X(d.width / 2), y: Y(FACE / 2), w: d.width, h: FACE, d: DEPTH })
  members.push({ x: X(FACE / 2), y: Y(d.height / 2), w: FACE, h: d.height - 2 * FACE, d: DEPTH })
  members.push({ x: X(d.width - FACE / 2), y: Y(d.height / 2), w: FACE, h: d.height - 2 * FACE, d: DEPTH })
  // mullions + transoms
  for (let j = 1; j < d.cols; j++)
    members.push({ x: X(cumX[j]), y: Y(d.height / 2), w: FACE, h: d.height - 2 * FACE, d: DEPTH })
  for (let r = 1; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++)
      members.push({ x: X(cumX[c] + cw[c] / 2), y: Y(cumY[r]), w: cw[c] - FACE, h: FACE, d: DEPTH })

  // sections
  d.cells.forEach((cell, i) => {
    const c = i % d.cols, r = Math.floor(i / d.cols)
    const secW = cw[c], secH = rh[r]
    const cx = cumX[c] + secW / 2, cy = cumY[r] + secH / 2
    const tint = (GLASS[cell.glass] || GLASS.clear).fill
    if (cell.opening === 'fixed') {
      glass.push({ x: X(cx), y: Y(cy), w: secW - FACE, h: secH - FACE, tint })
      return
    }
    const n = cell.panels || 1
    const sashW = secW / n, sashH = secH - FACE
    for (let k = 0; k < n; k++) {
      // sliding panels ride on alternating tracks (front/back) like the real thing
      const z = cell.opening === 'sliding' && n > 1 ? (k % 2 === 0 ? 16 : -16) : 0
      const px = cumX[c] + k * sashW + sashW / 2
      members.push({ x: X(px), y: Y(cy + sashH / 2 - SASH_FACE / 2), w: sashW, h: SASH_FACE, d: SASH_DEPTH, z })
      members.push({ x: X(px), y: Y(cy - sashH / 2 + SASH_FACE / 2), w: sashW, h: SASH_FACE, d: SASH_DEPTH, z })
      members.push({ x: X(px - sashW / 2 + SASH_FACE / 2), y: Y(cy), w: SASH_FACE, h: sashH - 2 * SASH_FACE, d: SASH_DEPTH, z })
      members.push({ x: X(px + sashW / 2 - SASH_FACE / 2), y: Y(cy), w: SASH_FACE, h: sashH - 2 * SASH_FACE, d: SASH_DEPTH, z })
      glass.push({ x: X(px), y: Y(cy), w: sashW - 2 * SASH_FACE, h: sashH - 2 * SASH_FACE, tint, z })
    }
  })
  return { members, glass }
}

function Wall({ d }) {
  const wallCol = '#ded8cc', t = 150, margin = 900
  const top = d.height / 2 + 500, bot = -d.height / 2 - FLOOR_APERTURE
  return (
    <group>
      {/* wall slabs around the opening */}
      <Member b={{ x: -d.width / 2 - margin / 2, y: (top + bot) / 2, w: margin, h: top - bot, d: t, z: -30 }} color={wallCol} />
      <Member b={{ x: d.width / 2 + margin / 2, y: (top + bot) / 2, w: margin, h: top - bot, d: t, z: -30 }} color={wallCol} />
      <Member b={{ x: 0, y: d.height / 2 + 250, w: d.width, h: 500, d: t, z: -30 }} color={wallCol} />
      <Member b={{ x: 0, y: -d.height / 2 - FLOOR_APERTURE / 2, w: d.width, h: FLOOR_APERTURE, d: t, z: -30 }} color={wallCol} />
      {/* floor */}
      <mesh position={[0, M(bot), 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[M(d.width) + 4, 4]} />
        <meshStandardMaterial color="#cfd6dc" />
      </mesh>
    </group>
  )
}

export default function Design3D({ design, wall = false }) {
  const { members, glass } = useMemo(() => buildGeometry(design), [design])
  const frameColor = (FRAMES[design.frame] || FRAMES.mill).color
  const s = Math.max(design.width, design.height) / 1000

  return (
    <Canvas camera={{ position: [s * 1.5, s * 0.5, s * 1.9], fov: 45 }}
      style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#eef3f8']} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 5]} intensity={1.1} />
      <directionalLight position={[-4, 2, -5]} intensity={0.35} />
      <group>
        {members.map((b, i) => <Member key={i} b={b} color={frameColor} />)}
        {glass.map((g, i) => <Glass key={i} b={g} tint={g.tint} />)}
        {wall && <Wall d={design} />}
      </group>
      <OrbitControls enableDamping dampingFactor={0.12}
        target={[0, wall ? -M(design.height) * 0.2 : 0, 0]} />
    </Canvas>
  )
}

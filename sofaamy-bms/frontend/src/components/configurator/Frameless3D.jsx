import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { FL_GLASS, FL_FAB } from '../../lib/products.js'
import { framelessBreakdown } from '../../lib/frameless.js'
import { pivotSide } from '../../lib/preps.js'
import './configurator.css'

// Frameless 3D — derived from the SAME design record as the 2D canvas,
// quote, glass order and hardware list. Two modes:
//   scene=false → clean studio view (glass + fittings)
//   scene=true  → realistic context: tiled bathroom for showers,
//                 building facade + pavement for shopfronts.
// All textures are generated procedurally — no external assets.
const M = (mm) => mm / 1000
const STEEL = '#cdd3d8'
const DARK = '#5d6d7e'

// ── procedural textures ──
function canvasTex(draw, size = 512, repeat = [1, 1]) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 4
  return t
}

const drawTiles = (base, grout, n = 6) => (g, s) => {
  g.fillStyle = grout; g.fillRect(0, 0, s, s)
  const tw = s / n
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = (Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1
      g.fillStyle = base
      g.globalAlpha = 0.92 + Math.abs(v) * 0.08
      g.fillRect(i * tw + 1.5, j * tw + 1.5, tw - 3, tw - 3)
    }
  g.globalAlpha = 1
}

const drawConcrete = (base) => (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s)
  for (let k = 0; k < 2600; k++) {
    const x = Math.random() * s, y = Math.random() * s
    g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.045)' : 'rgba(255,255,255,0.05)'
    g.fillRect(x, y, 1.6, 1.6)
  }
}

const drawPlaster = (base) => (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s)
  for (let k = 0; k < 1400; k++) {
    g.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.04)'
    g.beginPath()
    g.arc(Math.random() * s, Math.random() * s, Math.random() * 2.2, 0, 7)
    g.fill()
  }
}

const drawWood = () => (g, s) => {
  g.fillStyle = '#7a5230'; g.fillRect(0, 0, s, s)
  for (let y = 0; y < s; y += 5) {
    g.strokeStyle = `rgba(60,38,18,${0.12 + Math.random() * 0.18})`
    g.lineWidth = 1 + Math.random() * 2
    g.beginPath(); g.moveTo(0, y)
    g.bezierCurveTo(s * 0.3, y + Math.random() * 8 - 4, s * 0.7, y + Math.random() * 8 - 4, s, y)
    g.stroke()
  }
}

// ── fittings (all dims mm, local bay coords: x across bay, y up from floor) ──
function Box({ x, y, z = 0, w, h, d, color = STEEL, metal = 0.85, rough = 0.3 }) {
  return (
    <mesh position={[M(x), M(y), M(z)]} castShadow>
      <boxGeometry args={[M(w), M(h), M(d)]} />
      <meshStandardMaterial color={color} metalness={metal} roughness={rough} />
    </mesh>
  )
}

function Tube({ x, y, z = 0, r, h, color = STEEL, horizontal = false }) {
  return (
    <mesh position={[M(x), M(y), M(z)]} rotation={horizontal ? [0, 0, Math.PI / 2] : [0, 0, 0]} castShadow>
      <cylinderGeometry args={[M(r), M(r), M(h), 20]} />
      <meshStandardMaterial color={color} metalness={0.9} roughness={0.18} />
    </mesh>
  )
}

function GlassPane({ w, h, t, x = 0, y, z = 0, glass, scene }) {
  return (
    <mesh position={[M(x), M(y), M(z)]} castShadow>
      <boxGeometry args={[M(w), M(h), M(t)]} />
      {scene
        ? <meshPhysicalMaterial color="#dcefe9" transmission={glass.opacity > 0.7 ? 0.55 : 0.92}
            roughness={glass.opacity > 0.7 ? 0.55 : 0.06} thickness={M(t) * 4} ior={1.5}
            transparent opacity={0.9} />
        : <meshPhysicalMaterial color={glass.fill} transparent opacity={0.35}
            metalness={0.1} roughness={0.05} />}
    </mesh>
  )
}

// pull handle: two vertical tubes through the glass (back-to-back pair)
function Handle({ x, yMid, t }) {
  return (
    <group>
      {[1, -1].map(s => <Tube key={s} x={x} y={yMid} z={s * (t / 2 + 25)} r={16} h={900} />)}
      {[-350, 350].map(dy => <Box key={dy} x={x} y={yMid + dy} w={20} h={20} d={t + 100} />)}
    </group>
  )
}

// one bay = a group; doors get a nested pivot group so they stand ajar
function Bay({ bay, glass, scene, openAmount }) {
  const motionRef = useRef(null)
  const { type, w, gTop, gBot, t, pivot, trackY } = bay
  const gh = gTop - gBot, gy = (gTop + gBot) / 2
  const pivotX = pivot === 'right' ? w / 2 : -w / 2
  const isLeaf = type === 'door' || type === 'hinged'

  useFrame((_, delta) => {
    if (!motionRef.current) return
    const targetAngle = isLeaf ? (pivot === 'right' ? 1 : -1) * 0.42 * openAmount : 0
    const targetSlide = type === 'slider'
      ? (bay.i % 2 === 0 ? -1 : 1) * M(w * 0.28) * openAmount : 0
    const speed = Math.min(1, delta * 10)
    motionRef.current.rotation.y += (targetAngle - motionRef.current.rotation.y) * speed
    motionRef.current.position.x += (targetSlide - motionRef.current.position.x) * speed
  })

  const fittings = []
  let track = null
  if (type === 'fixed') {
    // corner clamps (BL 203)
    for (const dx of [-w / 2 + 120, w / 2 - 120])
      for (const y of [gBot + 60, gTop - 60])
        fittings.push(<Box key={`c${dx}${y}`} x={dx} y={y} w={55} h={45} d={t + 22} rough={0.25} />)
  }
  if (type === 'door') {
    const sx = -pivotX // stile side
    fittings.push(
      <Box key="pt" x={pivotX * (1 - 90 / w)} y={gTop - 32} w={165} h={55} d={t + 26} />,
      <Box key="pb" x={pivotX * (1 - 90 / w)} y={gBot + 32} w={165} h={55} d={t + 26} />,
      <Box key="lk" x={sx * (1 - 90 / w)} y={gBot + 35} w={165} h={55} d={t + 26} />,
      <Handle key="h" x={sx * (1 - 180 / w)} yMid={gy} t={t} />,
    )
  }
  if (type === 'hinged') {
    for (const y of [gBot + 180, gTop - 180])
      fittings.push(<Box key={`hg${y}`} x={pivotX * (1 - 20 / w)} y={y} w={65} h={90} d={t + 34} />)
    fittings.push(<Tube key="kn" x={-pivotX * (1 - 70 / w)} y={gy} z={t / 2 + 22} r={14} h={44} />)
  }
  if (type === 'slider') {
    track = <Box key="tk" x={0} y={trackY} w={w + FL_FAB.slideOverlapMm} h={52} d={64} color={DARK} rough={0.4} />
    fittings.push(
      <Tube key="r1" x={-w * 0.3} y={gTop + 24} r={22} h={16} horizontal />,
      <Tube key="r2" x={w * 0.3} y={gTop + 24} r={22} h={16} horizontal />,
    )
  }

  const pane = <GlassPane w={bay.gw} h={gh} t={t} y={gy} z={bay.z || 0} glass={glass} scene={scene} />
  // floor spring cover plate stays in the floor — it never swings with the leaf
  const plate = type === 'door'
    ? <Box x={pivotX * (1 - 150 / w)} y={-2} w={300} h={9} d={130} color={DARK} rough={0.45} />
    : null

  // Rotate leaves around the pivot edge and translate sliding leaves along
  // their track. Stationary floor/track fittings stay behind while the glass
  // and its moving hardware travel together.
  return (
    <group>
      {track}{plate}
      <group ref={motionRef} position={isLeaf ? [M(pivotX), 0, 0] : [0, 0, 0]}>
        <group position={isLeaf ? [M(-pivotX), 0, 0] : [0, 0, 0]}>
          {pane}{fittings}
        </group>
      </group>
    </group>
  )
}

// design → bays with leg placement (L-shape: return leg turns 90°)
function useRun(design) {
  return useMemo(() => {
    const bd = framelessBreakdown(design)
    const F = FL_FAB
    const H = design.height
    const t = bd.glass.thicknessMm
    const cum = design.colWidths.reduce((a, w) => [...a, a[a.length - 1] + w], [0])
    const cornerAt = design.cornerAfter >= 0 && design.cornerAfter < design.cols - 1
      ? design.cornerAfter : -1
    const mainW = cornerAt >= 0 ? cum[cornerAt + 1] : design.width
    const retW = cornerAt >= 0 ? design.width - mainW : 0
    const overIdx = bd.overIdx
    const hasOver = overIdx.length > 0
    const overBot = F.floorGapMm + design.doorH + F.overGapMm

    let slideK = 0
    const bays = design.cells.map((cell, i) => {
      const ty = cell.type || 'fixed'
      const w = design.colWidths[i]
      const inOver = hasOver && overIdx.includes(i)
      const gBot = F.floorGapMm
      // panel tops mirror the 2D canvas / breakdown heights
      let gTop = ty === 'fixed' ? H
        : inOver ? F.floorGapMm + design.doorH : H - F.jointMm
      let z = 0, trackY = 0, gw = w - F.jointMm
      if (ty === 'door' || ty === 'hinged') gw = w - F.doorGapMm
      if (ty === 'slider') {
        gw = w + F.slideOverlapMm
        trackY = (inOver ? F.floorGapMm + design.doorH : H) - F.slideTrackMm / 2
        gTop = trackY - F.slideTrackMm / 2 + 20   // rollers reach into the track
        z = (slideK++ % 2 === 0 ? 1 : -1) * (t + 14)
      }
      const onReturn = cornerAt >= 0 && i > cornerAt
      const mid = (cum[i] + cum[i + 1]) / 2
      return { i, type: ty, w, gw, gTop, gBot, t, z, trackY,
        pivot: pivotSide(design.cells, i),
        pos: onReturn ? [M(mainW), 0, -M(mid - mainW)] : [M(mid), 0, 0],
        rotY: onReturn ? -Math.PI / 2 : 0 }
    })

    // fanlight band (assumed contiguous, on the main leg)
    let over = null
    if (hasOver) {
      const oh = H - F.floorGapMm - design.doorH - F.overGapMm
      if (oh > 60) {
        const x0 = cum[overIdx[0]], x1 = cum[overIdx[overIdx.length - 1] + 1]
        over = { x: (x0 + x1) / 2, w: x1 - x0 - F.jointMm * 2, y: overBot + oh / 2, h: oh }
      }
    }
    return { bays, over, bd, t, mainW, retW, H, cornerAt }
  }, [design])
}

// ── SCENES ──
function Bathroom({ run }) {
  const { mainW, retW, H } = run
  const W = M(mainW), D = Math.max(M(retW), 1.0), h = Math.max(M(H) + 0.5, 2.5)
  const wallTiles = useMemo(() => canvasTex(drawTiles('#dfe9ec', '#b7c6cc'), 512, [3, 3]), [])
  const floorTiles = useMemo(() => canvasTex(drawTiles('#cfd8d3', '#a9b6b0', 4), 512, [5, 5]), [])
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.005, 0.4]} receiveShadow>
        <planeGeometry args={[W + 3.4, D + 2.6]} />
        <meshStandardMaterial map={floorTiles} roughness={0.35} metalness={0.05} />
      </mesh>
      {/* shower tray zone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.003, -D / 2]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color="#e8eef0" roughness={0.25} />
      </mesh>
      {/* back + left walls (tiled) */}
      <mesh position={[W / 2, h / 2, -D - 0.06]} receiveShadow>
        <boxGeometry args={[W + 3.4, h, 0.12]} />
        <meshStandardMaterial map={wallTiles} roughness={0.3} />
      </mesh>
      <mesh position={[-1.06, h / 2, -D / 2 + 1]} receiveShadow>
        <boxGeometry args={[0.12, h, D + 2.6]} />
        <meshStandardMaterial map={wallTiles} roughness={0.3} />
      </mesh>
      {/* shower head + riser on the back wall */}
      <Tube x={mainW / 2} y={H / 2 + 100} z={-D * 1000 + 60} r={14} h={H - 300} color="#dfe4e8" />
      <mesh position={[W / 2, M(H) - 0.12, -D + 0.28]} rotation={[0.35, 0, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 0.015, 24]} />
        <meshStandardMaterial color="#dfe4e8" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* drain */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, 0.006, -D / 2]}>
        <planeGeometry args={[0.12, 0.12]} />
        <meshStandardMaterial color="#8a949c" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* towel rail outside */}
      <Tube x={mainW + 500} y={1200} z={900} r={12} h={600} horizontal color="#dfe4e8" />
    </group>
  )
}

function Shopfront({ run }) {
  const { mainW, H } = run
  const W = M(mainW), h = M(H)
  const plaster = useMemo(() => canvasTex(drawPlaster('#e9e3d5'), 512, [2, 2]), [])
  const paving = useMemo(() => canvasTex(drawConcrete('#c9c9c4'), 512, [6, 4]), [])
  const inFloor = useMemo(() => canvasTex(drawTiles('#e6e2da', '#c6c1b6', 5), 512, [5, 4]), [])
  const wood = useMemo(() => canvasTex(drawWood(), 512, [2, 1]), [])
  const side = 2.2, top = 1.35
  const wallMat = <meshStandardMaterial map={plaster} roughness={0.85} />
  return (
    <group>
      {/* pavement outside + floor inside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.005, 2.5]} receiveShadow>
        <planeGeometry args={[W + 2 * side + 4, 5]} />
        <meshStandardMaterial map={paving} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W / 2, -0.002, -2.5]} receiveShadow>
        <planeGeometry args={[W + 2 * side + 4, 5]} />
        <meshStandardMaterial map={inFloor} roughness={0.5} />
      </mesh>
      {/* facade: piers each side + band above the opening */}
      <mesh position={[-side / 2, (h + top) / 2, -0.09]} castShadow receiveShadow>
        <boxGeometry args={[side, h + top, 0.25]} />{wallMat}</mesh>
      <mesh position={[W + side / 2, (h + top) / 2, -0.09]} castShadow receiveShadow>
        <boxGeometry args={[side, h + top, 0.25]} />{wallMat}</mesh>
      <mesh position={[W / 2, h + (top - 0.6) / 2 + 0.6, -0.09]} castShadow receiveShadow>
        <boxGeometry args={[W, top - 0.6, 0.25]} />{wallMat}</mesh>
      {/* signboard band */}
      <mesh position={[W / 2, h + 0.3, 0.02]} castShadow>
        <boxGeometry args={[W + 0.5, 0.6, 0.08]} />
        <meshStandardMaterial color="#16324c" roughness={0.5} />
      </mesh>
      <mesh position={[W / 2, h + 0.06, 0.07]}>
        <boxGeometry args={[W + 0.5, 0.03, 0.02]} />
        <meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* interior hints: back wall, counter, shelves, light strips */}
      <mesh position={[W / 2, 1.6, -4.5]}>
        <boxGeometry args={[W + 2 * side, 3.2, 0.1]} />
        <meshStandardMaterial color="#ded8cb" roughness={0.9} />
      </mesh>
      <mesh position={[W / 2, 0.5, -2.2]} castShadow>
        <boxGeometry args={[Math.max(W * 0.5, 1.2), 1.0, 0.55]} />
        <meshStandardMaterial map={wood} roughness={0.55} />
      </mesh>
      {[-0.9, 0.9].map(dx => (
        <mesh key={dx} position={[W / 2 + dx * (W / 2 + 0.4), 0.9, -3.4]} castShadow>
          <boxGeometry args={[0.9, 1.8, 0.35]} />
          <meshStandardMaterial map={wood} roughness={0.6} />
        </mesh>
      ))}
      {[0.3, 0.7].map(fx => (
        <mesh key={fx} position={[W * fx, h - 0.05, -1.6]}>
          <boxGeometry args={[0.9, 0.04, 0.12]} />
          <meshStandardMaterial color="#fff8e6" emissive="#fff3cf" emissiveIntensity={1.6} />
        </mesh>
      ))}
      {/* interior ceiling */}
      <mesh position={[W / 2, h + 0.02, -2.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W + 2 * side, 5]} />
        <meshStandardMaterial color="#efece4" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export default function Frameless3D({ design, scene = false }) {
  const run = useRun(design)
  const shellRef = useRef(null)
  const [maximized, setMaximized] = useState(false)
  const glass = FL_GLASS[design.glassId] || FL_GLASS.temp10
  const { bays, over, mainW, retW, H } = run
  const [openAmount, setOpenAmount] = useState(scene ? 0.3 : 0)
  useEffect(() => { setOpenAmount(scene ? 0.3 : 0) }, [scene, design.templateId])
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
  const cx = M(mainW) / 2
  const span = Math.max(M(mainW), M(H), M(retW) + 0.001)
  const sceneKind = design.scene === 'bathroom' ? 'bathroom' : 'shopfront'
  const camPos = scene
    ? [cx + span * 0.55, 1.65, span * 1.35 + 1.2]
    : [cx + span * 0.8, M(H) * 0.62, span * 1.5]

  return (
    <div ref={shellRef} className={`fl-viz-shell${maximized ? ' viz-maximized' : ''}`}>
      <Canvas shadows camera={{ position: camPos, fov: 45 }} style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true }}>
      {!scene && <color attach="background" args={['#eef3f8']} />}
      {scene && sceneKind === 'shopfront' && <Sky sunPosition={[6, 8, 4]} turbidity={5} />}
      {scene && sceneKind === 'bathroom' && <color attach="background" args={['#e8edf0']} />}

      <ambientLight intensity={scene ? 0.5 : 0.85} />
      <directionalLight position={[5, 7, 6]} intensity={scene ? 1.6 : 1.1} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-6} shadow-camera-right={6}
        shadow-camera-top={6} shadow-camera-bottom={-6} />
      <directionalLight position={[-4, 3, -5]} intensity={0.35} />
      {scene && sceneKind === 'bathroom' && <pointLight position={[cx, 2.4, 1.2]} intensity={0.8} />}

      <group>
        {bays.map(b => (
          <group key={b.i} position={b.pos} rotation={[0, b.rotY, 0]}>
            <Bay bay={b} glass={glass} scene={scene} openAmount={openAmount} />
          </group>
        ))}
        {over && (
          <group position={[M(over.x), 0, 0]}>
            <GlassPane w={over.w} h={over.h} t={run.t} y={over.y} glass={glass} scene={scene} />
            {[-over.w / 2 + 100, over.w / 2 - 100].map(dx => (
              <Box key={dx} x={dx} y={over.y - over.h / 2 + 30} w={165} h={55} d={run.t + 26} />
            ))}
          </group>
        )}
        {scene
          ? (sceneKind === 'bathroom' ? <Bathroom run={run} /> : <Shopfront run={run} />)
          : <ContactShadows position={[cx, 0, 0]} opacity={0.35} scale={span * 3.2} blur={2.2} far={2} />}
      </group>

      <OrbitControls enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.02}
        target={[cx, scene ? 1.3 : M(H) / 2, -M(retW) / 2]} />
      </Canvas>
      <div className="fl-viz-controls">
        <span className="viz-control-label">Opening</span>
        <button onClick={() => setOpenAmount(v => v > 0.5 ? 0 : 1)}>{openAmount > 0.5 ? 'Close' : 'Open'}</button>
        <input type="range" min="0" max="1" step="0.01" value={openAmount} onChange={e => setOpenAmount(+e.target.value)} />
        <span>{Math.round(openAmount * 100)}%</span>
        <span className="fl-hardware-note">Hardware shown</span>
        <button onClick={toggleMaximize}>{maximized ? 'Minimize' : 'Maximize'}</button>
      </div>
    </div>
  )
}

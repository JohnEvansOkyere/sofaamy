import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import {
  CanvasTexture, EquirectangularReflectionMapping, PMREMGenerator,
  RepeatWrapping, SRGBColorSpace,
} from 'three'

// Shared realism helpers for the client visualizers. Everything here is
// generated in-browser (canvas + PMREM) so the PWA keeps working offline —
// no HDRI or texture downloads.
const M = (mm) => mm / 1000

// Single sun direction: drives both the lighting rig and the sun disc painted
// into the sky, so reflections and shadows agree.
// Deliberately off to one side rather than head-on: a raking sun is what puts
// a shadow down one reveal and under the cill, which is the cue that reads as
// "this window is set into a wall" more than any amount of texture does.
export const SUN_DIR = [0.68, 0.60, 0.42]

function glow(ctx, x, y, r, inner, outer = 'rgba(255,255,255,0)') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

// Equirectangular sky: bright hazy Accra daylight. The horizon band and the
// cloud blobs are what glass and polished aluminium actually reflect, so they
// matter more to the "real" look than the background does.
function skyTexture() {
  const W = 1024, H = 512
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')

  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0.00, '#396fbe')
  sky.addColorStop(0.28, '#7ba6da')
  sky.addColorStop(0.45, '#cfdfec')
  sky.addColorStop(0.50, '#f3f1e8')
  sky.addColorStop(0.55, '#b3a894')
  sky.addColorStop(1.00, '#5d564c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  const clouds = [
    [0.12, 0.20, 0.16], [0.34, 0.14, 0.10], [0.55, 0.26, 0.20],
    [0.72, 0.16, 0.13], [0.88, 0.30, 0.17], [0.46, 0.36, 0.12],
  ]
  clouds.forEach(([u, v, r]) => glow(ctx, u * W, v * H, r * H, 'rgba(255,255,255,0.62)'))

  const u = Math.atan2(SUN_DIR[2], SUN_DIR[0]) / (Math.PI * 2) + 0.5
  const v = Math.asin(SUN_DIR[1]) / Math.PI + 0.5
  glow(ctx, u * W, (1 - v) * H, H * 0.32, 'rgba(255,244,218,0.55)')
  glow(ctx, u * W, (1 - v) * H, H * 0.07, 'rgba(255,255,255,1)')

  const t = new CanvasTexture(c)
  t.mapping = EquirectangularReflectionMapping
  t.colorSpace = SRGBColorSpace
  return t
}

// Image-based lighting. Without this, metal and glass have nothing to reflect
// and read as flat plastic no matter how the lights are tuned.
// `background`: 'sky' hangs the generated sky behind the scene, a colour string
// sets a flat backdrop, and null leaves whatever the caller already set alone.
export function useSceneEnvironment({ background = null } = {}) {
  const gl = useThree(s => s.gl)
  const scene = useThree(s => s.scene)

  useEffect(() => {
    const tex = skyTexture()
    const pmrem = new PMREMGenerator(gl)
    const env = pmrem.fromEquirectangular(tex).texture
    scene.environment = env
    // Ambient from the sky is dialled back so the sun, not the IBL, defines
    // the form — otherwise every surface flattens out to the same value.
    scene.environmentIntensity = 0.58
    if (background === 'sky') scene.background = tex
    else if (background) { scene.background = null; gl.setClearColor(background, 1) }
    return () => {
      scene.environment = null
      if (background) scene.background = null
      env.dispose()
      pmrem.dispose()
      tex.dispose()
    }
  }, [gl, scene, background])
}

// ---- procedural surfaces -------------------------------------------------
// Tileable value noise. Keeping frequencies integral makes the lattice wrap,
// so the maps repeat across a 6 m facade without visible seams.
const smooth = (t) => t * t * (3 - 2 * t)

function lattice(ix, iy, period, seed) {
  const x = ((ix % period) + period) % period
  const y = ((iy % period) + period) % period
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 57.13) * 43758.5453123
  return n - Math.floor(n)
}

function valueNoise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = smooth(x - ix), fy = smooth(y - iy)
  const a = lattice(ix, iy, period, seed), b = lattice(ix + 1, iy, period, seed)
  const c = lattice(ix, iy + 1, period, seed), d = lattice(ix + 1, iy + 1, period, seed)
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

function heightField(size, baseFreq, octaves, seed) {
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1, freq = baseFreq, sum = 0, norm = 0
      for (let o = 0; o < octaves; o++) {
        sum += amp * valueNoise(x / size * freq, y / size * freq, freq, seed + o * 13)
        norm += amp
        amp *= 0.5
        freq *= 2
      }
      h[y * size + x] = sum / norm
    }
  }
  return h
}

function grayTexture(h, size, lo, hi) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < h.length; i++) {
    const v = Math.round((lo + (hi - lo) * h[i]) * 255)
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

function normalTexture(h, size, strength) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const at = (x, y) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      img.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255)
      img.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255)
      img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255)
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  return t
}

// Base map is near-white so the wall colour picker still drives the hue —
// the texture only adds the mottling and grain a rendered blockwork wall has.
function buildSurface({ freq, octaves, seed, grain, mapLo, roughLo, roughHi }) {
  const size = 256
  const h = heightField(size, freq, octaves, seed)
  const map = grayTexture(h, size, mapLo, 1)
  map.colorSpace = SRGBColorSpace
  return { map, normalMap: normalTexture(h, size, grain), roughnessMap: grayTexture(h, size, roughLo, roughHi) }
}

const SURFACES = {}
function surface(kind) {
  if (SURFACES[kind]) return SURFACES[kind]
  SURFACES[kind] = kind === 'plaster'
    ? buildSurface({ freq: 16, octaves: 4, seed: 3, grain: 4, mapLo: 0.95, roughLo: 0.86, roughHi: 1 })
    : kind === 'paving'
      ? buildSurface({ freq: 10, octaves: 4, seed: 11, grain: 7, mapLo: 0.88, roughLo: 0.78, roughHi: 1 })
      : buildSurface({ freq: 6, octaves: 3, seed: 21, grain: 2, mapLo: 0.97, roughLo: 0.16, roughHi: 0.38 })
  return SURFACES[kind]
}

// Clone per mesh so each piece can carry its own repeat and hold a constant
// texel density whether it's a 300 mm cill or a 6 m facade panel.
export function useTiled(kind, repeatX, repeatY) {
  const maps = useMemo(() => {
    const base = surface(kind)
    const out = {}
    for (const [key, tex] of Object.entries(base)) {
      const t = tex.clone()
      t.needsUpdate = true
      t.wrapS = t.wrapT = RepeatWrapping
      t.repeat.set(Math.max(repeatX, 0.4), Math.max(repeatY, 0.4))
      out[key] = t
    }
    return out
  }, [kind, repeatX, repeatY])

  useEffect(() => () => Object.values(maps).forEach(t => t.dispose()), [maps])
  return maps
}

// Rendered blockwork. `b` uses the project's mm box convention {x,y,z,w,h,d}.
export function PlasterBox({ b, color, tile = 650, rotation, cast = true }) {
  const maps = useTiled('plaster', b.w / tile, b.h / tile)
  return (
    <mesh position={[M(b.x), M(b.y), M(b.z || 0)]} rotation={rotation} castShadow={cast} receiveShadow>
      <boxGeometry args={[M(b.w), M(b.h), M(b.d)]} />
      <meshStandardMaterial {...maps} color={color} roughness={1} metalness={0} normalScale={[0.3, 0.3]} />
    </mesh>
  )
}

// Ground / interior floor. `kind` picks paving (matte, outside) or tile
// (semi-polished, so the interior view catches a little sky bounce).
export function TexturedPlane({ position, rotation, size, color, kind = 'paving', tile = 800 }) {
  const maps = useTiled(kind, size[0] * 1000 / tile, size[1] * 1000 / tile)
  const polished = kind === 'tile'
  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={size} />
      <meshStandardMaterial {...maps} color={color} roughness={polished ? 0.5 : 0.95}
        metalness={polished ? 0.05 : 0} normalScale={polished ? [0.12, 0.12] : [0.4, 0.4]} />
    </mesh>
  )
}

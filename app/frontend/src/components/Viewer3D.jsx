import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { buildSurfaceGrid } from '../lib/labelGrid'
import { instanceColor } from '../lib/render'

const W = 10
const LIFT = 1.5                  // world units for a normalised height of 1 (visual only)
const hex = (h) => new THREE.Color(h)

/**
 * Image-space surface built from a SAVED prediction (label map + stored contours).
 * Height = distance from a region's edge (shape cue). It is NOT depth, thickness or volume.
 */
function Scene({ view, assets, selected, onSelect, o, resetKey, dark }) {
  const grid = useMemo(() => buildSurfaceGrid(assets.lab, 170), [assets.lab])
  const { cols, rows } = grid
  const H = W / (view.image.width / view.image.height)
  const cur = useRef(new Float32Array(cols * rows))
  const target = useRef(new Float32Array(cols * rows))
  const rise = useRef(0)
  const sweep = useRef(-1)
  const sweepMesh = useRef()
  const ctrl = useRef()
  const meshRef = useRef()
  const { camera, invalidate } = useThree()

  const texture = useMemo(() => {
    const t = new THREE.Texture(assets.img)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    t.needsUpdate = true
    return t
  }, [assets.img])
  useEffect(() => () => texture.dispose(), [texture])

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, cols - 1, rows - 1)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols * rows * 3).fill(1), 3))
    cur.current = new Float32Array(cols * rows)
    return g
  }, [cols, rows, H])
  useEffect(() => () => geometry.dispose(), [geometry])

  // a new analysis plays the reveal again: sweep passes over the image, then the surface rises
  useEffect(() => { rise.current = 0; sweep.current = 0 }, [view.id, grid])

  // targets + vertex colours follow the selection / display options
  useEffect(() => {
    const colors = geometry.attributes.color
    const tgt = target.current = new Float32Array(cols * rows)
    for (let i = 0; i < cols * rows; i++) {
      const id = grid.ids[i]
      const isSel = !selected || selected === id
      tgt[i] = id ? grid.heights[i] * (isSel ? 1 : 0.22) * o.heightScale : 0
      if (id) {
        const c = hex(instanceColor(id))
        const mix = o.photo ? 0.28 : 0.85
        const base = o.photo ? new THREE.Color(1, 1, 1) : new THREE.Color(dark ? '#122c3b' : '#c9d2de')
        const col = base.clone().lerp(c, isSel ? mix : mix * 0.35)
        colors.setXYZ(i, col.r, col.g, col.b)
      } else {
        const g = o.photo ? 1 : dark ? 0.11 : 0.8
        colors.setXYZ(i, g, g, g * (o.photo ? 1 : 1.03))
      }
    }
    colors.needsUpdate = true
    invalidate()
  }, [grid, geometry, cols, rows, selected, o.heightScale, o.photo, dark, invalidate])

  useEffect(() => { ctrl.current?.reset(); invalidate() }, [resetKey, invalidate])
  useEffect(() => { camera.position.set(0, 7.2, 10.8); camera.lookAt(0, 0, 0) }, [camera, view.id])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25)
    const goal = o.flat ? 0 : 1
    if (sweep.current >= 0 && sweep.current < 1) sweep.current = Math.min(1, sweep.current + dt / 1.1)
    const sweepDone = sweep.current >= 1 || sweep.current < 0
    rise.current += (sweepDone ? (goal - rise.current) * Math.min(1, dt * 2.4) : 0)
    const pos = geometry.attributes.position
    const k = Math.min(1, dt * 7)
    let changed = false
    for (let i = 0; i < pos.count; i++) {
      const goalZ = target.current[i] * rise.current * LIFT
      const c = cur.current[i]
      const n = Math.abs(goalZ - c) < 1e-4 ? goalZ : c + (goalZ - c) * k
      if (n !== c) { cur.current[i] = n; pos.setZ(i, n); changed = true }
    }
    if (changed) { pos.needsUpdate = true; geometry.computeVertexNormals() }
    if (sweepMesh.current) {
      sweepMesh.current.visible = sweep.current >= 0 && sweep.current < 1
      sweepMesh.current.position.z = -H / 2 + sweep.current * H
    }
    if (ctrl.current) ctrl.current.autoRotate = o.autoRotate
  })

  const centroids = view.instances.map((i) => ({ i, cx: ((i.normalized?.centroid?.x ?? 0.5) - 0.5) * W, cz: ((i.normalized?.centroid?.y ?? 0.5) - 0.5) * H }))
  const lines = view.instances.filter((i) => i.contour?.length > 2).map((i) => ({ i, pts: [...i.contour, i.contour[0]].map(([x, y]) => [(x - 0.5) * W, 0.05, (y - 0.5) * H]) }))

  return (
    <>
      <hemisphereLight args={['#d8f7ff', dark ? '#0c1d29' : '#b8c4d6', dark ? 1.25 : 0.9]} />
      <directionalLight position={[6, 12, 7]} intensity={1.7} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <pointLight position={[-8, 5, -6]} intensity={dark ? 0.9 : 0.5} color={dark ? '#35d8ff' : '#9ec5ff'} />

      <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial map={o.photo ? texture : null} vertexColors wireframe={o.wireframe} roughness={0.62} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[60, 60]} /><shadowMaterial opacity={0.18} /></mesh>
      <Grid position={[0, -0.03, 0]} args={[60, 60]} cellSize={0.5} cellThickness={0.5} cellColor={dark ? '#1f566c' : '#c5cfdd'} sectionSize={2.5} sectionThickness={1} sectionColor={dark ? '#3b8aa4' : '#8fa1bb'} fadeDistance={34} fadeStrength={1.4} infiniteGrid />

      {/* image frame */}
      <Line points={[[-W / 2, 0.02, -H / 2], [W / 2, 0.02, -H / 2], [W / 2, 0.02, H / 2], [-W / 2, 0.02, H / 2], [-W / 2, 0.02, -H / 2]]} color={dark ? '#35d8ff' : '#1747c8'} lineWidth={1.2} transparent opacity={0.6} />
      {/* one-shot reveal sweep */}
      <mesh ref={sweepMesh} position={[0, 0.06, 0]} visible={false}><boxGeometry args={[W, 0.02, 0.05]} /><meshBasicMaterial color={dark ? '#a4f2ff' : '#1747c8'} transparent opacity={0.7} toneMapped={false} /></mesh>

      {/* real instance boundaries on the image plane */}
      {o.contours && lines.map(({ i, pts }) => <Line key={i.index} points={pts} color={instanceColor(i.index)} lineWidth={selected === i.index ? 3.2 : 2} transparent opacity={selected && selected !== i.index ? 0.4 : 1} />)}

      {/* labels follow the real centroids and rise with the surface */}
      {o.labels && centroids.map(({ i, cx, cz }) => (
        <Html key={i.index} position={[cx, (grid.heights[Math.min(grid.heights.length - 1, Math.round(((i.normalized?.centroid?.y ?? 0.5) * rows)) * cols + Math.round((i.normalized?.centroid?.x ?? 0.5) * cols))] || 0.2) * o.heightScale * LIFT * (o.flat ? 0 : 1) + 0.5, cz]} center distanceFactor={13} zIndexRange={[10, 0]}>
          <button type="button" onClick={() => onSelect(selected === i.index ? null : i.index)} aria-pressed={selected === i.index}
            className={`whitespace-nowrap border px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] shadow-sm backdrop-blur transition-colors ${dark ? 'bg-[#0b1b29]/90 text-cyan-50 hover:bg-[#12354a]' : 'bg-white/90 text-ink hover:bg-white'}`}
            style={{ borderColor: instanceColor(i.index), borderLeftWidth: 3 }}>
            {i.kind === 'instance' ? 'Instance' : 'Region'} {i.id}{i.confidence != null ? ` · ${i.confidence.toFixed(2)}` : ''}
          </button>
        </Html>
      ))}

      <OrbitControls ref={ctrl} makeDefault enableDamping dampingFactor={0.07} minDistance={4} maxDistance={32} maxPolarAngle={Math.PI / 2.02} autoRotateSpeed={0.7} target={[0, 0.3, 0]} />
    </>
  )
}

export default function Viewer3D(props) {
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, near: 0.1, far: 120, position: [0, 7.2, 10.8] }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
      <Scene {...props} />
    </Canvas>
  )
}

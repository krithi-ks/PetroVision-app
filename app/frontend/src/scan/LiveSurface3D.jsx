import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { colorOf } from './palette'

const W = 10
const LIFT = 1.5

/**
 * Image-space surface of the REAL predicted mask, lying on the live camera image.
 * Height = distance from the predicted region's edge (a shape cue). It is NOT depth, thickness or volume.
 */
function Scene({ videoRef, camera, grid, instances, detected, scanning, aspect, reduce, resetKey, selected, onSelect }) {
  const cols = grid?.cols ?? 64
  const rows = grid?.rows ?? Math.max(8, Math.round(64 / aspect))
  const H = W / (grid?.aspect ?? aspect)
  const meshRef = useRef()
  const sweepRef = useRef()
  const cur = useRef(new Float32Array(cols * rows))
  const target = useRef(new Float32Array(cols * rows))
  const rise = useRef(0)
  const tick = useRef(0)
  const { invalidate } = useThree()
  const controls = useRef()

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, cols - 1, rows - 1)
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols * rows * 3).fill(0.85), 3))
    cur.current = new Float32Array(cols * rows)
    target.current = new Float32Array(cols * rows)
    return g
  }, [cols, rows, H])
  useEffect(() => () => geometry.dispose(), [geometry])

  // new real mask -> new target heights + tint
  useEffect(() => {
    const colors = geometry.attributes.color
    if (grid && grid.heights.length === cols * rows) {
      for (let i = 0; i < grid.heights.length; i++) {
        const id = grid.ids?.[i]
        target.current[i] = grid.heights[i] * (!selected || selected === id ? 1 : 0.22)
      }
      for (let i = 0; i < grid.inside.length; i++) {
        if (grid.inside[i]) {
          const id = grid.ids?.[i]
          const tint = id && selected && selected !== id ? 0.45 : 1
          colors.setXYZ(i, 0.25 * tint, 0.7 * tint, 0.95 * tint)
        } else colors.setXYZ(i, 0.62, 0.7, 0.8)
      }
    } else {
      target.current.fill(0)
      for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 0.78, 0.83, 0.9)
    }
    colors.needsUpdate = true
    invalidate()
  }, [grid, cols, rows, geometry, selected, invalidate])

  const texture = useMemo(() => {
    const v = videoRef.current
    if (camera !== 'on' || !v) return null
    const t = new THREE.VideoTexture(v)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [camera, videoRef])
  useEffect(() => () => texture?.dispose(), [texture])

  const lines = useMemo(() => (instances || []).slice(0, 8).map((inst) => ({
    key: inst.index,
    color: colorOf(inst.index),
    pts: (inst.contour || []).concat(inst.contour?.length ? [inst.contour[0]] : []).map(([nx, ny]) => [(nx - 0.5) * W, 0, (ny - 0.5) * H]),
  })).filter((l) => l.pts.length > 3), [instances, H])
  const groupRef = useRef()
  const labels = useMemo(() => (instances || []).map((inst) => ({
    instance: inst,
    x: ((inst.normalized?.centroid?.x ?? 0.5) - 0.5) * W,
    z: ((inst.normalized?.centroid?.y ?? 0.5) - 0.5) * H,
  })), [instances, H])
  useEffect(() => { controls.current?.reset(); invalidate() }, [resetKey, invalidate])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.25)
    rise.current += ((detected ? 1 : 0) - rise.current) * Math.min(1, dt * (reduce ? 20 : 2.2))
    const pos = geometry.attributes.position
    const k = Math.min(1, dt * (reduce ? 20 : 6))
    let changed = false
    for (let i = 0; i < pos.count; i++) {
      const goal = target.current[i] * rise.current * LIFT
      const c = cur.current[i]
      const n = Math.abs(goal - c) < 1e-4 ? goal : c + (goal - c) * k
      if (n !== c) { cur.current[i] = n; pos.setZ(i, n); changed = true }
    }
    if (changed) {
      pos.needsUpdate = true
      tick.current += 1
      if (tick.current % 2 === 0) geometry.computeVertexNormals()
    }
    if (groupRef.current) groupRef.current.position.y = rise.current * LIFT * 0.92 + 0.06
    if (sweepRef.current) {
      sweepRef.current.visible = scanning
      const p = ((state.clock.elapsedTime % 3.8) / 3.8)
      sweepRef.current.position.z = -H / 2 + p * H
      sweepRef.current.material.opacity = 0.55 * Math.sin(Math.PI * p) + 0.05
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#24364d', 0.9]} />
      <directionalLight position={[6, 12, 7]} intensity={1.7} />
      <pointLight position={[-8, 5, -6]} intensity={0.5} color="#6fe3ff" />
      <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial map={texture} vertexColors roughness={0.62} metalness={0.05} side={THREE.DoubleSide} color={texture ? '#ffffff' : '#24364d'} />
      </mesh>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]}>
        <meshBasicMaterial color="#55e8ff" wireframe transparent opacity={detected ? 0.3 : 0.1} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow><planeGeometry args={[60, 60]} /><shadowMaterial opacity={0.22} /></mesh>
      <Grid position={[0, -0.03, 0]} args={[60, 60]} cellSize={0.5} cellThickness={0.5} cellColor="#33465c" sectionSize={2.5} sectionThickness={1} sectionColor="#55718d" fadeDistance={34} fadeStrength={1.4} infiniteGrid />
      {/* frame outline on the image plane */}
      <Line points={[[-W / 2, 0.005, -H / 2], [W / 2, 0.005, -H / 2], [W / 2, 0.005, H / 2], [-W / 2, 0.005, H / 2], [-W / 2, 0.005, -H / 2]]} color="#6fe3ff" lineWidth={1} transparent opacity={0.55} />
      <mesh ref={sweepRef} position={[0, 0.02, 0]} visible={false}>
        <boxGeometry args={[W, 0.01, 0.03]} />
        <meshBasicMaterial color="#bff6ff" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      {/* instance boundaries floating just above the raised surface */}
      <group ref={groupRef}>
        {lines.map((l) => <Line key={l.key} points={l.pts} color={l.color} lineWidth={1.6} transparent opacity={detected ? 0.95 : 0} />)}
      </group>
      {detected && labels.map(({ instance, x, z }) => (
        <Html key={instance.index} position={[x, 0.55, z]} center distanceFactor={13} zIndexRange={[10, 0]}>
          <button type="button" onClick={() => onSelect?.(selected === instance.index ? null : instance.index)} aria-pressed={selected === instance.index}
            className="whitespace-nowrap border bg-slate-950/90 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-cyan-50 shadow-sm backdrop-blur"
            style={{ borderColor: colorOf(instance.index), borderLeftWidth: 3 }}>
            {instance.kind === 'instance' ? 'Instance' : 'Region'} {instance.id}{instance.confidence != null ? ` · ${instance.confidence.toFixed(2)}` : ''}
          </button>
        </Html>
      ))}
      <OrbitControls ref={controls} enableDamping dampingFactor={0.07} enablePan enableZoom enableRotate autoRotate autoRotateSpeed={0.7} minDistance={4} maxDistance={32} maxPolarAngle={Math.PI / 2.02} target={[0, 0.3, 0]} />
    </>
  )
}

export default function LiveSurface3D(props) {
  return (
    <div className="holo-surface hud-glass fade-in relative h-full min-h-[300px] w-full overflow-hidden">
      <Canvas dpr={1} gl={{ alpha: true, antialias: true }} camera={{ fov: 38, near: 0.1, far: 120, position: [0, 7.2, 10.8] }} style={{ position: 'absolute', inset: 0 }}>
        <Scene {...props} resetKey={props.resetKey} />
      </Canvas>
      <div className="hud-chip pointer-events-none absolute left-0 top-1.5 hud-tag !text-[9px]">Image-space 3D visualization</div>
      <div className="hud-foot pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 text-[8.5px] leading-tight tracking-[0.08em] text-white/70">
        {props.detected ? 'SURFACE DERIVED FROM THE PREDICTED MASK · NOT PHYSICAL DEPTH OR THICKNESS' : 'AWAITING SEGMENTATION · NOT PHYSICAL DEPTH'}
      </div>
    </div>
  )
}

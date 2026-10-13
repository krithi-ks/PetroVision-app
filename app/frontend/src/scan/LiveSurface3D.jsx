import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { colorOf } from './palette'

const W = 4
const LIFT = 0.85          // world units for a normalised height of 1.0 (visual only)

/**
 * Image-space surface of the REAL predicted mask, lying on the live camera image.
 * Height = distance from the predicted region's edge (a shape cue). It is NOT depth, thickness or volume.
 */
function Scene({ videoRef, camera, grid, instances, detected, scanning, aspect, reduce, resetKey }) {
  const touched = useRef(false)
  useEffect(() => { touched.current = false }, [resetKey])
  const cols = grid?.cols ?? 64
  const rows = grid?.rows ?? Math.max(8, Math.round(64 / aspect))
  const H = W / (grid?.aspect ?? aspect)
  const meshRef = useRef()
  const sweepRef = useRef()
  const cur = useRef(new Float32Array(cols * rows))
  const target = useRef(new Float32Array(cols * rows))
  const rise = useRef(0)
  const tick = useRef(0)
  const { camera: cam } = useThree()

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
      target.current.set(grid.heights)
      for (let i = 0; i < grid.inside.length; i++) {
        if (grid.inside[i]) colors.setXYZ(i, 0.45, 0.95, 1.0)
        else colors.setXYZ(i, 0.78, 0.83, 0.9)
      }
    } else {
      target.current.fill(0)
      for (let i = 0; i < colors.count; i++) colors.setXYZ(i, 0.78, 0.83, 0.9)
    }
    colors.needsUpdate = true
  }, [grid, cols, rows, geometry])

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
    // slow orbit; polar angle opens up when a real detection is displayed (reveals the relief)
    if (!touched.current) {                      // scripted reveal until the user takes control
      const t = state.clock.elapsedTime
      const az = reduce ? 0.28 : Math.sin(t * 0.22) * 0.5 + 0.2
      const polar = THREE.MathUtils.lerp(0.42, 0.98, rise.current)
      const r = 6.2
      cam.position.set(r * Math.sin(polar) * Math.sin(az), r * Math.cos(polar), r * Math.sin(polar) * Math.cos(az))
      cam.lookAt(0, 0.12, 0)
    }
  })

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <pointLight position={[-4, 2, -3]} intensity={0.9} color="#6fe3ff" />
      <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial map={texture} vertexColors roughness={0.75} metalness={0} side={THREE.DoubleSide} color={texture ? '#ffffff' : '#3a4b5e'} />
      </mesh>
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
      <OrbitControls enableDamping dampingFactor={0.08} enablePan enableZoom enableRotate minDistance={2.5} maxDistance={12} target={[0, 0.12, 0]} onStart={() => { touched.current = true }} />
    </>
  )
}

export default function LiveSurface3D(props) {
  return (
    <div className="hud-glass fade-in relative overflow-hidden" style={{ width: '100%', aspectRatio: '4 / 3' }}>
      <Canvas dpr={1} gl={{ alpha: true, antialias: true }} camera={{ fov: 38, near: 0.1, far: 50, position: [0, 4, 5] }} style={{ position: 'absolute', inset: 0 }}>
        <Scene {...props} resetKey={props.resetKey} />
      </Canvas>
      <div className="hud-chip pointer-events-none absolute left-0 top-1.5 hud-tag !text-[9px]">Image-space 3D visualization</div>
      <div className="hud-foot pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-1.5 pt-4 text-[8.5px] leading-tight tracking-[0.08em] text-white/70">
        {props.detected ? 'SURFACE DERIVED FROM THE PREDICTED MASK · NOT PHYSICAL DEPTH OR THICKNESS' : 'AWAITING SEGMENTATION · NOT PHYSICAL DEPTH'}
      </div>
    </div>
  )
}

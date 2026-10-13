import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, OrbitControls, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { heightfieldFromMask } from '../lib/maskSurface'

const WIDTH = 10

function Surface({ imageUrl, grid, heightScale, showPhoto, wireframe, flat }) {
  const { cols, rows, aspect, inside } = grid
  const tex = useTexture(imageUrl)
  useEffect(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true }, [tex])

  const field = useMemo(() => heightfieldFromMask(inside, cols, rows), [inside, cols, rows])
  const depth = WIDTH / aspect

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(WIDTH, depth, cols - 1, rows - 1)
    const pos = g.attributes.position
    const colors = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const h = field.heights[i]
      pos.setZ(i, flat ? 0 : h * heightScale)
      // tint only encodes "inside / outside the predicted mask" and shape-height - not any physical quantity
      if (field.inside[i]) {
        const t = 0.55 + 0.45 * h
        colors.set([1.0, 0.55 + 0.35 * (1 - t) + 0.1, 0.25 + 0.45 * (1 - t)], i * 3)
      } else colors.set([0.62, 0.7, 0.8], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [field, cols, rows, depth, heightScale, flat])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial map={showPhoto ? tex : null} vertexColors wireframe={wireframe} roughness={0.55} metalness={0.15} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Spin({ enabled, children }) {
  const ref = useRef()
  useFrame((_, dt) => { if (enabled && ref.current) ref.current.rotation.y += dt * 0.15 })
  return <group ref={ref}>{children}</group>
}

export default function MaskSurface({ imageUrl, grid, heightScale = 1.6, showPhoto = true, wireframe = false, autoRotate = true, flat = false }) {
  const depth = WIDTH / grid.aspect
  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 9.5, 14.5], fov: 42 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#050810']} />
      <fog attach="fog" args={['#050810', 18, 38]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[6, 10, 5]} intensity={1.7} castShadow />
      <pointLight position={[-8, 4, -6]} intensity={0.8} color="#22d3ee" />
      <Spin enabled={autoRotate}>
        <Surface imageUrl={imageUrl} grid={grid} heightScale={heightScale} showPhoto={showPhoto} wireframe={wireframe} flat={flat} />
        <Grid position={[0, -0.02, 0]} args={[40, 40]} cellSize={1} cellThickness={0.6} sectionSize={5} sectionThickness={1} cellColor="#16324a" sectionColor="#22d3ee" fadeDistance={28} infiniteGrid />
      </Spin>
      <OrbitControls enableDamping makeDefault minDistance={4} maxDistance={26} maxPolarAngle={Math.PI / 2.05} target={[0, 0.6, 0]} />
    </Canvas>
  )
}

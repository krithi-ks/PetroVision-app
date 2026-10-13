import { useEffect, useRef } from 'react'
import { colorOf } from './palette'

/** Draws the REAL segmentation of the latest frame: translucent per-instance fill + animated contours. */
export default function ScanOverlay({ result, mode, selected, active, revealKey, reduceMotion, width, height }) {
  const ref = useRef(null)
  const stateRef = useRef({})
  stateRef.current = { result, mode, selected, active, reduceMotion }
  const revealAt = useRef(0)

  useEffect(() => { revealAt.current = performance.now() }, [revealKey])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !width || !height) return undefined
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext('2d')
    let raf = 0

    const draw = (now) => {
      const { result: r, mode: m, selected: sel, reduceMotion: rm } = stateRef.current
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (r && r.instances.length) {
        const W = canvas.width
        const H = canvas.height
        const age = rm ? 9999 : now - revealAt.current
        const appear = Math.min(1, Math.max(0, (age - 150) / 650))           // region illuminates after the sweep arrives
        if ((m === 'mask' || m === 'both') && r.fillCanvas) {
          ctx.globalAlpha = appear
          ctx.imageSmoothingEnabled = true
          ctx.drawImage(r.fillCanvas, 0, 0, W, H)
          ctx.globalAlpha = 1
        }
        if (m === 'contour' || m === 'both') {
          r.instances.slice(0, 12).forEach((inst) => {
            const pts = inst.contour
            if (!pts || pts.length < 3) return
            const color = colorOf(inst.index)
            const path = new Path2D()
            pts.forEach(([x, y], i) => (i ? path.lineTo(x * W, y * H) : path.moveTo(x * W, y * H)))
            path.closePath()
            let perimeter = 0
            for (let i = 0; i < pts.length; i++) {
              const a = pts[i]
              const b = pts[(i + 1) % pts.length]
              perimeter += Math.hypot((b[0] - a[0]) * W, (b[1] - a[1]) * H)
            }
            const isSel = sel === inst.index
            ctx.save()
            ctx.lineJoin = 'round'
            ctx.shadowColor = color
            ctx.shadowBlur = (isSel ? 16 : 10) * dpr
            ctx.strokeStyle = color
            ctx.globalAlpha = 0.9 * appear
            ctx.lineWidth = (isSel ? 2.4 : 1.6) * dpr
            ctx.setLineDash(appear < 1 ? [perimeter * appear, perimeter] : [])      // contour draws itself on
            ctx.stroke(path)
            if (appear >= 1 && !rm) {                                              // light travelling along the boundary
              const seg = Math.max(40 * dpr, perimeter * 0.12)
              ctx.setLineDash([seg, perimeter])
              ctx.lineDashOffset = -((now / 1000) * 90 * dpr) % (perimeter + seg)
              ctx.strokeStyle = '#eafcff'
              ctx.lineWidth = (isSel ? 3.2 : 2.4) * dpr
              ctx.globalAlpha = 0.95
              ctx.stroke(path)
            }
            ctx.restore()
          })
        }
      }
      const { result: rr, active: act, reduceMotion: rm2 } = stateRef.current
      if (!rm2 && act && rr && rr.instances.length) raf = requestAnimationFrame(draw)
    }

    const kick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw) }
    kick()
    ref.current.__kick = kick
    return () => cancelAnimationFrame(raf)
  }, [width, height])

  // redraw on any change of what is shown
  useEffect(() => { ref.current?.__kick?.() }, [result, mode, selected, active, revealKey, reduceMotion])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}

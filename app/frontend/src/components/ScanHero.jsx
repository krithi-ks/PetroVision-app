import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'

/**
 * Decorative, interactive illustration of the PetroVision idea: a scan beam (follows the pointer)
 * reveals a segmentation boundary on an abstract water surface. It is an illustration, not data.
 */
export default function ScanHero({ className = '' }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const state = useRef({ target: 0.4, y: 0.4, hovering: false })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined                          // no canvas support: the illustration is simply omitted
    let raf = 0
    let w = 0, h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth; h = canvas.clientHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const blob = (t, cx, cy, r) => Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * Math.PI * 2
      const k = 1 + 0.16 * Math.sin(a * 3 + t * 0.6) + 0.1 * Math.sin(a * 5 - t * 0.8) + 0.05 * Math.sin(a * 9 + t)
      return [cx + Math.cos(a) * r * 1.25 * k, cy + Math.sin(a) * r * 0.82 * k]
    })
    const draw = (now) => {
      const t = now / 1000
      const s = state.current
      if (!s.hovering) s.target = reduce ? 1 : 0.5 + 0.5 * Math.sin(t * 0.55 - 1.2)
      s.y += (s.target - s.y) * 0.08
      const sy = s.y * h

      // water
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#d5e0ec'); g.addColorStop(1, '#a9bbcf')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 0.35
      for (let i = 0; i < 9; i++) {
        ctx.beginPath()
        for (let x = 0; x <= w; x += 8) {
          const y = h * (0.1 + i * 0.1) + Math.sin(x * 0.012 + t * 0.5 + i) * 7 + Math.sin(x * 0.03 - t * 0.3 + i * 2) * 3
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
        }
        ctx.strokeStyle = i % 2 ? '#ffffff' : '#7f94ab'; ctx.lineWidth = 1; ctx.stroke()
      }
      ctx.globalAlpha = 1

      // contamination blob (the thing being found)
      const pts = blob(t, w * 0.5, h * 0.52, Math.min(w, h) * 0.2)
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
      ctx.fillStyle = 'rgba(120,70,40,0.55)'; ctx.fill()

      // revealed segmentation = region above the beam
      ctx.save()
      ctx.beginPath(); ctx.rect(0, 0, w, sy); ctx.clip()
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath()
      ctx.fillStyle = 'rgba(217,72,15,0.5)'; ctx.fill()
      ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 18; ctx.lineWidth = 1.8; ctx.strokeStyle = '#0d1520'; ctx.stroke()
      ctx.restore()

      // grid + brackets
      ctx.strokeStyle = 'rgba(23,71,200,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([])
      for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
      for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
      const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8
      if (sy > y0) {                                                   // bracket forms once the beam has passed the region
        const yy1 = Math.min(y1, sy)
        ctx.strokeStyle = '#0d1520'; ctx.lineWidth = 1.6
        const L = 14
        ;[[x0, y0, 1, 1], [x1, y0, -1, 1]].forEach(([x, y, dx, dy]) => { ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke() })
        if (sy >= y1) [[x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => { ctx.beginPath(); ctx.moveTo(x, y + dy * L); ctx.lineTo(x, y); ctx.lineTo(x + dx * L, y); ctx.stroke() })
        ctx.fillStyle = '#0d1520'; ctx.font = '600 10px "IBM Plex Mono", monospace'
        ctx.fillText('INSTANCE 01', x0, y0 - 6)
        ctx.beginPath(); ctx.arc(w * 0.5, h * 0.52, 3, 0, 7); ctx.fill()
        void yy1
      }
      // beam
      const bg = ctx.createLinearGradient(0, sy - 60, 0, sy)
      bg.addColorStop(0, 'rgba(23,71,200,0)'); bg.addColorStop(1, 'rgba(23,71,200,0.22)')
      ctx.fillStyle = bg; ctx.fillRect(0, sy - 60, w, 60)
      ctx.fillStyle = '#1747c8'; ctx.fillRect(0, sy - 1, w, 2)
      ctx.fillStyle = '#0d1520'; ctx.font = '500 10px "IBM Plex Mono", monospace'; ctx.fillText('ILLUSTRATION', 12, h - 12)
      if (!reduce) raf = requestAnimationFrame(draw)
    }
    resize(); draw(performance.now())
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(performance.now()) }); ro.observe(canvas)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reduce])

  const move = (e) => { const r = ref.current.getBoundingClientRect(); state.current.hovering = true; state.current.target = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  return <canvas ref={ref} className={`block h-full w-full ${className}`} onPointerMove={move} onPointerLeave={() => { state.current.hovering = false }} role="img" aria-label="Illustration: a scan beam reveals the outline of a contaminated region" />
}

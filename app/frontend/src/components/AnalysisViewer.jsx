import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { drawAnalysis } from '../lib/render'
import { Spinner } from './ui'

const MAX_CANVAS = 1600

/**
 * Interactive viewer for one analysis: renders any display mode, supports wheel-zoom, drag-pan,
 * hover highlight and click-to-select an instance (read from the stored label map).
 */
export default function AnalysisViewer({ view, assets, opts, onPick, onHover, interactive = true, canvasRef, className = '' }) {
  const wrap = useRef(null)
  const inner = useRef(null)
  const ownRef = useRef(null)
  const canvas = canvasRef || ownRef
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })
  const drag = useRef(null)
  const aspect = view ? view.image.width / view.image.height : 4 / 3

  // letterbox the image inside the available space
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return undefined
    const fit = () => {
      const w = Math.min(el.clientWidth, el.clientHeight * aspect)
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [aspect])

  useEffect(() => { setT({ k: 1, x: 0, y: 0 }) }, [view?.id])

  // draw whenever data or display settings change
  useEffect(() => {
    const c = canvas.current
    if (!c || !assets?.img || !view) return
    const longSide = Math.min(MAX_CANVAS, Math.max(assets.img.naturalWidth, assets.img.naturalHeight))
    c.width = Math.round(aspect >= 1 ? longSide : longSide * aspect)
    c.height = Math.round(aspect >= 1 ? longSide / aspect : longSide)
    drawAnalysis(c, assets, view, opts)
  }, [view, assets, opts, aspect, canvas])

  const labelAt = useCallback((e) => {
    const r = canvas.current.getBoundingClientRect()
    const lab = assets?.lab
    if (!lab) return 0
    const x = Math.min(lab.w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * lab.w)))
    const y = Math.min(lab.h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * lab.h)))
    return lab.labels[y * lab.w + x]
  }, [assets, canvas])

  const onWheel = (e) => {
    if (!interactive) return
    e.preventDefault()
    const r = inner.current.getBoundingClientRect()
    const cx = e.clientX - (r.left + r.width / 2)
    const cy = e.clientY - (r.top + r.height / 2)
    setT((p) => {
      const k = Math.min(8, Math.max(1, p.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      const f = k / p.k
      return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: p.x + (cx - p.x) * (1 - f) , y: p.y + (cy - p.y) * (1 - f) }
    })
  }
  useEffect(() => {                                       // wheel needs a non-passive listener to prevent page scroll
    const el = wrap.current
    if (!el || !interactive) return undefined
    const h = (e) => onWheel(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  })

  const down = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId) }
  const move = (e) => {
    const d = drag.current
    if (d && (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3)) d.moved = true
    if (d?.moved && t.k > 1) setT((p) => ({ ...p, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
    else if (interactive && onHover && !d) onHover(labelAt(e) || null)
  }
  const up = (e) => {
    const d = drag.current
    drag.current = null
    if (d && !d.moved && interactive && onPick) onPick(labelAt(e) || null)
  }

  const ready = view && assets?.status === 'ready'
  return (
    <div ref={wrap} className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}>
      <div ref={inner} style={{ width: box.w, height: box.h, transform: `translate(${t.x}px, ${t.y}px) scale(${t.k})`, transition: drag.current ? 'none' : 'transform .12s ease-out' }}
        className="relative" onPointerDown={interactive ? down : undefined} onPointerMove={interactive ? move : undefined} onPointerUp={interactive ? up : undefined}
        onPointerLeave={() => { drag.current = null; onHover?.(null) }}>
        <canvas ref={canvas} className="h-full w-full" style={{ cursor: interactive ? (t.k > 1 ? 'grab' : 'crosshair') : 'default' }} role="img" aria-label="Analysed image with segmentation" />
      </div>
      {!ready && view && <div className="absolute inset-0 grid place-items-center text-ink-3"><Spinner /></div>}
      {interactive && ready && (
        <div className="absolute bottom-3 right-3 flex items-center overflow-hidden rounded border border-line-strong bg-surface/95 font-mono text-[11px] text-ink">
          <button type="button" className="h-8 w-8 hover:bg-surface-2" aria-label="Zoom out" onClick={() => setT((p) => ({ ...p, k: Math.max(1, p.k / 1.3), x: p.k / 1.3 <= 1 ? 0 : p.x, y: p.k / 1.3 <= 1 ? 0 : p.y }))}>−</button>
          <button type="button" className="h-8 min-w-[52px] border-x border-line px-2 hover:bg-surface-2" aria-label="Reset zoom" onClick={() => setT({ k: 1, x: 0, y: 0 })}>{Math.round(t.k * 100)}%</button>
          <button type="button" className="h-8 w-8 hover:bg-surface-2" aria-label="Zoom in" onClick={() => setT((p) => ({ ...p, k: Math.min(8, p.k * 1.3) }))}>+</button>
        </div>
      )}
    </div>
  )
}

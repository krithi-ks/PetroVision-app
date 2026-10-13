// Pure canvas renderer for a saved/fresh analysis. Every pixel drawn comes from the stored image,
// the stored label map and the stored per-instance geometry. Colour / opacity / mode only change how
// that data is *shown* - never the predictions or measurements.
import { HUD_PALETTE, hexToRgb } from '../scan/palette'

export const MODES = [
  ['original', 'Original'],
  ['binary', 'Binary mask'],
  ['overlay', 'Overlay'],
  ['outline', 'Outline'],
  ['instances', 'Instances'],
  ['boxes', 'Boxes'],
  ['combined', 'Combined'],
]

export const COLOR_CHOICES = [
  ['Red', '#e5322d'], ['Green', '#1fa95b'], ['Blue', '#2f6bff'], ['Yellow', '#f2b705'], ['Cyan', '#12b5d9'], ['Purple', '#8a4fff'],
]

function fillCanvas(lab, lut) {
  const { labels, w, h } = lab
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(w, h)
  const u32 = new Uint32Array(img.data.buffer)
  for (let i = 0; i < labels.length; i++) { const v = lut[labels[i]]; if (v) u32[i] = v }
  ctx.putImageData(img, 0, 0)
  return c
}

const packRGBA = (hex, alpha) => {
  const [r, g, b] = hexToRgb(hex)
  return ((Math.round(alpha * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0
}

export const instanceColor = (index) => HUD_PALETTE[(Math.max(1, index) - 1) % HUD_PALETTE.length]

function strokePoly(ctx, pts, W, H) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)))
  ctx.closePath()
}

function label(ctx, text, x, y, color, scale) {
  ctx.font = `600 ${Math.round(12 * scale)}px "IBM Plex Mono", monospace`
  const padX = 6 * scale
  const w = ctx.measureText(text).width + padX * 2
  const h = 18 * scale
  const yy = Math.max(0, y - h)
  ctx.fillStyle = 'rgba(8,14,22,0.82)'
  ctx.fillRect(x, yy, w, h)
  ctx.fillStyle = color
  ctx.fillRect(x, yy, 2.5 * scale, h)
  ctx.fillStyle = '#f2f8ff'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, yy + h / 2 + 0.5)
}

/**
 * @param canvas  target canvas (already sized)
 * @param assets  { img, lab }
 * @param view    saved analysis record
 * @param opts    { mode, color, opacity, showBoxes, showLabels, hidden:Set<number>, selected, hover }
 */
export function drawAnalysis(canvas, assets, view, opts) {
  const { img, lab } = assets
  const { mode, color, opacity, showBoxes, showLabels, hidden, selected, hover } = opts
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const scale = W / 1000
  ctx.clearRect(0, 0, W, H)
  const visible = view.instances.filter((i) => !hidden.has(i.index))

  if (mode === 'binary') {
    const lut = new Uint32Array(256).fill(0xffffffff)
    lut[0] = 0xff000000
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(fillCanvas(lab, lut), 0, 0, W, H)
    return
  }
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, 0, 0, W, H)
  if (mode === 'original') return

  // ---- fills
  if (mode === 'overlay' || mode === 'combined') {
    const lut = new Uint32Array(256)
    const px = packRGBA(color, opacity)
    ;(mode === 'combined' ? view.instances : visible).forEach((i) => { lut[i.index] = px })
    ctx.drawImage(fillCanvas(lab, lut), 0, 0, W, H)
  } else if (mode === 'instances') {
    const lut = new Uint32Array(256)
    visible.forEach((i) => { lut[i.index] = packRGBA(instanceColor(i.index), opacity) })
    ctx.drawImage(fillCanvas(lab, lut), 0, 0, W, H)
  }

  // ---- contours
  const strokeColor = (i) => (mode === 'instances' ? instanceColor(i.index) : color)
  if (mode === 'combined') {
    ctx.lineWidth = 2.4 * scale
    ctx.strokeStyle = color
    ctx.lineJoin = 'round'
    ;(view.contours || []).forEach((p) => { strokePoly(ctx, p, W, H); ctx.stroke() })
  } else if (mode === 'outline' || mode === 'instances' || mode === 'overlay') {
    visible.forEach((i) => {
      if (!i.contour?.length) return
      const isSel = selected === i.index
      const isHov = hover === i.index
      ctx.lineJoin = 'round'
      ctx.lineWidth = (isSel ? 4 : isHov ? 3.2 : mode === 'overlay' ? 1.4 : 2.4) * scale
      ctx.strokeStyle = strokeColor(i)
      ctx.globalAlpha = mode === 'overlay' ? 0.9 : 1
      strokePoly(ctx, i.contour, W, H)
      ctx.stroke()
      ctx.globalAlpha = 1
    })
  }

  // ---- boxes / centroids / labels
  const boxes = mode === 'boxes' || showBoxes
  if (mode === 'combined') {
    const bb = view.measurements.bounding_box
    if (bb && showBoxes) {
      const sx = W / view.mask.width, sy = H / view.mask.height
      ctx.setLineDash([8 * scale, 6 * scale]); ctx.lineWidth = 2 * scale; ctx.strokeStyle = color
      ctx.strokeRect(bb.x * sx, bb.y * sy, bb.width * sx, bb.height * sy); ctx.setLineDash([])
    }
    if (showLabels && view.measurements.bounding_box) {
      const bb2 = view.measurements.bounding_box
      label(ctx, `COMBINED · ${view.instance_count} ${view.instance_count === 1 ? 'REGION' : 'REGIONS'}`, bb2.x * (W / view.mask.width), bb2.y * (H / view.mask.height), color, scale)
    }
    return
  }
  visible.forEach((i) => {
    const nb = i.normalized?.bounding_box
    if (!nb) return
    const c = mode === 'boxes' || mode === 'instances' ? instanceColor(i.index) : color
    if (boxes) {
      ctx.lineWidth = (selected === i.index ? 3 : 2) * scale
      ctx.strokeStyle = c
      ctx.strokeRect(nb.x * W, nb.y * H, nb.width * W, nb.height * H)
    }
    const cen = i.normalized?.centroid
    if (cen && (mode === 'instances' || mode === 'boxes')) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = c; ctx.lineWidth = 2 * scale
      ctx.beginPath(); ctx.arc(cen.x * W, cen.y * H, 4 * scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    }
    if (showLabels || mode === 'boxes' || mode === 'instances') {
      if (!showLabels && mode !== 'boxes' && mode !== 'instances') return
      const conf = i.confidence != null ? ` · ${i.confidence.toFixed(2)}` : ''
      label(ctx, `${i.kind === 'instance' ? 'INSTANCE' : 'REGION'} ${i.id}${conf}`, nb.x * W, nb.y * H + (nb.y * H < 22 * scale ? 22 * scale : 0), c, scale)
    }
  })
}

// Helpers that turn the backend's label image (0 = background, k = instance/region k) into
// things the scanning viewport can use. Everything here is derived from the real predicted masks.
import { heightfieldFromMask } from './maskSurface'
import { hexToRgb } from '../scan/palette'

export async function decodeImage(dataUrl) {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  return img
}

/** Read the label image into a Uint8Array of label ids at its native size. */
export function readLabels(img) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, w, h)
  const labels = new Uint8Array(w * h)
  for (let i = 0; i < labels.length; i++) labels[i] = data[i * 4]
  return { labels, w, h }
}

/** Translucent per-instance colour fill as a canvas (drawn once per frame result). */
export function buildFillCanvas({ labels, w, h }, palette, alpha = 0.3) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(w, h)
  const u32 = new Uint32Array(img.data.buffer)
  const lut = palette.map((hex) => {
    const [r, g, b] = hexToRgb(hex)
    return ((Math.round(alpha * 255) << 24) | (b << 16) | (g << 8) | r) >>> 0     // little-endian RGBA
  })
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    if (l) u32[i] = lut[(l - 1) % lut.length]
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Coarse grid + normalised heightfield for the 3D view (nearest-neighbour so label ids survive). */
export function buildSurfaceGrid({ labels, w, h }, maxCells = 96) {
  const aspect = w / h
  const cols = aspect >= 1 ? maxCells : Math.max(8, Math.round(maxCells * aspect))
  const rows = aspect >= 1 ? Math.max(8, Math.round(maxCells / aspect)) : maxCells
  const inside = new Uint8Array(cols * rows)
  const ids = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    const sy = Math.min(h - 1, Math.floor(((y + 0.5) / rows) * h))
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) / cols) * w))
      ids[y * cols + x] = labels[sy * w + sx]
      inside[y * cols + x] = ids[y * cols + x] > 0 ? 1 : 0
    }
  }
  const field = heightfieldFromMask(inside, cols, rows)
  return { cols, rows, aspect, inside: field.inside, heights: field.heights, ids }
}

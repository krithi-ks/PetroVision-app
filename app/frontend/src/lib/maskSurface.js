// Mask -> image-space surface for the 3D view.
//
// The height of every vertex is derived ONLY from the predicted binary mask:
// height = distance (in grid cells) from the nearest pixel outside the region, normalised to 0..1
// and lightly smoothed. It is a visual encoding of the region's *shape* in image space.
// It is NOT depth, oil thickness or oil volume, and the UI says so.

/** Two-pass chamfer (3-4) distance to the nearest 0-cell. The grid border counts as outside. */
export function distanceInside(inside, cols, rows) {
  const INF = 1e9
  const d = new Float32Array(cols * rows)
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0
  const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : d[y * cols + x])

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (!inside[i]) continue
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
    }
  }
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = cols - 1; x >= 0; x--) {
      const i = y * cols + x
      if (!inside[i]) continue
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    }
  }
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? d[i] / 3 : 0
  return d
}

function boxBlur(src, cols, rows, passes = 1) {
  let a = src
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            const yy = y + dy
            if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue
            sum += a[yy * cols + xx]
            n++
          }
        }
        b[y * cols + x] = sum / n
      }
    }
    a = b
  }
  return a
}

/**
 * @param {Uint8Array|number[]} inside  1 where the mask is petroleum-like, row-major cols*rows
 * @returns {{heights: Float32Array, inside: Uint8Array, maxDistance: number}}
 *          heights are normalised to 0..1 (0 outside the mask).
 */
export function heightfieldFromMask(inside, cols, rows) {
  const flags = Uint8Array.from(inside, (v) => (v ? 1 : 0))
  const dist = distanceInside(flags, cols, rows)
  let max = 0
  for (let i = 0; i < dist.length; i++) if (dist[i] > max) max = dist[i]
  if (max === 0) return { heights: new Float32Array(cols * rows), inside: flags, maxDistance: 0 }

  const norm = new Float32Array(dist.length)
  for (let i = 0; i < dist.length; i++) norm[i] = Math.pow(dist[i] / max, 0.75)
  const smooth = boxBlur(norm, cols, rows, 2)
  let top = 0
  for (let i = 0; i < smooth.length; i++) {
    if (!flags[i]) smooth[i] = 0
    if (smooth[i] > top) top = smooth[i]
  }
  if (top > 0) for (let i = 0; i < smooth.length; i++) smooth[i] /= top
  return { heights: smooth, inside: flags, maxDistance: max }
}

/** Browser only: decode the backend's mask PNG into a coarse boolean grid. */
export async function loadMaskGrid(maskDataUrl, maxCells = 160) {
  const img = new Image()
  img.src = maskDataUrl
  await img.decode()
  const aspect = img.naturalWidth / img.naturalHeight
  const cols = aspect >= 1 ? maxCells : Math.max(8, Math.round(maxCells * aspect))
  const rows = aspect >= 1 ? Math.max(8, Math.round(maxCells / aspect)) : maxCells
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const g = canvas.getContext('2d', { willReadFrequently: true })
  g.imageSmoothingEnabled = true
  g.drawImage(img, 0, 0, cols, rows)
  const { data } = g.getImageData(0, 0, cols, rows)
  const inside = new Uint8Array(cols * rows)
  for (let i = 0; i < inside.length; i++) inside[i] = data[i * 4] >= 128 ? 1 : 0
  return { inside, cols, rows, aspect }
}

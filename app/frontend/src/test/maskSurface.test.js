import { describe, expect, it } from 'vitest'
import { distanceInside, heightfieldFromMask } from '../lib/maskSurface'

const grid = (rows) => Uint8Array.from(rows.flatMap((r) => [...r].map((c) => (c === '#' ? 1 : 0))))

describe('mask surface', () => {
  it('distance is 0 outside and grows toward the centre', () => {
    const rows = ['.......', '.#####.', '.#####.', '.#####.', '.#####.', '.#####.', '.......']
    const inside = grid(rows)
    const d = distanceInside(inside, 7, 7)
    expect(d[0]).toBe(0)
    expect(d[1 * 7 + 1]).toBeCloseTo(1, 5)       // edge cell of the region: 1 step from outside
    expect(d[3 * 7 + 3]).toBeCloseTo(3, 1)       // centre is 3 steps from outside
    expect(d[3 * 7 + 3]).toBeGreaterThan(d[2 * 7 + 2])
  })

  it('treats the grid border as outside', () => {
    const d = distanceInside(Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]), 3, 3)
    expect(d[0]).toBeCloseTo(1, 5)
    expect(d[4]).toBeGreaterThan(d[0])
  })

  it('heights are normalised, zero outside the mask, and flat for an empty mask', () => {
    const rows = Array.from({ length: 12 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x > 2 && x < 10 && y > 2 && y < 10 ? '#' : '.')).join(''))
    const inside = grid(rows)
    const { heights, maxDistance } = heightfieldFromMask(inside, 12, 12)
    expect(maxDistance).toBeGreaterThan(0)
    expect(Math.max(...heights)).toBeCloseTo(1, 5)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0)
    heights.forEach((h, i) => { if (!inside[i]) expect(h).toBe(0) })

    const empty = heightfieldFromMask(new Uint8Array(100), 10, 10)
    expect(Math.max(...empty.heights)).toBe(0)
    expect(empty.maxDistance).toBe(0)
  })
})

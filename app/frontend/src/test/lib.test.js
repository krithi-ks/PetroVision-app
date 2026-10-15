import { afterEach, describe, expect, it, vi } from 'vitest'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'
import { api, ApiError } from '../lib/api'
import { audio, SOUNDS } from '../audio/AudioManager'
import { binaryMaskPixels, buildSurfaceGrid } from '../lib/labelGrid'
import { colorOf, regionLabel } from '../scan/palette'
import { isAlertCandidate, isSpreadingCoverage } from '../scan/useLiveScan'

afterEach(() => vi.restoreAllMocks())

describe('format', () => {
  it('formats numbers and handles missing values', () => {
    expect(fmt(0.82010931, 3)).toBe('0.820')
    expect(fmt(null)).toBe('—')
    expect(fmtInt(1234567)).toBe('1,234,567')
    expect(fmtPct(12.3456)).toBe('12.35%')
    expect(fmtMs(8.18)).toBe('8.2 ms')
    expect(fmtMs(150.87)).toBe('151 ms')
    expect(fmtMs(undefined)).toBe('—')
  })

  describe('live alert qualification', () => {
    const instanceResult = (confidence, coverage) => ({
      measurements: { coverage_percent: coverage },
      instances: [{ kind: 'instance', confidence }],
    })

    it('requires meaningful coverage and strong confidence for instance alerts', () => {
      expect(isAlertCandidate(instanceResult(0.64, 4))).toBe(false)
      expect(isAlertCandidate(instanceResult(0.9, 0.09))).toBe(false)
      expect(isAlertCandidate(instanceResult(0.9, 0.1))).toBe(true)
    })

    it('requires larger persistent regions when the model does not report confidence', () => {
      const regionResult = (coverage) => ({
        measurements: { coverage_percent: coverage },
        instances: [{ kind: 'region', confidence: null }],
      })
      expect(isAlertCandidate(regionResult(0.49))).toBe(false)
      expect(isAlertCandidate(regionResult(0.5))).toBe(true)
    })

    it('only calls a sustained coverage increase spreading after both thresholds are reached', () => {
      expect(isSpreadingCoverage(1.49, 1)).toBe(false)
      expect(isSpreadingCoverage(1.5, 1)).toBe(true)
      expect(isSpreadingCoverage(0.9, 1)).toBe(false)
    })
  })
})

describe('api client', () => {
  it('turns backend error payloads into ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'x', text: async () => JSON.stringify({ error: { code: 'checkpoint_missing', message: 'Checkpoint not found', hint: 'set env' } }) }))
    await expect(api.models()).rejects.toMatchObject({ name: 'ApiError', status: 503, code: 'checkpoint_missing', message: 'Checkpoint not found', hint: 'set env' })
  })
  it('reports an unreachable backend clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await api.status().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('network')
    expect(err.message).toMatch(/offline/)
  })
  it('sends image + model_id as multipart', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"ok":1}' })
    vi.stubGlobal('fetch', spy)
    await api.inferImage(new File(['x'], 'a.png', { type: 'image/png' }), 'unet')
    const [url, opts] = spy.mock.calls[0]
    expect(url).toBe('/api/infer/image')
    expect(opts.method).toBe('POST')
    expect(opts.body.get('model_id')).toBe('unet')
    expect(opts.body.get('file').name).toBe('a.png')
  })
  it('sends original and prediction images together for Telegram alerts', async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"sent":true}' })
    vi.stubGlobal('fetch', spy)
    await api.sendTelegramIncident({
      image: new Blob(['original']),
      predictedImage: new Blob(['prediction']),
      incidentId: 'PV-123',
      timestamp: '2026-10-15T10:00:00Z',
      modelId: 'yolo',
      alertType: 'spreading',
      summary: 'Coverage increased.',
    })
    const form = spy.mock.calls[0][1].body
    expect(form.get('file').name).toBe('original-frame.jpg')
    expect(form.get('prediction').name).toBe('predicted-frame.jpg')
    expect(form.get('alert_type')).toBe('spreading')
  })
})

describe('audio manager', () => {
  it('persists on/off + volume and clamps volume', () => {
    audio.setEnabled(false); audio.setVolume(2)
    expect(audio.enabled).toBe(false); expect(audio.volume).toBe(1)
    const saved = JSON.parse(window.localStorage.getItem('petrovision.audio.v1'))
    expect(saved).toEqual({ enabled: false, volume: 1 })
    audio.setEnabled(true); audio.setVolume(0.6)
  })
  it('stays silent (and does not throw) before the user has interacted', () => {
    expect(audio.play('detection')).toBe(false)           // no unlocked AudioContext yet
    audio.setLoop('scan_loop', true); audio.setLoop('scan_loop', false)
  })
  it('declares every cue the Live Scan needs', () => {
    for (const k of ['camera_start', 'scan_start', 'scan_loop', 'detection', 'spatial_3d', 'complete', 'error']) expect(SOUNDS[k].file).toMatch(/\.wav$/)
    expect(SOUNDS.scan_loop.loop).toBe(true)
  })
})

describe('scan helpers', () => {
  it('renders every predicted label as white and the background as black', () => {
    const pixels = binaryMaskPixels(new Uint8Array([0, 1, 2, 0]))
    expect([...pixels]).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ])
  })

  it('builds a surface grid only where the real label map has instances', () => {
    const w = 40, h = 30
    const labels = new Uint8Array(w * h)
    for (let y = 8; y < 22; y++) for (let x = 10; x < 30; x++) labels[y * w + x] = 1
    const g = buildSurfaceGrid({ labels, w, h }, 40)
    expect(g.cols * g.rows).toBe(g.inside.length)
    const insideCount = g.inside.reduce((a, b) => a + b, 0)
    expect(insideCount).toBeGreaterThan(0); expect(insideCount).toBeLessThan(g.inside.length)
    expect(Math.max(...g.heights)).toBeCloseTo(1, 5)
    g.heights.forEach((v, i) => { if (!g.inside[i]) expect(v).toBe(0) })
    expect(Math.max(...buildSurfaceGrid({ labels: new Uint8Array(w * h), w, h }, 40).heights)).toBe(0)   // nothing detected -> flat
  })
  it('labels regions from the model class name and cycles colours', () => {
    expect(regionLabel({ class_name: 'oil' })).toBe('OIL REGION')
    expect(regionLabel({ class_name: 'petroleum' })).toBe('PETROLEUM REGION')
    expect(regionLabel({ class_name: null })).toBe('PETROLEUM-LIKE REGION')
    expect(colorOf(1)).not.toBe(colorOf(2)); expect(colorOf(9)).toBe(colorOf(1))
  })
})

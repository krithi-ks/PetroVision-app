import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import Analyze from '../pages/Analyze'
import Results from '../pages/Results'
import Live from '../pages/Live'
import Visualization3D from '../pages/Visualization3D'
import Dashboard from '../pages/Dashboard'

// ResponsiveContainer needs layout, which jsdom does not provide
vi.mock('recharts', async (orig) => {
  const mod = await orig()
  return { ...mod, ResponsiveContainer: ({ children }) => <div style={{ width: 600, height: 300 }}>{typeof children === 'function' ? null : children}</div> }
})

const MODELS = {
  models: [
    { id: 'unet', label: 'U-Net', task: 'semantic', dataset: 'LADOS', experiment_id: 'CV-UNET-001', initialization: 'Trained from scratch', availability: { status: 'available', available: true, message: 'ok' }, loaded: false },
    { id: 'deeplab', label: 'DeepLabV3+', task: 'semantic', dataset: 'LADOS', experiment_id: 'CV-DEEPLAB-001', initialization: 'ImageNet', availability: { status: 'checkpoint_missing', available: false, message: 'Model files are not installed.' }, loaded: false },
    { id: 'yolo26', label: 'YOLO26n-Seg', task: 'instance', dataset: 'De Kerf', experiment_id: 'CV-YOLO26-DEKERF', initialization: 'x', availability: { status: 'checkpoint_missing', available: false, message: 'Model files are not installed.' }, loaded: false },
  ],
}
const COMPARISON = {
  source: 'x',
  rows: [
    { model_name: 'U-Net', model_id: 'unet', iou: 0.5, dice: 0.6, precision: 0.7, recall: 0.8, accuracy: 0.9, parameters_m: 1.9, mean_ms_per_image: 8.2, images_per_second: 122 },
    { model_name: 'DeepLabV3+', model_id: 'deeplab', iou: 0.7, dice: 0.8, precision: 0.8, recall: 0.9, accuracy: 0.95, parameters_m: 26.7, mean_ms_per_image: 32.9, images_per_second: 30 },
  ],
  observations: { iou: { model_name: 'DeepLabV3+', model_id: 'deeplab', value: 0.7 }, precision: { model_name: 'DeepLabV3+', value: 0.8 }, recall: { model_name: 'DeepLabV3+', value: 0.9 }, lowest_latency: { model_name: 'U-Net', value: 8.2 } },
}
const DEKERF = {
  available: true, model_name: 'YOLO26n-Seg', annotation: 'Oil instances derived from connected regions of the semantic oil masks (not human-annotated instances).',
  metrics: { box_precision: 0.9323, box_recall: 0.9567, box_mAP50: 0.9681, box_mAP50_95: 0.8836, mask_precision: 0.98, mask_recall: 0.9093, mask_mAP50: 0.9642, mask_mAP50_95: 0.8243 },
  test: { test_images: 254, test_instances: 216 }, speed: { inference_ms: 6.5, hardware: 'Tesla T4' }, training: { epochs: 50, image_size: 640, batch_size: 16 }, parameters_fused: 2689079, history: null,
}
const ANALYSIS = {
  id: '20260101-000000-000001', created_at: '2026-01-01T00:00:00+00:00',
  model: { id: 'unet', label: 'U-Net', task: 'semantic' }, image: { filename: 'a.png', width: 100, height: 50 }, mask: { width: 100, height: 50 },
  measurements: { has_petroleum_like_region: true, petroleum_pixels: 1234, total_pixels: 5000, coverage_percent: 24.68, bounding_box: { x: 1, y: 2, width: 30, height: 20 }, centroid: { x: 10.5, y: 12.5 }, perimeter_px: 99.5, region_count: 2, largest_region_pixels: 1000, normalized: { bounding_box: { x: 0.01, y: 0.04, width: 0.3, height: 0.4 }, centroid: { x: 0.1, y: 0.25 } } },
  instances: [
    { index: 1, id: '01', kind: 'instance', class_name: 'oil', confidence: 0.9123, area_px: 12345, coverage_percent: 20.5, perimeter_px: 456.7, centroid: { x: 10, y: 12 }, bounding_box: { x: 1, y: 2, width: 30, height: 20 }, normalized: { bounding_box: { x: 0.01, y: 0.04, width: 0.3, height: 0.4 }, centroid: { x: 0.1, y: 0.25 } }, contour: [[0.1, 0.1], [0.4, 0.1], [0.4, 0.5]] },
    { index: 2, id: '02', kind: 'instance', class_name: 'oil', confidence: 0.8321, area_px: 2222, coverage_percent: 4.1, perimeter_px: 120.2, centroid: { x: 50, y: 20 }, bounding_box: { x: 40, y: 10, width: 9, height: 9 }, normalized: { bounding_box: { x: 0.4, y: 0.2, width: 0.1, height: 0.2 }, centroid: { x: 0.45, y: 0.3 } }, contour: [] },
  ],
  instance_count: 2, contours: [], timing: { inference_ms: 12.3, total_ms: 14 }, viz: null,
  urls: { source: '/api/history/x/source', labels: '/api/history/x/labels', thumb: '/api/history/x/thumb' },
}
const HISTORY_ITEM = { id: ANALYSIS.id, created_at: ANALYSIS.created_at, model: ANALYSIS.model, filename: 'a.png', image: { width: 100, height: 50 }, instance_count: 2, coverage_percent: 24.68, inference_ms: 12.3, thumb_url: '/api/history/x/thumb' }

const respond = (body, status = 200) => ({ ok: status < 400, status, statusText: '', text: async () => JSON.stringify(body) })

function mockFetch({ history = [], latest = null, overrides = {} } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const u = String(url)
    if (overrides[u]) return overrides[u](opts)
    if (u === '/api/status') return respond({ ready: true, models_available: 1, models_total: 3 })
    if (u === '/api/models') return respond(MODELS)
    if (u.startsWith('/api/history?')) return respond({ items: history, total: history.length })
    if (u === '/api/history/latest') return respond({ analysis: latest })
    if (u === `/api/history/${ANALYSIS.id}`) return respond(ANALYSIS)
    if (u === '/api/results/comparison') return respond(COMPARISON)
    if (u === '/api/results/dekerf') return respond(DEKERF)
    if (u === '/api/results/summary') return respond({ source: 's', methodology: { test_images: 343, image_size: '256x256' }, limitations: ['Limit one'] })
    if (u === '/api/results/benchmark') return respond({ source: 'b', hardware: 'Tesla T4', input_size: '256x256', batch_size: 1, warmup_images: 20, timed_images: 100, timing_scope: 'x', models: [] })
    if (u.startsWith('/api/results/history/')) return respond({ source: 'h', model_id: 'unet', loss_name: 'BCE + Dice loss', epochs: [1, 2], train_loss: [1, 0.5], validation_loss: [1, 0.6], best_epoch: 2 })
    return respond({ error: { code: 'not_found', message: 'nope' } }, 404)
  }))
}

const wrap = (ui) => render(<MemoryRouter><AppProvider>{ui}</AppProvider></MemoryRouter>)

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:fake')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Analyze workspace', () => {
  it('shows model availability honestly, with no developer details', async () => {
    mockFetch()
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/checkpoint|\.pt\b|models\/|PyTorch|Python|API online/i)
    expect(screen.getByRole('button', { name: /Run analysis/ }).disabled).toBe(true)        // no image yet
    expect(screen.getByText('Drop an image to analyze')).toBeTruthy()
  })

  it('runs inference on an upload and shows the saved record: instances, confidence, area, no research metrics', async () => {
    const infer = vi.fn(async () => respond({ analysis_id: ANALYSIS.id }))
    mockFetch({ overrides: { '/api/infer/image': infer } })
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    await waitFor(() => expect(screen.getByRole('button', { name: /Run analysis/ }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Run analysis/ }))
    await screen.findByText('Instance 01')
    expect(screen.getByText('Instance 02')).toBeTruthy()
    expect(screen.getByText('0.912')).toBeTruthy()                         // real confidence from the record
    expect(screen.getByText('12,345')).toBeTruthy()
    expect(screen.getByText('24.68%')).toBeTruthy()
    expect(infer).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toMatch(/\bIoU\b|\bDice\b|Recall/)   // no ground-truth metrics for live output
  })

  it('lets the user hide an instance without touching any measurement', async () => {
    mockFetch({ history: [HISTORY_ITEM], latest: ANALYSIS })
    wrap(<Analyze />)
    await screen.findByText('Instance 01')
    const group = screen.getByRole('group', { name: 'instance 01' })
    const eye = group.querySelector('button[aria-pressed]:not([data-sfx])')
    expect(eye.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(eye)
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('12,345')).toBeTruthy()                          // numbers unchanged
  })

  it('shows a clean message when analysis fails', async () => {
    mockFetch({ overrides: { '/api/infer/image': async () => respond({ error: { code: 'invalid_image', message: 'This file could not be read as an image.' } }, 400) } })
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(await screen.findByRole('button', { name: /Run analysis/ }))
    await screen.findByText('Analysis could not be completed')
    expect(screen.getByText(/could not be read as an image/)).toBeTruthy()
  })

  it('rejects non-image files client-side', async () => {
    mockFetch()
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/choose an image file/)).toBeTruthy()
  })
})

describe('Results page', () => {
  it('keeps LADOS and De Kerf separate and renders saved values', async () => {
    mockFetch()
    wrap(<Results />)
    await screen.findByText('Semantic / pixel-level comparison')
    expect(screen.getAllByText('0.7000').length).toBeGreaterThan(0)         // LADOS DeepLab IoU from the payload
    await screen.findByText('YOLO26n-Seg · instance segmentation')
    expect(screen.getByText(/not human-annotated/i)).toBeTruthy()
    expect(screen.getByText(/not comparable/i)).toBeTruthy()
    expect(screen.getAllByText('Box').length).toBeGreaterThan(0)
    expect(screen.queryByText(/best model|universally/i)).toBeNull()
    // the De Kerf model must not appear in the LADOS table
    const table = screen.getAllByRole('table')[0]
    expect(table.textContent).not.toMatch(/YOLO26/)
  })

  it('shows a clean empty state when the De Kerf results are unavailable', async () => {
    mockFetch({ overrides: { '/api/results/dekerf': async () => respond({ available: false }) } })
    wrap(<Results />)
    await screen.findByText('Results not available')
  })

  it('shows a retryable error when results cannot be loaded', async () => {
    mockFetch({ overrides: { '/api/results/comparison': async () => respond({ error: { code: 'results_not_found', message: 'Result file not found' } }, 404) } })
    wrap(<Results />)
    await screen.findByText('Could not load experiment results')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('lists saved analyses in the history tab', async () => {
    mockFetch({ history: [HISTORY_ITEM] })
    wrap(<Results />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Analysis history' }))
    await screen.findByRole('heading', { name: 'Analysis history' })
    expect(screen.getByText('U-Net')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete analysis' })).toBeTruthy()
  })
})

describe('Overview', () => {
  it('shows an honest empty state, and no developer details, when nothing was analysed', async () => {
    mockFetch()
    wrap(<Dashboard />)
    expect(await screen.findByText('No analysis yet')).toBeTruthy()
    expect(screen.getByText('Model availability')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/PyTorch|Python|API online|\.pt\b|CPU|Final-year/i)
  })

  it('shows the latest real analysis numbers from the saved record', async () => {
    mockFetch({ history: [HISTORY_ITEM], latest: ANALYSIS })
    wrap(<Dashboard />)
    await screen.findByText('Latest analysis')
    await waitFor(() => expect(screen.getAllByText(/24\.68|20\.5/).length).toBeGreaterThan(0), { timeout: 3000 })
  })
})

describe('Live Scan page', () => {
  it('explains a denied camera permission and does not claim to be running', async () => {
    mockFetch({ '/api/models/unet/load': async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ runtime: { device: 'cpu' } }) }) })
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockRejectedValue(denied) } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    wrap(<Live />)
    await waitFor(() => expect(screen.getByRole('combobox').value).toBe('unet'))
    fireEvent.click(screen.getByRole('button', { name: /Start camera/i }))
    await screen.findByText(/Camera access was blocked/)
    expect(screen.getByRole('button', { name: /Start camera/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Start scan/i }).disabled).toBe(true)   // cannot scan without a camera
  })

  it('reports a missing webcam API', async () => {
    mockFetch()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    wrap(<Live />)
    await waitFor(() => expect(screen.getByRole('combobox').value).toBe('unet'))
    fireEvent.click(screen.getByRole('button', { name: /Start camera/i }))
    await screen.findByText(/Camera access needs a modern browser/)
  })
})

describe('Live Scan page (no models)', () => {
  it('shows a clean unavailable state and never offers to scan', async () => {
    mockFetch({ '/api/models': async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ models: MODELS.models.map((m) => ({ ...m, availability: { status: 'checkpoint_missing', available: false, message: 'Model files are not installed.' } })) }) }) })
    wrap(<Live />)
    await waitFor(() => expect(screen.getAllByText('NO MODEL AVAILABLE').length).toBeGreaterThan(0))
    expect(screen.getByRole('button', { name: /Start scan/i }).disabled).toBe(true)
    expect(document.body.textContent).not.toMatch(/checkpoint|models\/|\.pt\b/i)
  })
  it('lists models grouped by task with unavailable ones disabled', async () => {
    mockFetch()
    wrap(<Live />)
    await waitFor(() => expect(screen.getByRole('combobox').value).toBe('unet'))
    const opts = [...screen.getByRole('combobox').querySelectorAll('option')]
    expect(opts.find((o) => o.value === 'deeplab').disabled).toBe(true)
    expect(opts.find((o) => o.value === 'unet').disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Both' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Contour' }))
    expect(screen.getByRole('button', { name: 'Contour' }).getAttribute('aria-pressed')).toBe('true')
  })
})


describe('3D page', () => {
  it('shows a clean empty state (not a blank page) when no analysis exists, with the scientific note', async () => {
    mockFetch()
    wrap(<Visualization3D />)
    expect(await screen.findByText('No analysis yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Start analysis' })).toBeTruthy()
    expect(screen.getByText(/does not represent physical oil thickness, depth, concentration or volume/i)).toBeTruthy()
  })

  it('offers saved analyses to pick from and highlights the instances of the latest one', async () => {
    mockFetch({ history: [HISTORY_ITEM], latest: ANALYSIS })
    wrap(<Visualization3D />)
    await screen.findByText('Saved analyses')
    expect(await screen.findByText('Instance 01')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset camera' })).toBeTruthy()
  })
})

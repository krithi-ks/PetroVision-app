import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../context/AppContext'
import { ThemeProvider } from '../context/ThemeContext'
import { audio } from '../audio/AudioManager'
import Analyze from '../pages/Analyze'
import Results from '../pages/Results'
import Live from '../pages/Live'
import Visualization3D from '../pages/Visualization3D'
import Dashboard from '../pages/Dashboard'
import AnalyticsDashboard from '../pages/AnalyticsDashboard'
import Research from '../pages/Research'

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
    if (u.startsWith('/api/geocode?')) return respond({ results: [{ name: 'Port Louis', admin1: 'Port Louis District', country: 'Mauritius', latitude: -20.16, longitude: 57.50 }] })
    if (u === `/api/history/${ANALYSIS.id}`) return respond(ANALYSIS)
    if (u.startsWith('https://marine-api.open-meteo.com/')) return respond({
      hourly: {
        time: ['2026-10-15T12:00'],
        wave_height: [1.2],
        wave_direction: [180],
        ocean_current_velocity: [0.4],
        ocean_current_direction: [90],
        sea_surface_temperature: [25],
      },
      hourly_units: { wave_height: 'm', wave_direction: '°', ocean_current_velocity: 'm/s', sea_surface_temperature: '°C' },
      timezone: 'Indian/Mauritius',
    })
    if (u.startsWith('https://api.open-meteo.com/')) return respond({
      current: { wind_speed_10m: 12, wind_direction_10m: 90 },
      current_units: { wind_speed_10m: 'km/h' },
      timezone: 'Indian/Mauritius',
    })
    if (u === '/api/results/comparison') return respond(COMPARISON)
    if (u === '/api/results/dekerf') return respond(DEKERF)
    if (u === '/api/results/summary') return respond({ source: 's', methodology: { test_images: 343, image_size: '256x256' }, limitations: ['Limit one'] })
    if (u === '/api/results/benchmark') return respond({ source: 'b', hardware: 'Tesla T4', input_size: '256x256', batch_size: 1, warmup_images: 20, timed_images: 100, timing_scope: 'x', models: [] })
    if (u.startsWith('/api/results/history/')) return respond({ source: 'h', model_id: 'unet', loss_name: 'BCE + Dice loss', epochs: [1, 2], train_loss: [1, 0.5], validation_loss: [1, 0.6], best_epoch: 2 })
    return respond({ error: { code: 'not_found', message: 'nope' } }, 404)
  }))
}

const wrap = (ui) => render(<MemoryRouter><ThemeProvider><AppProvider>{ui}</AppProvider></ThemeProvider></MemoryRouter>)
function SeedCurrent({ analysis }) {
  const { setCurrent } = useApp()
  useEffect(() => { setCurrent(analysis) }, [analysis, setCurrent])
  return null
}
const wrapWithAnalysis = (ui, analysis) => render(
  <MemoryRouter><ThemeProvider><AppProvider><SeedCurrent analysis={analysis} />{ui}</AppProvider></ThemeProvider></MemoryRouter>,
)

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

  it('keeps the newly selected original visible while a rerun is in progress', async () => {
    let finishInference
    mockFetch({
      latest: ANALYSIS,
      overrides: {
        '/api/infer/image': () => new Promise((resolve) => { finishInference = resolve }),
      },
    })
    wrapWithAnalysis(<Analyze />, ANALYSIS)
    await screen.findByText('Instance 01')
    fireEvent.change(screen.getByTestId('file-input'), {
      target: { files: [new File(['new image'], 'new-coast.png', { type: 'image/png' })] },
    })
    fireEvent.click(await screen.findByRole('button', { name: /Run analysis/ }))
    expect(await screen.findByAltText('Selected for analysis')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Analysed image with segmentation' })).toBeNull()
    await act(async () => { finishInference(respond({ error: { code: 'invalid_image', message: 'Image could not be read.' } }, 400)) })
    expect(await screen.findByText('Analysis could not be completed')).toBeTruthy()
  })

  it('starts with an upload prompt instead of restoring the most recent saved image', async () => {
    mockFetch({ latest: ANALYSIS })
    wrap(<Analyze />)
    expect(await screen.findByText('Drop an image to analyze')).toBeTruthy()
    expect(screen.queryByRole('img', { name: 'Analysed image with segmentation' })).toBeNull()
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

  it('runs analysis independently of browser audio permissions', async () => {
    const infer = vi.fn(async () => respond({ analysis_id: ANALYSIS.id }))
    const unlock = vi.spyOn(audio, 'unlock').mockRejectedValue(new Error('Audio is unavailable'))
    mockFetch({ overrides: { '/api/infer/image': infer } })
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: /Run analysis/ }))
    await screen.findByText('Instance 01')
    expect(infer).toHaveBeenCalledOnce()
    expect(unlock).not.toHaveBeenCalled()
  })

  it('shows the real inference result if reloading its saved record fails', async () => {
    const infer = vi.fn(async () => respond({
      ...ANALYSIS,
      analysis_id: ANALYSIS.id,
      mask: { ...ANALYSIS.mask, labels_png: 'data:image/png;base64,AA==' },
    }))
    mockFetch({ overrides: {
      '/api/infer/image': infer,
      [`/api/history/${ANALYSIS.id}`]: async () => respond({ detail: 'temporarily unavailable' }, 503),
    } })
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: /Run analysis/ }))
    expect(await screen.findByText('Analysis completed with limited details')).toBeTruthy()
    expect(screen.getByText('Instance 01')).toBeTruthy()
    expect(infer).toHaveBeenCalledOnce()
  })

  it('lets the user change models and run the same uploaded image again', async () => {
    const infer = vi.fn(async (options) => {
      const form = options.body
      const modelId = form.get('model_id')
      return respond({ analysis_id: ANALYSIS.id, model_id: modelId })
    })
    const models = { models: MODELS.models.map((model) => model.id === 'deeplab'
      ? { ...model, availability: { status: 'available', available: true, message: 'ok' } }
      : model) }
    mockFetch({ overrides: {
      '/api/models': async () => respond(models),
      '/api/infer/image': infer,
    } })
    wrap(<Analyze />)
    await screen.findByText('DeepLabV3+')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: /Run analysis/ }))
    await screen.findByText('Instance 01')
    fireEvent.click(screen.getByRole('radio', { name: /DeepLabV3\+/ }))
    fireEvent.click(screen.getByRole('button', { name: /Run analysis/ }))
    await waitFor(() => expect(infer).toHaveBeenCalledTimes(2))
    expect(infer.mock.calls.map(([options]) => options.body.get('model_id'))).toEqual(['unet', 'deeplab'])
  })

  it('can run the same image and model again after a successful analysis', async () => {
    const infer = vi.fn(async () => respond({ analysis_id: ANALYSIS.id }))
    mockFetch({ overrides: { '/api/infer/image': infer } })
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    const runButton = screen.getByRole('button', { name: /Run analysis/ })

    fireEvent.click(runButton)
    await waitFor(() => expect(infer).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(runButton.disabled).toBe(false))
    fireEvent.click(runButton)
    await waitFor(() => expect(infer).toHaveBeenCalledTimes(2))
  })

  it('keeps the selected image ready for analysis after switching away and back', async () => {
    const infer = vi.fn(async () => respond({ analysis_id: ANALYSIS.id }))
    mockFetch({ overrides: { '/api/infer/image': infer } })
    function TabSwitcher() {
      const [showAnalyze, setShowAnalyze] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setShowAnalyze((shown) => !shown)}>Switch tab</button>
          {showAnalyze ? <Analyze /> : <div>Another tab</div>}
        </>
      )
    }
    wrap(<TabSwitcher />)
    await screen.findByText('U-Net')
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch tab' }))
    expect(screen.getByText('Another tab')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Switch tab' }))
    const runButton = await screen.findByRole('button', { name: /Run analysis/ })
    expect(runButton.disabled).toBe(false)
    fireEvent.click(runButton)
    await waitFor(() => expect(infer).toHaveBeenCalledOnce())
  })

  it('checks bounding boxes by default', async () => {
    mockFetch()
    wrap(<Analyze />)
    await screen.findByText('U-Net')
    expect(screen.getByRole('checkbox', { name: 'Bounding boxes' }).checked).toBe(true)
  })

  it('defaults to YOLO11 when it is available', async () => {
    const yolo11 = {
      id: 'yolo', label: 'YOLO11n-Seg', task: 'instance', dataset: 'LADOS',
      availability: { status: 'available', available: true, message: 'ok' }, loaded: false,
    }
    const models = [
      ...MODELS.models.map((model) => model.id === 'yolo26'
        ? { ...model, availability: { status: 'available', available: true, message: 'ok' } }
        : model),
      yolo11,
    ]
    mockFetch({ overrides: { '/api/models': async () => respond({ models }) } })
    wrap(<Analyze />)

    const model = await screen.findByRole('radio', { name: /YOLO11n-Seg/ })
    expect(model.getAttribute('aria-checked')).toBe('true')
  })

  it('lets the user hide an instance without touching any measurement', async () => {
    mockFetch({ history: [HISTORY_ITEM], latest: ANALYSIS })
    wrapWithAnalysis(<Analyze />, ANALYSIS)
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
  it('shows only analysis history', async () => {
    mockFetch()
    wrap(<Results />)
    await screen.findByRole('heading', { name: 'Analysis history' })
    expect(screen.queryByText('Experiments')).toBeNull()
    expect(screen.queryByText('Semantic / pixel-level comparison')).toBeNull()
  })

  it('lists saved analyses in the history tab', async () => {
    mockFetch({ history: [HISTORY_ITEM] })
    wrap(<Results />)
    await screen.findByRole('heading', { name: 'Analysis history' })
    expect(screen.getByText('U-Net')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete analysis' })).toBeTruthy()
  })
})

describe('Research page', () => {
  it('does not show limitations or future scope sections', async () => {
    mockFetch()
    wrap(<Research />)
    await screen.findByText('What PetroVision does — and what it does not')
    expect(screen.queryByRole('heading', { name: 'Limitations' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Future direction' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Model Results' })).toBeNull()
  })
})

describe('Analytics dashboard', () => {
  it('opens a selected saved analysis with original, prediction, overlay and image metrics', async () => {
    mockFetch({ history: [HISTORY_ITEM], latest: ANALYSIS })
    wrap(<AnalyticsDashboard />)
    await screen.findByText('Source image')
    expect(screen.getByText('Predicted mask · black and white')).toBeTruthy()
    expect(screen.getByText('Prediction overlay')).toBeTruthy()
    expect(screen.getByText('Region perimeter')).toBeTruthy()
    expect(screen.getByText('Inference speed')).toBeTruthy()
    expect(screen.getByText('Source image').closest('div.grid').className).toContain('grid-cols-1')
    expect(screen.getByText('Source image').parentElement.querySelector('img').className).toContain('min-h-[380px]')
    expect(screen.getAllByText('Perimeter').length).toBeGreaterThan(0)
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
    expect(screen.getByText('Source image').closest('div.grid').className).toContain('md:grid-cols-3')
    expect(screen.getByText('Source image').closest('div.grid').className).not.toContain('grid-cols-1')
  })

  it('uses a searched location for the marine ecosystem and requests sea conditions', async () => {
    mockFetch()
    const requests = globalThis.fetch
    wrap(<Dashboard />)

    const search = screen.getByLabelText('Search a coastal or marine location')
    fireEvent.change(search, { target: { value: 'Port Louis' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.click(await screen.findByRole('button', { name: /Port Louis/ }))

    expect((await screen.findAllByText('Port Louis, Port Louis District, Mauritius')).length).toBeGreaterThan(0)
    await waitFor(() => {
      const marineRequest = requests.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.startsWith('https://marine-api.open-meteo.com/') && url.includes('latitude=-20.16'))
      expect(marineRequest).toBeTruthy()
      expect(marineRequest).toContain('latitude=-20.16')
      expect(marineRequest).toContain('longitude=57.5')
      expect(marineRequest).toContain('cell_selection=sea')
    })
    expect(screen.getByText(/20\.1600° S/)).toBeTruthy()
    expect(screen.getByText(/57\.5000° E/)).toBeTruthy()
  })

  it('shows feedback when a location search returns no matches', async () => {
    mockFetch({ overrides: {
      '/api/geocode?query=Nowhere': async () => respond({ results: [] }),
    } })
    wrap(<Dashboard />)

    fireEvent.change(screen.getByLabelText('Search a coastal or marine location'), { target: { value: 'Nowhere' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    expect((await screen.findByRole('alert')).textContent).toContain('No matching locations found.')
  })
})

describe('Live Scan page', () => {
  it('defaults to YOLO11 when it is available', async () => {
    const yolo11 = {
      id: 'yolo', label: 'YOLO11n-Seg', task: 'instance', dataset: 'LADOS',
      availability: { status: 'available', available: true, message: 'ok' }, loaded: false,
    }
    const models = [
      ...MODELS.models.map((model) => model.id === 'yolo26'
        ? { ...model, availability: { status: 'available', available: true, message: 'ok' } }
        : model),
      yolo11,
    ]
    mockFetch({ overrides: { '/api/models': async () => respond({ models }) } })
    wrap(<Live />)
    await waitFor(() => expect(screen.getByRole('combobox').value).toBe('yolo'))
  })

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
    fireEvent.click(screen.getByRole('button', { name: /U-Net/ }))
    expect(await screen.findByText('Instance 01')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset camera' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Auto-rotate' }).getAttribute('aria-checked')).toBe('true')
  })
})

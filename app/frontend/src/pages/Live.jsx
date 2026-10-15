import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { audio } from '../audio/AudioManager'
import { uiSoundHandlers } from '../audio/uiSounds'
import { fmt, fmtMs } from '../lib/format'
import { useReducedMotion } from '../lib/useReducedMotion'
import SoundControl from '../components/SoundControl'
import { IconCamera, IconCube, IconScan, IconStop } from '../components/icons'
import { Notice, Spinner } from '../components/ui'
import ScanHUD from '../scan/ScanHUD'
import ScanOverlay from '../scan/ScanOverlay'
import ScanResults from '../scan/ScanResults'
import { STATUS_COLOR, STATUS_TEXT } from '../scan/palette'
import { useLiveScan } from '../scan/useLiveScan'
import '../scan/scan.css'
import { api } from '../lib/api'

const LiveSurface3D = lazy(() => import('../scan/LiveSurface3D'))

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch { return false }
}

/** Fit a box of the given aspect inside an element (letterboxed), tracking resizes. */
function useFit(ref, aspect) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const compute = () => {
      const w = Math.max(0, Math.min(el.clientWidth, el.clientHeight * aspect))
      setBox({ w: Math.floor(w), h: Math.floor(w / aspect) })
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, aspect])
  return box
}

const MODES = [['mask', 'Mask'], ['contour', 'Contour'], ['both', 'Both']]

function pickDefaultModel(models) {
  const usable = models.filter((m) => m.availability.available)
  return (usable.find((m) => m.id === 'yolo') || usable.find((m) => m.task === 'instance') || usable[0])?.id || null
}

async function predictionImage(frameBlob, result) {
  const bitmap = await createImageBitmap(frameBlob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not render the prediction evidence image.')
    context.drawImage(bitmap, 0, 0)
    context.drawImage(result.fillCanvas, 0, 0, bitmap.width, bitmap.height)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not encode the prediction evidence image.'))
      }, 'image/jpeg', 0.9)
    })
  } finally {
    bitmap.close()
  }
}

function Ribbon({ status, model, result, stats }) {
  const items = [
    ['Status', STATUS_TEXT[status]],
    ['Model', model ? model.label : '—'],
    [result?.instances?.[0]?.kind === 'region' ? 'Regions' : 'Instances', result ? String(result.instance_count).padStart(2, '0') : '—'],
    ['Coverage · image-space', result ? `${fmt(result.measurements.coverage_percent, 2)} %` : '—'],
    ['FPS', stats.fps ? fmt(stats.fps, 1) : '—'],
    ['Inference', result ? fmtMs(result.timing.inference_ms) : '—'],
    ['Analysis frame', result ? `${result.mask.width}×${result.mask.height} px` : '—'],
  ]
  return (
    <dl className="flex flex-wrap items-stretch divide-x divide-line border-t border-line bg-surface">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-[110px] flex-1 px-4 py-2"><dt className="label">{k}</dt><dd className="font-mono text-[13px] font-medium tabular-nums text-ink">{v}</dd></div>
      ))}
    </dl>
  )
}

export default function Live() {
  const { models, modelsLoading, status: system, refreshModels, analyze, run } = useApp()
  const reduce = useReducedMotion()
  const [modelId, setModelId] = useState(null)
  const [mode, setMode] = useState('both')
  const [show3D, setShow3D] = useState(true)
  const [resetKey, setResetKey] = useState(0)
  const [selected, setSelected] = useState(1)
  const [save, setSave] = useState({ status: 'idle' })
  const [telegramAlert, setTelegramAlert] = useState({ status: 'idle', message: '' })
  const [telegramIntegration, setTelegramIntegration] = useState({ status: 'checking', configured: null })
  const sentIncidentIds = useRef(new Set())
  const sendingIncidentIds = useRef(new Set())
  const [gl] = useState(webglAvailable)
  const sfx = useMemo(uiSoundHandlers, [])

  const live = useLiveScan({ modelId })
  const { cameras, selectedCamera, setSelectedCamera } = live
  const {
    videoRef,
    camera,
    scanning,
    status,
    inFlight,
    result,
    frame,
    ended,
    stoppedFrame,
    stats,
    error,
    revealKey,
    detection,
    incident,
  } = live
  const model = useMemo(() => models.find((m) => m.id === modelId) || null, [models, modelId])
  const available = useMemo(() => models.filter((m) => m.availability.available), [models])

  useEffect(() => { if (!modelId && models.length) setModelId(pickDefaultModel(models)) }, [models, modelId])
  useEffect(() => { refreshModels() }, [refreshModels, scanning])
  useEffect(() => {
    let active = true
    api.telegramStatus()
      .then((result) => { if (active) setTelegramIntegration({ status: 'ready', configured: result.configured }) })
      .catch((err) => { if (active) setTelegramIntegration({ status: 'error', configured: null, message: err.message }) })
    return () => { active = false }
  }, [])

  // changing the model while scanning restarts the scan on the new model (loaded once, then cached)
  const restart = useRef(false)
  const onModel = (id) => {
    if (id === modelId) return
    if (scanning) { restart.current = true; live.stopScan({ silent: true }) }
    setModelId(id)
  }
  useEffect(() => { if (restart.current && !scanning) { restart.current = false; live.startScan() } }, [modelId, scanning]) // eslint-disable-line react-hooks/exhaustive-deps

  // cues tied to real state changes
  const wasScanning = useRef(false)
  useEffect(() => {
    if (scanning && !wasScanning.current && show3D && gl) audio.play('spatial_3d', { delay: 0.9 })
    wasScanning.current = scanning
  }, [scanning, show3D, gl])
  const hadDetection = useRef(false)
  useEffect(() => {                                           // results panel "streams in" once per detection
    if (detection === 'detected' && !hadDetection.current) audio.play('data_stream', { delay: 0.55 })
    hadDetection.current = detection === 'detected'
  }, [detection])

  useEffect(() => { if (result && !result.instances.some((i) => i.index === selected)) setSelected(result.instances[0]?.index ?? 1) }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  const aspect = frame.w && frame.h ? frame.w / frame.h : 16 / 9
  const viewport = useRef(null)
  const fit = useFit(viewport, aspect)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return undefined
    const sync = () => v.videoWidth && live.setFrame({ w: v.videoWidth, h: v.videoHeight })
    v.addEventListener('loadedmetadata', sync); v.addEventListener('resize', sync)
    return () => { v.removeEventListener('loadedmetadata', sync); v.removeEventListener('resize', sync) }
  }, [videoRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle3D = () => { audio.unlock(); setShow3D((s) => { if (!s && gl) audio.play('spatial_3d'); return !s }) }

  // save the current camera frame as a real, persisted analysis (the frame is analysed once more at full quality)
  const saveSnapshot = async () => {
    const blob = live.resultBlob.current || live.lastBlob.current
    if (!blob || !modelId) return
    setSave({ status: 'saving' })
    const view = await analyze(new File([blob], `live-scan-${Date.now()}.jpg`, { type: 'image/jpeg' }), modelId, { updateCurrent: false })
    setSave(view ? { status: 'saved', id: view.id } : { status: 'error' })
  }
  useEffect(() => { if (scanning) setSave({ status: 'idle' }) }, [scanning])

  const noModel = !modelsLoading && available.length === 0
  const canScan = camera === 'on' && !!modelId && !noModel
  const systemReady = !!system?.ready
  const instanceCount = result?.instance_count ?? 0
  const groups = [['instance', 'Instance segmentation'], ['semantic', 'Semantic segmentation']]


  const sendIncident = useCallback(async (alertIncident) => {
    if (!alertIncident?.alertId || !alertIncident.frameBlob || !alertIncident.result) return
    const { alertId } = alertIncident
    if (sentIncidentIds.current.has(alertId) || sendingIncidentIds.current.has(alertId)) return
    sendingIncidentIds.current.add(alertId)
    const result = alertIncident.result
    const coverage = result.measurements?.coverage_percent
    const inferenceMs = result.timing?.inference_ms
    const confidences = (result.instances || []).map((item) => item.confidence).filter(Number.isFinite)
    const maxConfidence = confidences.length ? Math.max(...confidences) : null
    const spreading = alertIncident.type === 'spreading'
    const summary = [
      spreading ? 'Alert: possible spreading — image-space coverage increased.' : 'Alert: persistent visual detection.',
      `Visual regions: ${result.instance_count}`,
      `Current image-space coverage: ${Number.isFinite(coverage) ? `${coverage.toFixed(2)}%` : 'unavailable'}`,
      ...(spreading ? [`Previous alert coverage: ${alertIncident.previousCoverage.toFixed(2)}%`, `Increase: +${(coverage - alertIncident.previousCoverage).toFixed(2)} percentage points`] : []),
      `Highest model confidence: ${maxConfidence == null ? 'not reported by this model' : `${(maxConfidence * 100).toFixed(1)}%`}`,
      `Inference time: ${Number.isFinite(inferenceMs) ? `${inferenceMs.toFixed(1)} ms` : 'unavailable'}`,
      'Caution: visual AI indication only, not chemical confirmation. Reflections, shadows, camera motion, and other lookalikes can cause false positives; verify before taking action.',
    ].join('\n')

    setTelegramAlert({ status: 'sending', message: `Sending ${spreading ? 'spreading' : 'detection'} evidence to Telegram…` })
    try {
      const predictedImage = await predictionImage(alertIncident.frameBlob, result)
      await api.sendTelegramIncident({
        image: alertIncident.frameBlob,
        predictedImage,
        incidentId: alertIncident.id,
        timestamp: alertIncident.timestamp,
        modelId: alertIncident.modelId,
        alertType: alertIncident.type,
        summary,
      })
      sentIncidentIds.current.add(alertId)
      setTelegramAlert({
        status: 'sent',
        message: `Telegram ${spreading ? 'spreading' : 'detection'} alert sent for incident ${alertIncident.id}.`,
      })
    } catch (err) {
      setTelegramAlert({ status: 'error', message: `Telegram alert failed: ${err.message}` })
      console.error('PetroVision Telegram alert failed:', err)
    } finally {
      sendingIncidentIds.current.delete(alertId)
    }
  }, [])

  useEffect(() => {
    if (incident) void sendIncident(incident)
  }, [incident, sendIncident])

  return (
    <div {...sfx}>
      {/* ------------------------------------------------------------ controls (kept off the camera) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="mr-1 hidden sm:block"><div className="label text-accent">Live scan</div><div className="text-[13px] font-semibold text-ink">Optical analysis</div></div>
            <div className="flex items-center gap-2">

      {cameras.length > 0 && (
        <select
          value={selectedCamera}
          onChange={(e) => {
            if (camera === 'on') {
              live.stopCamera()
            }
            setSelectedCamera(e.target.value)
          }}
          className="h-9 max-w-[220px] rounded-md border border-line bg-surface px-3 text-sm text-ink outline-none"
          aria-label="Camera source"
        >
          {cameras.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camera ${index + 1}`}
            </option>
          ))}
        </select>
      )}

      {camera === 'on' ? (
        <button type="button" className="btn-ghost" onClick={live.stopCamera}>
          <IconStop width={15} height={15} /> Stop camera
        </button>
      ) : (
        <button type="button" className="btn-ghost" onClick={live.startCamera} disabled={camera === 'starting'}>
          {camera === 'starting' ? <Spinner size={14} /> : <IconCamera width={15} height={15} />}
          {camera === 'starting' ? 'Starting' : 'Start camera'}
        </button>
      )}

      {scanning ? (
            <button type="button" className="btn-danger" onClick={() => live.stopScan()}><IconStop width={15} height={15} /> Stop scan</button>
          ) : (
            <button type="button" className="btn-primary" onClick={live.startScan} disabled={!canScan} title={camera !== 'on' ? 'Start the camera first' : noModel ? 'No model available' : undefined}>
              <IconScan width={15} height={15} /> Start scan
            </button>
          )}
        </div>
        <label className="flex items-center gap-2">
          <span className="label">Model</span>
          <select value={modelId || ''} onChange={(e) => onModel(e.target.value)} disabled={modelsLoading || !models.length}
            className="h-9 rounded border border-line-strong bg-surface px-2 font-mono text-[12px] text-ink focus:border-accent">
            {!modelId && <option value="">{modelsLoading ? 'Loading…' : 'No model available'}</option>}
            {groups.map(([task, title]) => {
              const list = models.filter((m) => (m.task || 'semantic') === task)
              return list.length ? (
                <optgroup key={task} label={title}>{list.map((m) => <option key={m.id} value={m.id} disabled={!m.availability.available}>{m.label}{m.availability.available ? '' : ' — unavailable'}</option>)}</optgroup>
              ) : null
            })}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="label hidden md:inline">Display</span>
          <div className="seg" role="group" aria-label="Visualization mode">{MODES.map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {gl && (
            <button type="button" aria-pressed={show3D} onClick={toggle3D}
              className={`flex h-9 items-center gap-2 rounded border px-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.1em] transition-colors ${show3D ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:border-ink'}`}>
              <IconCube width={15} height={15} /> 3D
            </button>
          )}
          <span className="label hidden lg:inline">Scan audio</span>
          <SoundControl label="Scan audio" />
        </div>
      </div>

      {error && <div className="border-b border-line bg-surface px-4 py-2 sm:px-6"><Notice tone="error" action={<button type="button" className="btn-ghost !h-8" onClick={live.dismissError}>Dismiss</button>}>{error.message}</Notice></div>}


      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
        <p className={`text-xs ${telegramIntegration.status === 'error' || telegramIntegration.configured === false ? 'text-amber-700' : 'text-ink-3'}`} role="status">
          {telegramIntegration.status === 'checking' ? 'Telegram alerts: checking configuration…'
            : telegramIntegration.status === 'error' ? `Telegram configuration could not be checked: ${telegramIntegration.message}`
              : telegramIntegration.configured ? 'Telegram alerts are configured.'
                : 'Telegram alerts are not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in the backend environment.'}
        </p>
        {telegramAlert.status !== 'idle' && (
          <div className="flex flex-wrap items-center gap-3" role="status" aria-live="polite">
            <p className={`text-xs ${telegramAlert.status === 'error' ? 'text-red-600' : telegramAlert.status === 'sent' ? 'text-emerald-700' : 'text-ink-muted'}`}>{telegramAlert.message}</p>
            {telegramAlert.status === 'error' && incident && <button type="button" className="btn-ghost !h-7" onClick={() => sendIncident(incident)}>Retry Telegram alert</button>}
          </div>
        )}
        {telegramIntegration.configured && telegramAlert.status === 'idle' && (
          <p className="w-full text-[10px] text-ink-3">
            Automatic alerts need 5 consecutive qualifying frames: instance models require ≥65% confidence and ≥0.1% coverage; semantic models require ≥0.5% coverage.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------------ the scanning viewport */}
      <div className="bg-surface-2">
        <div className="grid items-start gap-3 p-2 sm:p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
          <div ref={viewport} className="relative flex items-center justify-center bg-hud-bg" style={{ height: 'clamp(440px, calc(100vh - 190px), 820px)' }}>
            <div className="scan-stage" data-lock={status === 'DETECTED'} style={{ width: fit.w || '100%', height: fit.h || '100%' }} role="region" aria-label="Live camera scan">
              <video ref={videoRef} playsInline muted aria-label="Camera feed" style={{ opacity: camera === 'on' && !ended ? 1 : 0 }} />
              {ended && stoppedFrame && <img className="scan-captured-frame" src={stoppedFrame} alt="Captured camera frame when scan stopped" />}
              <ScanOverlay result={result} mode={mode} selected={selected} active={scanning || status === 'DETECTED'} revealKey={revealKey} reduceMotion={reduce} width={fit.w} height={fit.h} />
              <ScanHUD status={status} scanning={scanning} inFlight={inFlight} camera={camera} result={result} stats={stats} model={model} noModel={noModel}
                systemReady={systemReady && !noModel} selected={selected} onSelect={setSelected} mode={mode} show3D={show3D && gl} revealKey={revealKey} reduceMotion={reduce} errorText={error?.message} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <ScanResults result={result} status={status} stats={stats} scanning={scanning} selected={selected} onSelect={setSelected} model={model}
              onSave={saveSnapshot} save={save} canSave={camera === 'on' && !!(live.resultBlob.current || live.lastBlob.current) && !!modelId && !noModel && !scanning ? true : camera === 'on' && !!result && !!modelId} />
          </div>
        </div>
        {show3D && gl && camera === 'on' && (
          <section className="mx-2 mb-3 flex min-h-[540px] flex-col overflow-hidden border border-cyan-800/70 bg-[#0b1b29] p-3 shadow-[0_0_28px_rgba(53,216,255,0.08)] sm:mx-4 sm:mb-4 sm:min-h-[620px]" aria-label="Live holographic mask view">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><div className="font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200">Live holographic projection</div><p className="mt-1 text-[11px] text-cyan-100/65">Mask-derived relief, not physical depth or thickness.</p></div>
              <button type="button" className="btn-ghost !h-8 !border-cyan-800 !bg-[#10283a] !text-cyan-100 hover:!border-cyan-400" onClick={() => setResetKey((key) => key + 1)}>Reset view</button>
            </div>
            <div className="min-h-[460px] flex-1">
              <Suspense fallback={<div className="grid h-full min-h-[460px] place-items-center text-sm text-cyan-100/70"><Spinner /> Loading holographic view…</div>}>
                <LiveSurface3D videoRef={videoRef} camera={camera} grid={result?.grid} instances={result?.instances} detected={detection === 'detected' && scanning}
                  scanning={scanning} aspect={aspect} reduce={reduce} resetKey={resetKey} selected={selected} onSelect={setSelected} />
              </Suspense>
            </div>
          </section>
        )}
        <div className="border-t border-line"><Ribbon status={status} model={model} result={result} stats={stats} /></div>
      </div>

      {save.status === 'saved' && save.id && <div className="border-t border-line bg-surface px-4 py-3 text-center"><Link to="/dashboard" state={{ analysisId: save.id }} className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline">View saved live scan in dashboard →</Link></div>}

      <div className="sr-only" aria-live="polite">{`Scan status ${STATUS_TEXT[status]}. ${instanceCount} ${instanceCount === 1 ? 'instance' : 'instances'} detected.`}</div>
    </div>
  )
}

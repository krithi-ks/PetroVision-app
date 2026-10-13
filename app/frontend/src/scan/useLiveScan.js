import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { audio } from '../audio/AudioManager'
import { buildFillCanvas, buildSurfaceGrid, decodeImage, readLabels } from '../lib/labelGrid'
import { HUD_PALETTE } from './palette'

const CAPTURE_WIDTH = 480          // frames are downscaled before upload (the models resize anyway)
const JPEG_QUALITY = 0.72
const MIN_FRAME_GAP_MS = 40
const CONFIRM_FRAMES = 2           // consecutive frames with detections before DETECTED
const CLEAR_FRAMES = 3             // consecutive empty frames before NO DETECTION
const DETECTION_SOUND_COOLDOWN_MS = 3000
const LATENCY_HISTORY = 48

export function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera permission for this site and try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.'
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is in use by another application or could not be started.'
    default:
      return 'The camera could not be started.'
  }
}

/**
 * Camera + real-time inference loop + detection state machine.
 * Every value exposed here comes from the real model response or the real camera stream.
 */
export function useLiveScan({ modelId }) {
  const videoRef = useRef(null)
  const stream = useRef(null)
  const loop = useRef({ active: false, abort: null, id: 0 })
  const caps = useRef(document.createElement('canvas'))
  const streaks = useRef({ pos: 0, neg: 0, state: 'unknown', lastSound: 0 })
  const times = useRef([])
  const latencies = useRef([])
  const framesDone = useRef(0)
  const lastBlob = useRef(null)

  const [camera, setCamera] = useState('off')            // off | starting | on
  const [scanning, setScanning] = useState(false)

  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')

  const [loadingModel, setLoadingModel] = useState(false)
  const [inFlight, setInFlight] = useState(false)
  const [detection, setDetection] = useState('unknown')  // unknown | detected | none
  const [result, setResult] = useState(null)
  const [frame, setFrame] = useState({ w: 0, h: 0 })
  const [stats, setStats] = useState({ fps: null, frames: 0, latencies: [] })
  const [error, setError] = useState(null)
  const [revealKey, setRevealKey] = useState(0)
  const [ended, setEnded] = useState(false)               // scan stopped with a result on screen -> COMPLETE

  const [incident, setIncident] = useState(null)


  const fail = useCallback((err) => {
    const e = err instanceof ApiError ? err : new Error(cameraErrorMessage(err))
    setError(e)
    audio.play('error')
    loop.current.active = false
    loop.current.abort?.abort()
    audio.setLoop('scan_loop', false)
    setScanning(false)
    setInFlight(false)
    setLoadingModel(false)
  }, [])


  const loadCameras = useCallback(async () => {
  try {
    console.log('loadCameras called')
    const devices = await navigator.mediaDevices.enumerateDevices()

    const videoDevices = devices.filter(
      (device) => device.kind === 'videoinput'
    )
    console.log('Browser cameras:', videoDevices)

    setCameras(videoDevices)

    // Keep the currently selected camera if it still exists.
    if (
      selectedCamera &&
      videoDevices.some((device) => device.deviceId === selectedCamera)
    ) {
      return
    }

    // Prefer Logitech when it is available.
    const logitech = videoDevices.find((device) =>
      device.label.toLowerCase().includes('logitech')
    )

    if (logitech) {
      setSelectedCamera(logitech.deviceId)
    } else if (videoDevices.length > 0) {
      setSelectedCamera(videoDevices[0].deviceId)
    }
  } catch (err) {
    console.error('Could not enumerate cameras:', err)
  }
}, [selectedCamera])


  // ------------------------------------------------------------------ camera
  const startCamera = useCallback(async () => {
    setError(null)
    await audio.unlock()
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError(new Error('Camera access needs a modern browser opened on localhost or HTTPS.'))
      audio.play('error')
      return false
    }
    setCamera('starting')
    try {
      const videoConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(selectedCamera
          ? { deviceId: { exact: selectedCamera } }
          : { facingMode: { ideal: 'environment' } }),
            }

      const s = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      })
      stream.current = s
      s.getVideoTracks()[0]?.addEventListener('ended', () => { setError(new Error('The camera was disconnected.')); stopCameraRef.current?.() })
      const v = videoRef.current
      v.srcObject = s
      await v.play()
      setFrame({ w: v.videoWidth, h: v.videoHeight })
      setCamera('on')
      setEnded(false)
      await loadCameras()
      audio.play('camera_start')
      if (modelId) api.loadModel(modelId).catch(() => {})       // warm the model while the user frames the shot
      return true
    } catch (err) {
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
      setCamera('off')
      setError(new Error(cameraErrorMessage(err)))
      audio.play('error')
      return false
    }
    }, [modelId, selectedCamera])

  useEffect(() => {
  if (camera !== 'on' || !selectedCamera) return

  const activeVideo = videoRef.current
  const activeTrack = stream.current?.getVideoTracks?.()[0]

  if (!activeVideo || !activeTrack) return

  const activeDeviceId = activeTrack.getSettings?.().deviceId

  if (!activeDeviceId || activeDeviceId === selectedCamera) return

  stopCamera()
  startCamera()
}, [selectedCamera]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopScan = useCallback(({ silent = false } = {}) => {
    const wasActive = loop.current.active
    loop.current.active = false
    loop.current.abort?.abort()
    audio.setLoop('scan_loop', false)
    setScanning(false)
    setInFlight(false)
    setLoadingModel(false)
    if (wasActive && !silent && framesDone.current > 0) {
      setEnded(true)
      audio.play('complete')
    }
  }, [])

  const stopCamera = useCallback(() => {
    const wasOn = !!stream.current
    stopScan({ silent: true })
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCamera('off')
    setEnded(false)
    setResult(null)
    setDetection('unknown')
    setStats({ fps: null, frames: 0, latencies: [] })
    lastBlob.current = null
    if (wasOn) audio.play('camera_stop')
  }, [stopScan])
  const stopCameraRef = useRef(stopCamera)
  stopCameraRef.current = stopCamera

  // ------------------------------------------------------------------ inference loop
  const runLoop = useCallback(async (id, runId) => {
    const state = loop.current
    const cap = caps.current
    while (state.active && state.id === runId) {
      const v = videoRef.current
      if (!v || v.readyState < 2 || !v.videoWidth) { await new Promise((r) => setTimeout(r, 60)); continue }
      const w = CAPTURE_WIDTH
      const h = Math.max(2, Math.round((v.videoHeight / v.videoWidth) * w))
      cap.width = w
      cap.height = h
      cap.getContext('2d').drawImage(v, 0, 0, w, h)
      const blob = await new Promise((r) => cap.toBlob(r, 'image/jpeg', JPEG_QUALITY))
      if (!blob || !state.active || state.id !== runId) continue
      lastBlob.current = blob

      const t0 = performance.now()
      try {
        state.abort = new AbortController()
        setInFlight(true)
        const res = await api.inferFrame(blob, id, state.abort.signal)
        if (!state.active || state.id !== runId) break

        const labelImg = await decodeImage(res.mask.labels_png)
        const lab = readLabels(labelImg)
        const built = {
          ...res,
          fillCanvas: buildFillCanvas(lab, HUD_PALETTE, 0.3),
          grid: buildSurfaceGrid(lab, 96),
          receivedAt: performance.now(),
        }

        // ---- detection state machine (debounced; sound only on a meaningful change) ----
        const s = streaks.current
        if (res.instance_count > 0) { s.pos += 1; s.neg = 0 } else { s.neg += 1; s.pos = 0 }
        let next = s.state
        if (s.state !== 'detected' && s.pos >= CONFIRM_FRAMES) next = 'detected'
        else if (s.state === 'detected' && s.neg >= CLEAR_FRAMES) next = 'none'
        else if (s.state === 'unknown' && s.neg >= CLEAR_FRAMES) next = 'none'
        let confirmed = false

if (next !== s.state) {
  s.state = next
  setDetection(next)

    if (next === 'detected') {
      confirmed = true
      setRevealKey((k) => k + 1)

      const now = performance.now()

      if (now - s.lastSound > DETECTION_SOUND_COOLDOWN_MS) {
        audio.play('detection')
        s.lastSound = now
      }

      // Preserve the original frame and the prediction produced from it.
      setIncident({
        id: `PV-${Date.now()}`,
        timestamp: new Date().toISOString(),
        modelId: id,
        frameBlob: blob,
        result: built,
      })
    }
  }

        // ---- real throughput / latency ----
        const now = performance.now()
        times.current.push(now)
        while (times.current.length && now - times.current[0] > 3000) times.current.shift()
        const fps = times.current.length > 1 ? (times.current.length - 1) / ((times.current[times.current.length - 1] - times.current[0]) / 1000) : null
        latencies.current.push(res.timing.inference_ms)
        if (latencies.current.length > LATENCY_HISTORY) latencies.current.shift()
        framesDone.current += 1

        setResult(built)
        setStats({ fps, frames: framesDone.current, latencies: [...latencies.current] })
        setInFlight(false)
      } catch (err) {
        if (err?.name === 'AbortError' || !state.active || state.id !== runId) break
        fail(err)
        break
      }
      const spent = performance.now() - t0
      if (spent < MIN_FRAME_GAP_MS) await new Promise((r) => setTimeout(r, MIN_FRAME_GAP_MS - spent))
    }
  }, [fail])

  const startScan = useCallback(async () => {
    if (camera !== 'on' || !modelId || loop.current.active) return
    setError(null)
    setEnded(false)
    await audio.unlock()
    const runId = loop.current.id + 1
    loop.current = { active: true, abort: null, id: runId }
    streaks.current = { pos: 0, neg: 0, state: 'unknown', lastSound: streaks.current.lastSound }
    times.current = []
    latencies.current = []
    framesDone.current = 0
    setResult(null)
    setDetection('unknown')
    setIncident(null)

    setStats({ fps: null, frames: 0, latencies: [] })
    setScanning(true)
    audio.play('scan_start')
    audio.setLoop('scan_loop', true)
    setLoadingModel(true)
    try {
      await api.loadModel(modelId)                     // loaded once, then cached by the backend
    } catch (err) {
      if (loop.current.id === runId) fail(err)
      return
    }
    if (!loop.current.active || loop.current.id !== runId) return
    setLoadingModel(false)
    runLoop(modelId, runId)
  }, [camera, modelId, fail, runLoop])

  useEffect(() => () => {
    loop.current.active = false
    loop.current.abort?.abort()
    stream.current?.getTracks().forEach((t) => t.stop())
    audio.setLoop('scan_loop', false)
  }, [])

  // ------------------------------------------------------------------ derived status
  const status = useMemo(() => {
    if (error) return 'ERROR'
    if (scanning) {
      if (loadingModel) return 'PROCESSING'
      if (detection === 'detected') return 'DETECTED'
      if (detection === 'none') return 'NO_DETECTION'
      return stats.frames === 0 ? 'PROCESSING' : 'SCANNING'
    }
    if (ended && result) return 'COMPLETE'
    return camera === 'on' ? 'CAMERA_READY' : 'IDLE'
  }, [error, scanning, loadingModel, detection, stats.frames, ended, result, camera])

  const dismissError = useCallback(() => setError(null), [])

  return {
  videoRef,
  camera,
  scanning,
  status,
  inFlight,
  detection,
  result,
  frame,
  setFrame,
  stats,
  error,
  revealKey,
  loadingModel,
  dismissError,
  lastBlob,

  cameras,
  selectedCamera,
  setSelectedCamera,

  startCamera,
  stopCamera,
  startScan,
  stopScan,
  incident
}
}

// Centralised audio for PetroVision (src/audio/AudioManager.js).
//
// * Local assets only (public/audio/*.wav, synthesised by scripts/generate_sounds.py).
// * The AudioContext is created lazily, and only after a user gesture (browser autoplay policy):
//   call `audio.unlock()` from click / key handlers.
// * Sounds are interface feedback only - they never encode confidence, severity or any measurement.
// * Looping sounds are *declared* (`setLoop`) and applied when audio is enabled + unlocked, so the
//   Live Scan page can state "scan loop should be playing" without caring about permissions.

const PREFS_KEY = 'petrovision.audio.v1'
const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/')

// gain = relative loudness of the cue; minGap = minimum ms between two plays of the same cue
export const SOUNDS = {
  system_ready: { file: 'system_ready.wav', gain: 0.7 },
  camera_start: { file: 'camera_start.wav', gain: 0.7 },
  camera_stop: { file: 'camera_stop.wav', gain: 0.65 },
  scan_start: { file: 'scan_start.wav', gain: 0.8 },
  scan_loop: { file: 'scan_loop.wav', gain: 0.2, loop: true },
  detection: { file: 'detection.wav', gain: 0.85 },
  spatial_3d: { file: 'spatial_3d.wav', gain: 0.6 },
  complete: { file: 'complete.wav', gain: 0.75 },
  error: { file: 'error.wav', gain: 0.6 },
  data_stream: { file: 'data_stream.wav', gain: 0.5, minGap: 600 },
  ui_hover: { file: 'ui_hover.wav', gain: 0.4, minGap: 70 },
  ui_click: { file: 'ui_click.wav', gain: 0.55, minGap: 60 },
  ui_toggle_on: { file: 'ui_toggle_on.wav', gain: 0.5, minGap: 80 },
  ui_toggle_off: { file: 'ui_toggle_off.wav', gain: 0.5, minGap: 80 },
  ui_select: { file: 'ui_select.wav', gain: 0.55, minGap: 120 },
  ui_expand: { file: 'ui_expand.wav', gain: 0.5, minGap: 150 },
  ui_collapse: { file: 'ui_collapse.wav', gain: 0.5, minGap: 150 },
}

function readPrefs() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}')
    return {
      enabled: raw.enabled !== false,
      volume: typeof raw.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : 0.6,
    }
  } catch {
    return { enabled: true, volume: 0.6 }
  }
}

class AudioManager {
  constructor() {
    this.prefs = typeof window === 'undefined' ? { enabled: true, volume: 0.6 } : readPrefs()
    this.ctx = null
    this.master = null
    this.buffers = new Map()
    this.loading = null
    this.loops = new Map()        // name -> { src, gain }   (currently playing)
    this.wanted = new Set()       // loops that should be playing
    this.lastPlayed = new Map()
    this.listeners = new Set()
    this.snapshot = { ...this.prefs, unlocked: false }
  }

  // ---- state for React (useSyncExternalStore) ------------------------------------------------
  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snapshot
  _emit() {
    this.snapshot = { ...this.prefs, unlocked: !!this.ctx && this.ctx.state === 'running' }
    this.listeners.forEach((fn) => fn())
  }
  _persist() {
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs))
    } catch {
      /* preference simply won't persist */
    }
  }

  get enabled() { return this.prefs.enabled }
  get volume() { return this.prefs.volume }

  // ---- lifecycle ------------------------------------------------------------------------------
  /** Must be called from a user-gesture handler. Safe to call repeatedly. */
  async unlock() {
    if (typeof window === 'undefined') return false
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    if (!this.ctx) {
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = this._masterGain()
      // gentle low-pass tames the brightest glass tones; the compressor keeps overlapping cues from stacking up
      const soften = this.ctx.createBiquadFilter()
      soften.type = 'lowpass'
      soften.frequency.value = 9500
      soften.Q.value = 0.4
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.knee.value = 18
      comp.ratio.value = 3.5
      comp.attack.value = 0.004
      comp.release.value = 0.2
      this.master.connect(soften).connect(comp).connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume() } catch { /* still blocked */ }
    }
    this._emit()
    this._ensureLoaded().then(() => this._applyLoops())
    return this.ctx.state === 'running'
  }

  _masterGain() { return this.prefs.enabled ? this.prefs.volume ** 1.6 : 0 }

  async _ensureLoaded() {
    if (this.loading) return this.loading
    this.loading = Promise.all(
      Object.entries(SOUNDS).map(async ([name, def]) => {
        try {
          const res = await fetch(`${BASE}audio/${def.file}`)
          if (!res.ok) throw new Error(String(res.status))
          const data = await res.arrayBuffer()
          this.buffers.set(name, await this.ctx.decodeAudioData(data))
        } catch {
          /* a missing asset just means that cue stays silent */
        }
      }),
    )
    return this.loading
  }

  setEnabled(enabled) {
    this.prefs.enabled = !!enabled
    this._persist()
    if (this.master) this._ramp(this.master.gain, this._masterGain(), 0.12)
    this._applyLoops()
    this._emit()
  }

  setVolume(volume) {
    this.prefs.volume = Math.min(1, Math.max(0, Number(volume) || 0))
    this._persist()
    if (this.master) this._ramp(this.master.gain, this._masterGain(), 0.05)
    this._emit()
  }

  _ramp(param, value, seconds) {
    const t = this.ctx.currentTime
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(value, t + seconds)
  }

  // ---- one-shot cues ----------------------------------------------------------------------------
  play(name, { gain = 1, delay = 0 } = {}) {
    const def = SOUNDS[name]
    const buffer = this.buffers.get(name)
    if (!def || !buffer || !this.ctx || this.ctx.state !== 'running' || !this.prefs.enabled) return false
    if (def.minGap) {                                                    // rate-limit chatty interface cues
      const now = performance.now()
      if (now - (this.lastPlayed.get(name) || 0) < def.minGap) return false
      this.lastPlayed.set(name, now)
    }
    const src = this.ctx.createBufferSource()
    const g = this.ctx.createGain()
    src.buffer = buffer
    g.gain.value = def.gain * gain
    src.connect(g).connect(this.master)
    src.start(this.ctx.currentTime + delay)
    return true
  }

  // ---- loops ------------------------------------------------------------------------------------
  setLoop(name, shouldPlay) {
    if (shouldPlay) this.wanted.add(name)
    else this.wanted.delete(name)
    this._applyLoops()
  }

  _applyLoops() {
    if (!this.ctx || this.ctx.state !== 'running') return
    for (const [name, def] of Object.entries(SOUNDS)) {
      if (!def.loop) continue
      const playing = this.loops.get(name)
      const should = this.wanted.has(name) && this.prefs.enabled && this.buffers.has(name)
      if (should && !playing) {
        const src = this.ctx.createBufferSource()
        const g = this.ctx.createGain()
        src.buffer = this.buffers.get(name)
        src.loop = true
        g.gain.setValueAtTime(0, this.ctx.currentTime)
        g.gain.linearRampToValueAtTime(def.gain, this.ctx.currentTime + 0.6)
        src.connect(g).connect(this.master)
        src.start()
        this.loops.set(name, { src, g })
      } else if (!should && playing) {
        const t = this.ctx.currentTime
        playing.g.gain.cancelScheduledValues(t)
        playing.g.gain.setValueAtTime(playing.g.gain.value, t)
        playing.g.gain.linearRampToValueAtTime(0, t + 0.4)
        playing.src.stop(t + 0.45)
        this.loops.delete(name)
      }
    }
  }

  stopAll() {
    this.wanted.clear()
    this._applyLoops()
  }
}

export const audio = new AudioManager()

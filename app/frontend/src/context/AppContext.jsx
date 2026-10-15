import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { audio } from '../audio/AudioManager'
import { useAudio } from '../audio/useAudio'
import { useOptionalAuth } from './AuthContext'

const AppContext = createContext(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

const STATUS_POLL_MS = 15000

export function AppProvider({ children }) {
  const auth = useOptionalAuth()
  // ---- sound (UI feedback only) -------------------------------------------------
  const audioState = useAudio()
  const muted = !audioState.enabled
  const play = useCallback((name) => audio.play(name === 'select' ? 'ui_select' : name === 'click' ? 'ui_click' : name), [])
  const toggleMute = useCallback(() => {
    audio.unlock()
    audio.setEnabled(!audio.enabled)
    if (audio.enabled) audio.play('ui_toggle_on')
  }, [])

  // ---- system + models ------------------------------------------------------------
  const [status, setStatus] = useState(null)               // { ready, models_available, models_total }
  const [statusError, setStatusError] = useState(null)
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const [modelsError, setModelsError] = useState(null)

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api.status()); setStatusError(null) } catch (err) { setStatus(null); setStatusError(err.message) }
  }, [])
  const refreshModels = useCallback(async () => {
    try { setModels((await api.models()).models); setModelsError(null) } catch (err) { setModelsError(err.message) } finally { setModelsLoading(false) }
  }, [])

  // ---- saved analyses ---------------------------------------------------------------
  const [history, setHistory] = useState({ items: [], total: 0, loaded: false })
  const [current, setCurrent] = useState(null)             // the analysis shown in Analyze / Visualize / Overview
  const [run, setRun] = useState({ status: 'idle', error: null, modelId: null })
  const runId = useRef(0)

  const refreshHistory = useCallback(async () => {
    try { const h = await api.history(60); setHistory({ items: h.items, total: h.total, loaded: true }) }
    catch { setHistory((p) => ({ ...p, loaded: true })) }
  }, [])

  const openAnalysis = useCallback(async (id) => {
    try { const rec = await api.analysis(id); setCurrent(rec); return rec } catch { await refreshHistory(); return null }
  }, [refreshHistory])

  const removeAnalysis = useCallback(async (id) => {
    try { await api.deleteAnalysis(id) } catch { /* already gone */ }
    setCurrent((c) => (c?.id === id ? null : c))
    await refreshHistory()
    try { const l = await api.latest(); setCurrent((c) => c || l.analysis) } catch { /* ignore */ }
  }, [refreshHistory])

  useEffect(() => {
    if (auth && (auth.loading || !auth.user)) return undefined
    refreshStatus(); refreshModels(); refreshHistory()
    api.latest().then((l) => l.analysis && setCurrent((c) => c || l.analysis)).catch(() => {})
    const t = setInterval(refreshStatus, STATUS_POLL_MS)
    return () => clearInterval(t)
  }, [auth?.loading, auth?.user?.id, refreshStatus, refreshModels, refreshHistory])

  /** Run real inference on an uploaded image. The backend saves the result; we then show the saved record. */
  const analyze = useCallback(async (file, modelId) => {
    const id = ++runId.current
    setRun({ status: 'running', error: null, modelId })
    audio.play('scan_start')
    try {
      const res = await api.inferImage(file, modelId)
      if (id !== runId.current) return null
      let view
      if (res.analysis_id) view = await api.analysis(res.analysis_id)
      else {                                              // saving failed server-side: still show the real result
        view = { ...res, id: null, urls: { source: URL.createObjectURL(file), labels: res.mask.labels_png }, contours: res.contours || [], viz: null }
      }
      setCurrent(view)
      setRun({ status: 'done', error: null, modelId })
      audio.play('complete')
      refreshHistory(); refreshModels()
      return view
    } catch (err) {
      if (id !== runId.current) return null
      setRun({ status: 'error', error: err, modelId })
      audio.play('error')
      refreshModels()
      return null
    }
  }, [refreshHistory, refreshModels])

  const value = useMemo(() => ({
    muted, toggleMute, play,
    status, statusError, refreshStatus,
    models, modelsLoading, modelsError, refreshModels,
    history, refreshHistory, current, setCurrent, openAnalysis, removeAnalysis, run, analyze,
  }), [muted, toggleMute, play, status, statusError, refreshStatus, models, modelsLoading, modelsError, refreshModels, history, refreshHistory, current, openAnalysis, removeAnalysis, run, analyze])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

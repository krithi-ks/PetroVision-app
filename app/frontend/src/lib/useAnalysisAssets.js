import { useEffect, useState } from 'react'
import { decodeImage, readLabels } from './labelGrid'

const cache = new Map()          // source url -> { img, lab }   (kept small; analyses are immutable once saved)
const CACHE_MAX = 8

async function load(view) {
  const key = `${view.id || 'local'}:${view.urls.source}`
  if (cache.has(key)) return cache.get(key)
  const [img, labelImg] = await Promise.all([decodeImage(view.urls.source), decodeImage(view.urls.labels)])
  const entry = { img, lab: readLabels(labelImg) }
  cache.set(key, entry)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return entry
}

/** Loads the saved analysis' source image + label map (no inference). */
export function useAnalysisAssets(view) {
  const [state, setState] = useState({ status: 'idle', img: null, lab: null })
  useEffect(() => {
    if (!view?.urls) { setState({ status: 'idle', img: null, lab: null }); return undefined }
    let cancelled = false
    setState((s) => ({ ...s, status: 'loading' }))
    load(view).then((e) => !cancelled && setState({ status: 'ready', ...e })).catch(() => !cancelled && setState({ status: 'error', img: null, lab: null }))
    return () => { cancelled = true }
  }, [view?.id, view?.urls?.source]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

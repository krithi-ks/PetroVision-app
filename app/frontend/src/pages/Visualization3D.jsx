import { Suspense, lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { audio } from '../audio/AudioManager'
import { uiSoundHandlers } from '../audio/uiSounds'
import { useApp } from '../context/AppContext'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'
import { instanceColor } from '../lib/render'
import { useAnalysisAssets } from '../lib/useAnalysisAssets'
import { useTheme } from '../context/ThemeContext'
import AnalysisViewer from '../components/AnalysisViewer'
import { Badge, Spinner } from '../components/ui'

const Viewer3D = lazy(() => import('../components/Viewer3D'))
const BASE = { mode: 'original', color: '#e5322d', opacity: 0.5, showBoxes: false, showLabels: false, hidden: new Set(), selected: null, hover: null }
const MASK = { ...BASE, mode: 'binary' }

function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))) } catch { return false }
}

function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between py-1.5 text-[13px] text-ink">
      <span>{label}</span>
      <span className={`relative h-[18px] w-8 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-line-strong'}`}><span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition-all ${checked ? 'left-[16px]' : 'left-[2px]'}`} /></span>
    </button>
  )
}

export default function Visualization3D() {
  const { current: view, history, openAnalysis } = useApp()
  const { theme } = useTheme()
  const assets = useAnalysisAssets(view)
  const [gl] = useState(webglAvailable)
  const [selected, setSelected] = useState(null)
  const [resetKey, setResetKey] = useState(0)
  const [o, setO] = useState({ heightScale: 1, photo: true, wireframe: false, contours: true, labels: true, flat: false, autoRotate: true })
  const sfx = useMemo(uiSoundHandlers, [])
  const set = (k) => (v) => setO((p) => ({ ...p, [k]: v }))
  const ready = view && assets.status === 'ready'

  const choose = (id) => { setSelected(null); setResetKey((k) => k + 1); openAnalysis(id) }

  return (
    <div className="-mx-4 -my-8 sm:-mx-6" {...sfx}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="mr-2"><div className="label text-accent">Visualize</div><div className="text-[13px] font-semibold text-ink">3D view</div></div>
        <Badge kind="viz">Image-space visualization</Badge>
        {view && <span className="text-[12px] text-ink-3">{view.model.label} · {new Date(view.created_at || Date.now()).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
      </div>

      <div className="grid lg:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          <div className="visualization-canvas relative h-[560px] lg:h-[calc(100vh-56px-49px-96px)] lg:min-h-[520px]" style={{ background: theme === 'dark' ? 'radial-gradient(ellipse at 50% 20%, #18384a 0%, #0d1e2b 52%, #09141e 100%)' : 'linear-gradient(180deg,#f7f9fc 0%,#e3e9f1 100%)' }} data-testid="three-canvas">
            {!view ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div className="grid-bg absolute inset-0 opacity-50" />
                <div className="relative"><div className="text-[17px] font-semibold text-ink">No analysis yet</div><p className="mx-auto mt-1.5 max-w-sm text-[13px] text-ink-2">Analyze an image or save a live-scan snapshot to see its mask as an interactive image-space surface.</p>
                  <div className="mt-4 flex justify-center gap-2"><Link to="/analyze" className="btn-primary">Start analysis</Link><Link to="/live" className="btn-ghost">Live scan</Link></div></div>
              </div>
            ) : !gl ? (
              <div className="grid h-full place-items-center text-center text-[13px] text-ink-2">3D rendering needs WebGL. Try another browser or enable hardware acceleration.</div>
            ) : !ready ? (
              <div className="grid h-full place-items-center text-ink-3"><Spinner /></div>
            ) : (
              <Suspense fallback={<div className="grid h-full place-items-center text-ink-3"><Spinner /></div>}>
                <Viewer3D view={view} assets={assets} selected={selected} onSelect={(i) => { setSelected(i); audio.play('ui_select') }} o={o} resetKey={resetKey} dark={theme === 'dark'} />
              </Suspense>
            )}
            {view && gl && ready && <div className="pointer-events-none absolute bottom-3 left-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Drag · orbit &nbsp; Scroll · zoom &nbsp; Right-drag · pan</div>}
            {view && <div className="pointer-events-none absolute left-4 top-3 flex gap-2"><Badge kind="live">{view.instance_count} {view.instances[0]?.kind === 'region' ? 'regions' : 'instances'}</Badge></div>}
          </div>

          {/* saved analyses: pick any previous result, no inference is re-run */}
          <div className="border-t border-line bg-surface px-4 py-3 sm:px-6">
            <div className="mb-2 flex items-center justify-between"><span className="label">Saved analyses</span><span className="font-mono text-[11px] text-ink-3">{history.total}</span></div>
            {history.items.length === 0 ? <p className="text-[13px] text-ink-3">No analysis yet.</p> : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {history.items.map((h) => (
                  <button key={h.id} type="button" data-sfx="select" onClick={() => choose(h.id)} aria-pressed={view?.id === h.id}
                    className={`w-[132px] shrink-0 border p-1 text-left transition-colors ${view?.id === h.id ? 'border-ink bg-surface-2' : 'border-line hover:border-line-strong'}`}>
                    <img src={h.thumb_url} alt="" className="h-[62px] w-full object-cover" loading="lazy" />
                    <span className="mt-1 block truncate font-mono text-[10.5px] text-ink">{h.model.label}</span>
                    <span className="block font-mono text-[10px] text-ink-3">{h.instance_count} · {fmtPct(h.coverage_percent, 1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="border-l border-line bg-surface lg:max-h-[calc(100vh-56px-49px)] lg:overflow-y-auto">
          <section className="border-b border-line p-4">
            <h2 className="label mb-2.5">Source</h2>
            {ready ? (
              <div className="grid grid-cols-2 gap-2">
                <figure><div className="h-[88px] overflow-hidden border border-line bg-surface-2"><AnalysisViewer view={view} assets={assets} opts={BASE} interactive={false} /></div><figcaption className="mt-1 text-[11px] text-ink-3">Original</figcaption></figure>
                <figure><div className="h-[88px] overflow-hidden border border-line bg-surface-2"><AnalysisViewer view={view} assets={assets} opts={MASK} interactive={false} /></div><figcaption className="mt-1 text-[11px] text-ink-3">Predicted mask</figcaption></figure>
              </div>
            ) : <p className="text-[13px] text-ink-3">—</p>}
          </section>

          <section className="border-b border-line p-4">
            <h2 className="label mb-2">View</h2>
            <label className="block py-1.5"><span className="flex justify-between text-[13px] text-ink"><span>Relief exaggeration</span><span className="font-mono text-ink-3">{o.heightScale.toFixed(1)}×</span></span>
              <input type="range" min="0.3" max="2.5" step="0.1" value={o.heightScale} onChange={(e) => set('heightScale')(+e.target.value)} className="mt-1.5 w-full" aria-label="Relief exaggeration" disabled={o.flat} /></label>
            <Toggle label="Source photo" checked={o.photo} onChange={set('photo')} />
            <Toggle label="Instance outlines" checked={o.contours} onChange={set('contours')} />
            <Toggle label="Labels" checked={o.labels} onChange={set('labels')} />
            <Toggle label="Wireframe" checked={o.wireframe} onChange={set('wireframe')} />
            <Toggle label="Flatten to 2D" checked={o.flat} onChange={set('flat')} />
            <Toggle label="Auto-rotate" checked={o.autoRotate} onChange={set('autoRotate')} />
            <button type="button" className="btn-ghost mt-3 w-full" onClick={() => { setResetKey((k) => k + 1); setSelected(null) }}>Reset camera</button>
          </section>

          {view && (
            <section className="border-b border-line p-4">
              <h2 className="label mb-2.5">{view.instances[0]?.kind === 'region' ? 'Regions' : 'Instances'}</h2>
              {view.instances.length === 0 ? <p className="text-[13px] text-ink-3">No petroleum-like region was predicted.</p> : (
                <ul className="space-y-1">
                  {view.instances.map((i) => (
                    <li key={i.index}>
                      <button type="button" data-sfx="select" onClick={() => setSelected((s) => (s === i.index ? null : i.index))} aria-pressed={selected === i.index}
                        className={`w-full border-l-[3px] px-2.5 py-1.5 text-left transition-colors ${selected === i.index ? 'bg-surface-2' : 'hover:bg-surface-2'}`} style={{ borderColor: instanceColor(i.index) }}>
                        <span className="flex justify-between font-mono text-[11.5px] uppercase tracking-[0.08em] text-ink"><span>{i.kind === 'instance' ? 'Instance' : 'Region'} {i.id}</span><span className="text-ink-3">{i.confidence != null ? fmt(i.confidence, 2) : ''}</span></span>
                        <span className="font-mono text-[11px] text-ink-3">{fmtInt(i.area_px)} px · {fmtPct(i.coverage_percent, 2)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <div><dt className="label">Coverage</dt><dd className="font-mono text-[13px] text-ink">{fmtPct(view.measurements.coverage_percent)}</dd></div>
                <div><dt className="label">Inference</dt><dd className="font-mono text-[13px] text-ink">{fmtMs(view.timing.inference_ms)}</dd></div>
              </dl>
            </section>
          )}

          <section className="p-4">
            <h2 className="label mb-2">About this visualization</h2>
            <p className="text-[12.5px] leading-relaxed text-ink-2">Height represents a visualization derived from the predicted mask. It does not represent physical oil thickness, depth, concentration or volume.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}

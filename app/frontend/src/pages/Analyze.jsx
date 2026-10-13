import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { audio } from '../audio/AudioManager'
import { uiSoundHandlers } from '../audio/uiSounds'
import { useApp } from '../context/AppContext'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'
import { COLOR_CHOICES, MODES, instanceColor } from '../lib/render'
import { useAnalysisAssets } from '../lib/useAnalysisAssets'
import AnalysisViewer from '../components/AnalysisViewer'
import ModelPicker from '../components/ModelPicker'
import { IconCube, IconScan } from '../components/icons'
import { Badge, Button, Notice, Spinner } from '../components/ui'

const DEFAULTS = { color: '#e5322d', opacity: 0.45, showBoxes: false, showLabels: true }

function Section({ title, children, right }) {
  return (
    <section className="border-b border-line px-4 py-4">
      <div className="mb-2.5 flex items-center justify-between"><h2 className="label">{title}</h2>{right}</div>
      {children}
    </section>
  )
}

function InstanceCard({ inst, selected, hidden, onSelect, onToggle, index }) {
  const c = instanceColor(inst.index)
  return (
    <div role="group" aria-label={`${inst.kind} ${inst.id}`} style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
      className={`animate-rise relative w-[236px] shrink-0 border bg-surface p-3 transition-colors ${selected ? 'border-ink' : 'border-line hover:border-line-strong'} ${hidden ? 'opacity-50' : ''}`}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: c }} />
      <div className="flex items-center justify-between gap-2">
        <button type="button" data-sfx="select" onClick={() => onSelect(inst.index)} className="flex min-w-0 items-center gap-2 text-left" aria-pressed={selected}>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink">{inst.kind === 'instance' ? 'Instance' : 'Region'} {inst.id}</span>
        </button>
        <button type="button" onClick={() => onToggle(inst.index)} aria-pressed={!hidden} title={hidden ? 'Show' : 'Hide'}
          className="grid h-6 w-6 place-items-center rounded border border-line text-ink-2 hover:border-ink hover:text-ink">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />{hidden ? <path d="M4 4l16 16" /> : <circle cx="12" cy="12" r="3" />}</svg>
        </button>
      </div>
      <div className="mt-0.5 text-[11px] text-ink-3">{inst.class_name || 'petroleum-like'}</div>
      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
        <div><dt className="label">Confidence</dt><dd className="font-mono text-[13px] text-ink">{inst.confidence != null ? fmt(inst.confidence, 3) : '—'}</dd></div>
        <div><dt className="label">Area</dt><dd className="font-mono text-[13px] text-ink">{fmtInt(inst.area_px)}<span className="ml-0.5 text-[10px] text-ink-3">px</span></dd></div>
        <div><dt className="label">Perimeter</dt><dd className="font-mono text-[13px] text-ink">{fmt(inst.perimeter_px, 0)}<span className="ml-0.5 text-[10px] text-ink-3">px</span></dd></div>
        <div><dt className="label">Coverage</dt><dd className="font-mono text-[13px] text-ink">{fmtPct(inst.coverage_percent)}</dd></div>
        <div className="col-span-2"><dt className="label">Centroid</dt><dd className="font-mono text-[13px] text-ink">{inst.centroid ? `${fmt(inst.centroid.x, 0)}, ${fmt(inst.centroid.y, 0)}` : '—'}<span className="ml-1 text-[10px] text-ink-3">px</span></dd></div>
      </dl>
    </div>
  )
}

export default function Analyze() {
  const { models, modelsLoading, modelsError, refreshModels, current, setCurrent, run, analyze, history, openAnalysis, removeAnalysis, play } = useApp()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [modelId, setModelId] = useState(null)
  const [mode, setMode] = useState('instances')
  const [color, setColor] = useState(DEFAULTS.color)
  const [opacity, setOpacity] = useState(DEFAULTS.opacity)
  const [showBoxes, setShowBoxes] = useState(DEFAULTS.showBoxes)
  const [showLabels, setShowLabels] = useState(DEFAULTS.showLabels)
  const [hidden, setHidden] = useState(() => new Set())
  const [selected, setSelected] = useState(null)
  const [hover, setHover] = useState(null)
  const [drag, setDrag] = useState(false)
  const [fileError, setFileError] = useState(null)
  const input = useRef(null)
  const canvasRef = useRef(null)
  const sfx = useMemo(uiSoundHandlers, [])

  const view = current
  const assets = useAnalysisAssets(view)
  const running = run.status === 'running'

  useEffect(() => {
    if (modelId || !models.length) return
    const usable = models.filter((m) => m.availability.available)
    setModelId((usable.find((m) => m.id === 'yolo26') || usable.find((m) => m.task === 'instance') || usable[0])?.id || null)
  }, [models, modelId])

  // opening a saved analysis restores the display settings it was last viewed with
  useEffect(() => {
    if (!view) return
    const v = view.viz
    setSelected(null); setHover(null)
    setHidden(new Set(v?.hidden_instances || []))
    if (v) { setMode(v.mode || 'instances'); setColor(v.color || DEFAULTS.color); setOpacity(v.opacity ?? DEFAULTS.opacity); setShowBoxes(!!v.show_boxes); setShowLabels(v.show_labels !== false) }
    else setMode(view.instances.some((i) => i.kind === 'instance') ? 'instances' : 'overlay')
  }, [view?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // persist display settings (visualisation only - never changes predictions)
  useEffect(() => {
    if (!view?.id) return undefined
    const t = setTimeout(() => api.saveViz(view.id, { mode, color, opacity, show_boxes: showBoxes, show_labels: showLabels, hidden_instances: [...hidden] }).catch(() => {}), 900)
    return () => clearTimeout(t)
  }, [view?.id, mode, color, opacity, showBoxes, showLabels, hidden])

  const pick = useCallback((f) => {
    setFileError(null)
    if (!f) return
    if (!f.type.startsWith('image/')) return setFileError('Please choose an image file (JPEG, PNG, WebP or BMP).')
    if (f.size > 25 * 1024 * 1024) return setFileError('This file is larger than 25 MB.')
    setFile(f)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f) })
    audio.play('ui_expand')
  }, [])

  const execute = async () => { if (file && modelId) { await audio.unlock(); await analyze(file, modelId); setFile(null) } }

  const opts = useMemo(() => ({ mode, color, opacity, showBoxes, showLabels, hidden, selected, hover }), [mode, color, opacity, showBoxes, showLabels, hidden, selected, hover])
  const resetDisplay = () => { setMode(view?.instances.some((i) => i.kind === 'instance') ? 'instances' : 'overlay'); setColor(DEFAULTS.color); setOpacity(DEFAULTS.opacity); setShowBoxes(false); setShowLabels(true); setHidden(new Set()); setSelected(null) }
  const toggleHidden = (idx) => setHidden((h) => { const n = new Set(h); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  const download = () => canvasRef.current?.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `petrovision_${view.id || 'analysis'}_${mode}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000) })

  const showPreview = !!file && !running                 // a new image is waiting to be analysed
  const noModels = !modelsLoading && models.length > 0 && !models.some((m) => m.availability.available)
  const m = view?.measurements
  const instCount = view?.instance_count ?? 0

  return (
    <div className="-mx-4 -my-8 sm:-mx-6" {...sfx}>
      <div className="grid min-h-[calc(100vh-56px)] lg:grid-cols-[1fr_340px]">
        {/* ============================ viewer + instance strip ============================ */}
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
            <div className="mr-2"><div className="label text-accent">Analyze</div><div className="text-[13px] font-semibold text-ink">Image workspace</div></div>
            <div className="seg flex-wrap" role="group" aria-label="Display mode">
              {MODES.map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} disabled={!view || showPreview}>{l}</button>)}
            </div>
            {view && !showPreview && (
              <div className="ml-auto flex items-center gap-2">
                {view.model && <Badge kind="live">{view.model.label}</Badge>}
                <button type="button" className="btn-ghost !h-8" onClick={download}>Export PNG</button>
              </div>
            )}
          </div>

          <div className="relative min-h-[420px] flex-1 bg-[#e9edf3]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #cdd5e0 1px, transparent 0)', backgroundSize: '18px 18px' }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}>
            {showPreview ? (
              <div className="flex h-full items-center justify-center p-6"><img src={preview} alt="Selected for analysis" className="max-h-full max-w-full border border-line-strong bg-surface object-contain shadow-sm" /></div>
            ) : view ? (
              <div className="absolute inset-0 p-4"><AnalysisViewer view={view} assets={assets} opts={opts} canvasRef={canvasRef} onPick={(l) => { setSelected(l || null); if (l) audio.play('ui_select') }} onHover={setHover} /></div>
            ) : (
              <button type="button" onClick={() => input.current?.click()} data-sfx="expand" className="absolute inset-6 grid place-items-center border border-dashed border-line-strong text-center transition-colors hover:border-accent hover:bg-accent-soft/40">
                <span className="absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-ink" /><span className="absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-ink" />
                <span className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-ink" /><span className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-ink" />
                <span><span className="block text-[15px] font-semibold text-ink">Drop an image to analyze</span><span className="mt-1 block text-[13px] text-ink-2">or click to browse · JPEG, PNG, WebP, BMP</span></span>
              </button>
            )}
            {drag && <div className="pointer-events-none absolute inset-3 border-2 border-accent bg-accent/10" />}
            {running && (
              <div className="absolute inset-0 grid place-items-center bg-surface/60 backdrop-blur-[1px]">
                <div className="relative overflow-hidden border border-line-strong bg-surface px-6 py-4 text-center"><div className="absolute inset-x-0 top-0 h-[2px] animate-pulse bg-accent" /><div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink"><Spinner size={14} /> Analyzing</div></div>
              </div>
            )}
          </div>

          {/* ---------------- instances + metrics ---------------- */}
          <div className="border-t border-line bg-surface-2/60 px-4 py-3">
            {run.status === 'error' && run.error && <Notice tone="error" className="mb-3" title="Analysis could not be completed">{run.error.message}</Notice>}
            {view && !showPreview ? (
              <div className="flex gap-3 overflow-x-auto pb-1">
                <div className="w-[236px] shrink-0 border border-line bg-surface p-3">
                  <div className="label mb-2">{view.instances[0]?.kind === 'region' ? 'Regions' : 'Detection'} · summary</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div><dt className="label">{view.instances[0]?.kind === 'region' ? 'Regions' : 'Instances'}</dt><dd className="font-mono text-[18px] text-ink">{String(instCount).padStart(2, '0')}</dd></div>
                    <div><dt className="label">Coverage</dt><dd className="font-mono text-[18px] text-signal">{fmtPct(m.coverage_percent)}</dd></div>
                    <div><dt className="label">Pixel area</dt><dd className="font-mono text-[13px] text-ink">{fmtInt(m.petroleum_pixels)} px</dd></div>
                    <div><dt className="label">Inference</dt><dd className="font-mono text-[13px] text-ink">{fmtMs(view.timing.inference_ms)}</dd></div>
                    <div className="col-span-2"><dt className="label">Image · mask</dt><dd className="font-mono text-[12px] text-ink-2">{view.image.width}×{view.image.height} · {view.mask.width}×{view.mask.height} px</dd></div>
                  </dl>
                  <p className="mt-2 text-[10.5px] leading-snug text-ink-3">Image-space values for visible petroleum-like regions.</p>
                </div>
                {view.instances.length ? view.instances.map((inst, i) => (
                  <InstanceCard key={inst.index} index={i} inst={inst} selected={selected === inst.index} hidden={hidden.has(inst.index)}
                    onSelect={(x) => setSelected((s) => (s === x ? null : x))} onToggle={toggleHidden} />
                )) : <div className="grid min-w-[260px] place-items-center border border-dashed border-line-strong px-6 text-center text-[13px] text-ink-2">No petroleum-like region was predicted in this image.</div>}
              </div>
            ) : <p className="py-3 text-center text-[13px] text-ink-3">{showPreview ? 'Choose a model and run the analysis.' : 'Instances and measurements appear here after an analysis.'}</p>}
          </div>
        </div>

        {/* ============================ control panel ============================ */}
        <aside className="border-l border-line bg-surface lg:max-h-[calc(100vh-56px)] lg:overflow-y-auto">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" data-testid="file-input" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          <Section title="Image" right={file && <span className="max-w-[150px] truncate text-[11px] text-ink-3">{file.name}</span>}>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => input.current?.click()} disabled={running} data-sfx="expand">{file || view ? 'Replace image' : 'Upload image'}</Button>
            </div>
            {fileError && <Notice tone="error" className="mt-2">{fileError}</Notice>}
          </Section>

          <Section title="Model">
            {modelsLoading ? <div className="flex items-center gap-2 text-sm text-ink-3"><Spinner size={14} /> Loading</div>
              : modelsError ? <Notice tone="error" title="Models unavailable" action={<Button variant="ghost" className="!h-8" onClick={refreshModels}>Retry</Button>}>{modelsError}</Notice>
              : <ModelPicker models={models} value={modelId} onChange={setModelId} disabled={running} />}
            {noModels && <Notice tone="warn" className="mt-3" title="No model is available" />}
            <Button className="mt-3 w-full" onClick={execute} disabled={!file || !modelId || running || noModels}>
              {running ? <><Spinner size={14} /> Analyzing</> : <><IconScan width={15} height={15} /> Run analysis</>}
            </Button>
          </Section>

          <Section title="Display" right={<button type="button" onClick={resetDisplay} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent hover:underline" disabled={!view}>Reset</button>}>
            <div className="space-y-4">
              <div>
                <div className="label mb-1.5">Mask colour</div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Mask colour">
                  {COLOR_CHOICES.map(([name, hex]) => (
                    <button key={hex} type="button" title={name} aria-label={name} aria-pressed={color === hex} onClick={() => setColor(hex)} disabled={mode === 'instances' || mode === 'boxes'}
                      className={`h-6 w-6 rounded-full border-2 transition-transform disabled:opacity-35 ${color === hex ? 'scale-110 border-ink' : 'border-surface ring-1 ring-line-strong'}`} style={{ background: hex }} />
                  ))}
                  <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-line-strong" title="Custom colour" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
                    <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Custom colour" />
                  </label>
                </div>
                {(mode === 'instances' || mode === 'boxes') && <p className="mt-1.5 text-[11px] text-ink-3">Instances use their own colours.</p>}
              </div>
              <label className="block"><span className="label flex justify-between"><span>Opacity</span><span className="font-mono">{Math.round(opacity * 100)}%</span></span>
                <input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="mt-1.5 w-full" aria-label="Mask opacity" /></label>
              <div className="space-y-2 text-[13px] text-ink">
                <label className="flex items-center gap-2"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Bounding boxes</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Instance labels</label>
              </div>
              <p className="text-[11px] leading-snug text-ink-3">Display settings change only how the prediction is drawn, never the prediction or its measurements.</p>
            </div>
          </Section>

          {view && !showPreview && (
            <Section title="Next">
              <Link to="/3d" className="btn-oil w-full" onClick={() => play('click')}><IconCube width={15} height={15} /> View in 3D</Link>
            </Section>
          )}

          <Section title="Recent analyses" right={<span className="font-mono text-[10.5px] text-ink-3">{history.total}</span>}>
            {history.items.length === 0 ? <p className="text-[13px] text-ink-3">No analysis yet.</p> : (
              <ul className="space-y-1.5">
                {history.items.slice(0, 6).map((h) => (
                  <li key={h.id} className="group flex items-center gap-2">
                    <button type="button" onClick={() => { setFile(null); openAnalysis(h.id) }} className={`flex min-w-0 flex-1 items-center gap-2.5 border p-1.5 text-left transition-colors ${view?.id === h.id ? 'border-ink bg-surface-2' : 'border-line hover:border-line-strong'}`}>
                      <img src={h.thumb_url} alt="" className="h-10 w-14 shrink-0 object-cover" loading="lazy" />
                      <span className="min-w-0"><span className="block truncate font-mono text-[11px] text-ink">{h.model.label}</span><span className="block truncate text-[11px] text-ink-3">{h.instance_count} · {fmtPct(h.coverage_percent, 1)} · {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                    </button>
                    <button type="button" aria-label="Delete analysis" title="Delete" onClick={() => removeAnalysis(h.id)} className="grid h-7 w-7 place-items-center text-ink-3 opacity-0 transition-opacity hover:text-bad focus:opacity-100 group-hover:opacity-100">×</button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  )
}

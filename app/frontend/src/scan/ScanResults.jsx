import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fmt, fmtInt } from '../lib/format'
import { useTween } from '../lib/useTween'
import { colorOf, regionLabel } from './palette'
import { Badge, Spinner } from '../components/ui'

function Counter({ label, value, digits = 0, unit, pad = 0, accent }) {
  const v = useTween(value ?? null, 480)
  const text = value == null ? '—' : digits ? fmt(v, digits) : pad ? String(Math.round(v)).padStart(pad, '0') : fmtInt(v)
  return (
    <div className="border-l border-line-strong pl-3">
      <div className="label">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-medium leading-none tabular-nums ${accent || 'text-ink'}`}>{text}{value != null && unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>}</div>
    </div>
  )
}

function Silhouette({ contour, color }) {
  if (!contour?.length) return <div className="h-14 w-14 shrink-0 border border-dashed border-line" />
  const xs = contour.map((p) => p[0]); const ys = contour.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const sc = 52 / Math.max(x1 - x0, y1 - y0, 1e-6)
  const pts = contour.map(([x, y]) => `${((x - x0) * sc + 3).toFixed(1)},${((y - y0) * sc + 3).toFixed(1)}`).join(' ')
  return (
    <svg width="58" height="58" viewBox="0 0 58 58" className="shrink-0 border border-line bg-surface-2" aria-hidden>
      <polygon points={pts} fill={color} fillOpacity=".25" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function InstanceCard({ inst, selected, onSelect, index }) {
  const c = colorOf(inst.index)
  const [open, setOpen] = useState(false)
  const conf = inst.confidence
  return (
    <article style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }} onMouseEnter={() => onSelect(inst.index)}
      className={`animate-rise relative border bg-surface p-3.5 transition-colors ${selected ? 'border-ink' : 'border-line'}`}>
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: '#0d1520' }} /><span className="absolute left-0 top-0 h-[3px] w-12" style={{ background: c }} />
      <div className="flex items-start gap-3">
        <Silhouette contour={inst.contour} color="#0d1520" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-mono text-[12px] font-medium uppercase tracking-[0.1em] text-ink">{inst.kind === 'instance' ? 'Instance' : 'Region'} {inst.id}</h3>
            <span className="text-[10px] uppercase tracking-[0.1em] text-ink-3">{regionLabel(inst)}</span>
          </div>
          {conf != null && (
            <div className="mt-1.5"><div className="flex justify-between font-mono text-[11px] text-ink-2"><span>CONFIDENCE</span><span className="text-ink">{fmt(conf, 3)}</span></div>
              <div className="mt-1 h-1 bg-surface-2"><div className="h-full bg-ink transition-[width] duration-500" style={{ width: `${conf * 100}%` }} /></div></div>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div><dt className="label">Area</dt><dd className="font-mono text-[13px] text-ink">{fmtInt(inst.area_px)} <span className="text-[10px] text-ink-3">px</span></dd></div>
            <div><dt className="label">Coverage</dt><dd className="font-mono text-[13px] text-ink">{fmt(inst.coverage_percent, 2)} <span className="text-[10px] text-ink-3">%</span></dd></div>
          </dl>
        </div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent hover:underline">{open ? 'Less' : 'More'} detail</button>
      {open && (
        <dl className="animate-rise mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2">
          <div><dt className="label">Perimeter</dt><dd className="font-mono text-[13px] text-ink">{fmt(inst.perimeter_px, 0)} <span className="text-[10px] text-ink-3">px</span></dd></div>
          <div><dt className="label">Centroid</dt><dd className="font-mono text-[13px] text-ink">{inst.centroid ? `${fmt(inst.centroid.x, 0)}, ${fmt(inst.centroid.y, 0)}` : '—'}</dd></div>
          <div className="col-span-2"><dt className="label">Bounding box</dt><dd className="font-mono text-[13px] text-ink">{inst.bounding_box ? `${inst.bounding_box.width}×${inst.bounding_box.height} px at ${inst.bounding_box.x}, ${inst.bounding_box.y}` : '—'}</dd></div>
        </dl>
      )}
    </article>
  )
}

function LatencyChart({ values }) {
  const stat = useMemo(() => {
    if (!values?.length) return null
    const min = Math.min(...values), max = Math.max(...values), mean = values.reduce((a, b) => a + b, 0) / values.length
    return { min, max, mean }
  }, [values])
  const W = 520, H = 84
  if (!stat || values.length < 2) return <div className="grid h-[84px] place-items-center border border-dashed border-line text-[12px] text-ink-3">Latency appears once frames are being analyzed.</div>
  const span = Math.max(1e-6, stat.max - stat.min)
  const y = (v) => H - 8 - ((v - stat.min) / span) * (H - 22)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, y(v)])
  const line = pts.map((p) => p.join(',')).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[84px] w-full" preserveAspectRatio="none" role="img" aria-label="Inference time per frame">
        <polygon points={`0,${H} ${line} ${W},${H}`} fill="var(--accent)" fillOpacity=".08" />
        <line x1="0" x2={W} y1={y(stat.mean)} y2={y(stat.mean)} stroke="var(--line-strong)" strokeDasharray="4 4" />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-ink-3"><span>min {fmt(stat.min, 0)} ms</span><span>mean {fmt(stat.mean, 0)} ms</span><span>max {fmt(stat.max, 0)} ms</span></div>
    </div>
  )
}

export default function ScanResults({ result, status, stats, scanning, selected, onSelect, onSave, save, canSave, model }) {
  const instances = result?.instances || []
  const regionKind = instances[0]?.kind === 'region'
  return (
    <section className="border-t border-line bg-app" aria-label="Scan results">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><h2 className="text-[17px] font-semibold text-ink">Scan results</h2><Badge kind="live">Live output</Badge></div>
          <div className="flex items-center gap-3">
            {save.status === 'saved' && <span className="animate-rise font-mono text-[11px] text-ok">Saved to history · <Link to="/analyze" className="underline">Analyze</Link> · <Link to="/3d" className="underline">3D view</Link></span>}
            {save.status === 'error' && <span className="font-mono text-[11px] text-bad">Could not save this frame.</span>}
            <button type="button" className="btn-primary" onClick={onSave} disabled={!canSave || save.status === 'saving'}>{save.status === 'saving' ? <><Spinner size={14} /> Saving</> : 'Save snapshot'}</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-5 md:grid-cols-3 xl:grid-cols-6">
          <Counter label={regionKind ? 'Regions' : 'Instances'} value={result ? result.instance_count : null} pad={2} />
          <Counter label="Coverage · image-space" value={result?.measurements.coverage_percent} digits={2} unit="%" accent="text-signal" />
          <Counter label="Pixel area" value={result?.measurements.petroleum_pixels} unit="px" />
          <Counter label="Inference" value={result?.timing.inference_ms} digits={0} unit="ms" />
          <Counter label="Throughput" value={stats.fps} digits={1} unit="FPS" />
          <Counter label="Frames analyzed" value={stats.frames || null} />
        </div>
        {result && instances.length === 0 && model?.id === 'yolo26' && (
          <p className="mt-3 text-xs text-ink-3">YOLO26 found no oil instances in this frame. It was trained on De Kerf drone imagery, so results may vary on scenes outside that domain.</p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div>
            <div className="label mb-3">{regionKind ? 'Regions' : 'Instances'} in the current frame</div>
            {instances.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{instances.slice(0, 12).map((inst, i) => <InstanceCard key={`${inst.index}`} index={i} inst={inst} selected={selected === inst.index} onSelect={onSelect} />)}</div>
            ) : (
              <div className="grid min-h-[140px] place-items-center border border-dashed border-line-strong bg-surface px-6 text-center text-[13px] text-ink-2">
                {result ? 'No petroleum-like region in the current frame.' : scanning ? 'Analyzing the first frame…' : 'Start the camera and a scan to see detections here.'}
              </div>
            )}
          </div>
          <div>
            <div className="label mb-3">Inference time per frame</div>
            <div className="border border-line bg-surface p-3.5"><LatencyChart values={stats.latencies} /></div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">Live frames have no ground truth, so no IoU, Dice, precision or recall is shown. Areas and perimeters are in pixels of the analysis frame{result ? ` (${result.mask.width}×${result.mask.height})` : ''}.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

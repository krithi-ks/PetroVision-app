import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { audio } from '../audio/AudioManager'
import { uiSoundHandlers } from '../audio/uiSounds'
import { colorFor, MODEL_ORDER } from '../lib/models'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'
import { useTween } from '../lib/useTween'
import { useApp } from '../context/AppContext'
import { Badge, Button, EmptyState, Notice, ResearchBadge, Skeleton } from '../components/ui'

const QUALITY = [['iou', 'IoU'], ['dice', 'Dice'], ['precision', 'Precision'], ['recall', 'Recall'], ['accuracy', 'Accuracy']]
const tooltipStyle = { background: '#ffffff', border: '1px solid #b9c2ce', borderRadius: 4, color: '#0d1520', fontSize: 12 }
const axis = { stroke: '#6c7a8c', fontSize: 12 }
const grid = '#e1e6ed'

function useLoad(fn) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const load = () => {
    setState({ loading: true, data: null, error: null })
    fn().then((data) => setState({ loading: false, data, error: null })).catch((error) => setState({ loading: false, data: null, error }))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])
  return [state, load]
}

function SectionHead({ kicker, title, children, badge }) {
  return (
    <div className="mb-5 flex flex-col gap-2 border-b border-line-strong pb-4 md:flex-row md:items-end md:justify-between">
      <div><div className="label mb-1.5 text-accent">{kicker}</div><h2 className="text-[20px] font-semibold tracking-tight text-ink">{title}</h2>{children && <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">{children}</p>}</div>
      {badge}
    </div>
  )
}

function Metric({ label, value, delay = 0 }) {
  const v = useTween(value ?? null, 700)
  return (
    <div style={{ animationDelay: `${delay}ms` }} className="animate-rise border-l border-line-strong pl-3">
      <div className="label">{label}</div>
      <div className="mt-1 font-mono text-[22px] font-medium leading-none tabular-nums text-ink">{value == null ? '—' : fmt(v, 4)}</div>
      <div className="mt-2 h-[3px] bg-surface-2"><div className="h-full bg-accent transition-[width] duration-700" style={{ width: `${(value || 0) * 100}%` }} /></div>
    </div>
  )
}

function Observation({ title, obs, render }) {
  if (!obs) return null
  return <div className="border-l border-line-strong pl-3"><div className="label">{title}</div><div className="mt-1 flex items-baseline gap-2"><span className="font-semibold text-ink">{obs.model_name}</span><span className="font-mono text-sm text-accent">{render(obs.value)}</span></div></div>
}

function HistoryChart({ modelId }) {
  const [state] = useLoad(() => api.history_(modelId))
  if (state.loading) return <Skeleton className="h-72" />
  if (state.error) return <Notice tone="warn" title="Training history unavailable" />
  const h = state.data
  const rows = h.epochs.map((e, i) => ({ epoch: e, train: h.train_loss[i], validation: h.validation_loss[i] }))
  const best = h.best_epoch ? rows.find((r) => r.epoch === h.best_epoch) : null
  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={grid} /><XAxis dataKey="epoch" {...axis} /><YAxis {...axis} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v, 4)} labelFormatter={(l) => `Epoch ${l}`} /><Legend />
          <Line type="monotone" dataKey="train" name="Training loss" stroke="#1747c8" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="validation" name="Validation loss" stroke="#d9480f" strokeWidth={2} dot={false} />
          {best && <ReferenceDot x={best.epoch} y={best.validation} r={6} fill="#f2b705" stroke="none" />}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-3">{h.loss_name}. {best ? `Highlighted: epoch ${best.epoch}, the checkpoint kept as best. ` : ''}Loss scales differ between model families.</p>
    </>
  )
}

/* ------------------------------------------------------------------ LADOS */
function Lados() {
  const [cmp, reloadCmp] = useLoad(api.comparison)
  const [bench] = useLoad(api.benchmark)
  const [summary] = useLoad(api.summary)
  const { play } = useApp()
  const [histModel, setHistModel] = useState('segformer')
  const [withYolo, setWithYolo] = useState(true)
  const rows = useMemo(() => (cmp.data ? [...cmp.data.rows].sort((a, b) => MODEL_ORDER.indexOf(a.model_id) - MODEL_ORDER.indexOf(b.model_id)) : []), [cmp.data])
  const shown = withYolo ? rows : rows.filter((r) => r.model_id !== 'yolo')
  const qualityData = useMemo(() => QUALITY.map(([k, label]) => ({ metric: label, ...Object.fromEntries(shown.map((r) => [r.model_name, r[k]])) })), [shown])
  const obs = cmp.data?.observations

  return (
    <section aria-labelledby="lados-h">
      <SectionHead kicker="Experiment 1 · LADOS" title="Semantic / pixel-level comparison" badge={<ResearchBadge />}>
        Pixel-level metrics on the held-out LADOS test split{summary.data?.methodology?.test_images ? ` (${summary.data.methodology.test_images} images, ${summary.data.methodology.image_size})` : ''}. YOLO11n-Seg is an instance model; its pixel metrics are derived by merging predicted instances into one mask.
      </SectionHead>
      {cmp.error && <Notice tone="error" title="Could not load experiment results" action={<Button variant="ghost" className="!h-8" onClick={reloadCmp}>Retry</Button>}>{cmp.error.message}</Notice>}
      {cmp.loading && <div className="space-y-4"><Skeleton className="h-60" /><Skeleton className="h-72" /></div>}
      {cmp.data && (
        <div className="space-y-8">
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[760px] text-sm" id="lados-h">
              <thead><tr className="border-b border-line bg-surface-2/60 text-left"><th className="label px-4 py-2.5">Model</th>{QUALITY.map(([k, l]) => <th key={k} className="label px-3 py-2.5 text-right">{l}</th>)}<th className="label px-3 py-2.5 text-right">Params (M)</th><th className="label px-3 py-2.5 text-right">Latency (ms)</th><th className="label px-4 py-2.5 text-right">Images/s</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.model_name} className="border-b border-line last:border-0 transition-colors hover:bg-surface-2/60">
                    <td className="px-4 py-2.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(r.model_id) }} /><span className="font-medium text-ink">{r.model_name}</span></td>
                    {QUALITY.map(([k]) => <td key={k} className={`px-3 py-2.5 text-right font-mono ${obs?.[k]?.model_name === r.model_name ? 'font-bold text-accent' : 'text-ink-2'}`}>{fmt(r[k], 4)}</td>)}
                    <td className="px-3 py-2.5 text-right font-mono text-ink-2">{fmt(r.parameters_m, 2)}</td><td className="px-3 py-2.5 text-right font-mono text-ink-2">{fmt(r.mean_ms_per_image, 1)}</td><td className="px-4 py-2.5 text-right font-mono text-ink-2">{fmt(r.images_per_second, 1)}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <p className="-mt-5 text-xs text-ink-3">Bold: highest measured value in that column in this evaluation, not a general ranking.</p>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Observation title="Highest IoU" obs={obs.iou} render={(v) => fmt(v, 4)} /><Observation title="Highest precision" obs={obs.precision} render={(v) => fmt(v, 4)} />
            <Observation title="Highest recall" obs={obs.recall} render={(v) => fmt(v, 4)} /><Observation title="Lowest measured latency" obs={obs.lowest_latency} render={(v) => `${fmt(v, 1)} ms`} />
          </div>

          <div className="border border-line bg-surface p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-ink">Quality metrics by model</h3><p className="text-[13px] text-ink-2">Higher is better for all five.</p></div>
              <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={withYolo} onChange={(e) => setWithYolo(e.target.checked)} /> Include YOLO11n-Seg (derived)</label></div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={qualityData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="metric" {...axis} /><YAxis domain={[0, 1]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v, 4)} cursor={{ fill: 'rgba(13,21,32,.05)' }} /><Legend />
                {shown.map((r) => <RBar key={r.model_name} dataKey={r.model_name} fill={colorFor(r.model_id)} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {[['parameters_m', 'Parameters (millions)', (v) => fmt(v, 2)], ['mean_ms_per_image', 'Inference time (ms / image)', (v) => fmt(v, 1)], ['images_per_second', 'Throughput (images / s)', (v) => fmt(v, 1)]].map(([key, title, f]) => (
              <div key={key} className="border border-line bg-surface p-5"><h3 className="mb-3 font-semibold text-ink">{title}</h3>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                    <CartesianGrid stroke={grid} horizontal={false} /><XAxis type="number" {...axis} /><YAxis type="category" dataKey="model_name" width={92} {...axis} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => f(v)} cursor={{ fill: 'rgba(13,21,32,.05)' }} />
                    <RBar dataKey={key} radius={[0, 3, 3, 0]} label={{ position: 'right', fill: '#6c7a8c', fontSize: 11, formatter: f }}>{rows.map((r) => <Cell key={r.model_name} fill={colorFor(r.model_id)} />)}</RBar>
                  </BarChart>
                </ResponsiveContainer></div>))}
          </div>
          {bench.data && <Notice tone="info" title="About the timings">Measured on {bench.data.hardware} with {bench.data.input_size} input, batch size {bench.data.batch_size} ({bench.data.timed_images} timed images). They depend on hardware and implementation and differ from the live inference time on your machine.</Notice>}

          <div className="border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-ink">Training behaviour</h3>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Model training history">{rows.map((r) => (
                <button key={r.model_id} role="tab" aria-selected={histModel === r.model_id} onClick={() => { setHistModel(r.model_id); play('select') }}
                  className={`rounded border px-3 py-1.5 text-sm transition-colors ${histModel === r.model_id ? 'border-ink bg-ink text-white' : 'border-line text-ink-2 hover:border-line-strong'}`}>{r.model_name}</button>))}</div></div>
            <HistoryChart key={histModel} modelId={histModel} />
          </div>
          {summary.data?.limitations?.length > 0 && (
            <div className="border border-line bg-surface p-5"><h3 className="mb-3 font-semibold text-ink">Limitations recorded with these results</h3>
              <ul className="space-y-2 text-sm leading-relaxed text-ink-2">{summary.data.limitations.map((l) => <li key={l} className="flex gap-2"><span className="text-warn">▪</span>{l}</li>)}</ul></div>)}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ De Kerf */
function DeKerf() {
  const [st, reload] = useLoad(api.dekerf)
  const d = st.data
  return (
    <section aria-labelledby="dekerf-h">
      <SectionHead kicker="Experiment 2 · De Kerf" title="YOLO26n-Seg · instance segmentation" badge={d?.available ? <ResearchBadge /> : undefined}>
        A separate experiment on the De Kerf UAV oil-spill dataset.
      </SectionHead>
      {st.loading && <Skeleton className="h-64" />}
      {st.error && <Notice tone="error" title="Could not load experiment results" action={<Button variant="ghost" className="!h-8" onClick={reload}>Retry</Button>} />}
      {d && !d.available && <EmptyState title="Results not available">The saved results of this experiment could not be found.</EmptyState>}
      {d?.available && (
        <div className="space-y-6" id="dekerf-h">
          <Notice tone="info" title="Derived instances">{d.annotation} Metrics below use the test split and are <strong>not comparable</strong> with the LADOS experiment: different dataset, task, annotation formulation and metrics.</Notice>
          <div className="grid gap-6 border-y border-line py-6 md:grid-cols-2">
            <div><div className="label mb-3">Box</div><div className="grid grid-cols-2 gap-x-6 gap-y-5">{[['Precision', 'box_precision'], ['Recall', 'box_recall'], ['mAP50', 'box_mAP50'], ['mAP50-95', 'box_mAP50_95']].map(([l, k], i) => <Metric key={k} label={l} value={d.metrics[k]} delay={i * 70} />)}</div></div>
            <div><div className="label mb-3">Mask</div><div className="grid grid-cols-2 gap-x-6 gap-y-5">{[['Precision', 'mask_precision'], ['Recall', 'mask_recall'], ['mAP50', 'mask_mAP50'], ['mAP50-95', 'mask_mAP50_95']].map(([l, k], i) => <Metric key={k} label={l} value={d.metrics[k]} delay={i * 70 + 280} />)}</div></div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <div className="border border-line bg-surface p-5"><h3 className="mb-3 font-semibold text-ink">Box vs mask metrics</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[['Precision', 'precision'], ['Recall', 'recall'], ['mAP50', 'mAP50'], ['mAP50-95', 'mAP50_95']].map(([l, k]) => ({ metric: l, Box: d.metrics[`box_${k}`], Mask: d.metrics[`mask_${k}`] }))} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="metric" {...axis} /><YAxis domain={[0, 1]} {...axis} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v, 4)} cursor={{ fill: 'rgba(13,21,32,.05)' }} /><Legend />
                  <RBar dataKey="Box" fill="#1747c8" radius={[3, 3, 0, 0]} /><RBar dataKey="Mask" fill="#0d9488" radius={[3, 3, 0, 0]} />
                </BarChart></ResponsiveContainer></div>
            <div className="border border-line bg-surface p-5"><h3 className="mb-3 font-semibold text-ink">Experiment</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[['Dataset', 'De Kerf UAV RGB'], ['Test images', d.test?.test_images != null ? fmtInt(d.test.test_images) : '—'], ['Test instances', d.test?.test_instances != null ? fmtInt(d.test.test_instances) : '—'], ['Background images', d.test?.test_background_images != null ? fmtInt(d.test.test_background_images) : '—'],
                  ['Parameters', d.parameters_fused ? `${fmt(d.parameters_fused / 1e6, 2)} M` : '—'], ['Image size', d.training?.image_size ? `${d.training.image_size} px` : '—'], ['Epochs', d.training?.epochs ?? '—'], ['Batch size', d.training?.batch_size ?? '—'],
                  ['Preprocess', d.speed?.preprocess_ms != null ? fmtMs(d.speed.preprocess_ms) : '—'], ['Inference', d.speed?.inference_ms != null ? fmtMs(d.speed.inference_ms) : '—'], ['Postprocess', d.speed?.postprocess_ms != null ? fmtMs(d.speed.postprocess_ms) : '—'], ['Measured on', d.speed?.hardware || '—']]
                  .map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="font-mono text-[13px] text-ink">{v}</dd></div>)}
              </dl></div>
          </div>

          {d.history && (
            <div className="border border-line bg-surface p-5"><h3 className="mb-3 font-semibold text-ink">Training behaviour</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={d.history.epochs.map((e, i) => ({ epoch: e, 'Train seg loss': d.history.train_seg_loss[i], 'Val seg loss': d.history.val_seg_loss[i], 'Val mask mAP50-95': d.history.mask_mAP50_95[i] }))} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke={grid} /><XAxis dataKey="epoch" {...axis} /><YAxis yAxisId="l" {...axis} /><YAxis yAxisId="r" orientation="right" domain={[0, 1]} {...axis} /><Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v, 4)} labelFormatter={(l) => `Epoch ${l}`} /><Legend />
                  <Line yAxisId="l" dataKey="Train seg loss" stroke="#1747c8" strokeWidth={2} dot={false} /><Line yAxisId="l" dataKey="Val seg loss" stroke="#d9480f" strokeWidth={2} dot={false} /><Line yAxisId="r" dataKey="Val mask mAP50-95" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart></ResponsiveContainer>
              <p className="mt-2 text-xs text-ink-3">Validation curves from training (loss on the left axis, mAP on the right). Test metrics above are measured once on the held-out test split.</p></div>)}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ analysis history */
function HistoryTab() {
  const { history, openAnalysis, removeAnalysis } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const open = async (id, to) => { await openAnalysis(id); nav(to) }
  const clear = async () => { if (!window.confirm('Delete all saved analyses?')) return; setBusy(true); await api.clearHistory().catch(() => {}); await removeAnalysis('none'); setBusy(false) }
  return (
    <section>
      <SectionHead kicker="Saved analyses" title="Analysis history" badge={<Badge kind="live">Live output</Badge>}>
        Every analysis you run is saved with its measurements. These are predictions without ground truth, so no IoU, Dice, precision or recall is shown.
      </SectionHead>
      {history.items.length === 0 ? <EmptyState title="No analysis yet" action={<Link to="/analyze" className="btn-primary">Start analysis</Link>}>Run an analysis or save a live-scan snapshot to build your history.</EmptyState> : (
        <>
          <div className="mb-3 flex justify-end"><button type="button" onClick={clear} disabled={busy} className="font-mono text-[11px] uppercase tracking-[0.1em] text-bad hover:underline">Clear history</button></div>
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line bg-surface-2/60 text-left"><th className="label px-3 py-2.5">Image</th><th className="label px-3 py-2.5">Time</th><th className="label px-3 py-2.5">Model</th><th className="label px-3 py-2.5 text-right">Instances</th><th className="label px-3 py-2.5 text-right">Coverage</th><th className="label px-3 py-2.5 text-right">Inference</th><th className="px-3 py-2.5" /></tr></thead>
              <tbody>{history.items.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                  <td className="px-3 py-2"><img src={h.thumb_url} alt="" className="h-10 w-16 object-cover" loading="lazy" /></td>
                  <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{new Date(h.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 text-ink">{h.model.label}</td><td className="px-3 py-2 text-right font-mono text-ink">{h.instance_count}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{fmtPct(h.coverage_percent)}</td><td className="px-3 py-2 text-right font-mono text-ink-2">{fmtMs(h.inference_ms)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right"><button type="button" className="mr-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline" onClick={() => open(h.id, '/analyze')}>Open</button><button type="button" className="mr-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline" onClick={() => open(h.id, '/3d')}>3D</button><button type="button" aria-label="Delete analysis" className="text-ink-3 hover:text-bad" onClick={() => removeAnalysis(h.id)}>×</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export default function Results() {
  const [tab, setTab] = useState('experiments')
  const sfx = useMemo(uiSoundHandlers, [])
  return (
    <div {...sfx}>
      <div className="mb-8 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
        <div><div className="label mb-2 text-accent">Results</div><h1 className="text-[26px] font-semibold tracking-tight text-ink">Research results</h1>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-2">Measured experiments on controlled datasets with ground truth, kept separate from your own analyses.</p></div>
        <div className="seg" role="tablist" aria-label="Results view">
          {[['experiments', 'Experiments'], ['history', 'Analysis history']].map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => { setTab(k); audio.play('ui_expand') }}>{l}</button>)}
        </div>
      </div>
      {tab === 'experiments' ? <div className="space-y-16"><Lados /><DeKerf /></div> : <HistoryTab />}
    </div>
  )
}

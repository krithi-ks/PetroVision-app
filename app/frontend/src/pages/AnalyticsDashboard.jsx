import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Area,
  AreaChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../lib/api'
import { fmt, fmtInt, fmtMs, fmtPct } from '../lib/format'
import { colorFor } from '../lib/models'
import { Badge, Notice, Skeleton } from '../components/ui'
import { useAnalysisAssets } from '../lib/useAnalysisAssets'
import AnalysisEvidence from '../components/AnalysisEvidence'

const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)', fontSize: 12 }
const chartColors = ['#0f766e', '#0284c7', '#6366f1', '#f59e0b', '#e11d48', '#64748b']

function StatCard({ label, value, hint, accent = 'text-slate-900' }) {
  return (
    <div className="analytics-card rounded-2xl border border-line bg-surface p-5">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`mt-3 text-[28px] font-semibold leading-none tracking-tight ${accent}`}>{value}</div>
      <div className="mt-2 text-xs text-slate-400">{hint}</div>
    </div>
  )
}

function ChartPanel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`analytics-card rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function DetailMetric({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-800">{value ?? '—'}{unit && value != null && <span className="ml-1 text-[10px] font-normal text-slate-400">{unit}</span>}</div>
    </div>
  )
}

export default function AnalyticsDashboard() {
  const location = useLocation()
  const [history, setHistory] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysisError, setAnalysisError] = useState('')

  useEffect(() => {
    let active = true
    api.history(300).then((result) => {
      if (!active) return
      setHistory(result.items)
      setSelectedId((current) => location.state?.analysisId || current || result.items[0]?.id || '')
    }).catch((err) => {
      if (active) setError(err.message || 'Could not load saved analyses.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setAnalysis(null)
      return undefined
    }
    let active = true
    setAnalysisLoading(true)
    setAnalysisError('')
    api.analysis(selectedId).then((result) => {
      if (active) setAnalysis(result)
    }).catch((err) => {
      if (active) {
        setAnalysis(null)
        setAnalysisError(err.message || 'Could not load this analysis.')
      }
    }).finally(() => {
      if (active) setAnalysisLoading(false)
    })
    return () => { active = false }
  }, [selectedId])

  const modelData = useMemo(() => {
    const counts = new Map()
    for (const item of history) {
      const id = item.model?.id || 'unknown'
      const name = item.model?.label || id
      const existing = counts.get(id)
      counts.set(id, { name, modelId: id, value: (existing?.value || 0) + 1 })
    }
    return [...counts.values()]
  }, [history])
  const coverageTrend = useMemo(() => history
    .slice()
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .map((item) => ({
      id: item.id,
      time: new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      coverage: Number(item.coverage_percent) || 0,
      filename: item.filename || item.id,
    })), [history])

  const instances = useMemo(() => (analysis?.instances || []).map((item) => ({
    ...item,
    label: `${item.kind === 'instance' ? 'Inst.' : 'Region'} ${item.id}`,
  })), [analysis])
  const analysisAssets = useAnalysisAssets(analysis)
  const measurements = analysis?.measurements
  const averageCoverage = history.length
    ? history.reduce((sum, item) => sum + (Number(item.coverage_percent) || 0), 0) / history.length
    : null
  const averageLatency = history.length
    ? history.reduce((sum, item) => sum + (Number(item.inference_ms) || 0), 0) / history.length
    : null
  const totalRegions = history.reduce((sum, item) => sum + (Number(item.instance_count) || 0), 0)
  const selectedIndex = history.findIndex((item) => item.id === selectedId)
  const stepAnalysis = (offset) => {
    const item = history[selectedIndex + offset]
    if (item) setSelectedId(item.id)
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-7 flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-accent"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Analysis intelligence</div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Analytics dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-2">Explore saved image analyses, petroleum coverage, model usage and region-level measurements.</p>
        </div>
        <Link to="/analyze" className="btn-primary self-start sm:self-auto">
          <span aria-hidden="true">＋</span> Analyze an image
        </Link>
      </div>

      {error && <Notice tone="error" title="Dashboard data unavailable">{error}</Notice>}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saved analyses" value={loading ? '—' : fmtInt(history.length)} hint="Stored image assessments" />
        <StatCard label="Average petroleum coverage" value={averageCoverage == null ? '—' : fmtPct(averageCoverage)} hint="Across saved analyses" accent="text-teal-700" />
        <StatCard label="Regions detected" value={loading ? '—' : fmtInt(totalRegions)} hint="Sum of saved model detections" accent="text-sky-700" />
        <StatCard label="Average inference time" value={averageLatency == null ? '—' : fmtMs(averageLatency)} hint="Recorded model inference duration" accent="text-indigo-700" />
      </div>

      {loading ? (
        <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div>
      ) : history.length === 0 ? (
        <section className="analytics-card rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-700">🌊</div>
          <h2 className="mt-4 text-lg font-semibold text-ink">Your analysis dashboard is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-2">Run an image analysis to see the original image, detected petroleum regions, coverage trends and detailed measurements here.</p>
          <Link to="/analyze" className="btn-primary mt-5">Start an analysis</Link>
        </section>
      ) : (
        <>
          <div className="mb-5 grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
            <ChartPanel title="Saved analysis" subtitle="Select a scan to inspect the image, model output and measurements." className="min-w-0">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <select aria-label="Choose saved analysis" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-line bg-surface px-3 text-xs text-ink outline-none focus:border-accent sm:max-w-[390px]">
                  {history.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.filename || item.id} · {fmtPct(item.coverage_percent)}</option>)}
                </select>
                {analysis?.model && <Badge kind="muted">{analysis.model.label || analysis.model.id}</Badge>}
              </div>
              {analysisError && <Notice tone="error" title="Analysis unavailable">{analysisError}</Notice>}
              {analysisLoading ? <Skeleton className="h-[270px]" /> : analysis?.urls && (
                <AnalysisEvidence analysis={analysis} assets={analysisAssets} stacked showInstances imageClassName="h-[min(64vh,680px)] min-h-[380px] w-full" />
              )}
              {analysis && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <DetailMetric label="Coverage" value={fmtPct(measurements?.coverage_percent)} />
                  <DetailMetric label="Petroleum pixels" value={fmtInt(measurements?.petroleum_pixels)} />
                  <DetailMetric label="Regions" value={fmtInt(analysis.instance_count)} />
                  <DetailMetric label="Image dimensions" value={`${analysis.image?.width} × ${analysis.image?.height}`} unit="px" />
                  <DetailMetric label="Analysis source" value={analysis.image?.filename?.startsWith('live-scan-') ? 'Live camera' : 'Uploaded image'} />
                  <DetailMetric label="Perimeter" value={fmt(measurements?.perimeter_px, 1)} unit="px" />
                  <DetailMetric label="Inference speed" value={analysis.timing?.inference_ms > 0 ? fmt(1000 / analysis.timing.inference_ms, 2) : null} unit="images/s" />
                </div>
              )}
            </ChartPanel>

            <ChartPanel title="Selected image footprint" subtitle="Inspect the petroleum-like pixel footprint in each saved image.">
              {analysis ? (
                <div className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div><div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">Image-space coverage</div><div className="mt-2 font-mono text-4xl font-semibold tracking-tight text-accent">{fmtPct(measurements?.coverage_percent)}</div></div>
                    <div className="text-right"><div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-3">Detected area</div><div className="mt-2 font-mono text-sm text-ink">{fmtInt(measurements?.petroleum_pixels)} px</div></div>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-orange-400 transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, Number(measurements?.coverage_percent) || 0))}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs text-ink-2">{analysis.image?.filename || analysis.id}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" className="btn-ghost !h-8 !px-3" aria-label="Previous saved analysis" onClick={() => stepAnalysis(1)} disabled={selectedIndex < 0 || selectedIndex >= history.length - 1}>←</button>
                      <span className="font-mono text-[10px] text-ink-3">{selectedIndex + 1} / {history.length}</span>
                      <button type="button" className="btn-ghost !h-8 !px-3" aria-label="Next saved analysis" onClick={() => stepAnalysis(-1)} disabled={selectedIndex <= 0}>→</button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <DetailMetric label="Predicted regions" value={fmtInt(analysis.instance_count)} />
                    <DetailMetric label="Model" value={analysis.model?.label || analysis.model?.id} />
                  </div>
                </div>
              ) : <div className="grid min-h-[180px] place-items-center text-sm text-ink-3">Choose a saved image to inspect its predicted footprint.</div>}
            </ChartPanel>
          </div>

          <div className="mb-5">
            <ChartPanel title="Coverage over time" subtitle="Select any point to open that saved image analysis.">
              {coverageTrend.length > 1 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={coverageTrend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                    onClick={(event) => {
                      const id = event?.activePayload?.[0]?.payload?.id
                      if (id) setSelectedId(id)
                    }}>
                    <defs><linearGradient id="coverageTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.34} /><stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="time" minTickGap={24} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" width={48} tick={{ fill: 'var(--chart-tick)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${fmt(value, 2)}%`, 'Coverage']} labelFormatter={(label, payload) => payload?.[0]?.payload?.filename || label} />
                    <Area type="monotone" dataKey="coverage" stroke="var(--chart-primary)" strokeWidth={2} fill="url(#coverageTrendFill)" activeDot={{ r: 6, strokeWidth: 2, cursor: 'pointer' }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-line bg-surface-2 px-5 text-center text-sm text-ink-3">
                  {coverageTrend.length === 1 ? 'Run another analysis to compare coverage over time.' : 'Saved scans will appear here as an interactive coverage trend.'}
                </div>
              )}
            </ChartPanel>
          </div>

          <div className="mb-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <ChartPanel title="Model usage" subtitle="Saved analyses by inference model.">
              {modelData.length > 0 ? (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={modelData} dataKey="value" nameKey="name" innerRadius={57} outerRadius={88} paddingAngle={3} stroke="none">
                        {modelData.map((item, index) => <Cell key={item.modelId} fill={colorFor(item.modelId) || chartColors[index % chartColors.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [value, 'Analyses']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="w-full space-y-2 sm:max-w-[190px]">
                    {modelData.map((item, index) => <li key={item.modelId} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorFor(item.modelId) || chartColors[index % chartColors.length] }} /><span className="truncate">{item.name}</span></span><span className="font-mono text-slate-800">{item.value}</span></li>)}
                  </ul>
                </div>
              ) : <div className="grid h-[240px] place-items-center text-sm text-slate-400">Model information is not available.</div>}
            </ChartPanel>

            <ChartPanel title="Detected region areas" subtitle={analysis ? `Pixel area for each region in ${analysis.image?.filename || 'the selected image'}.` : 'Choose an analysis to inspect individual detections.'}>
              {instances.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={instances} margin={{ top: 10, right: 8, left: -18, bottom: 2 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtInt(value), 'Area (px)']} />
                    <Bar dataKey="area_px" name="Area" fill="var(--chart-primary)" radius={[5, 5, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="grid h-[260px] place-items-center text-sm text-slate-400">{analysis ? 'No petroleum-like regions detected in this image.' : 'Select an analysis to view region areas.'}</div>}
            </ChartPanel>
          </div>

          {analysis && (
            <div className="mb-5">
              <ChartPanel title="Region perimeter" subtitle="Image-space boundary length for each detected region.">
                {instances.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={instances} margin={{ top: 10, right: 8, left: -18, bottom: 2 }}>
                      <CartesianGrid stroke="var(--line)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--ink-3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${fmt(value, 1)} px`, 'Perimeter']} />
                      <Bar dataKey="perimeter_px" name="Perimeter" fill="var(--accent)" radius={[5, 5, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="grid h-[250px] place-items-center text-sm text-slate-400">No detected regions to chart.</div>}
              </ChartPanel>
            </div>
          )}

          {analysis && (
            <div className="mb-5 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
              <ChartPanel title="Analysis measurements" subtitle="Values from the selected model output. Coordinates are in image pixels.">
                <div className="grid grid-cols-2 gap-2">
                  <DetailMetric label="Inference time" value={fmtMs(analysis.timing?.inference_ms)} />
                  <DetailMetric label="Total processing" value={fmtMs(analysis.timing?.total_ms)} />
                  <DetailMetric label="Total pixels" value={fmtInt(measurements?.total_pixels)} />
                  <DetailMetric label="Perimeter" value={fmt(measurements?.perimeter_px, 1)} unit="px" />
                  <DetailMetric label="Largest region" value={fmtInt(measurements?.largest_region_pixels)} unit="px" />
                  <DetailMetric label="Centroid" value={measurements?.centroid ? `${fmt(measurements.centroid.x, 1)}, ${fmt(measurements.centroid.y, 1)}` : null} unit="px" />
                  <DetailMetric label="Bounding box" value={measurements?.bounding_box ? `${measurements.bounding_box.width} × ${measurements.bounding_box.height}` : null} unit="px" />
                  <DetailMetric label="Analyzed at" value={new Date(analysis.created_at).toLocaleString()} />
                </div>
              </ChartPanel>

              <ChartPanel title="Region details" subtitle={`${instances.length} model-reported region${instances.length === 1 ? '' : 's'} in the selected image.`}>
                {instances.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">No petroleum-like regions were detected.</div> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead><tr className="border-b border-slate-100 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">
                        <th className="py-2.5 pr-3 font-medium">Region</th><th className="px-3 py-2.5 font-medium">Class</th><th className="px-3 py-2.5 text-right font-medium">Area</th><th className="px-3 py-2.5 text-right font-medium">Perimeter</th><th className="px-3 py-2.5 text-right font-medium">Coverage</th><th className="px-3 py-2.5 text-right font-medium">Confidence</th><th className="py-2.5 pl-3 text-right font-medium">Centroid</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {instances.map((item) => <tr key={item.index}>
                          <td className="py-3 pr-3 font-medium text-slate-800">{item.label}</td>
                          <td className="px-3 py-3 text-slate-500">{item.class_name || 'Petroleum-like'}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{fmtInt(item.area_px)} px</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{fmt(item.perimeter_px, 1)} px</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{fmtPct(item.coverage_percent)}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{item.confidence == null ? '—' : fmt(item.confidence, 3)}</td>
                          <td className="py-3 pl-3 text-right font-mono text-slate-700">{item.centroid ? `${fmt(item.centroid.x, 0)}, ${fmt(item.centroid.y, 0)}` : '—'}</td>
                        </tr>)}
                      </tbody>
                    </table>
                  </div>
                )}
              </ChartPanel>
            </div>
          )}
          <p className="mb-2 text-center text-[11px] leading-5 text-slate-400">Charts summarize saved model predictions; they are not independent environmental measurements or ground-truth metrics.</p>
        </>
      )}
    </div>
  )
}

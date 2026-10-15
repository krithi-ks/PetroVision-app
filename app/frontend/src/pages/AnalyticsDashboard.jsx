import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

const tooltipStyle = { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: 12 }
const chartColors = ['#0f766e', '#0284c7', '#6366f1', '#f59e0b', '#e11d48', '#64748b']

function StatCard({ label, value, hint, accent = 'text-slate-900' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.025)]">
      <div className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`mt-3 text-[28px] font-semibold leading-none tracking-tight ${accent}`}>{value}</div>
      <div className="mt-2 text-xs text-slate-400">{hint}</div>
    </div>
  )
}

function ChartPanel({ title, subtitle, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.025)] ${className}`}>
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1.5 text-sm font-semibold tabular-nums text-slate-800">{value ?? '—'}{unit && value != null && <span className="ml-1 text-[10px] font-normal text-slate-400">{unit}</span>}</div>
    </div>
  )
}

export default function AnalyticsDashboard() {
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
      setSelectedId((current) => current || result.items[0]?.id || '')
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

  const coverageData = useMemo(() => [...history].reverse().map((item) => ({
    date: new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    coverage: Number(item.coverage_percent) || 0,
    model: item.model?.label || item.model?.id || 'Unknown',
  })), [history])

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

  const instances = useMemo(() => (analysis?.instances || []).map((item) => ({
    ...item,
    label: `${item.kind === 'instance' ? 'Inst.' : 'Region'} ${item.id}`,
  })), [analysis])
  const measurements = analysis?.measurements
  const averageCoverage = history.length
    ? history.reduce((sum, item) => sum + (Number(item.coverage_percent) || 0), 0) / history.length
    : null
  const averageLatency = history.length
    ? history.reduce((sum, item) => sum + (Number(item.inference_ms) || 0), 0) / history.length
    : null
  const totalRegions = history.reduce((sum, item) => sum + (Number(item.instance_count) || 0), 0)

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-7 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-teal-700"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Analysis intelligence</div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Analytics dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Explore saved image analyses, petroleum coverage, model usage and region-level measurements.</p>
        </div>
        <Link to="/analyze" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg bg-[#0c4c57] px-4 text-sm font-semibold text-white transition hover:bg-[#0a6267] sm:self-auto">
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
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-700">🌊</div>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Your analysis dashboard is ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Run an image analysis to see the original image, detected petroleum regions, coverage trends and detailed measurements here.</p>
          <Link to="/analyze" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">Start an analysis</Link>
        </section>
      ) : (
        <>
          <div className="mb-5 grid gap-5 xl:grid-cols-[1.45fr_1fr]">
            <ChartPanel title="Saved analysis" subtitle="Select a scan to inspect the image, model output and measurements." className="min-w-0">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <select aria-label="Choose saved analysis" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-teal-500 sm:max-w-[390px]">
                  {history.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.filename || item.id} · {fmtPct(item.coverage_percent)}</option>)}
                </select>
                {analysis?.model && <Badge kind="muted">{analysis.model.label || analysis.model.id}</Badge>}
              </div>
              {analysisError && <Notice tone="error" title="Analysis unavailable">{analysisError}</Notice>}
              {analysisLoading ? <Skeleton className="h-[270px]" /> : analysis?.urls && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <div className="border-b border-slate-200 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Source image</div>
                    <img src={analysis.urls.source} alt={`Analysed source image: ${analysis.image?.filename || 'saved scan'}`} className="h-[250px] w-full object-contain" />
                  </figure>
                  <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <div className="border-b border-slate-200 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">Predicted region labels</div>
                    <img src={analysis.urls.labels} alt="Model-predicted petroleum region labels" className="h-[250px] w-full object-contain [image-rendering:pixelated]" />
                  </figure>
                </div>
              )}
              {analysis && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <DetailMetric label="Coverage" value={fmtPct(measurements?.coverage_percent)} />
                  <DetailMetric label="Petroleum pixels" value={fmtInt(measurements?.petroleum_pixels)} />
                  <DetailMetric label="Regions" value={fmtInt(analysis.instance_count)} />
                  <DetailMetric label="Image dimensions" value={`${analysis.image?.width} × ${analysis.image?.height}`} unit="px" />
                </div>
              )}
            </ChartPanel>

            <ChartPanel title="Coverage over time" subtitle="Petroleum-like pixel coverage recorded for each saved analysis.">
              {coverageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={318}>
                  <AreaChart data={coverageData} margin={{ top: 8, right: 8, left: -18, bottom: 2 }}>
                    <defs><linearGradient id="coverageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0f766e" stopOpacity={0.24} /><stop offset="95%" stopColor="#0f766e" stopOpacity={0.01} /></linearGradient></defs>
                    <CartesianGrid stroke="#e8eef2" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={22} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${fmt(value, 2)}%`, 'Coverage']} labelFormatter={(label, items) => `${label}${items?.[0]?.payload?.model ? ` · ${items[0].payload.model}` : ''}`} />
                    <Area type="monotone" dataKey="coverage" stroke="#0f766e" strokeWidth={2.5} fill="url(#coverageFill)" activeDot={{ r: 5, fill: '#0f766e' }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="grid h-[318px] place-items-center text-sm text-slate-400">No coverage measurements yet.</div>}
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
                    <CartesianGrid stroke="#e8eef2" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [fmtInt(value), 'Area (px)']} />
                    <Bar dataKey="area_px" name="Area" fill="#0f766e" radius={[5, 5, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="grid h-[260px] place-items-center text-sm text-slate-400">{analysis ? 'No petroleum-like regions detected in this image.' : 'Select an analysis to view region areas.'}</div>}
            </ChartPanel>
          </div>

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
                        <th className="py-2.5 pr-3 font-medium">Region</th><th className="px-3 py-2.5 font-medium">Class</th><th className="px-3 py-2.5 text-right font-medium">Area</th><th className="px-3 py-2.5 text-right font-medium">Coverage</th><th className="px-3 py-2.5 text-right font-medium">Confidence</th><th className="py-2.5 pl-3 text-right font-medium">Centroid</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {instances.map((item) => <tr key={item.index}>
                          <td className="py-3 pr-3 font-medium text-slate-800">{item.label}</td>
                          <td className="px-3 py-3 text-slate-500">{item.class_name || 'Petroleum-like'}</td>
                          <td className="px-3 py-3 text-right font-mono text-slate-700">{fmtInt(item.area_px)} px</td>
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

import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { uiSoundHandlers } from '../audio/uiSounds'
import { useApp } from '../context/AppContext'
import { fmtMs, fmtPct } from '../lib/format'
import { Badge, EmptyState } from '../components/ui'

function HistoryTab() {
  const { history, openAnalysis, removeAnalysis } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)

  const open = async (id, to) => {
    await openAnalysis(id)
    nav(to, to === '/dashboard' ? { state: { analysisId: id } } : undefined)
  }

  const clear = async () => {
    if (!window.confirm('Delete all saved analyses?')) return
    setBusy(true)
    await api.clearHistory().catch(() => {})
    await removeAnalysis('none')
    setBusy(false)
  }

  return (
    <section>
      <div className="mb-5 border-b border-line-strong pb-4">
        <div className="label mb-1.5 text-accent">Saved analyses</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">Analysis history</h1>
            <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
              Review saved upload and live-scan predictions, measurements and dashboard details.
            </p>
          </div>
          <Badge kind="live">Live output</Badge>
        </div>
      </div>

      {history.items.length === 0 ? (
        <EmptyState title="No analysis yet" action={<Link to="/analyze" className="btn-primary">Start analysis</Link>}>
          Run an analysis or save a live-scan snapshot to build your history.
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={clear} disabled={busy} className="font-mono text-[11px] uppercase tracking-[0.1em] text-bad hover:underline">
              Clear history
            </button>
          </div>
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2/60 text-left">
                  <th className="label px-3 py-2.5">Image</th>
                  <th className="label px-3 py-2.5">Time</th>
                  <th className="label px-3 py-2.5">Model</th>
                  <th className="label px-3 py-2.5 text-right">Instances</th>
                  <th className="label px-3 py-2.5 text-right">Coverage</th>
                  <th className="label px-3 py-2.5 text-right">Inference</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0 hover:bg-surface-2/60">
                    <td className="px-3 py-2"><img src={item.thumb_url} alt="" className="h-10 w-16 object-cover" loading="lazy" /></td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="px-3 py-2 text-ink">{item.model.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{item.instance_count}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink">{fmtPct(item.coverage_percent)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-2">{fmtMs(item.inference_ms)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button type="button" className="mr-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline" onClick={() => open(item.id, '/analyze')}>Open</button>
                      <button type="button" className="mr-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline" onClick={() => open(item.id, '/dashboard')}>Dashboard</button>
                      <button type="button" className="mr-3 font-mono text-[11px] uppercase tracking-[0.1em] text-accent hover:underline" onClick={() => open(item.id, '/3d')}>3D</button>
                      <button type="button" aria-label="Delete analysis" className="text-ink-3 hover:text-bad" onClick={() => removeAnalysis(item.id)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export default function Results() {
  const sfx = useMemo(uiSoundHandlers, [])
  return <div {...sfx}><HistoryTab /></div>
}

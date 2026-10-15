import { Badge } from './ui'
import { colorFor } from '../lib/models'
import { useApp } from '../context/AppContext'

const TASK_TITLE = { instance: 'Instance segmentation', semantic: 'Semantic segmentation' }

/** Models grouped by task, with clean availability labels (no file-system details). */
export default function ModelPicker({ models, value, onChange, disabled = false }) {
  const { play } = useApp()
  const groups = ['instance', 'semantic'].map((task) => [task, models.filter((m) => (m.task || 'semantic') === task)]).filter(([, list]) => list.length)
  return (
    <div role="radiogroup" aria-label="Model" className="space-y-4">
      {groups.map(([task, list]) => (
        <div key={task}>
          <div className="label mb-1.5">{TASK_TITLE[task]}</div>
          <div className="divide-y divide-line overflow-hidden rounded border border-line">
            {list.map((m) => {
              const usable = m.availability.available
              const selected = value === m.id
              const reason = m.availability.missing_modules?.length
                ? `Missing components: ${m.availability.missing_modules.join(', ')}`
                : m.availability.message
              return (
                <button key={m.id} type="button" role="radio" aria-checked={selected} disabled={disabled || !usable}
                  onClick={() => { onChange(m.id); play('select') }} title={!usable ? reason : undefined}
                  aria-label={`${m.label}${!usable && reason ? `, unavailable: ${reason}` : ''}`}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${selected ? 'bg-accent-soft' : 'bg-surface hover:bg-surface-2'}`}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: usable ? colorFor(m.id) : 'var(--line-strong)' }} />
                    <span className="min-w-0">
                      <span className={`block truncate text-[13px] font-medium ${usable ? 'text-ink' : 'text-ink-3'}`}>{m.label}</span>
                      <span className="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">{m.dataset}{!usable && reason ? ` · ${reason}` : ''}</span>
                    </span>
                  </span>
                  <Badge kind={usable ? 'ok' : 'muted'}>{usable ? 'Available' : 'Unavailable'}</Badge>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

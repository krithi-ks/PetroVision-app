import { useEffect, useRef } from 'react'

export function Panel({ className = '', children, ...rest }) {
  return <div className={`panel ${className}`} {...rest}>{children}</div>
}

export function Eyebrow({ children }) {
  return <div className="label mb-2 text-accent">{children}</div>
}

export function PageHeader({ eyebrow, title, children, right }) {
  return (
    <div className="mb-7 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl animate-rise">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {children && <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{children}</p>}
      </div>
      {right}
    </div>
  )
}

const BADGES = {
  research: 'border-accent/40 bg-accent-soft text-accent',
  live: 'border-signal/40 bg-signal/10 text-signal',
  future: 'border-dashed border-line-strong bg-surface-2 text-ink-2',
  viz: 'border-accent/40 bg-accent-soft text-accent',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  bad: 'border-bad/40 bg-bad/10 text-bad',
  muted: 'border-line bg-surface-2 text-ink-2',
}

export function Badge({ kind = 'muted', children, title, className = '' }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${BADGES[kind]} ${className}`}>
      {kind === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-signal" />}
      {children}
    </span>
  )
}

export const ResearchBadge = ({ children = 'Saved experiment results' }) => <Badge kind="research">{children}</Badge>
export const LiveBadge = ({ children = 'Live output' }) => <Badge kind="live">{children}</Badge>

export function Button({ variant = 'primary', className = '', children, ...rest }) {
  return <button className={`btn-${variant} ${className}`} {...rest}>{children}</button>
}

export function Spinner({ size = 16, className = '' }) {
  return (
    <svg className={`animate-spin ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const NOTICE_TONES = {
  info: 'border-accent/30 bg-accent-soft text-ink',
  warn: 'border-warn/40 bg-warn/10 text-ink',
  error: 'border-bad/40 bg-bad/10 text-ink',
  success: 'border-ok/40 bg-ok/10 text-ink',
}

export function Notice({ tone = 'info', title, children, action, className = '' }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={`rounded border-l-2 border px-4 py-3 text-sm ${NOTICE_TONES[tone]} ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {title && <div className="font-semibold">{title}</div>}
          {children && <div className={`${title ? 'mt-1 ' : ''}leading-relaxed text-ink-2`}>{children}</div>}
        </div>
        {action}
      </div>
    </div>
  )
}

export function Stat({ label, value, unit, hint, accent = 'ink' }) {
  const color = accent === 'oil' ? 'text-signal' : accent === 'cyan' ? 'text-accent' : 'text-ink'
  return (
    <div className="border-l border-line-strong pl-3">
      <div className="label">{label}</div>
      <div className={`mt-1 font-mono text-[19px] font-medium leading-tight ${color}`}>
        {value}
        {unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-3">{hint}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <div className="text-base font-semibold text-ink">{title}</div>
      {children && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Bar({ value, color = 'var(--accent)', className = '' }) {
  const pct = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={`h-1 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function useEscape(onClose) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && ref.current?.()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
}

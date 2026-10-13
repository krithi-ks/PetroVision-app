export function fmt(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Number(value).toFixed(digits)
}

export function fmtInt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return Math.round(Number(value)).toLocaleString('en-US')
}

export function fmtPct(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${Number(value).toFixed(digits)}%`
}

export function fmtMs(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const v = Number(value)
  return v >= 100 ? `${v.toFixed(0)} ms` : `${v.toFixed(1)} ms`
}

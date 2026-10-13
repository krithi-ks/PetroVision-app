// Consistent 1.5px-stroke icon set (20px grid). Inline SVG: no extra dependency.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const I = (children) => (props) => <svg {...base} {...props}>{children}</svg>

export const IconSoundOn = I(<><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>)
export const IconSoundOff = I(<><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m22 9-6 6M16 9l6 6" /></>)
export const IconCamera = I(<><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>)
export const IconScan = I(<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></>)
export const IconStop = I(<rect x="6" y="6" width="12" height="12" rx="1" />)
export const IconCube = I(<><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>)
export const IconMenu = I(<path d="M4 7h16M4 12h16M4 17h16" />)
export const IconClose = I(<path d="M6 6l12 12M18 6 6 18" />)
export const IconChevron = I(<path d="m6 9 6 6 6-6" />)
export const IconLayers = I(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>)

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="4" stroke="var(--ink)" strokeWidth="1.5" />
      <path d="M16 6c4.2 5.6 7.6 9.2 7.6 13.6a7.6 7.6 0 0 1-15.2 0C8.4 15.2 11.8 11.6 16 6z" fill="var(--signal)" />
      <path d="M4 16h5M23 16h5M16 4v3M16 25v3" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio/AudioManager'
import { useAudio } from '../audio/useAudio'
import { IconSoundOff, IconSoundOn } from './icons'

/** Sound on/off + volume. `tone="hud"` is the translucent variant used inside the scanning viewport. */
export default function SoundControl({ tone = 'light', label = 'Sound' }) {
  const { enabled, volume } = useAudio()
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => { if (!root.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const btn = tone === 'hud'
    ? 'border-[color:var(--hud-line)] bg-[color:var(--hud-glass)] text-hud-white hover:border-hud-cyan'
    : 'border-line-strong bg-surface text-ink hover:border-ink'

  return (
    <div className="relative" ref={root}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => { audio.unlock(); audio.setEnabled(!enabled) }}
          aria-pressed={enabled}
          title={enabled ? `${label}: on` : `${label}: off`}
          className={`grid h-9 w-9 place-items-center rounded border transition-colors ${btn}`}
        >
          <span className="sr-only">{enabled ? 'Turn sound off' : 'Turn sound on'}</span>
          {enabled ? <IconSoundOn /> : <IconSoundOff />}
        </button>
        <button
          type="button"
          onClick={() => { audio.unlock(); setOpen((o) => !o) }}
          aria-expanded={open}
          aria-label="Volume"
          className={`hidden h-9 items-center rounded border px-2 font-mono text-[11px] tabular-nums transition-colors sm:flex ${btn}`}
        >
          {Math.round(volume * 100)}
        </button>
      </div>
      {open && (
        <div className={`absolute right-0 top-11 z-50 w-52 rounded border p-3 ${tone === 'hud' ? 'border-[color:var(--hud-line)] bg-hud-bg text-hud-white' : 'border-line-strong bg-surface text-ink shadow-sm'}`}>
          <label className="label block" htmlFor="vol">Volume</label>
          <input id="vol" type="range" min="0" max="1" step="0.05" value={volume} className="mt-2 w-full"
            onChange={(e) => { audio.setVolume(+e.target.value) }} />
        </div>
      )}
    </div>
  )
}

import { audio } from './AudioManager'

const INTERACTIVE = 'button, [role="button"], [role="radio"], [role="tab"], [role="switch"], select, a[href], input[type="range"], input[type="checkbox"], [data-sfx]'

/**
 * Pointer-event handlers that give an interface region a consistent "touch" sound language.
 * Attach them once on a wrapper element; they use event delegation, so nothing needs to be wired per button.
 *
 *   hover   -> soft glass tick                 (mouse/pen only, never on touch, rate-limited)
 *   click   -> glass tap
 *   toggles -> rising / falling pair           (aria-pressed / aria-expanded decide the direction)
 *   data-sfx="select" | "expand" | "none"      override per element
 *
 * Sounds are interface feedback only; they never reflect any measurement.
 */
export function uiSoundHandlers() {
  let last = null
  const target = (e) => e.target?.closest?.(INTERACTIVE)
  const usable = (el) => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.dataset.sfx !== 'none'

  return {
    onPointerOver: (e) => {
      if (e.pointerType === 'touch') return
      const el = target(e)
      if (!usable(el) || el === last) return
      last = el
      audio.play('ui_hover')
    },
    onPointerLeave: () => { last = null },
    onClick: (e) => {
      const el = target(e)
      if (!usable(el)) return
      const sfx = el.dataset.sfx
      if (sfx === 'select') return void audio.play('ui_select')
      const pressed = el.getAttribute('aria-pressed') ?? el.getAttribute('aria-checked')
      if (pressed === 'true') return void audio.play('ui_toggle_off')       // state not yet re-rendered: 'true' means turning off
      if (pressed === 'false') return void audio.play('ui_toggle_on')
      const expanded = el.getAttribute('aria-expanded')
      if (sfx === 'expand' || expanded !== null) return void audio.play(expanded === 'true' ? 'ui_collapse' : 'ui_expand')
      audio.play('ui_click')
    },
  }
}

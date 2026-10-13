import { afterEach, describe, expect, it, vi } from 'vitest'
import { audio } from '../audio/AudioManager'
import { uiSoundHandlers } from '../audio/uiSounds'

afterEach(() => vi.restoreAllMocks())

const el = (attrs = {}, tag = 'button') => {
  const node = document.createElement(tag)
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v))
  document.body.appendChild(node)
  return node
}
const ev = (node, extra = {}) => ({ target: node, pointerType: 'mouse', ...extra })

describe('UI sound language', () => {
  it('plays a hover tick once per element and never on touch', () => {
    const play = vi.spyOn(audio, 'play').mockReturnValue(true)
    const h = uiSoundHandlers()
    const b = el()
    h.onPointerOver(ev(b)); h.onPointerOver(ev(b))
    expect(play).toHaveBeenCalledTimes(1); expect(play).toHaveBeenCalledWith('ui_hover')
    h.onPointerOver(ev(el(), { pointerType: 'touch' }))
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('maps clicks to the right cue: plain, toggle on/off, expand/collapse, select', () => {
    const play = vi.spyOn(audio, 'play').mockReturnValue(true)
    const h = uiSoundHandlers()
    h.onClick(ev(el())); expect(play).toHaveBeenLastCalledWith('ui_click')
    h.onClick(ev(el({ 'aria-pressed': 'false' }))); expect(play).toHaveBeenLastCalledWith('ui_toggle_on')
    h.onClick(ev(el({ 'aria-pressed': 'true' }))); expect(play).toHaveBeenLastCalledWith('ui_toggle_off')
    h.onClick(ev(el({ 'aria-expanded': 'false' }))); expect(play).toHaveBeenLastCalledWith('ui_expand')
    h.onClick(ev(el({ 'aria-expanded': 'true' }))); expect(play).toHaveBeenLastCalledWith('ui_collapse')
    h.onClick(ev(el({ 'data-sfx': 'select' }))); expect(play).toHaveBeenLastCalledWith('ui_select')
  })

  it('stays silent for disabled controls, opt-outs and non-interactive targets', () => {
    const play = vi.spyOn(audio, 'play').mockReturnValue(true)
    const h = uiSoundHandlers()
    h.onClick(ev(el({ disabled: '' }))); h.onClick(ev(el({ 'data-sfx': 'none' }))); h.onClick(ev(el({}, 'div')))
    expect(play).not.toHaveBeenCalled()
  })
})

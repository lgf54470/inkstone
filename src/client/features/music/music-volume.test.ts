import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicPlayerControls } from './music-player-controls'
import { MusicVolumeButton, MusicVolumeSlider } from './music-transport-widgets'

const realToggleMute = useMusic.getState().toggleMute
const realSetVolume = useMusic.getState().setVolume

beforeEach(() => {
  useMusic.setState({ volume: 0.42, muted: false })
})

afterEach(() => {
  document.body.innerHTML = ''
  useMusic.setState({ volume: 1, muted: false, toggleMute: realToggleMute, setVolume: realSetVolume })
  vi.restoreAllMocks()
})

function volumeSlider(): HTMLInputElement {
  const slider = document.querySelector(`input[type="range"][aria-label="${t('music.volume')}"]`)
  if (!slider) throw new Error('no volume slider on screen')
  return slider as HTMLInputElement
}

function buttonNamed(label: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === label)
  if (!button) throw new Error(`no button named ${label} on screen`)
  return button as HTMLButtonElement
}

// Both surfaces draw the same control, so neither may hand-roll its own range input: the shared
// slider is what gives the control a readable value instead of a bare number, and keeps its fill,
// keyboard step and accessible value in one place. The hub bar and the transport popover used to
// be two different sliders; only one of them announced its value, so the same control read
// differently depending on which surface it was opened from.
describe('the volume control', () => {
  it('reports its value as a percentage on the transport surface', () => {
    const view = renderElement(createElement(MusicVolumeSlider))
    expect(volumeSlider().getAttribute('aria-valuetext')).toBe('42%')
    expect(view.container.textContent).toContain('42%')
    view.unmount()
  })

  it('takes the same shape in the hub bar as in the transport popover', () => {
    const view = renderElement(createElement(MusicPlayerControls, { queueOpen: false, onToggleQueue: () => {} }))
    expect(volumeSlider().getAttribute('aria-valuetext')).toBe('42%')
    view.unmount()
  })

  it('shows zero while muted even though the stored level is kept', () => {
    useMusic.setState({ muted: true })
    const view = renderElement(createElement(MusicVolumeSlider))
    expect(volumeSlider().getAttribute('aria-valuetext')).toBe('0%')
    view.unmount()
  })
})

describe('the volume panel', () => {
  // Muting here used to double as a hidden double-click gesture on the panel's trigger: no label
  // named it, no keyboard reached it, and a quick double tap flipped the state twice, which read
  // as one tap being ignored. The trigger now says only what it does — it opens the panel — and
  // the mute button inside the panel is the one named control for that job.
  it('opens from its trigger without muting on the side', () => {
    const toggleMute = vi.fn()
    useMusic.setState({ toggleMute })
    const view = renderElement(createElement(MusicVolumeButton))
    const trigger = buttonNamed(t('music.volume'))

    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      trigger.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })

    expect(toggleMute).not.toHaveBeenCalled()
    view.unmount()
  })

  it('names its trigger for the panel it opens rather than for muting', () => {
    const view = renderElement(createElement(MusicVolumeButton))
    expect(() => buttonNamed(t('music.volume'))).not.toThrow()
    expect(() => buttonNamed(t('music.mute'))).toThrow()
    view.unmount()
  })

  it('still offers a named mute control once the panel is open', () => {
    const view = renderElement(createElement(MusicVolumeButton))
    act(() => { buttonNamed(t('music.volume')).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(buttonNamed(t('music.mute'))).toBeDefined()
    view.unmount()
  })
})

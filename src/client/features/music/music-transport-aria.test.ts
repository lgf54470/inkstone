import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initI18n, t } from '../../lib/i18n'
import { MusicEqButton, MusicQueueButton, MusicRateButton, MusicSleepButton, MusicVolumeButton } from './music-transport-widgets'
import { useMusic } from './music-store'

beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mount(node: React.ReactNode): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(node) })
}

function trigger(label: string): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label) as HTMLButtonElement
}

beforeEach(() => {
  useMusic.setState({
    queue: [], currentIndex: 0, volume: 0.8, muted: false, playbackRate: 1,
    eqEnabled: false, sleepEndsAt: null, sleepMinutes: null, sleepAfterCurrentTrack: false,
    clearQueue: vi.fn(),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// A button that opens a panel is described by aria-expanded; publishing aria-pressed on the
// same element tells a screen reader it is a toggle instead, and the two cannot both be true.
describe('popover triggers do not claim the toggle role', () => {
  it('leaves the queue trigger to aria-expanded', async () => {
    await mount(createElement(MusicQueueButton, {}))
    const button = trigger(t('music.queue'))
    expect(button.getAttribute('aria-pressed')).toBeNull()
    expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the volume trigger to aria-expanded', async () => {
    await mount(createElement(MusicVolumeButton, {}))
    const button = trigger(t('music.volume'))
    expect(button.getAttribute('aria-pressed')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the rate trigger to aria-expanded', async () => {
    await mount(createElement(MusicRateButton, {}))
    const button = trigger(t('music.playback_rate'))
    expect(button.getAttribute('aria-pressed')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the sleep trigger to aria-expanded', async () => {
    await mount(createElement(MusicSleepButton, {}))
    const button = trigger(t('music.sleep_timer'))
    expect(button.getAttribute('aria-pressed')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the EQ trigger to aria-expanded', async () => {
    await mount(createElement(MusicEqButton, {}))
    const button = trigger(t('music.eq'))
    expect(button.getAttribute('aria-pressed')).toBeNull()
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('the emphasis a panel owns is still painted', () => {
  it('highlights the EQ trigger while the equaliser is on', async () => {
    useMusic.setState({ eqEnabled: true })
    await mount(createElement(MusicEqButton, {}))
    const button = trigger(t('music.eq'))
    expect(button.className).toContain('bg-[var(--accent-soft)]')
    expect(button.getAttribute('aria-pressed')).toBeNull()
  })

  it('highlights the rate trigger only while the rate is not default', async () => {
    await mount(createElement(MusicRateButton, {}))
    expect(trigger(t('music.playback_rate')).className).not.toContain('bg-[var(--accent-soft)]')
    act(() => root?.unmount())
    root = null
    document.body.innerHTML = ''
    useMusic.setState({ playbackRate: 1.5 })
    await mount(createElement(MusicRateButton, {}))
    expect(trigger(t('music.playback_rate')).className).toContain('bg-[var(--accent-soft)]')
  })
})

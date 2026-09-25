import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initI18n, t } from '../../lib/i18n'
import { MusicSleepButton } from './music-transport-widgets'
import { useMusic } from './music-store'

// The minute labels are formatted strings, so the assertions need the real resources.
beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(createElement(MusicSleepButton, {})) })
}

function trigger(): HTMLButtonElement {
  return [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.sleep_timer')) as HTMLButtonElement
}

async function openMenu(): Promise<void> {
  await act(async () => { trigger().click() })
}

function option(label: string): HTMLButtonElement {
  return [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes(label)) as HTMLButtonElement
}

beforeEach(() => {
  useMusic.setState({
    sleepEndsAt: null, sleepMinutes: null, sleepAfterCurrentTrack: false,
    setSleepTimer: vi.fn(), setSleepAfterCurrentTrack: vi.fn(),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// The armed option was marked with the accent colour alone, so neither a screen reader nor a
// reader who cannot separate that colour could tell which one the menu was on.
describe('sleep timer menu selection (UI-10)', () => {
  it('states the armed minute option to assistive tech', async () => {
    useMusic.setState({ sleepEndsAt: Date.now() + 30 * 60_000, sleepMinutes: 30 })
    await mount()
    await openMenu()
    expect(option(t('music.sleep_minutes', { value0: 30 })).getAttribute('aria-pressed')).toBe('true')
    expect(option(t('music.sleep_minutes', { value0: 45 })).getAttribute('aria-pressed')).toBe('false')
    expect(option(t('music.off')).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks the armed option with more than colour', async () => {
    useMusic.setState({ sleepEndsAt: Date.now() + 30 * 60_000, sleepMinutes: 30 })
    await mount()
    await openMenu()
    const armed = option(t('music.sleep_minutes', { value0: 30 }))
    const idle = option(t('music.sleep_minutes', { value0: 45 }))
    expect(armed.querySelectorAll('svg').length).toBeGreaterThan(idle.querySelectorAll('svg').length)
  })

  it('presses off while nothing is armed', async () => {
    await mount()
    await openMenu()
    expect(option(t('music.off')).getAttribute('aria-pressed')).toBe('true')
    expect(option(t('music.sleep_after_current')).getAttribute('aria-pressed')).toBe('false')
  })

  it('presses the after-current option when that mode is armed', async () => {
    useMusic.setState({ sleepAfterCurrentTrack: true })
    await mount()
    await openMenu()
    expect(option(t('music.sleep_after_current')).getAttribute('aria-pressed')).toBe('true')
    expect(option(t('music.off')).getAttribute('aria-pressed')).toBe('false')
  })
})

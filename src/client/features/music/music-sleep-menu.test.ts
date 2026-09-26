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

// IMP-6: the presets never covered a 90-minute nap or a 3-hour session; a custom
// minute input closes that gap without growing the preset row.
describe('sleep timer custom minutes (IMP-6)', () => {
  function customInput(): HTMLInputElement {
    const field = [...document.querySelectorAll('[role="dialog"] input')].find((input) => input.getAttribute('aria-label') === t('music.sleep_custom')) as HTMLInputElement | undefined
    if (!field) throw new Error('no custom minutes field')
    return field
  }

  function applyButton(): HTMLButtonElement {
    return [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent?.includes(t('music.sleep_custom_apply'))) as HTMLButtonElement
  }

  function typeInto(field: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('applies a custom minute count through the store action', async () => {
    await mount()
    await openMenu()
    typeInto(customInput(), '90')
    await act(async () => { applyButton().click() })
    expect(useMusic.getState().setSleepTimer).toHaveBeenCalledWith(90)
  })

  it('refuses to apply a count outside the one-to-eight-hour window', async () => {
    await mount()
    await openMenu()
    typeInto(customInput(), '0')
    expect(applyButton().disabled).toBe(true)
    typeInto(customInput(), '600')
    expect(useMusic.getState().setSleepTimer).not.toHaveBeenCalled()
  })
})

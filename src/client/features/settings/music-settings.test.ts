import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import type { ReactNode } from 'react'
import { renderElement } from '../../lib/test-render'
import { t } from '../../lib/i18n'
import { useMusic } from '../music'
import { MusicSettings } from './music-settings'

// The store is a module singleton shared by every case, so each one starts from the
// defaults it is about rather than from whatever the previous one left behind.
beforeEach(() => {
  window.localStorage.clear()
  useMusic.setState({
    providerEnabled: {},
    providerQuality: 320,
    providerNoticeAccepted: false,
    showSourceBadge: true,
    crossfadeEnabled: false,
    eqEnabled: false,
    immersiveBackground: 'theme',
    lyricAlign: 'left',
    lyricTextSize: 'default',
    floatingVisible: true,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  window.localStorage.clear()
})

// The vitest projects select `*.test.ts` only (pinned by tests/merge-preflight.test.ts), so the
// section is mounted with createElement rather than JSX, the same way the hub window test does it.
function render(children: ReactNode): ReturnType<typeof renderElement> {
  return renderElement(children)
}

function click(element: Element): void {
  act(() => { (element as HTMLElement).click() })
}

function switchByLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)
  if (!found) throw new Error(`no switch labelled ${label}`)
  return found
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === text)
  if (!found) throw new Error(`no button reading ${text}`)
  return found as HTMLButtonElement
}

// FB-F4: one surface where the music preferences live, instead of switches scattered
// through the player popovers.
describe('music settings section · online sources', () => {
  it('lists the online provider behind a switch that is off by default', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const toggle = switchByLabel(container, t('music.provider_gds'))
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    unmount()
  })

  // FB-S6: a third-party catalogue is a decision, so it is stated once and the switch stays
  // shut until the reader says they read it.
  it('holds the provider switch shut until the notice is acknowledged', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const toggle = switchByLabel(container, t('music.provider_gds'))
    expect(toggle.disabled).toBe(true)
    expect(container.textContent).toContain(t('music.settings_risk_body'))
    click(buttonByText(container, t('music.settings_risk_accept')))
    expect(useMusic.getState().providerNoticeAccepted).toBe(true)
    expect(switchByLabel(container, t('music.provider_gds')).disabled).toBe(false)
    unmount()
  })

  it('turns the provider on through the same store the search panel reads', () => {
    useMusic.setState({ providerNoticeAccepted: true })
    const { container, unmount } = render(createElement(MusicSettings))
    click(switchByLabel(container, t('music.provider_gds')))
    expect(useMusic.getState().providerEnabled.gds).toBe(true)
    unmount()
  })

  // FB-F7: the tier the worker has always accepted but the client never sent.
  it('writes the online quality tier', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const select = container.querySelector<HTMLSelectElement>(`select[aria-label="${t('music.settings_quality')}"]`)
    expect(select).not.toBeNull()
    act(() => {
      select!.value = '740'
      select!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useMusic.getState().providerQuality).toBe(740)
    unmount()
  })

  it('toggles the source badge', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    click(switchByLabel(container, t('music.settings_show_source_badge')))
    expect(useMusic.getState().showSourceBadge).toBe(false)
    unmount()
  })
})

describe('music settings section · playback defaults', () => {
  // The playback group is not a second copy of the player popover: it renders the same
  // panel, so a change made here is a change made there.
  it('shares the equalizer panel with the player popover', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    click(switchByLabel(container, t('music.crossfade')))
    expect(useMusic.getState().crossfadeEnabled).toBe(true)
    unmount()
  })

  it('writes the immersive background, lyric alignment and lyric size', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    click(buttonByText(container, t('music.background_blur')))
    expect(useMusic.getState().immersiveBackground).toBe('blur')
    click(buttonByText(container, t('music.lyric_align_center')))
    expect(useMusic.getState().lyricAlign).toBe('center')
    click(buttonByText(container, t('music.lyric_size_large')))
    expect(useMusic.getState().lyricTextSize).toBe('large')
    unmount()
  })

  it('hides the floating player from the same preference the player reads', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    click(switchByLabel(container, t('music.mini_player')))
    expect(useMusic.getState().floatingVisible).toBe(false)
    unmount()
  })
})

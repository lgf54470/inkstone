import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { MusicHubToolbar } from './music-hub-toolbar'

const PROPS = {
  tracks: [],
  onUpload: vi.fn(),
  onBrowseWebdav: vi.fn(),
  onBrowseAlist: vi.fn(),
  onPodcasts: vi.fn(),
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function buttonLabels(): string[] {
  return [...document.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '')
}

function hasLabeledButton(label: string): boolean {
  return [...document.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === label)
}

let rendered: ReturnType<typeof renderElement> | null = null

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

// REF-2: the actions row is a rigid single line; a squeezing container folded
// the sort labels mid-character and deformed every button. Wide containers keep
// the full row, narrow ones fold the low-frequency actions into a "more" menu.
describe('hub toolbar fold strategy (REF-2)', () => {
  it('keeps the low-frequency actions inline on a wide container', () => {
    stubMatchMedia(true)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    const labels = buttonLabels()
    expect(labels).toContain(t('music.import_m3u'))
    expect(labels).toContain(t('music.import_text'))
    expect(labels).toContain(t('music.import_url'))
    expect(hasLabeledButton(t('music.refresh_metadata'))).toBe(true)
    expect(hasLabeledButton(t('music.more_actions'))).toBe(false)
  })

  it('folds the low-frequency actions into a more menu on a narrow container', () => {
    stubMatchMedia(false)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    const labels = buttonLabels()
    expect(labels).not.toContain(t('music.import_m3u'))
    expect(labels).not.toContain(t('music.import_text'))
    expect(labels).not.toContain(t('music.import_url'))
    expect(hasLabeledButton(t('music.refresh_metadata'))).toBe(false)
    expect(hasLabeledButton(t('music.more_actions'))).toBe(true)
    expect(labels).toContain(t('music.upload'))
    expect(labels).toContain(t('music.webdav_title'))
  })

  it('offers the folded actions as menu items and keeps the primary flows inline', () => {
    stubMatchMedia(false)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    const trigger = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === t('music.more_actions'),
    ) as HTMLButtonElement
    act(() => { trigger.click() })
    const menuLabels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim() ?? '')
    expect(menuLabels).toContain(t('music.import_m3u'))
    expect(menuLabels).toContain(t('music.import_text'))
    expect(menuLabels).toContain(t('music.import_url'))
    expect(menuLabels).toContain(t('music.refresh_metadata'))
    expect(menuLabels).toContain(t('music.metadata_force'))
    expect(menuLabels).toContain(t('music.match_covers'))
  })
})

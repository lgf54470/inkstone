import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { MusicHubToolbar, buildSourceFilterOptions } from './music-hub-toolbar'

const PROPS = {
  tracks: [],
  libraryTracks: [],
  onUpload: vi.fn(),
  onBrowseWebdav: vi.fn(),
  onBrowseAlist: vi.fn(),
  onBrowseServers: vi.fn(),
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

// REF-7: the fold decision has to read the toolbar's own container. The hub's centre
// column is ~760px wide even on a 1440px viewport (hub 1240 − sidebar 224 − now playing
// 256), so a viewport read left the rigid row unfolded exactly where it overflows, and
// folded it on maximised layouts that had room to spare.
const CENTRE_COLUMN_WIDTH = 760
const WIDE_CONTAINER_WIDTH = 1440

function stubContainerWidth(width: number): void {
  class Observer {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(): void {
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
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
    // FB-U2: this width is a phone's, so the primary flows are here too — named, without labels.
    expect(hasLabeledButton(t('music.upload'))).toBe(true)
    expect(hasLabeledButton(t('music.webdav_title'))).toBe(true)
  })

  it('offers the folded actions as menu items', () => {
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

// FB-F3: the row used to offer three fixed values while the library could hold five
// source kinds, so alist / external / provider rows had no way to be filtered to.
describe('hub toolbar source filter (FB-F3)', () => {
  it('offers a value per source the library actually holds', () => {
    expect(buildSourceFilterOptions([{ source: 'r2' }, { source: 'alist' }, { source: 'provider' }]))
      .toEqual(['all', 'r2', 'alist', 'provider'])
  })

  it('lists the sources in one canonical order, whatever order the rows came in', () => {
    expect(buildSourceFilterOptions([{ source: 'provider' }, { source: 'external' }, { source: 'r2' }]))
      .toEqual(['all', 'r2', 'external', 'provider'])
  })

  it('keeps the active filter on the row even when no track carries that source', () => {
    expect(buildSourceFilterOptions([{ source: 'r2' }], ['alist'])).toEqual(['all', 'r2', 'alist'])
  })

  it('paints the label of a source that reached the library', () => {
    stubMatchMedia(true)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, { ...PROPS, libraryTracks: [{ source: 'alist' }] })) })
    expect(buttonLabels()).toContain(t('music.source_alist'))
    expect(buttonLabels()).toContain(t('music.source_all'))
  })

  // FB-U2: the compact shape swaps the segmented row for a dropdown, and it draws the same list —
  // the filtering that FB-F3 fixed must not depend on which control the width chose.
  it('offers the same sources in the dropdown the compact shapes draw', () => {
    stubMatchMedia(false)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, { ...PROPS, libraryTracks: [{ source: 'alist' }, { source: 'r2' }] })) })
    expect(optionsOf(t('music.source_filter')))
      .toEqual([t('music.source_all'), t('music.source_r2'), t('music.source_alist')])
  })
})

// FB-U2: at 360–390px the row used to wrap into six lines — a 240px search box, a segmented source
// filter, the sort segments and four labelled buttons — and the header plus toolbar ate a third of a
// phone screen. One shape answers it: the search takes a row of its own, the two filters become
// dropdowns, the primary flows keep their name but drop their label, and everything low-frequency is
// one press away in the menu.
const selectLabels = (): string[] => [...document.querySelectorAll('select')]
  .map((select) => select.getAttribute('aria-label') ?? '')

const optionsOf = (label: string): string[] => [...document.querySelectorAll(`select[aria-label="${label}"] option`)]
  .map((option) => option.textContent ?? '')

const toolbarShapeAttr = (): string | null =>
  document.querySelector<HTMLElement>('[data-music-toolbar]')?.getAttribute('data-shape') ?? null

describe('hub toolbar on a phone-width container (FB-U2)', () => {
  it('stacks the search and answers both filters with a dropdown', () => {
    stubMatchMedia(false)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    expect(toolbarShapeAttr()).toBe('stacked')
    // The sort rides the search's row (it is 120px there) while the source filter leads the row
    // below it with the four primary flows, which is what keeps this to two rows at 360px.
    expect(selectLabels()).toEqual([t('music.sort'), t('music.source_filter')])
    // The segmented rows are what pushed the row into six lines; neither survives here.
    expect(document.querySelectorAll('[role="radiogroup"]')).toHaveLength(0)
  })

  it('keeps every primary flow one press away, named but without its label', () => {
    stubMatchMedia(false)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    for (const key of ['music.upload', 'music.webdav_title', 'music.alist_title', 'music.server_title', 'music.podcast_title'] as const) {
      expect(hasLabeledButton(t(key))).toBe(true)
      expect(buttonLabels()).not.toContain(t(key))
    }
  })
})

// FB-R3: a short viewport squeezes the same row from the other side. There the width is not the
// problem — spending a second row on it would be — so the controls compact while the row stays one.
describe('hub toolbar on a short viewport (FB-R3)', () => {
  it('compacts the controls without stacking the search', () => {
    stubMatchMedia(true)
    stubContainerWidth(1180)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, { ...PROPS, shortViewport: true })) })
    expect(toolbarShapeAttr()).toBe('compact')
    expect(selectLabels()).toEqual([t('music.source_filter'), t('music.sort')])
    expect(buttonLabels()).not.toContain(t('music.upload'))
    expect(hasLabeledButton(t('music.upload'))).toBe(true)
    // Nothing low-frequency stays inline at this height, even though the width would give it room.
    expect(hasLabeledButton(t('music.more_actions'))).toBe(true)
    expect(buttonLabels()).not.toContain(t('music.import_m3u'))
  })

  it('leaves a tall container of the same width alone', () => {
    stubMatchMedia(true)
    stubContainerWidth(1180)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    expect(toolbarShapeAttr()).toBe('inline')
    expect(selectLabels()).toEqual([])
    expect(buttonLabels()).toContain(t('music.upload'))
  })
})

describe('hub toolbar folds on the container width, not the viewport (REF-7)', () => {
  it('folds on a narrow container even when the viewport is wide', () => {
    stubMatchMedia(true)
    stubContainerWidth(CENTRE_COLUMN_WIDTH)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    expect(hasLabeledButton(t('music.more_actions'))).toBe(true)
    expect(buttonLabels()).not.toContain(t('music.import_m3u'))
  })

  it('keeps the actions inline on a wide container even when the viewport is narrow', () => {
    stubMatchMedia(false)
    stubContainerWidth(WIDE_CONTAINER_WIDTH)
    act(() => { rendered = renderElement(createElement(MusicHubToolbar, PROPS)) })
    expect(hasLabeledButton(t('music.more_actions'))).toBe(false)
    expect(buttonLabels()).toContain(t('music.import_m3u'))
  })
})

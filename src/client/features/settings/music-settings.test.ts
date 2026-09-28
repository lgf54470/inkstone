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
    providerSourceEnabled: {},
    providerSourceOrder: [],
    providerScope: 'all',
    providerQuality: 320,
    providerNoticeAccepted: false,
    showSourceBadge: true,
    crossfadeEnabled: false,
    eqEnabled: false,
    immersiveBackground: 'theme',
    lyricAlign: 'left',
    lyricTextSize: 'default',
    lyricSource: 'auto',
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

function selectByLabel(container: HTMLElement, label: string): HTMLSelectElement {
  const found = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)
  if (!found) throw new Error(`no select labelled ${label}`)
  return found
}

// FB-F13: the lookup's source is a preference, so it is chosen here rather than per press.
describe('music settings section · lyrics source', () => {
  it('offers the three sources and starts on the automatic one', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const select = selectByLabel(container, t('music.settings_lyric_source'))
    expect([...select.options].map((option) => option.value)).toEqual(['auto', 'lrclib', 'catalogue'])
    expect(select.value).toBe('auto')
    expect(container.textContent).toContain(t('music.settings_lyric_source_hint'))
    unmount()
  })

  it('writes the choice into the store the lookup reads', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const select = selectByLabel(container, t('music.settings_lyric_source'))
    act(() => {
      select.value = 'catalogue'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useMusic.getState().lyricSource).toBe('catalogue')
    unmount()
  })
})

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

// FB3-U3 + FB3-C2: the add-server form was drawn inside the group that already explains what a music
// server is, and said the same sentence again; and its two columns each sized their label to their own
// text, so the four inputs and the select sat on four different left edges. The explanation lives once,
// the form names the action instead, and the fields share one label column.
describe('music settings section · add server form (FB3-U3)', () => {
  it('explains what a music server is once, and the form names the action', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const text = container.textContent ?? ''
    expect(text.split(t('music.server_hint')).length - 1).toBe(1)
    expect(text).toContain(t('music.server_form_hint'))
    unmount()
  })

  it('puts every field on one shared label column', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const fields = [...container.querySelectorAll('[data-server-field]')]
    expect(fields).toHaveLength(5)
    expect(fields[0].parentElement?.className).toContain('grid-cols-[auto_1fr_auto_1fr]')
    for (const field of fields) {
      expect(field.className).toContain('col-span-2')
      expect(field.className).toContain('grid-cols-subgrid')
    }
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

// FB3-F2: the aggregate used to be one switch over five catalogues the reader could not see. This is
// the table they now hold: one row per catalogue, each with its own switch and its place in the ask
// order — and the order is not cosmetic, it is the merge order of a search answer and the order the
// switch-source candidates are ranked in.
describe('music settings section · the catalogue table (FB3-F2)', () => {
  const sourceRow = (container: HTMLElement, label: string): HTMLElement => {
    const row = [...container.querySelectorAll('li')].find((item) => item.textContent?.includes(label))
    if (!row) throw new Error(`no catalogue row for ${label}`)
    return row
  }

  const SOURCES = ['netease', 'kuwo', 'migu', 'qq', 'bilibili'] as const
  const labelOf = (source: string): string => t(`music.provider_source_${source}` as 'music.provider_source_netease')
  const moveUp = (container: HTMLElement, label: string): HTMLButtonElement => {
    const button = sourceRow(container, label).querySelector<HTMLButtonElement>(`button[aria-label="${t('music.source_move_up', { value0: label })}"]`)
    if (!button) throw new Error(`no move-earlier control for ${label}`)
    return button
  }

  it('draws one row per catalogue, in the shared order, with its own switch', () => {
    const { container, unmount } = render(createElement(MusicSettings))
    const rows = [...container.querySelectorAll('li')].filter((item) => item.querySelector('[role="switch"]'))
    const labels = SOURCES.map(labelOf)
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.textContent?.trim())).toEqual(labels)
    // The ends hold: the first catalogue cannot move earlier and the last cannot move later.
    expect(moveUp(container, labels[0]).disabled).toBe(true)
    expect(sourceRow(container, labels[4]).querySelector<HTMLButtonElement>(`button[aria-label="${t('music.source_move_down', { value0: labels[4] })}"]`)?.disabled).toBe(true)
    unmount()
  })

  it('switches one catalogue off, and drops a scope that named it', () => {
    // The per-catalogue switches sit behind the same acknowledgement as the aggregate one.
    useMusic.setState({ providerNoticeAccepted: true, providerScope: 'kuwo' })
    const { container, unmount } = render(createElement(MusicSettings))
    click(switchByLabel(container, t('music.provider_source_kuwo')))
    expect(useMusic.getState().providerSourceEnabled).toEqual({ kuwo: false })
    expect(useMusic.getState().providerScope).toBe('all')
    unmount()
  })

  it('moves a catalogue one place earlier', () => {
    useMusic.setState({ providerNoticeAccepted: true })
    const { container, unmount } = render(createElement(MusicSettings))
    click(moveUp(container, labelOf('migu')))
    expect(useMusic.getState().providerSourceOrder).toEqual(['netease', 'migu', 'kuwo', 'qq', 'bilibili'])
    unmount()
  })
})

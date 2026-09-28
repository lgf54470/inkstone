import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { act, createElement } from 'react'
import { t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { Fragment } from 'react'
import { useEscape } from '../../components/overlay'
import { SearchBox, SEARCH_DEBOUNCE_MS, SEARCH_HISTORY_SETTLE_MS } from './music-search-box'
import { useMusic } from './music-store'

let historyRendered: ReturnType<typeof renderElement> | null = null

afterEach(() => {
  act(() => historyRendered?.unmount())
  historyRendered = null
  document.body.innerHTML = ''
  vi.useRealTimers()
  useMusic.setState({ query: '', searchHistory: [], scope: { kind: 'all' }, tracks: [], playlists: [] })
})

function inputOf(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement
}

function typeText(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function pressEnter(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

describe('music search box debounce', () => {
  it('waits out the debounce window before touching the store', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'moon')
    expect(input.value).toBe('moon')
    expect(useMusic.getState().query).toBe('')

    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1) })
    expect(useMusic.getState().query).toBe('')

    act(() => { vi.advanceTimersByTime(1) })
    expect(useMusic.getState().query).toBe('moon')
    rendered.unmount()
  })

  it('collapses a burst of keystrokes into the final value only', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'm')
    typeText(input, 'mo')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 2) })
    typeText(input, 'moo')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })

    expect(useMusic.getState().query).toBe('moo')
    expect(input.value).toBe('moo')
    rendered.unmount()
  })
})

describe('music search box commit', () => {
  it('commits immediately on Enter and records the search history', () => {
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)

    typeText(input, 'moon')
    pressEnter(input)

    expect(useMusic.getState().query).toBe('moon')
    expect(useMusic.getState().searchHistory).toEqual(['moon'])
    rendered.unmount()
  })

  it('adopts a query changed from outside the box', () => {
    const rendered = renderElement(createElement(SearchBox))

    act(() => { useMusic.setState({ query: 'outside' }) })

    expect(inputOf(rendered.container).value).toBe('outside')
    rendered.unmount()
  })
})

function pressKey(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

function samplePlaylist(id: string, name: string, trackCount: number): MusicPlaylistDetail {
  return {
    id, name, trackCount, items: [], description: '', isPinned: false, isFavorite: false,
    shareSlug: null, coverUrl: null, sortOrder: 0, createdAt: 0, updatedAt: 0,
  }
}

function mountWithLibrary(): HTMLInputElement {
  act(() => {
    useMusic.setState({
      tracks: [
        { id: '1', title: 'Song 1', artist: 'Sun Yi', album: 'Sunrise', durationMs: 1000, isPinned: false },
        { id: '2', title: 'Song 2', artist: 'Moon', album: 'Sunset', durationMs: 1000, isPinned: false },
        { id: '3', title: 'Song 3', artist: 'Sun Yi', album: 'Morning', durationMs: 1000, isPinned: false },
      ] as MusicTrack[],
      playlists: [samplePlaylist('p1', 'Sunday Chill', 4)],
    })
  })
  historyRendered = renderElement(createElement(SearchBox))
  const input = inputOf(historyRendered.container)
  act(() => { input.focus() })
  return input
}

// The same box with a recorded history behind it: the popup's other shape, where its one action is the
// clear-history button.
function mountWithHistory(): HTMLInputElement {
  act(() => { useMusic.setState({ searchHistory: ['jazz', 'moon'] }) })
  historyRendered = renderElement(createElement(SearchBox))
  const input = inputOf(historyRendered.container)
  act(() => { input.focus() })
  return input
}

// UI-22: the history dropdown is a popup list attached to the input; without
// combobox semantics a screen-reader user cannot see it open or walk its rows.
describe('music search history combobox semantics', () => {

  it('wires the opened list to the input', () => {
    const input = mountWithHistory()
    const listbox = document.querySelector('[role="listbox"]') as HTMLElement | null
    expect(listbox).not.toBeNull()
    const options = [...listbox!.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['jazz', 'moon'])
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-controls')).toBe(listbox!.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('false')
  })

  // A11Y-6: a text-only button sat at its line height, well under the 24px a fingertip needs.
  it('gives the clear-history button a box a fingertip can hit', () => {
    mountWithHistory()
    const clear = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === t('music.search_clear_history')) as HTMLButtonElement
    expect(clear.classList.contains('min-h-6')).toBe(true)
  })

  it('walks the entries with the arrow keys and commits the highlighted one on Enter', () => {
    const input = mountWithHistory()
    const options = [...document.querySelectorAll('[role="option"]')]
    pressKey(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
    expect(options[0]?.getAttribute('aria-selected')).toBe('true')
    pressKey(input, 'ArrowDown')
    pressKey(input, 'ArrowUp')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id)
    pressKey(input, 'Enter')
    expect(useMusic.getState().query).toBe('jazz')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })
})

// FEA-A1-5 + FB3-C7: while typing, the jump targets into the library — artists, albums and playlists
// matching the words — used to be rows of this box's drop-down. They are drawn in the online panel now,
// beside the hits they lead to, because that drop-down hung over the panel's own first rows: the visual
// gate pressed a hit's tick and the press landed on the suggestion above it (the tick measured at x=297,
// the popup's box starting at x=298). The box's popup is the history, and only the history.
describe('the typed box has no drop-down of its own (FB3-C7)', () => {
  it('draws no popup while there are words in the box', () => {
    const input = mountWithLibrary()
    typeText(input, 'sun')
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })

  it('commits what was typed on Enter, because that is the way out of the box now', () => {
    const input = mountWithLibrary()
    typeText(input, 'sun')
    pressEnter(input)
    expect(useMusic.getState().query).toBe('sun')
  })

  it('leaves the scope to the panel rows, not to a keypress in the box', () => {
    const input = mountWithLibrary()
    typeText(input, 'sun')
    pressKey(input, 'ArrowDown')
    pressKey(input, 'Enter')
    expect(useMusic.getState().scope).toEqual({ kind: 'all' })
  })
})

// FB3-U1: the box's clear control used to run the history action — the one callback `clearAll` fed both
// the × in the input and the "clear history" row in the popup, so the × emptied the history and left the
// typed query exactly where it was. The two intents are their own controls now, and these cases read the
// one thing neither of them can fake: what the box shows and what the store holds afterwards.
function buttonByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')]
    .find((button) => button.getAttribute('aria-label') === label) as HTMLButtonElement | undefined
}

describe('music search box clear control (FB3-U1)', () => {
  it('empties the box and the store query, and leaves the history alone', () => {
    act(() => { useMusic.setState({ searchHistory: ['jazz'] }) })
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)
    typeText(input, 'moon')

    act(() => { buttonByLabel(t('music.search_clear'))?.click() })

    expect(input.value).toBe('')
    expect(useMusic.getState().query).toBe('')
    expect(useMusic.getState().searchHistory).toEqual(['jazz'])
    expect(document.querySelector('input')?.value).toBe('')
    rendered.unmount()
  })

  // FB3-U5: clearing and then having to click back into the box to see the history it just left behind is
  // the same gesture asked twice. The caret stays where it was, and the popup the box now answers with is
  // the history it did not touch.
  it('keeps the caret in the box and shows the untouched history afterwards', () => {
    const input = mountWithHistory()
    typeText(input, 'moon')

    act(() => { buttonByLabel(t('music.search_clear'))?.click() })

    expect(document.activeElement).toBe(input)
    expect(useMusic.getState().searchHistory).toEqual(['jazz', 'moon'])
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
  })

  // The other half of the split: the popup's own action still means what it says.
  it('still clears the history from the popup action, and only that', () => {
    mountWithHistory()
    const clear = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === t('music.search_clear_history'))

    act(() => { clear?.click() })

    expect(useMusic.getState().searchHistory).toEqual([])
  })
})

// FB2-U7: the popup drops over whatever sits below the box, and in the hub that is the online results
// panel — its switch, its heading and its selection bar. A press aimed at one of those controls used to
// land on the popup's frame instead, and vanish: the frame is inside the box, so the box's own
// outside-press rule never fired, and nothing on screen changed. The rows are the popup; the frame
// around them lets the pointer through to whatever the reader was aiming at.
describe('music search popup keeps only its rows for itself (FB2-U7)', () => {
  it('lets a press through its frame, and keeps the rows and their one action', () => {
    mountWithHistory()
    const listbox = document.querySelector('[role="listbox"]')
    expect(listbox?.parentElement?.className).toContain('pointer-events-none')
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options).toHaveLength(2)
    for (const option of options) expect(option.className).toContain('pointer-events-auto')
    const clear = [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === t('music.search_clear_history'))
    expect(clear?.className).toContain('pointer-events-auto')
  })
})

// FB2-U8: the box's own contract says Escape closes the popup. In the hub that was not true: the modal's
// escape stack runs the top of the stack and stops the event there, and the popup had never registered —
// so Escape closed the whole music library while the popup stayed up over it.
describe('music search popup takes Escape before the surface behind it (FB2-U8)', () => {
  it('closes the history popup on Escape and leaves the box as it was', () => {
    const input = mountWithHistory()
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(input.value).toBe('')
  })

  it('closes the popup rather than the surface that also listens for Escape', () => {
    const behind = vi.fn()
    // Mounted exactly the way the hub mounts it: the surface first, the box inside it after.
    act(() => { useMusic.setState({ searchHistory: ['sun'] }) })
    historyRendered = renderElement(createElement(Fragment, null,
      createElement(Behind, { onEscape: behind }),
      createElement(SearchBox),
    ))
    const input = inputOf(historyRendered.container)
    act(() => { input.focus() })
    expect(document.querySelector('[role="listbox"]')).not.toBeNull()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(behind).not.toHaveBeenCalled()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
  })
})

// The surface the box stands inside: nothing but an escape handler, which is what the hub's modal is to
// the box from Escape's point of view.
function Behind({ onEscape }: { onEscape: () => void }) {
  useEscape(true, onEscape)
  return null
}

// FB3-F5: the history was written only when Enter confirmed a query, could only be emptied whole, and
// its title read differently in the two languages. A search the reader actually looked at is a search
// they may want back; one of their own rows is theirs to drop.
describe('music search history completeness (FB3-F5)', () => {
  it('records a query the reader settled on, without needing a commitment', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)
    typeText(input, 'moon')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + SEARCH_HISTORY_SETTLE_MS) })
    expect(useMusic.getState().searchHistory).toEqual(['moon'])
    rendered.unmount()
    vi.useRealTimers()
  })

  it('keeps a single letter out of it, because that is typing and not a search', () => {
    vi.useFakeTimers()
    const rendered = renderElement(createElement(SearchBox))
    typeText(inputOf(rendered.container), 'm')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + SEARCH_HISTORY_SETTLE_MS) })
    expect(useMusic.getState().searchHistory).toEqual([])
    rendered.unmount()
    vi.useRealTimers()
  })

  it('lets one entry go without clearing the rest', () => {
    const input = mountWithHistory()
    expect(input.value).toBe('')
    const remove = [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === t('music.search_remove_entry', { value0: 'jazz' }))
    expect(remove).toBeDefined()
    act(() => { (remove as HTMLButtonElement).click() })
    expect(useMusic.getState().searchHistory).toEqual(['moon'])
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1)
  })
})

// FB3-F8 + FB3-C7: the catalogue's answer to the words in the box is drawn with the hits — in the online
// panel — and its rows are the panel's own (see music-provider-results.test.ts). The box draws no
// suggestion rows at all any more, which is what this reads from the box's side.
describe('the catalogue answer is not a row of this popup (FB3-C7)', () => {
  const hit = (sourceId: string, title: string) => ({
    provider: 'gds', source: 'netease', sourceId, title, artist: 'Ann', album: '', durationMs: null, coverId: null, lyricId: null,
  })

  it('draws no popup even when the catalogue has answered the words in the box', () => {
    vi.useFakeTimers()
    useMusic.setState({ providerResults: [hit('b9', 'Echo Beach')], providerKeywords: 'echo' })
    const rendered = renderElement(createElement(SearchBox))
    const input = inputOf(rendered.container)
    act(() => { input.focus() })
    typeText(input, 'echo')
    act(() => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS) })
    expect(document.querySelector('[role="option"]')).toBeNull()
    rendered.unmount()
  })
})

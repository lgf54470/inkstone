import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicTrackList } from './music-track-list'
import { SEARCH_RESULT_LIMIT } from './music-search'
import { useMusic, useVisibleTracks } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

function track(id: string, title: string, artist: string): MusicTrack {
  return {
    id,
    title,
    artist,
    album: '',
    durationMs: 1000,
    source: 'r2',
    format: 'mp3',
    webdavPath: null,
    mime: 'audio/mpeg',
    sizeBytes: 0,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null, contentHash: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const tracks = [track('t1', 'Alpha', 'Zoe'), track('t2', 'Beta', 'Ann')]

let root: Root | null = null

async function mountList(list: MusicTrack[] = tracks): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackList, { tracks: list, loading: false, emptyTitle: 'x', onEdit: () => {} }))
  })
}

// A windowed list has to be read where the hub reads it: the page holds the capped list it asked the
// store for (`useVisibleTracks`), and a raw array prop is the caller's own list, not the library's —
// so the budget is invisible down that path and those cases would pass on any implementation.
function StoreList(): ReturnType<typeof createElement> {
  const visible = useVisibleTracks()
  return createElement(MusicTrackList, { tracks: visible, loading: false, emptyTitle: 'x', onEdit: () => {} })
}

async function mountStoreList(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(StoreList))
  })
}

// jsdom has neither a measurement nor a media query, and this file's subject is the table a wide
// centre column draws: the premise is set once here. FB-U4's own describe stubs the measured box,
// which is the answer the component actually reads.
function stubColumnsWide(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function stubMeasuredWidth(width: number): void {
  vi.stubGlobal('ResizeObserver', class {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(): void {
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve(): void {}
    disconnect(): void {}
  })
}

function headerRow(): Element {
  return document.querySelector('[role="rowgroup"]')?.parentElement?.firstElementChild ?? document.querySelectorAll('[role="row"]')[0]
}

function headerButton(label: string): HTMLButtonElement | undefined {
  return [...headerRow().querySelectorAll('button')].find((button) => button.textContent?.includes(label)) as HTMLButtonElement | undefined
}

function columnheaderOf(label: string): Element | undefined {
  return [...headerRow().querySelectorAll('[role="columnheader"]')].find((cell) => cell.textContent?.includes(label))
}

beforeEach(() => {
  stubColumnsWide()
  useMusic.setState({
    tracks,
    tags: [],
    playlists: [],
    scope: { kind: 'all' },
    query: '',
    sort: 'recent',
    sortDirection: 'asc',
    viewMode: 'list',
    // The subject here is the table, so the premise says the reader picked it: FB-R1's narrow
    // default only applies to a view nobody has chosen, and reading the rows is that choice.
    viewModeChosen: true,
    sourceFilter: 'all',
    selectedIds: [],
    romanized: {},
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null, matchLimit: SEARCH_RESULT_LIMIT })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// FB-U4: the artist / album / source columns were CSS media queries over the viewport, so a
// maximised hub and a windowed one on the same screen both answered a question about the screen
// rather than about the centre column these columns live in. The density is that column's own
// answer, and when the columns go the row owes the reader what they carried — artist, album and
// source move onto the line under the title instead of disappearing.
describe('table column density (FB-U4)', () => {
  const denseTracks = [{ ...track('t9', 'Alpha', 'Zoe'), album: 'Nightfall' }]

  async function mountDense(): Promise<void> {
    useMusic.setState({ tracks: denseTracks })
    await mountList(denseTracks)
  }

  function firstRow(): Element {
    return document.querySelectorAll('[role="rowgroup"] > [role="row"]')[0]!
  }

  function cellsReading(text: string): Element[] {
    return [...firstRow().querySelectorAll('[role="cell"]')].filter((cell) => cell.textContent === text)
  }

  it('draws the columns when the box has room for them', async () => {
    stubMeasuredWidth(1000)
    await mountDense()
    expect(columnheaderOf(t('music.table_artist'))).toBeDefined()
    expect(columnheaderOf(t('music.table_album'))).toBeDefined()
    expect(cellsReading('Nightfall')).toHaveLength(1)
  })

  it('moves them onto the row when it does not', async () => {
    stubMeasuredWidth(700)
    await mountDense()
    expect(columnheaderOf(t('music.table_artist'))).toBeUndefined()
    expect(columnheaderOf(t('music.table_album'))).toBeUndefined()
    expect(cellsReading('Nightfall')).toHaveLength(0)
    expect(firstRow().textContent).toContain('Nightfall')
    expect(firstRow().textContent).toContain('Zoe')
    expect(firstRow().textContent).toContain(t('music.source_r2'))
  })
})

// FB3-C9: the box the list measures is the one its rows are drawn in, and that box does not exist
// while the list is still showing a loading state — a list that mounted on that state and attached its
// measurement once would never see the box, and every read after that came from the viewport fallback.
// Measured in the running hub: a 1060px window whose centre column was 538px drew the full 572px-wide
// table, i.e. a row wider than the column it was in. The premise here is the state the gate read: the
// viewport says the columns fit, the box says they do not.
describe('the list folds by the box its rows land in (FB3-C9)', () => {
  const oneTrack = [{ ...track('t9', 'Alpha', 'Zoe'), album: 'Nightfall' }]

  async function mountThenFill(): Promise<void> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicTrackList, { tracks: [], loading: true, emptyTitle: 'x', onEdit: () => {} }))
    })
    useMusic.setState({ tracks: oneTrack })
    await act(async () => {
      root?.render(createElement(MusicTrackList, { tracks: oneTrack, loading: false, emptyTitle: 'x', onEdit: () => {} }))
    })
  }

  it('reads the box that arrives with the rows, not the viewport that was there first', async () => {
    // The viewport would draw all three columns; only the measured box says to move them onto the row.
    stubColumnsWide()
    stubMeasuredWidth(520)
    useMusic.setState({ viewMode: 'list', viewModeChosen: true })
    await mountThenFill()
    expect(columnheaderOf(t('music.table_artist'))).toBeUndefined()
    expect(columnheaderOf(t('music.table_album'))).toBeUndefined()
    expect(document.querySelector('[role="rowgroup"] > [role="row"]')?.textContent).toContain('Nightfall')
  })
})

describe('table header sorting', () => {
  it('clicking the title header sorts ascending, clicking again descending', async () => {
    await mountList()
    const button = headerButton(t('music.table_title'))
    expect(button).toBeDefined()
    await act(async () => {
      button?.click()
    })
    expect(useMusic.getState().sort).toBe('title')
    expect(useMusic.getState().sortDirection).toBe('asc')
    expect(columnheaderOf(t('music.table_title'))?.getAttribute('aria-sort')).toBe('ascending')
    await act(async () => {
      headerButton(t('music.table_title'))?.click()
    })
    expect(useMusic.getState().sort).toBe('title')
    expect(useMusic.getState().sortDirection).toBe('desc')
    expect(columnheaderOf(t('music.table_title'))?.getAttribute('aria-sort')).toBe('descending')
  })


  it('the artist column sorts by artist', async () => {
    await mountList()
    const button = headerButton(t('music.table_artist'))
    expect(button).toBeDefined()
    await act(async () => {
      button?.click()
    })
    expect(useMusic.getState().sort).toBe('artist')
  })

  it('idle sortable columns advertise aria-sort none', async () => {
    await mountList()
    expect(columnheaderOf(t('music.table_duration'))?.getAttribute('aria-sort')).toBe('none')
  })

  it('playlist scope offers no header sorting because the item order is manual', async () => {
    useMusic.setState({ scope: { kind: 'playlist', playlistId: 'p1' } })
    await mountList()
    expect(headerRow().querySelectorAll('button')).toHaveLength(0)
    expect(headerRow().querySelectorAll('[aria-sort]')).toHaveLength(0)
  })
})

describe('source column wrapping contract (UI-15)', () => {
  function sourceCell(): Element | undefined {
    const row = document.querySelectorAll('[role="rowgroup"] > [role="row"]')[0]
    return [...(row?.children ?? [])].find((cell) => cell.querySelector('span[title]')) ?? undefined
  }

  function badge(): Element | undefined {
    return sourceCell()?.querySelector('span[title]') ?? undefined
  }

  it('keeps the source badge on a single line', async () => {
    await mountList()
    const label = badge()
    expect(label?.textContent).toBe(t('music.source_r2'))
    expect(label?.classList.contains('whitespace-nowrap')).toBe(true)
  })

  // The longest label ("Cloud (R2)") has to fit the cell the header also uses;
  // 4rem clipped it, so both sides take the wider budget together.
  it('gives the header and the rows the same width for that column', async () => {
    await mountList()
    const header = columnheaderOf(t('music.source'))
    const cell = sourceCell()
    expect(header?.classList.contains('w-24')).toBe(true)
    expect(cell?.classList.contains('w-24')).toBe(true)
    expect(cell?.classList.contains('shrink-0')).toBe(true)
  })
})

describe('table ARIA structure', () => {
  it('rows expose a cell per column instead of bare spans', async () => {
    await mountList()
    const firstRow = document.querySelectorAll('[role="rowgroup"] > [role="row"]')[0]
    expect(firstRow).toBeDefined()
    const childRoles = [...firstRow.children].map((child) => child.getAttribute('role'))
    expect(childRoles.every((role) => role === 'cell')).toBe(true)
    const headerCells = [...headerRow().children]
    expect(headerCells).toHaveLength(firstRow.children.length)
  })

  it('every columnheader is readable, and the icon-only ones hide instead of going unroled', async () => {
    await mountList()
    const headerCells = [...headerRow().children]
    // A row's children must all be cells; a roleless span leaves the row malformed. The three
    // columns with nothing readable keep the role and hide themselves from the a11y tree, so
    // the grid is legal without announcing empty headers (axe empty-table-header).
    expect(headerCells.every((cell) => cell.getAttribute('role') === 'columnheader')).toBe(true)
    const hidden = headerCells.filter((cell) => cell.getAttribute('aria-hidden') === 'true')
    expect(hidden).toHaveLength(3)
    for (const cell of headerCells.filter((child) => child.getAttribute('aria-hidden') !== 'true')) {
      expect(cell.textContent?.trim() || cell.querySelector('input[aria-label]')).toBeTruthy()
    }
    // aria-multiselectable is not allowed on role='table'; selection is carried per row checkbox.
    expect(document.querySelector('[role="table"]')?.getAttribute('aria-multiselectable')).toBeNull()
  })
})

// IMP-3: a windowed list must keep painting the rows near the playhead while the
// DOM stays bounded, and the numbers a reader announces must describe the whole list.
describe('the track table window (IMP-3)', () => {
  function manyTracks(count: number): MusicTrack[] {
    return Array.from({ length: count }, (_, index) => track(`t-${String(index).padStart(3, '0')}`, `Track ${index}`, 'Artist'))
  }

  async function mountLargeList(count: number): Promise<void> {
    const list = manyTracks(count)
    useMusic.setState({ tracks: list })
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicTrackList, { tracks: list, loading: false, emptyTitle: 'x', onEdit: () => {} }))
    })
  }

  function renderedRows(): string[] {
    return [...document.querySelectorAll('[role="rowgroup"] > [role="row"]')].map((row) => row.textContent ?? '')
  }

  it('renders every row while the list is small', async () => {
    await mountList()
    expect(renderedRows()).toHaveLength(2)
    expect(document.querySelector('[role="table"]')?.getAttribute('aria-rowcount')).toBe('2')
  })

  it('renders a bounded window for a large list and moves it on scroll', async () => {
    await mountLargeList(500)
    const table = document.querySelector('[role="table"]')
    expect(table?.getAttribute('aria-rowcount')).toBe('500')
    const before = renderedRows()
    expect(before.length).toBeLessThan(500)
    expect(before.some((text) => text.includes('Track 0'))).toBe(true)

    const group = document.querySelector('[role="rowgroup"]')
    act(() => {
      group!.scrollTop = 300 * 48
      group!.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    const after = renderedRows()
    expect(after.length).toBeLessThan(500)
    expect(after.some((text) => text.includes('Track 0'))).toBe(false)
    expect(after.some((text) => text.includes('Track 290'))).toBe(true)
  })
})
// REF-4: the track list carried its metadata at 11px and its titles at 12.5px, which
// read as a shrunken table inside a window that had room to spare. The body columns now
// sit on the same baseline the rest of the app uses.
describe('MusicTrackList type scale (REF-4)', () => {
  function rowCells(): HTMLElement[] {
    return [...document.querySelectorAll('[role="rowgroup"] > [role="row"] [role="cell"]')] as HTMLElement[]
  }

  function cellClasses(): string {
    return rowCells().map((cell) => cell.className).join(' ')
  }

  it('keeps the metadata columns at the body size instead of 11px', async () => {
    await mountList()
    expect(rowCells().length).toBeGreaterThan(0)
    expect(cellClasses()).toContain('--text-12')
    expect(cellClasses()).not.toContain('--text-11')
  })

  it('sets the row title one step above the body size', async () => {
    await mountList()
    const title = [...document.querySelectorAll('[role="rowgroup"] > [role="row"] span')]
      .find((node) => node.className.includes('font-medium')) as HTMLElement
    expect(title.className).toContain('--text-13')
  })
})

// FB-PF2: the header's "matches left out" notice now carries the way to see them — the cap is the
// reader's own, and the button and the notice read the same budget out of the store.
describe('match limit action (FB-PF2)', () => {
  const many = Array.from({ length: SEARCH_RESULT_LIMIT + 10 }, (_, index) => track(`m${index}`, `moonlight ${index}`, 'Zoe'))

  function loadMoreButton(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')]
      .find((node) => node.textContent === t('music.load_more_matches')) as HTMLButtonElement | undefined
  }

  // FB-PF4: the table windows its rows, so an unfiltered library costs it a window; the grid
  // mounts a card per row, and until this budget reached it too, opening the grid on a library
  // nobody had searched mounted every card it had — the search-only cap was the whole guard.
  function gridCards(): number {
    return document.querySelector('div.grid.grid-cols-2')?.children.length ?? 0
  }

  it('mounts one page of cards for a library nobody searched', async () => {
    useMusic.setState({ tracks: many, query: '', viewMode: 'grid', viewModeChosen: true, romanized: {} })
    await mountStoreList()
    expect(gridCards()).toBe(SEARCH_RESULT_LIMIT)
    const button = loadMoreButton()
    expect(button).toBeTruthy()
    await act(async () => { button?.click() })
    expect(useMusic.getState().matchLimit).toBe(SEARCH_RESULT_LIMIT * 2)
    expect(gridCards()).toBe(many.length)
  })

  it('offers the remainder instead of only counting it', async () => {
    useMusic.setState({ tracks: many, query: 'moonlight', viewMode: 'grid', viewModeChosen: true, romanized: {} })
    await mountList(many)
    const button = loadMoreButton()
    expect(button).toBeTruthy()
    expect(useMusic.getState().matchLimit).toBe(SEARCH_RESULT_LIMIT)
    await act(async () => { button?.click() })
    expect(useMusic.getState().matchLimit).toBe(SEARCH_RESULT_LIMIT * 2)
    expect(loadMoreButton()).toBeUndefined()
  })
})

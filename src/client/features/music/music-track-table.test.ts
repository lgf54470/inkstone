import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicTrackList } from './music-track-list'
import { useMusic } from './music-store'

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

async function mountList(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackList, { tracks, loading: false, emptyTitle: 'x', onEdit: () => {} }))
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
  useMusic.setState({
    tracks,
    tags: [],
    playlists: [],
    scope: { kind: 'all' },
    query: '',
    sort: 'recent',
    sortDirection: 'asc',
    viewMode: 'list',
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
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null })
  vi.restoreAllMocks()
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

  it('every columnheader is readable and icon-only columns stay unroled spacers', async () => {
    await mountList()
    const headerCells = [...headerRow().children]
    // Artwork, favourite and menu columns carry nothing a screen reader could read, so they
    // align through an empty spacer rather than an empty columnheader (axe empty-table-header).
    const spacers = headerCells.filter((cell) => !cell.getAttribute('role'))
    expect(spacers).toHaveLength(3)
    for (const cell of headerCells.filter((child) => child.getAttribute('role') === 'columnheader')) {
      expect(cell.textContent?.trim() || cell.querySelector('input[aria-label]')).toBeTruthy()
    }
    // aria-multiselectable is not allowed on role='table'; selection is carried per row checkbox.
    expect(document.querySelector('[role="table"]')?.getAttribute('aria-multiselectable')).toBeNull()
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicHubToolbar } from './music-hub-toolbar'
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

function track(id: string): MusicTrack {
  return {
    id,
    title: id,
    artist: '',
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

const tracks = [track('t1'), track('t2')]

let root: Root | null = null

async function mount(element: Parameters<Root['render']>[0]): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
  return container
}

// UI-16's segmented controls are the shape a *wide* toolbar draws: FB-U2 answers a phone's width with
// dropdowns instead (pinned in `music-hub-toolbar.test.ts`), so a test about the segments has to say
// which toolbar it is reading. Without this the jsdom default — no measured container, a viewport that
// reports nothing — is the narrow answer, and the source filter is a select.
function stubWideToolbar(): void {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function radioIn(group: Element, label: string): HTMLButtonElement {
  return [...group.querySelectorAll('[role="radio"]')].find((radio) => radio.textContent?.includes(label)) as HTMLButtonElement
}

function tabbableCount(group: Element): number {
  return [...group.querySelectorAll('[role="radio"]')].filter((radio) => radio.getAttribute('tabindex') === '0').length
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
  vi.unstubAllGlobals()
})

describe('view mode toggle (UI-16)', () => {
  async function mountList(): Promise<HTMLElement> {
    return mount(createElement(MusicTrackList, { tracks, loading: false, emptyTitle: 'x' }))
  }

  function group(container: HTMLElement): Element {
    return container.querySelector(`[role="radiogroup"][aria-label="${t('music.view_mode')}"]`) as Element
  }

  it('names the group by what it controls, not by one of its options', async () => {
    const container = await mountList()
    expect(group(container)).toBeTruthy()
    // The old hand-written group stole 'List view' as its name; it must not exist twice.
    const stale = [...container.querySelectorAll('[role="radiogroup"]')].filter((node) => node !== group(container))
    expect(stale.every((node) => node.getAttribute('aria-label') !== t('music.view_list'))).toBe(true)
  })

  it('keeps exactly one tab stop in the group', async () => {
    const container = await mountList()
    expect(tabbableCount(group(container))).toBe(1)
  })

  it('an arrow key moves the selection and the focus', async () => {
    const container = await mountList()
    const list = radioIn(group(container), t('music.view_list'))
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(useMusic.getState().viewMode).toBe('grid')
    await act(async () => {
      radioIn(group(container), t('music.view_grid')).focus()
      radioIn(group(container), t('music.view_grid')).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(useMusic.getState().viewMode).toBe('list')
  })
})

// FB-R1: a narrow list opens as covers until the reader says otherwise. The measurement is the
// list's own box (the same read the columns use), and what it writes is a default — a view chosen
// by hand is never overruled by a later mount, and a wide list keeps rows where they read better.
describe('narrow default view (FB-R1)', () => {
  // The shape is a prop the hub hands down (it is the one that knows its own box); the list does not
  // read the viewport for it, so this file states the shape instead of stubbing a measurement.
  function mountList(narrow: boolean): Promise<HTMLElement> {
    return mount(createElement(MusicTrackList, { tracks, loading: false, emptyTitle: 'x', narrow }))
  }

  function cards(): Element | null {
    return document.querySelector('div.grid-cols-2')
  }

  function toggleGroup(container: HTMLElement): Element {
    return container.querySelector(`[role="radiogroup"][aria-label="${t('music.view_mode')}"]`) as Element
  }

  it('opens a narrow list as covers when nothing has been chosen', async () => {
    useMusic.setState({ viewMode: 'list', viewModeChosen: false })
    await mountList(true)
    expect(useMusic.getState().viewMode).toBe('grid')
    expect(cards()).toBeTruthy()
  })

  it('leaves a chosen view alone', async () => {
    useMusic.setState({ viewMode: 'list', viewModeChosen: true })
    await mountList(true)
    expect(useMusic.getState().viewMode).toBe('list')
    expect(cards()).toBeNull()
  })

  // The centre column of a windowed hub is narrower than the breakpoint and still wants rows: the
  // question is the hub's own shape, which is why a wide hub asks for nothing.
  it('keeps rows for a wide list, whose centre column may still be narrow', async () => {
    useMusic.setState({ viewMode: 'grid', viewModeChosen: false })
    await mountList(false)
    expect(useMusic.getState().viewMode).toBe('list')
  })

  it('marks the view as chosen the moment a person picks one', async () => {
    useMusic.setState({ viewMode: 'list', viewModeChosen: false })
    const container = await mountList(true)
    await act(async () => {
      radioIn(toggleGroup(container), t('music.view_list')).click()
    })
    expect(useMusic.getState().viewModeChosen).toBe(true)
    expect(useMusic.getState().viewMode).toBe('list')
  })
})

describe('source filter (UI-16)', () => {
  function group(container: HTMLElement): Element {
    return container.querySelector(`[role="radiogroup"][aria-label="${t('music.source_filter')}"]`) as Element
  }

  it('keeps exactly one tab stop and selects on click', async () => {
    useMusic.setState({ sourceFilter: 'all' })
    stubWideToolbar()
    const container = await mount(createElement(MusicHubToolbar, {
      tracks: [], libraryTracks: [{ source: 'r2' }, { source: 'alist' }],
      onUpload: () => {}, onBrowseWebdav: () => {}, onBrowseAlist: () => {}, onBrowseServers: () => {}, onPodcasts: () => {},
    }))
    expect(group(container)).toBeTruthy()
    expect(tabbableCount(group(container))).toBe(1)
    await act(async () => {
      radioIn(group(container), t('music.source_r2')).click()
    })
    expect(useMusic.getState().sourceFilter).toBe('r2')
    expect(tabbableCount(group(container))).toBe(1)
  })

  // FB-F3: a reference source that is in the library has to be reachable from the filter.
  it('reaches a reference source the library holds', async () => {
    useMusic.setState({ sourceFilter: 'all' })
    stubWideToolbar()
    const container = await mount(createElement(MusicHubToolbar, {
      tracks: [], libraryTracks: [{ source: 'r2' }, { source: 'alist' }],
      onUpload: () => {}, onBrowseWebdav: () => {}, onBrowseAlist: () => {}, onBrowseServers: () => {}, onPodcasts: () => {},
    }))
    await act(async () => {
      radioIn(group(container), t('music.source_alist')).click()
    })
    expect(useMusic.getState().sourceFilter).toBe('alist')
  })
})

describe('sort control while browsing groups (M-50)', () => {
  function mountToolbar(): Promise<HTMLElement> {
    return mount(createElement(MusicHubToolbar, {
      tracks: [], libraryTracks: [],
      onUpload: () => {}, onBrowseWebdav: () => {}, onBrowseAlist: () => {}, onBrowseServers: () => {}, onPodcasts: () => {},
    }))
  }

  it('hides the track sort control while a grouped grid is open', async () => {
    useMusic.setState({ scope: { kind: 'albums' } })
    const container = await mountToolbar()
    expect(container.querySelector(`[aria-label="${t('music.sort')}"]`)).toBeNull()
  })

  it('keeps it in the ordinary library scope', async () => {
    const container = await mountToolbar()
    expect(container.querySelector(`[aria-label="${t('music.sort')}"]`)).toBeTruthy()
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicWebdavEntry } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicTrackList } from './music-track-list'
import { MusicWebdavModal } from './music-webdav-modal'
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

let root: Root | null = null

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
}

function buttonWithText(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(label)) as HTMLButtonElement | undefined
}

function emptyList() {
  return createElement(MusicTrackList, { tracks: [], loading: false, emptyTitle: 'library is empty', onEdit: () => {} })
}

function webdavState(overrides: Partial<{ error: string | null; entries: MusicWebdavEntry[] }> = {}) {
  return {
    loading: false,
    configured: true,
    dir: '/srv/music',
    directory: '',
    path: 'jazz',
    entries: [],
    truncated: false,
    error: null,
    importingPaths: [],
    ...overrides,
  }
}

beforeEach(() => {
  useMusic.setState({
    tracks: [],
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
    webdav: webdavState(),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null })
  vi.restoreAllMocks()
})

describe('empty search results (UI-10)', () => {
  // FB3-U8: the action reads as what it does now — showing the whole library again — instead of wearing
  // the name the box's × carries.
  it('offers showing the whole library instead of the upload pitch when a query found nothing', async () => {
    useMusic.setState({ query: 'zzznope' })
    await mount(emptyList())
    expect(document.body.textContent).toContain(t('music.no_results'))
    expect(document.body.textContent).not.toContain(t('music.no_tracks_hint'))
    await act(async () => {
      buttonWithText(t('music.search_show_all'))?.click()
    })
    expect(useMusic.getState().query).toBe('')
  })

  it('keeps the upload hint when the library genuinely has no tracks', async () => {
    await mount(emptyList())
    expect(document.body.textContent).toContain(t('music.no_tracks_hint'))
    expect(document.body.textContent).not.toContain(t('music.no_results'))
  })
})

describe('webdav browse failure (UI-11)', () => {
  it('reports the failure with a retry instead of an empty directory', async () => {
    const browse = vi.fn().mockResolvedValue(undefined)
    useMusic.setState({ webdav: webdavState({ error: 'server said no' }), browseWebdav: browse })
    await mount(createElement(MusicWebdavModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain(t('music.webdav_failed'))
    expect(document.body.textContent).not.toContain(t('music.webdav_empty'))
    await act(async () => {
      buttonWithText(t('common.retry'))?.click()
    })
    expect(browse).toHaveBeenCalledWith('jazz')
  })

  it('shows the empty directory message only when the listing came back empty', async () => {
    await mount(createElement(MusicWebdavModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain(t('music.webdav_empty'))
    expect(document.body.textContent).not.toContain(t('music.webdav_failed'))
  })

  it('lets the keyboard scroll a long folder listing (UI-17)', async () => {
    const entry: MusicWebdavEntry = { name: 'a.mp3', path: 'jazz/a.mp3', isDirectory: false, sizeBytes: 1024, mime: 'audio/mpeg', modifiedAt: null }
    useMusic.setState({ webdav: webdavState({ entries: [entry] }) })
    await mount(createElement(MusicWebdavModal, { open: true, onClose: () => {} }))
    const list = document.querySelector('ul.overflow-y-auto') as HTMLElement | null
    expect(list).not.toBeNull()
    expect(list?.getAttribute('tabindex')).toBe('0')
    expect(list?.getAttribute('aria-label')).toBe(t('music.webdav_title'))
  })
})

// FB3-U4 + FB3-U8: a search that matched nothing in the library is not a search that found nothing —
// with the online panel listing five hits right above it, "no matching tracks" reads as the whole
// screen's verdict, and the action under it carried the same words as the × in the box.
describe('music search empty state wording (FB3-U4)', () => {
  const ONLINE_HIT = {
    provider: 'gds', source: 'netease', sourceId: '1', title: 'Origin', artist: 'Alice',
    album: 'Debut', durationMs: 214_000, coverId: null, lyricId: null,
  }

  it('says the library has nothing, and names the online matches above it', async () => {
    useMusic.setState({ query: 'zzzz', providerResults: [ONLINE_HIT, { ...ONLINE_HIT, sourceId: '2' }] })
    await mount(createElement(MusicTrackList, { tracks: [], loading: false, emptyTitle: 'library is empty', onEdit: () => {} }))
    expect(document.body.textContent).toContain(t('music.search_results', { value0: 'zzzz' }))
    expect(document.body.textContent).toContain(t('music.no_results_online', { value0: 2 }))
    expect(document.body.textContent).not.toContain('library is empty')
  })

  it('gives its action a name of its own, not the clear control’s', async () => {
    useMusic.setState({ query: 'zzzz', providerResults: [] })
    await mount(createElement(MusicTrackList, { tracks: [], loading: false, emptyTitle: 'library is empty', onEdit: () => {} }))
    const action = buttonWithText(t('music.search_show_all'))
    expect(action).toBeDefined()
    expect(buttonWithText(t('music.search_clear'))).toBeUndefined()
  })

  it('does not promise online matches the panel is not showing', async () => {
    useMusic.setState({ query: 'zzzz', providerResults: null })
    await mount(createElement(MusicTrackList, { tracks: [], loading: false, emptyTitle: 'library is empty', onEdit: () => {} }))
    expect(document.body.textContent).not.toContain(t('music.no_results_online', { value0: 0 }))
    expect(document.body.textContent).toContain(t('music.search_results', { value0: 'zzzz' }))
  })
})

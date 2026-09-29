import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { ConfirmHost } from '../../components/overlay'
import { MusicTrackList } from './music-track-list'
import { lyricSubmenu, MusicTrackMenuHost } from './music-track-menu'
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

function track(id: string, title: string): MusicTrack {
  return {
    id,
    title,
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

const tracks = [track('t1', 'Alpha'), track('t2', 'Beta')]

let root: Root | null = null

// The menu is one instance for the whole app, mounted by the shell rather than by the list — the
// immersive player and the queue open the same one. This fixture mounts it the same way the shell
// does, so what these reads are about stays the menu and not who renders it.
async function mountList(rows: MusicTrack[] = tracks): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(Fragment, null, createElement(ConfirmHost), createElement(MusicTrackMenuHost), createElement(MusicTrackList, { tracks: rows, loading: false, emptyTitle: 'x' })))
  })
}

function byText(scope: ParentNode, label: string): HTMLElement | undefined {
  return [...scope.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label)
}

function menuButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll('button')].filter((button) => button.getAttribute('aria-label') === t('music.open_menu'))
}

function menuItem(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"]')]
    .find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined
}

function openMenus(): number {
  return document.querySelectorAll('[role="menu"]').length
}

beforeEach(() => {
  useMusic.setState({
    tracks,
    tags: [],
    playlists: [],
    scope: { kind: 'all' },
    query: '',
    sort: 'title',
    viewMode: 'list',
    sourceFilter: 'all',
    selectedIds: [],
    romanized: {},
    queue: [],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
    playCollection: vi.fn(async () => {}),
    addToQueue: vi.fn(),
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null })
  vi.restoreAllMocks()
})

describe('track menu singleton opening', () => {
  it('opens through the store with the clicked button as anchor', async () => {
    await mountList()
    const buttons = menuButtons()
    expect(buttons).toHaveLength(2)
    await act(async () => {
      buttons[1]?.click()
    })
    const menu = useMusic.getState().trackMenu
    expect(menu?.target.track.id).toBe('t2')
    expect(menu?.anchor).toBe(buttons[1])
    expect(openMenus()).toBe(1)
  })

  it('opening another row replaces the previous menu instead of stacking', async () => {
    await mountList()
    const buttons = menuButtons()
    await act(async () => {
      buttons[1]?.click()
    })
    await act(async () => {
      buttons[0]?.click()
    })
    expect(openMenus()).toBe(1)
    expect(useMusic.getState().trackMenu?.target.track.id).toBe('t1')
  })

  it('a right click anchors the menu at the pointer', async () => {
    await mountList()
    const row = document.querySelectorAll('[role="row"]')[2]
    expect(row).toBeDefined()
    await act(async () => {
      row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 }))
    })
    const menu = useMusic.getState().trackMenu
    expect(menu?.target.track.id).toBe('t2')
    expect(menu?.anchor).toEqual({ x: 40, y: 50 })
    expect(openMenus()).toBe(1)
  })
})

describe('track menu singleton items', () => {
  it('running an item closes the store-held menu and calls the action', async () => {
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    await act(async () => {
      menuItem(t('music.add_to_queue'))?.click()
    })
    expect(useMusic.getState().addToQueue).toHaveBeenCalledWith('t2')
    expect(useMusic.getState().trackMenu).toBeNull()
  })

  it('play-all runs over the lazily derived visible list', async () => {
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    await act(async () => {
      menuItem(t('music.play_all'))?.click()
    })
    expect(useMusic.getState().playCollection).toHaveBeenCalledWith(['t1', 't2'], 1)
  })
})

// The immersive player opens this menu off a right click, and the one thing that gesture most wants
// was missing from it: start or stop the track. The item is first, and it reads the store's playback
// state as well as the track — on the track that is playing it is the pause control, which is why the
// label is not a property of the track alone.
describe('track menu transport item', () => {
  function exactItem(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"]')]
      .find((item) => item.textContent?.trim() === label) as HTMLButtonElement | undefined
  }

  it('offers pausing when the menu was opened on the track that is playing', async () => {
    const togglePlay = vi.fn(async () => {})
    useMusic.setState({ queue: ['t2'], currentIndex: 0, isPlaying: true, togglePlay })
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    const item = exactItem(t('music.pause'))
    expect(item).toBeDefined()
    await act(async () => {
      item?.click()
    })
    expect(togglePlay).toHaveBeenCalledTimes(1)
  })

  it('offers playing the track when the menu was opened on another one', async () => {
    const playTrack = vi.fn(async () => {})
    useMusic.setState({ queue: ['t2'], currentIndex: 0, isPlaying: true, playTrack })
    await mountList()
    await act(async () => {
      menuButtons()[0]?.click()
    })
    const item = exactItem(t('music.play'))
    expect(item).toBeDefined()
    await act(async () => {
      item?.click()
    })
    expect(playTrack).toHaveBeenCalledWith('t1')
  })
})

describe('track menu offline item', () => {
  it('offers saving a track that is not cached on this device and runs the toggle', async () => {
    const toggleTrackOffline = vi.fn(async () => {})
    useMusic.setState({ offlineTrackIds: [], toggleTrackOffline })
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    expect(menuItem(t('music.make_offline'))).toBeDefined()
    expect(menuItem(t('music.remove_offline'))).toBeUndefined()
    await act(async () => {
      menuItem(t('music.make_offline'))?.click()
    })
    expect(toggleTrackOffline).toHaveBeenCalledWith('t2')
  })

  it('offers removing a track that is already cached on this device', async () => {
    useMusic.setState({ offlineTrackIds: ['t2'], toggleTrackOffline: vi.fn(async () => {}) })
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    expect(menuItem(t('music.remove_offline'))).toBeDefined()
    expect(menuItem(t('music.make_offline'))).toBeUndefined()
  })
})

// FB-F13: the row menu names a lyric source for one press, with the preference as the default.
describe('lyric source submenu (FB-F13)', () => {
  it('offers the setting plus the two sources, and passes the chosen one through', async () => {
    const searchTrackLyric = vi.fn(async () => {})
    const wrap = (run: () => void) => () => run()
    const items = lyricSubmenu(track('t1', 'Alpha'), wrap, searchTrackLyric)
    expect(items.map((item) => item.label)).toEqual([
      t('music.lyric_source_follow_settings'),
      t('music.lyric_source_lrclib'),
      t('music.lyric_source_catalogue'),
    ])
    items[0]?.onSelect?.()
    items[1]?.onSelect?.()
    items[2]?.onSelect?.()
    expect(searchTrackLyric.mock.calls).toEqual([['t1'], ['t1', 'lrclib'], ['t1', 'catalogue']])
  })
})

// FB-F12: the recent list is where a played stamp shows, so that is where removing one lives.
describe('play history management (FB-F12)', () => {
  const played = (id: string, title: string): MusicTrack => ({ ...track(id, title), lastPlayedAt: 111, playCount: 4 })
  const history = [played('t1', 'Alpha'), played('t2', 'Beta')]

  it('offers removing a played row from the history and runs it for that row alone', async () => {
    const forgetPlayHistory = vi.fn(async () => {})
    useMusic.setState({ tracks: history, scope: { kind: 'recent' }, forgetPlayHistory })
    await mountList(history)
    await act(async () => {
      menuButtons()[1]?.click()
    })
    await act(async () => {
      menuItem(t('music.remove_from_history'))?.click()
    })
    expect(forgetPlayHistory).toHaveBeenCalledWith(['t2'])
  })

  it('stays out of the menu of a row that was never played', async () => {
    useMusic.setState({ tracks, scope: { kind: 'recent' } })
    await mountList()
    await act(async () => {
      menuButtons()[1]?.click()
    })
    expect(menuItem(t('music.remove_from_history'))).toBeUndefined()
  })

  it('clears the whole list only after the question is answered', async () => {
    const forgetPlayHistory = vi.fn(async () => {})
    useMusic.setState({ tracks: history, scope: { kind: 'recent' }, forgetPlayHistory })
    await mountList(history)
    await act(async () => {
      byText(document, t('music.history_clear'))?.click()
    })
    expect(forgetPlayHistory).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain(t('music.history_clear_confirm', { value0: 2 }))
    await act(async () => {
      byText(dialog ?? document, t('music.history_clear'))?.click()
    })
    expect(forgetPlayHistory).toHaveBeenCalledWith(['t1', 't2'])
  })

  it('keeps the export button everywhere else', async () => {
    useMusic.setState({ tracks, scope: { kind: 'all' } })
    await mountList()
    expect(byText(document, t('music.history_clear'))).toBeUndefined()
    expect(byText(document, t('music.export_m3u'))).toBeDefined()
  })
})

describe('playlist track menu', () => {
  async function openPlaylistMenu(rowIndex: number): Promise<ReturnType<typeof vi.fn>> {
    const movePlaylistItem = vi.fn(async () => {})
    useMusic.setState({
      scope: { kind: 'playlist', playlistId: 'p1' },
      playlists: [{
        id: 'p1',
        name: 'Road',
        items: [
          { id: 'i2', playlistId: 'p1', trackId: 't2', sortOrder: 0 },
          { id: 'i1', playlistId: 'p1', trackId: 't1', sortOrder: 1 },
        ],
      } as unknown as MusicPlaylistDetail],
      movePlaylistItem,
    })
    await mountList()
    await act(async () => {
      menuButtons()[rowIndex]?.click()
    })
    return movePlaylistItem
  }

  it('offers move and unlink entries carrying the row item identity', async () => {
    await openPlaylistMenu(0) // row t1: second in the manual order, so move-down is at the boundary
    expect(useMusic.getState().trackMenu?.target).toMatchObject({ track: tracks[0], itemId: 'i1', playlistId: 'p1' })
    expect(menuItem(t('music.move_up'))).toBeDefined()
    expect(menuItem(t('music.move_down'))?.disabled).toBe(true)
    expect(menuItem(t('music.remove_from_playlist'))).toBeDefined()
  })

  it('running move up asks the store to move the item one step', async () => {
    const movePlaylistItem = await openPlaylistMenu(0)
    await act(async () => {
      menuItem(t('music.move_up'))?.click()
    })
    expect(movePlaylistItem).toHaveBeenCalledWith('p1', 'i1', -1)
    expect(useMusic.getState().trackMenu).toBeNull()
  })
})

describe('track menu lyric search (M-52)', () => {
  async function mountAndOpen(target: MusicTrack): Promise<void> {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(Fragment, null,
        createElement(ConfirmHost),
        createElement(MusicTrackMenuHost),
        createElement(MusicTrackList, { tracks: [target], loading: false, emptyTitle: 'x' })))
    })
    await act(async () => {
      menuButtons()[0]?.click()
    })
  }

  // FB-F13: the search row opens a source menu now, so choosing a source is two presses — the row
  // itself is a disclosure (the Menu opens a submenu on its own click) and the source is the second.
  async function chooseLyricSource(label: string): Promise<void> {
    await act(async () => {
      menuItem(t('music.search_lyrics'))?.click()
    })
    await act(async () => {
      menuItem(label)?.click()
    })
  }

  it('runs straight through for a track without stored lyrics', async () => {
    const searchTrackLyric = vi.fn(async () => {})
    useMusic.setState({ searchTrackLyric })
    await mountAndOpen(track('t1', 'Alpha'))
    await chooseLyricSource(t('music.lyric_source_follow_settings'))
    expect(searchTrackLyric).toHaveBeenCalledWith('t1')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('asks before replacing the lyrics a track already carries', async () => {
    const searchTrackLyric = vi.fn(async () => {})
    useMusic.setState({ searchTrackLyric })
    await mountAndOpen({ ...track('t1', 'Alpha'), hasLyric: true, lyric: '[00:01.000]kept' })
    await chooseLyricSource(t('music.lyric_source_catalogue'))
    expect(searchTrackLyric).not.toHaveBeenCalled()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain(t('music.search_lyrics_confirm', { value0: 'Alpha' }))
    const replace = [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes(t('music.replace')))
    expect(replace).toBeDefined()
    await act(async () => {
      replace?.click()
    })
    expect(searchTrackLyric).toHaveBeenCalledWith('t1', 'catalogue')
  })

  it('keeps the stored lyrics when the replace prompt is declined', async () => {
    const searchTrackLyric = vi.fn(async () => {})
    useMusic.setState({ searchTrackLyric })
    await mountAndOpen({ ...track('t1', 'Alpha'), hasLyric: true, lyric: '[00:01.000]kept' })
    await chooseLyricSource(t('music.lyric_source_follow_settings'))
    const cancel = [...(document.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes(t('common.cancel')))
    await act(async () => {
      cancel?.click()
    })
    expect(searchTrackLyric).not.toHaveBeenCalled()
  })
})

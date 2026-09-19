import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
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

const tracks = [track('t1', 'Alpha'), track('t2', 'Beta'), track('t3', 'Gamma')]

let root: Root | null = null

function transferStore(): { data: Record<string, string>; setData: (k: string, v: string) => void; getData: (k: string) => string; effectAllowed: string; dropEffect: string } {
  const data: Record<string, string> = {}
  return {
    data,
    setData: (key, value) => { data[key] = value },
    getData: (key) => data[key] ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

function fireDrag(node: Element, type: 'dragstart' | 'dragover' | 'drop' | 'dragend', transfer: ReturnType<typeof transferStore>): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  node.dispatchEvent(event)
}

function rows(): Element[] {
  return [...document.querySelectorAll('[role="rowgroup"] > [role="row"]')]
}

beforeEach(() => {
  useMusic.setState({
    tracks,
    tags: [],
    scope: { kind: 'playlist', playlistId: 'p1' },
    playlists: [{
      id: 'p1',
      name: 'Road',
      items: [
        { id: 'i1', playlistId: 'p1', trackId: 't1', sortOrder: 0 },
        { id: 'i3', playlistId: 'p1', trackId: 't3', sortOrder: 1 },
        { id: 'i2', playlistId: 'p1', trackId: 't2', sortOrder: 2 },
      ],
    } as unknown as MusicPlaylistDetail],
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
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, trackMenu: null })
  vi.restoreAllMocks()
})

async function mountList(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackList, { tracks, loading: false, emptyTitle: 'x', onEdit: () => {} }))
  })
}

describe('playlist row drag reorder', () => {
  it('dragging a row onto another asks the store to move it onto the target index', async () => {
    const movePlaylistItemToIndex = vi.fn(async () => {})
    useMusic.setState({ movePlaylistItemToIndex })
    await mountList()
    const transfer = transferStore()
    await act(async () => {
      fireDrag(rows()[0], 'dragstart', transfer)
    })
    await act(async () => {
      fireDrag(rows()[1], 'drop', transfer)
    })
    // t1 (i1) dropped on the t2 row: i2 sits at index 2 in the manual order.
    expect(movePlaylistItemToIndex).toHaveBeenCalledWith('p1', 'i1', 2)
  })

  it('ignores a drop on the dragged row itself', async () => {
    const movePlaylistItemToIndex = vi.fn(async () => {})
    useMusic.setState({ movePlaylistItemToIndex })
    await mountList()
    const transfer = transferStore()
    await act(async () => {
      fireDrag(rows()[0], 'dragstart', transfer)
    })
    await act(async () => {
      fireDrag(rows()[0], 'drop', transfer)
    })
    expect(movePlaylistItemToIndex).not.toHaveBeenCalled()
  })

  it('offers no drag handles outside playlist scope', async () => {
    useMusic.setState({ scope: { kind: 'all' }, movePlaylistItemToIndex: vi.fn(async () => {}) })
    await mountList()
    const row = rows()[0]
    expect(row.getAttribute('draggable')).not.toBe('true')
  })
})

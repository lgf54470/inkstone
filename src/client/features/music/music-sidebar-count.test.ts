import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { MusicHubSidebar } from './music-hub-sidebar'
import { useMusic } from './music-store'

const counter = { reads: 0 }

// Counting played through a getter shows how often the library was walked for a
// number that only changes when the tracks themselves change.
function track(id: string, lastPlayedAt: number | null): MusicTrack {
  const base: MusicTrack = {
    id, title: `Song ${id}`, artist: 'Artist', album: 'Album', durationMs: 1000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null,
    lyric: null, hasLyric: false, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
  Object.defineProperty(base, 'lastPlayedAt', {
    get(): number | null {
      counter.reads += 1
      return lastPlayedAt
    },
  })
  return base
}

const tracks = [track('t1', 100), track('t2', null), track('t3', 5)]

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

async function mountSidebar(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicHubSidebar, { onCreatePlaylist: () => {}, onManageTags: () => {} }))
  })
}

beforeEach(() => {
  counter.reads = 0
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
  useMusic.setState({ tracks: [], tags: [], playlists: [], queue: [], currentIndex: 0, selectedIds: [] })
})

describe('sidebar counts are derived, not recomputed (PERF-8)', () => {
  it('does not re-walk the library when unrelated playback state changes', async () => {
    await mountSidebar()
    const afterMount = counter.reads
    expect(afterMount).toBeGreaterThan(0)
    await act(async () => {
      useMusic.setState({ isPlaying: true, currentIndex: 1, queue: ['t1', 't2'] })
    })
    await act(async () => {
      useMusic.setState({ isPlaying: false, viewMode: 'grid' })
    })
    expect(counter.reads).toBe(afterMount)
  })

  it('still shows how many tracks were ever played', async () => {
    await mountSidebar()
    const rows = [...document.querySelectorAll('button')].map((button) => button.textContent ?? '')
    const recent = rows.find((text) => text.includes('2'))
    expect(recent).toBeDefined()
  })
})

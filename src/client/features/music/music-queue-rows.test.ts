import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { MusicQueueList } from './music-queue-list'
import { useMusic } from './music-store'

const counter = vi.hoisted(() => ({ renders: 0 }))

// One artwork per rendered queue row, so counting them answers how many rows
// React actually re-rendered when the list itself was asked to render again.
vi.mock('./music-artwork', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./music-artwork')>()
  return {
    ...actual,
    MusicArtwork: (props: Record<string, unknown>) => {
      counter.renders += 1
      return createElement(actual.MusicArtwork, props as never)
    },
  }
})

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string): MusicTrack {
  return {
    id, title: `Song ${id}`, artist: 'Artist', album: '', durationMs: 1000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null,
    lyric: null, hasLyric: false, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

const tracks = [track('t1'), track('t2'), track('t3')]

let root: Root | null = null

async function mountQueue(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicQueueList, {}))
  })
}

beforeEach(() => {
  counter.renders = 0
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
    queue: ['t1', 't2', 't3'],
    currentIndex: 0,
    isPlaying: false,
    streamLoading: false,
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, selectedIds: [] })
})

describe('queue row render economy (PERF-9)', () => {
  it('renders every queued row once', async () => {
    await mountQueue()
    expect(counter.renders).toBe(3)
  })

  it('leaves the rows alone when the list re-renders with the same queue', async () => {
    await mountQueue()
    const before = counter.renders
    await act(async () => {
      root?.render(createElement(MusicQueueList, {}))
    })
    expect(counter.renders - before).toBe(0)
  })
})

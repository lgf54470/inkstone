import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, memo } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { MusicTrackList } from './music-track-list'
import { useMusic } from './music-store'
import type { TrackRowProps } from './music-track-row'

const counter = vi.hoisted(() => ({ renders: 0 }))

// The wrapper sits on the same memo boundary the real row has, so counting it answers
// the question that matters: which rows React actually re-rendered. A row that
// re-renders although none of its props changed is exactly the waste guarded here.
vi.mock('./music-track-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./music-track-row')>()
  return {
    ...actual,
    MusicTrackRow: memo((props: TrackRowProps) => {
      counter.renders += 1
      return createElement(actual.MusicTrackRow, props)
    }),
  }
})

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function track(id: string, title: string): MusicTrack {
  return {
    id,
    title,
    artist: 'Artist',
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
    lastPlayedAt: null,
    contentHash: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

const tracks = [track('t1', 'Alpha'), track('t2', 'Beta'), track('t3', 'Gamma')]

let root: Root | null = null

async function mountList(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicTrackList, { tracks, loading: false, emptyTitle: 'x', onEdit: () => {} }))
  })
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
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, selectedIds: [], trackMenu: null })
})

describe('track row render economy (PERF-1)', () => {
  it('re-renders only the row whose selection changed', async () => {
    await mountList()
    const before = counter.renders
    await act(async () => {
      useMusic.setState({ selectedIds: ['t2'] })
    })
    expect(counter.renders - before).toBe(1)
  })

  it('re-renders only the row that became current', async () => {
    await mountList()
    const before = counter.renders
    await act(async () => {
      useMusic.setState({ queue: ['t3'], currentIndex: 0 })
    })
    expect(counter.renders - before).toBe(1)
  })

  it('leaves every row alone when only playback state changes', async () => {
    await mountList()
    useMusic.setState({ queue: ['t1'], currentIndex: 0 })
    const before = counter.renders
    await act(async () => {
      useMusic.setState({ isPlaying: true })
    })
    expect(counter.renders - before).toBe(1)
  })
})

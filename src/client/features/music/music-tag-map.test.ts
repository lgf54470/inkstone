import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTag, MusicTrack } from '@shared/types'
import { MusicTrackList } from './music-track-list'
import { useMusic } from './music-store'

const counter = vi.hoisted(() => ({ calls: 0 }))

// Every tag row costs one colour resolve, so counting them tells how many times
// the tag tree was walked: once for the list, or once per row.
vi.mock('./music-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./music-utils')>()
  return {
    ...actual,
    tagColorValue: (
      color: Parameters<typeof actual.tagColorValue>[0],
      fallback: Parameters<typeof actual.tagColorValue>[1],
    ) => {
      counter.calls += 1
      return actual.tagColorValue(color, fallback)
    },
  }
})

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function tag(id: string, name: string): MusicTag {
  return { id, name, color: '#ef4444', parentId: null, isPinned: false, sortOrder: 0, createdAt: 0 }
}

function track(id: string): MusicTrack {
  return {
    id, title: `Song ${id}`, artist: 'Artist', album: '', durationMs: 1000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null,
    lyric: null, hasLyric: false, tagIds: ['tg1'], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

const tracks = [track('t1'), track('t2'), track('t3')]
const TAGS_RESOLVED_ONCE = 2

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
  counter.calls = 0
  useMusic.setState({
    tracks,
    tags: [tag('tg1', 'rock'), tag('tg2', 'live')],
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
  useMusic.setState({ tracks: [], tags: [], queue: [], currentIndex: 0, selectedIds: [] })
})

describe('tag lookup is shared (PERF-7)', () => {
  it('resolves the tag tree once for the whole list, not once per row', async () => {
    await mountList()
    expect(counter.calls).toBe(TAGS_RESOLVED_ONCE)
  })

  it('still paints the tag pill each row carries', async () => {
    await mountList()
    const pills = [...document.querySelectorAll('[role="rowgroup"] > [role="row"]')]
      .map((row) => row.textContent)
    expect(pills).toHaveLength(3)
    expect(pills.every((text) => text?.includes('rock'))).toBe(true)
  })
})

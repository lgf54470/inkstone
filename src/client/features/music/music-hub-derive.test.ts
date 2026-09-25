import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { MusicHubModal } from './music-hub-modal'
import { useMusic } from './music-store'

const counter = vi.hoisted(() => ({ calls: 0 }))

// Ranking the whole library is the expensive step. Every consumer that calls the hook
// on its own pays for it again, so this counts how many times one hub render ranks.
vi.mock('./music-store/library-load', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./music-store/library-load')>()
  return {
    ...actual,
    visibleTracks: (input: Parameters<typeof actual.visibleTracks>[0]) => {
      counter.calls += 1
      return actual.visibleTracks(input)
    },
  }
})

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

beforeEach(() => {
  counter.calls = 0
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

function track(id: string, album: string, artist: string): MusicTrack {
  return {
    id, title: `Song ${id}`, artist, album, durationMs: 1000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null,
    lyric: null, hasLyric: false, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

const tracks = [track('t1', 'Spark', 'Ann'), track('t2', 'Spark', 'Ann')]

let root: Root | null = null

async function mountHub(scope: unknown): Promise<void> {
  useMusic.setState({
    loadLibrary: vi.fn(async () => {}),
    tracks,
    tags: [],
    playlists: [],
    query: '',
    scope,
  } as never)
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicHubModal, { open: true, onClose: () => {} }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], tags: [], playlists: [], query: '', scope: { kind: 'all' } } as never)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('hub derived list (PERF-6)', () => {
  it('ranks the library once for the whole hub', async () => {
    await mountHub({ kind: 'all' })
    expect(counter.calls).toBe(1)
  })

  it('ranks it once even when the album header and the list both need it', async () => {
    await mountHub({ kind: 'album', album: 'Spark', artist: 'Ann' })
    expect(counter.calls).toBe(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'
import {
  filterTracks,
  formatMusicTime,
  loadMusicLibrary,
  musicSnapshot,
  playTrack,
  setMusicQuery,
  setMusicTag,
  stepIndex,
} from './music-player'

function track(overrides: Partial<BlogMusicTrack> = {}): BlogMusicTrack {
  const id = overrides.id ?? 'a'
  return {
    id,
    title: 'Moonlight',
    artist: 'Hu Yanbin',
    album: 'Album One',
    durationMs: 200_000,
    lyric: null,
    coverUrl: null,
    streamUrl: `https://api.test/api/blog/public/music/tracks/${id}/stream`,
    tagIds: [],
    createdAt: 1,
    ...overrides,
  }
}

function libraryBody(tracks: BlogMusicTrack[], enabled = true): unknown {
  return { enabled, tracks, tags: [{ id: 't1', name: 'Guofeng', color: null, parentId: null }] }
}

function stubLibrary(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearApiMemoryCache()
  setMusicQuery('')
  setMusicTag(null)
})

interface FakeAudio {
  src: string
  paused: boolean
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  listeners: Map<string, () => void>
}

function installFakeAudio(): { instances: FakeAudio[]; emit: (type: string) => void } {
  const instances: FakeAudio[] = []
  class FakeAudioElement implements FakeAudio {
    src = ''
    paused = true
    volume = 1
    muted = false
    currentTime = 0
    duration = 0
    listeners = new Map<string, () => void>()
    constructor() {
      instances.push(this)
    }
    addEventListener(type: string, handler: () => void): void {
      this.listeners.set(type, handler)
    }
    play(): Promise<void> {
      this.paused = false
      this.listeners.get('play')?.()
      return Promise.resolve()
    }
    pause(): void {
      this.paused = true
      this.listeners.get('pause')?.()
    }
  }
  vi.stubGlobal('Audio', FakeAudioElement)
  return {
    instances,
    emit: (type: string) => instances[0]?.listeners.get(type)?.(),
  }
}

describe('playback wiring', () => {
  it('points the shared audio element at the stream, follows time and advances on end', async () => {
    stubLibrary(libraryBody([track({ id: 'a' }), track({ id: 'b', title: 'Sakura' })]))
    await loadMusicLibrary(true)
    const fake = installFakeAudio()

    playTrack('a')
    const element = fake.instances[0]!
    expect(element.src).toContain('/api/blog/public/music/tracks/a/stream')
    expect(element.paused).toBe(false)
    expect(musicSnapshot().playing).toBe(true)
    expect(musicSnapshot().queue).toEqual(['a', 'b'])

    element.currentTime = 12
    fake.emit('timeupdate')
    expect(musicSnapshot().timeMs).toBe(12_000)

    element.duration = 268
    fake.emit('durationchange')
    expect(musicSnapshot().durationMs).toBe(268_000)

    fake.emit('ended')
    expect(musicSnapshot().currentId).toBe('b')
    expect(element.src).toContain('/tracks/b/stream')
  })
})

describe('filterTracks', () => {
  const tracks = [
    track({ id: 'a', title: 'Moonlight', artist: 'Hu Yanbin', album: 'Album One', tagIds: ['t1'] }),
    track({ id: 'b', title: 'Sakura', artist: 'Wang', album: 'Album Two', tagIds: ['t2'] }),
  ]

  it('matches title, artist and album case-insensitively', () => {
    expect(filterTracks(tracks, 'moon', null).map((entry) => entry.id)).toEqual(['a'])
    expect(filterTracks(tracks, 'HU YAN', null).map((entry) => entry.id)).toEqual(['a'])
    expect(filterTracks(tracks, 'album two', null).map((entry) => entry.id)).toEqual(['b'])
    expect(filterTracks(tracks, '  ', null)).toHaveLength(2)
  })

  it('combines the query with the tag filter', () => {
    expect(filterTracks(tracks, '', 't1').map((entry) => entry.id)).toEqual(['a'])
    expect(filterTracks(tracks, 'sakura', 't1')).toEqual([])
  })
})

describe('stepIndex', () => {
  it('wraps in both directions and handles a single entry', () => {
    expect(stepIndex(3, 2, 1)).toBe(0)
    expect(stepIndex(3, 0, -1)).toBe(2)
    expect(stepIndex(1, 0, 1)).toBe(0)
    expect(stepIndex(3, -1, 1)).toBe(0)
    expect(stepIndex(3, -1, -1)).toBe(2)
    expect(stepIndex(0, 0, 1)).toBe(-1)
  })
})

describe('formatMusicTime', () => {
  it('formats durations and guards empty values', () => {
    expect(formatMusicTime(0)).toBe('00:00')
    expect(formatMusicTime(65_000)).toBe('01:05')
    expect(formatMusicTime(Number.NaN)).toBe('00:00')
  })
})

describe('loadMusicLibrary', () => {
  it('publishes a ready library from the API projection', async () => {
    stubLibrary(libraryBody([track()]))
    await loadMusicLibrary(true)
    const state = musicSnapshot()
    expect(state.status).toBe('ready')
    expect(state.tracks).toHaveLength(1)
    expect(state.tags).toHaveLength(1)
    expect(state.tracks[0]?.streamUrl).toContain('/api/blog/public/music/tracks/a/stream')
  })

  it('stays unavailable while the owner has not published the library', async () => {
    stubLibrary(libraryBody([track()], false))
    await loadMusicLibrary(true)
    expect(musicSnapshot().status).toBe('unavailable')
    expect(musicSnapshot().tracks).toEqual([])
  })

  it('keeps the queue aligned with the active filter when playback starts', async () => {
    stubLibrary(libraryBody([track({ id: 'a' }), track({ id: 'b', title: 'Sakura' }), track({ id: 'c', title: 'Sunrise' })]))
    await loadMusicLibrary(true)
    setMusicQuery('sa')
    playTrack('b')
    expect(musicSnapshot().currentId).toBe('b')
    expect(musicSnapshot().queue).toEqual(['b'])
    setMusicQuery('')
    playTrack('c')
    expect(musicSnapshot().queue).toEqual(['a', 'b', 'c'])
  })
})

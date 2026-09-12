import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'
import {
  MUSIC_PLAYBACK_RATES,
  SEEK_STEP_MS,
  computeNextQueueIndex,
  computePrevQueueIndex,
  cycleMusicMode,
  filterTracks,
  formatMusicTime,
  loadMusicLibrary,
  musicSnapshot,
  nextPlayMode,
  nextPlaybackRate,
  nudgeMusicSeek,
  playNext,
  playPrevious,
  playTrack,
  setMusicQuery,
  setMusicRate,
  setMusicTag,
  type MusicPlayMode,
} from './music-player'

/** store 是模块单例，用例通过公开的循环入口把模式归位 */
function setPlayMode(mode: MusicPlayMode): void {
  for (let step = 0; step < 4 && musicSnapshot().mode !== mode; step += 1) cycleMusicMode()
}

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
  setPlayMode('order')
  setMusicRate(1)
})

interface FakeAudio {
  src: string
  paused: boolean
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  playbackRate: number
  preservesPitch: boolean
  listeners: Map<string, () => void>
}

// audio 元素在 store 里是单例：首个用例创建后，后续用例复用同一个假元素
let sharedElement: FakeAudio | null = null

function installFakeAudio(): { instances: FakeAudio[]; element: FakeAudio; emit: (type: string) => void } {
  const instances: FakeAudio[] = []
  class FakeAudioElement implements FakeAudio {
    src = ''
    paused = true
    volume = 1
    muted = false
    currentTime = 0
    duration = 0
    playbackRate = 1
    preservesPitch = false
    listeners = new Map<string, () => void>()
    constructor() {
      instances.push(this)
      sharedElement = this
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
    get element(): FakeAudio {
      if (!sharedElement) throw new Error('audio element has not been created yet')
      return sharedElement
    },
    emit: (type: string) => sharedElement?.listeners.get(type)?.(),
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

describe('play mode math', () => {
  it('cycles through every mode and wraps back to order', () => {
    expect(nextPlayMode('order')).toBe('repeat-all')
    expect(nextPlayMode('repeat-all')).toBe('repeat-one')
    expect(nextPlayMode('repeat-one')).toBe('shuffle')
    expect(nextPlayMode('shuffle')).toBe('order')
  })

  it('advances within bounds and only wraps when repeating', () => {
    expect(computeNextQueueIndex(0, 3, 'order')).toBe(1)
    expect(computeNextQueueIndex(2, 3, 'order')).toBe(-1)
    expect(computeNextQueueIndex(2, 3, 'repeat-all')).toBe(0)
    expect(computeNextQueueIndex(0, 0, 'repeat-all')).toBe(-1)
  })

  it('walks backwards and wraps only when repeating', () => {
    expect(computePrevQueueIndex(1, 3, 'order')).toBe(0)
    expect(computePrevQueueIndex(0, 3, 'order')).toBe(0)
    expect(computePrevQueueIndex(0, 3, 'repeat-all')).toBe(2)
  })

  it('repeats the current index in repeat-one and never picks it when shuffling', () => {
    expect(computeNextQueueIndex(1, 3, 'repeat-one')).toBe(1)
    expect(computePrevQueueIndex(1, 3, 'repeat-one')).toBe(0)
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(computeNextQueueIndex(1, 3, 'shuffle')).not.toBe(1)
    }
    expect(computeNextQueueIndex(0, 1, 'shuffle')).toBe(0)
  })

  it('cycles the available playback rates and restarts from an unknown one', () => {
    expect(MUSIC_PLAYBACK_RATES).toContain(1)
    expect(nextPlaybackRate(1)).toBe(1.25)
    expect(nextPlaybackRate(2)).toBe(MUSIC_PLAYBACK_RATES[0])
    expect(nextPlaybackRate(0.5)).toBe(MUSIC_PLAYBACK_RATES[0])
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

describe('play mode behavior', () => {
  it('replays the same track in repeat-one instead of advancing', async () => {
    stubLibrary(libraryBody([track({ id: 'a' }), track({ id: 'b', title: 'Sakura' })]))
    await loadMusicLibrary(true)
    const fake = installFakeAudio()
    playTrack('a')
    setPlayMode('repeat-one')
    const element = fake.element
    element.currentTime = 99
    fake.emit('ended')
    expect(musicSnapshot().currentId).toBe('a')
    expect(element.currentTime).toBe(0)
    expect(element.paused).toBe(false)
    expect(musicSnapshot().playing).toBe(true)
  })

  it('stops at the end in order mode and wraps in repeat-all mode', async () => {
    stubLibrary(libraryBody([track({ id: 'a' }), track({ id: 'b', title: 'Sakura' })]))
    await loadMusicLibrary(true)
    installFakeAudio()
    playTrack('b')
    setPlayMode('order')
    playNext()
    expect(musicSnapshot().currentId).toBe('b')
    setPlayMode('repeat-all')
    playNext()
    expect(musicSnapshot().currentId).toBe('a')
    playPrevious()
    expect(musicSnapshot().currentId).toBe('b')
  })

  it('picks a different track on every shuffle step', async () => {
    stubLibrary(libraryBody([track({ id: 'a' }), track({ id: 'b', title: 'Sakura' }), track({ id: 'c', title: 'Sunrise' })]))
    await loadMusicLibrary(true)
    installFakeAudio()
    playTrack('a')
    setPlayMode('shuffle')
    const before = musicSnapshot().currentId
    playNext()
    expect(musicSnapshot().currentId).not.toBe(before)
  })
})

describe('transport controls', () => {
  it('nudges the playhead inside the track bounds', async () => {
    stubLibrary(libraryBody([track({ id: 'a' })]))
    await loadMusicLibrary(true)
    const fake = installFakeAudio()
    playTrack('a')
    const element = fake.element
    element.duration = 30
    fake.emit('durationchange')
    element.currentTime = 5
    fake.emit('timeupdate')

    nudgeMusicSeek(SEEK_STEP_MS)
    expect(element.currentTime).toBe(15)
    nudgeMusicSeek(-SEEK_STEP_MS * 10)
    expect(element.currentTime).toBe(0)
    nudgeMusicSeek(SEEK_STEP_MS * 100)
    expect(element.currentTime).toBe(30)
  })

  it('applies the playback rate to the shared audio element', async () => {
    stubLibrary(libraryBody([track({ id: 'a' })]))
    await loadMusicLibrary(true)
    const fake = installFakeAudio()
    playTrack('a')
    const element = fake.element
    expect(element.playbackRate).toBe(1)
    setMusicRate(1.25)
    expect(musicSnapshot().rate).toBe(1.25)
    expect(element.playbackRate).toBe(1.25)
    expect(element.preservesPitch).toBe(true)
  })
})
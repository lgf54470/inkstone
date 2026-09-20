// @vitest-environment jsdom
import { act } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Player = typeof import('./music-player')

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
    mime: 'audio/mpeg',
    ...overrides,
  }
}

function stubLibrary(tracks: BlogMusicTrack[]): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    enabled: true,
    tracks,
    tags: [],
    queue: { ids: tracks.map((entry) => entry.id), currentId: null },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

async function playerWith(tracks: BlogMusicTrack[]): Promise<Player> {
  stubLibrary(tracks)
  const player = await import('./music-player')
  await player.loadMusicLibrary(true)
  return player
}

/** jsdom 没有 canvas 后端；频谱条拿不到 2D 上下文即退出，不影响它按曲目重取节点的分支 */
async function mountVisualizerThenSwitch(player: Player): Promise<void> {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
  // 组件与 store 必须在同一次 resetModules 之后一起导入，否则它连的是上一代模块
  const { MusicVisualizer } = await import('./music-visualizer')
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => {
    createRoot(container).render(createElement(MusicVisualizer, {}))
  })
  await act(async () => { player.playTrack('v1') })
}

function mediaByKind(kind: 'audio' | 'video'): HTMLMediaElement[] {
  return Array.from(document.getElementsByTagName(kind))
}

/** 强制重读曲库：不清 api 的内存缓存，30s 内的第二次读会拿到同一份旧投影 */
async function reloadLibrary(player: Player, tracks: BlogMusicTrack[]): Promise<void> {
  // 必须清引擎那一代的 api 模块，静态 import 拿到的是 resetModules 之前的另一代
  const { clearApiMemoryCache: clearCurrentCache } = await import('../../lib/api')
  clearCurrentCache()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    enabled: true,
    tracks,
    tags: [],
    queue: { ids: tracks.map((entry) => entry.id), currentId: tracks[0]?.id ?? null },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  await player.loadMusicLibrary(true)
}

function videos(): HTMLVideoElement[] {
  return Array.from(document.getElementsByTagName('video'))
}

function host(): HTMLElement {
  const node = document.createElement('div')
  document.body.append(node)
  return node
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  destination = { label: 'destination' }
  sources: HTMLMediaElement[] = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createAnalyser() {
    return { fftSize: 0, smoothingTimeConstant: 0, connect: () => undefined }
  }

  createMediaElementSource(element: HTMLMediaElement) {
    this.sources.push(element)
    return { connect: () => undefined }
  }

  resume() {
    this.state = 'running'
    return Promise.resolve()
  }
}

function audioSources(): string[] {
  return FakeAudioContext.instances.flatMap((context) => context.sources).map((element) => element.tagName)
}

beforeEach(() => {
  document.body.innerHTML = ''
  FakeAudioContext.instances = []
  vi.resetModules()
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  // pause 必须像浏览器那样把事件发出去，测试才看得到「退休元素的静默」
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearApiMemoryCache()
})

describe('the playback element follows the track kind', () => {
  it('plays a clip on a video element without ever building an audio one', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('v1')

    expect(mediaByKind('audio')).toHaveLength(0)
    const [video] = videos()
    expect(video?.tagName).toBe('VIDEO')
    expect(video?.getAttribute('src')).toContain('/tracks/v1/stream')
    expect(video?.playsInline).toBe(true)
    expect(player.musicSnapshot().playing).toBe(true)
  })

  it('releases the video element when an audio track takes over', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' }), track({ id: 'a1' })])
    player.playTrack('v1')
    const [video] = videos()
    player.playTrack('a1')

    expect(mediaByKind('audio')).toHaveLength(1)
    expect(video?.getAttribute('src')).toBeNull()
    expect(video?.parentElement).toBe(document.body)
    expect(video?.hidden).toBe(true)
    expect(video?.paused).toBe(true)
  })
})

describe('a retired element keeps to itself', () => {
  it('ignores the events of a retired element', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' }), track({ id: 'a1' })])
    player.playTrack('v1')
    const [video] = videos()
    player.playTrack('a1')

    video?.play()
    video?.dispatchEvent(new Event('timeupdate'))
    video?.dispatchEvent(new Event('pause'))
    expect(player.musicSnapshot().timeMs).toBe(0)
    expect(player.musicSnapshot().playing).toBe(true)
  })

  it('keeps one element per kind across repeated switches', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' }), track({ id: 'a1' })])
    player.playTrack('v1')
    const video = videos()[0]
    player.playTrack('a1')
    const audio = mediaByKind('audio')[0]
    player.playTrack('v1')
    player.playTrack('a1')

    expect(mediaByKind('video')).toHaveLength(1)
    expect(mediaByKind('audio')).toHaveLength(1)
    expect(videos()[0]).toBe(video)
    expect(mediaByKind('audio')[0]).toBe(audio)
  })
})

describe('the handover happens before the retirement', () => {
  it('swaps kinds on a refresh without letting the old element stop playback', async () => {
    const player = await playerWith([track({ id: 'a1' })])
    player.playTrack('a1')
    const [audio] = mediaByKind('audio')

    await reloadLibrary(player, [track({ id: 'a1', mime: 'video/mp4' })])
    player.setVolume(0.5)

    expect(audio?.parentElement).toBe(document.body)
    expect(player.musicSnapshot().playing).toBe(true)
  })
})

describe('the video stage', () => {
  it('moves the playing clip into a claimed stage and takes it back on release', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('v1')
    const video = videos()[0]!
    const stage = host()

    const release = player.claimVideoStage(stage)
    expect(video.parentElement).toBe(stage)
    expect(video.hidden).toBe(false)
    release()
    expect(video.parentElement).toBe(document.body)
    expect(video.hidden).toBe(true)
  })

  it('hands the picture to a stage that appears after playback started', async () => {
    const player = await playerWith([track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('v1')
    const video = videos()[0]!
    expect(video.parentElement).toBe(document.body)

    player.claimVideoStage(host())
    expect(video.parentElement?.tagName).toBe('DIV')
    expect(video.hidden).toBe(false)
  })

  it('never stages an audio element', async () => {
    const player = await playerWith([track({ id: 'a1' }), track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('a1')
    const stage = host()
    player.claimVideoStage(stage)
    expect(mediaByKind('audio')[0]?.parentElement).toBe(document.body)

    player.playTrack('v1')
    expect(videos()[0]?.parentElement).toBe(stage)
    expect(mediaByKind('audio')[0]?.parentElement).toBe(document.body)
  })

  it('keeps the stage while transport acts on the staged element', async () => {
    const player = await playerWith([track({ id: 'a1' }), track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('a1')
    const stage = host()
    player.claimVideoStage(stage)
    player.playTrack('v1')
    player.seekTo(30_000)

    expect(videos()[0]?.parentElement).toBe(stage)
    expect(player.musicSnapshot().timeMs).toBe(30_000)
  })
})

describe('the analyser follows the element', () => {
  it('builds one chain per kind instead of reusing the audio one', async () => {
    const player = await playerWith([track({ id: 'a1' }), track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('a1')
    const audioNode = await player.ensureMusicAnalyser()
    player.playTrack('v1')
    const videoNode = await player.ensureMusicAnalyser()

    expect(audioNode).not.toBe(videoNode)
    expect(audioSources()).toEqual(['AUDIO', 'VIDEO'])
  })

  it('reuses the chain of an element that comes back', async () => {
    const player = await playerWith([track({ id: 'a1' }), track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('a1')
    const first = await player.ensureMusicAnalyser()
    player.playTrack('v1')
    await player.ensureMusicAnalyser()
    player.playTrack('a1')
    const again = await player.ensureMusicAnalyser()

    expect(again).toBe(first)
    expect(audioSources()).toEqual(['AUDIO', 'VIDEO'])
  })

  it('rebuilds the visualizer chain when the track switches kind', async () => {
    const player = await playerWith([track({ id: 'a1' }), track({ id: 'v1', mime: 'video/mp4' })])
    player.playTrack('a1')
    await mountVisualizerThenSwitch(player)

    expect(audioSources()).toEqual(['AUDIO', 'VIDEO'])
  })
})

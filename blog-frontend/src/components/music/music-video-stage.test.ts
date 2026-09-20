// @vitest-environment jsdom
import { act } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'
import MusicFloatingPlayer from './MusicFloatingPlayer'
import { loadMusicLibrary, musicSnapshot, playTrack, togglePlayerExpanded } from './music-player'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

async function stubLibrary(tracks: BlogMusicTrack[]): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    enabled: true,
    tracks,
    tags: [],
    queue: { ids: tracks.map((entry) => entry.id), currentId: null },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  await loadMusicLibrary(true)
}

async function renderCard(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(MusicFloatingPlayer, { locale: 'zh-CN' }))
  })
  return container
}

async function setExpanded(expanded: boolean): Promise<void> {
  if (musicSnapshot().expanded !== expanded) await act(async () => { togglePlayerExpanded() })
}

/** jsdom 没有 canvas 后端，频谱条画不出东西；返回 null 让绘制循环按无上下文退出 */
function silenceCanvas(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null)
}

async function play(id: string): Promise<void> {
  await act(async () => { playTrack(id) })
}

beforeEach(() => {
  silenceCanvas()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
})

afterEach(async () => {
  await setExpanded(false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearApiMemoryCache()
})

describe('the expanded card stage', () => {
  it('lends a box to the clip so the picture lives where the player is', async () => {
    await stubLibrary([track({ id: 'v1', mime: 'video/mp4' })])
    await play('v1')
    await setExpanded(true)
    const container = await renderCard()
    const stage = container.querySelector('.music-video-stage')

    expect(stage).not.toBeNull()
    expect(stage?.firstElementChild).toBe(document.querySelector('.music-video-stage > video'))
    expect(document.querySelector<HTMLVideoElement>('.music-video-stage > video')?.hidden).toBe(false)
  })

  it('renders no stage for an audio track', async () => {
    await stubLibrary([track({ id: 'a1' })])
    await play('a1')
    await setExpanded(true)
    const container = await renderCard()

    expect(container.querySelector('.music-video-stage')).toBeNull()
    expect(document.querySelector('.music-video-stage > video')).toBeNull()
  })

  it('takes the picture back when the card collapses', async () => {
    await stubLibrary([track({ id: 'v1', mime: 'video/mp4' })])
    await play('v1')
    await setExpanded(true)
    const container = await renderCard()
    const video = container.querySelector<HTMLVideoElement>('.music-video-stage > video')
    expect(video).not.toBeNull()

    await setExpanded(false)
    expect(container.querySelector('.music-video-stage')).toBeNull()
    expect(video?.parentElement).toBe(document.body)
    expect(video?.hidden).toBe(true)
  })
})

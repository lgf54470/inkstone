import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { fadeTrack, installMediaElementPlayback } from './audio-engine.test-helpers'
import { MusicVideoStage } from './music-video-stage'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function trackWithMime(mime: string): MusicTrack {
  return { ...fadeTrack('media-1'), mime }
}

let root: Root | null = null

async function mountStage(track: MusicTrack): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicVideoStage, { track, className: 'aspect-square w-full' }))
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function playVideo(engine: typeof import('./audio-engine')) {
  installMediaElementPlayback()
  await engine.startPlayback(trackWithMime('video/mp4'))
  const media = engine.mediaElement()
  if (!media) throw new Error('playing a video track should have created its element')
  return media
}

describe('MusicVideoStage', () => {
  it('lends the surface container to the element that carries the video', async () => {
    const engine = await import('./audio-engine')
    const container = await mountStage(trackWithMime('video/mp4'))
    const media = await playVideo(engine)
    expect(container.querySelector('.music-video-stage')?.contains(media)).toBe(true)
  })

  it('renders no container at all for an audio track', async () => {
    const container = await mountStage(trackWithMime('audio/mpeg'))
    expect(container.querySelector('.music-video-stage')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('takes the element back when the surface unmounts, so the container can go with it', async () => {
    const engine = await import('./audio-engine')
    const container = await mountStage(trackWithMime('video/mp4'))
    const media = await playVideo(engine)
    expect(media.parentElement).not.toBe(document.body)
    act(() => root?.unmount())
    root = null
    expect(media.parentElement).toBe(document.body)
    expect(media.hidden).toBe(true)
    expect(container.querySelector('video')).toBeNull()
  })
})

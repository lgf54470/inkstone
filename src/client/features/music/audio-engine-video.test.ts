import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { fadeTrack, installMediaElementPlayback, recordingBridge, useFakeAudioStack } from './audio-engine.test-helpers'

useFakeAudioStack()

async function engineUnderTest() {
  const engine = await import('./audio-engine')
  installMediaElementPlayback()
  engine.configureAudio(recordingBridge().bridge)
  return engine
}

function trackWithMime(id: string, mime: string): MusicTrack {
  return { ...fadeTrack(id), mime }
}

function videoState(media: HTMLMediaElement | null): { controls: boolean; playsInline: boolean } | null {
  return media instanceof HTMLVideoElement ? { controls: media.controls, playsInline: media.playsInline } : null
}

describe('the playback element follows the track kind', () => {
  it('plays a video track on a video element that carries its own controls', async () => {
    const engine = await engineUnderTest()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const media = engine.mediaElement()
    expect(media?.tagName).toBe('VIDEO')
    expect(videoState(media)).toEqual({ controls: true, playsInline: true })
    expect(media?.getAttribute('src')).toContain('/tracks/v1/stream')
    // An <audio> element would refuse this container outright, so making one first is a bug.
    expect(document.querySelectorAll('audio').length).toBe(0)
    expect(media?.parentElement).toBe(document.body)
  })

  it('plays an audio track of the same library on an audio element and releases the video one', async () => {
    const engine = await engineUnderTest()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const video = engine.mediaElement()
    await engine.startPlayback(trackWithMime('a1', 'audio/mpeg'))
    expect(engine.mediaElement()?.tagName).toBe('AUDIO')
    expect(video?.getAttribute('src')).toBeNull()
  })

  it('keeps the video element across two video tracks instead of rebuilding it', async () => {
    const engine = await engineUnderTest()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const first = engine.mediaElement()
    await engine.startPlayback(trackWithMime('v2', 'video/quicktime'))
    expect(engine.mediaElement()).toBe(first)
    expect(document.querySelectorAll('video').length).toBe(1)
  })
})

describe('crossfade yields to video', () => {
  it('refuses to fade an audio track into a video one', async () => {
    const engine = await engineUnderTest()
    await engine.startPlayback(trackWithMime('a1', 'audio/mpeg'))
    expect(engine.startCrossfade(trackWithMime('v1', 'video/mp4'))).toBe(false)
    expect(engine.crossfadeActive()).toBe(false)
    expect(document.querySelectorAll('video').length).toBe(0)
  })

  it('refuses to fade a video track into the next one', async () => {
    const engine = await engineUnderTest()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    expect(engine.startCrossfade(trackWithMime('v2', 'video/webm'))).toBe(false)
    expect(engine.crossfadeActive()).toBe(false)
  })
})

// The engine registers its stage placer as the module loads, and useFakeAudioStack() resets the
// registry per case; claiming through a statically imported copy would talk to a dead instance.
async function engineWithStage() {
  const engine = await engineUnderTest()
  const { claimMediaStage } = await import('./media-stage')
  return { claim: claimMediaStage, engine }
}

function host(): HTMLElement {
  const node = document.createElement('div')
  document.body.append(node)
  return node
}

describe('the video stage', () => {
  it('moves the playing element into a claimed stage and takes it back out', async () => {
    const { claim, engine } = await engineWithStage()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const media = engine.mediaElement()
    const stage = host()
    const release = claim(stage)
    expect(media?.parentElement).toBe(stage)
    expect(media?.hidden).toBe(false)
    release()
    expect(media?.parentElement).toBe(document.body)
    expect(media?.hidden).toBe(true)
  })

  it('hands the picture to the surface underneath when the topmost one unmounts', async () => {
    const { claim, engine } = await engineWithStage()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const media = engine.mediaElement()
    const hub = host()
    const overlay = host()
    const releaseHub = claim(hub)
    const releaseOverlay = claim(overlay)
    expect(media?.parentElement).toBe(overlay)
    releaseOverlay()
    expect(media?.parentElement).toBe(hub)
    releaseHub()
    expect(media?.parentElement).toBe(document.body)
  })
})

describe('what may not be staged', () => {
  it('keeps the audio element off a stage that a video surface claimed', async () => {
    const { claim, engine } = await engineWithStage()
    await engine.startPlayback(trackWithMime('a1', 'audio/mpeg'))
    const media = engine.mediaElement()
    const stage = host()
    claim(stage)
    expect(media?.parentElement).toBe(document.body)
    expect(media?.hidden).toBe(true)
    expect(stage.childElementCount).toBe(0)
  })

  it('retires a staged video element before its container can be unmounted with it', async () => {
    const { claim, engine } = await engineWithStage()
    await engine.startPlayback(trackWithMime('v1', 'video/mp4'))
    const video = engine.mediaElement()
    const stage = host()
    claim(stage)
    expect(video?.parentElement).toBe(stage)
    await engine.startPlayback(trackWithMime('a1', 'audio/mpeg'))
    expect(video?.parentElement).toBe(document.body)
    expect(video?.hidden).toBe(true)
    expect(stage.querySelector('video')).toBeNull()
  })
})

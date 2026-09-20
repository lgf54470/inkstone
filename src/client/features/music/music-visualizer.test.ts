import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'

vi.mock('./audio-engine', () => ({
  applyVolume: vi.fn(),
  mediaElement: vi.fn(() => null),
  CROSSFADE_MS: 3_000,
  cancelCrossfade: vi.fn(),
  configureAudio: vi.fn(),
  configureEqualizer: vi.fn(),
  configureLoudnessNormalization: vi.fn(),
  crossfadeActive: vi.fn(() => false),
  ensureAudioGraph: vi.fn(async () => ({
    frequencyBinCount: 128,
    getByteFrequencyData: (bytes: Uint8Array) => { bytes[0] = 200 },
  })),
  pausePlayback: vi.fn(),
  resumePlayback: vi.fn(async () => 'blocked'),
  seekTo: vi.fn(),
  startCrossfade: vi.fn(() => false),
  startPlayback: vi.fn(async () => 'blocked'),
  stopPlayback: vi.fn(),
}))

import { renderElement } from '../../lib/test-render'
import { MusicVisualizer, visualizerLevels } from './music-visualizer'
import { useMusic } from './music-store'

function spectrum(values: number[]): Uint8Array {
  const bytes = new Uint8Array(64)
  values.forEach((value, index) => {
    bytes[index] = value
  })
  return bytes
}

describe('visualizerLevels', () => {
  it('returns one peak per bar from the usable part of the spectrum', () => {
    const bytes = spectrum([255, 0, 128, 0, 64, 0, 32, 0])
    const levels = visualizerLevels(bytes, 4)
    expect(levels).toHaveLength(4)
    expect(levels.every((level) => level >= 0 && level <= 1)).toBe(true)
    expect(Math.max(...levels)).toBe(1)
  })

  it('grows with louder frequencies and stays flat for silence', () => {
    expect(visualizerLevels(spectrum([]), 5)).toEqual([0, 0, 0, 0, 0])
    const quiet = visualizerLevels(spectrum([40, 40, 40, 40]), 4)
    const loud = visualizerLevels(spectrum([220, 220, 220, 220]), 4)
    expect(Math.max(...loud)).toBeGreaterThan(Math.max(...quiet))
  })

  it('keeps the first bars inside the spectrum when it is shorter than the bar count', () => {
    const levels = visualizerLevels(new Uint8Array(3).fill(200), 12)
    expect(levels).toHaveLength(12)
    expect(levels.every((level) => Number.isFinite(level))).toBe(true)
  })
})

let rafCount = 0
let cancelCount = 0
let drawCount = 0
let ioCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null
let restoreContext: (() => void) | null = null

beforeEach(() => {
  rafCount = 0
  cancelCount = 0
  drawCount = 0
  ioCallback = null
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => ({
    clearRect: () => { drawCount += 1 },
    beginPath: () => {},
    roundRect: () => {},
    fill: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    closePath: () => {},
  })) as never
  restoreContext = () => {
    HTMLCanvasElement.prototype.getContext = original
  }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  vi.stubGlobal('requestAnimationFrame', () => {
    rafCount += 1
    return rafCount
  })
  vi.stubGlobal('cancelAnimationFrame', () => { cancelCount += 1 })
  class ObserverStub {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      ioCallback = callback
    }

    observe() {}
    disconnect() { ioCallback = null }
  }
  vi.stubGlobal('IntersectionObserver', ObserverStub)
})

afterEach(() => {
  useMusic.setState({ isPlaying: false })
  document.documentElement.classList.remove('theme-test-hook')
  restoreContext?.()
  vi.unstubAllGlobals()
})

describe('visualizer pause gating', () => {
  it('paints a calm baseline once while paused without requesting frames', () => {
    useMusic.setState({ isPlaying: false })
    const rendered = renderElement(createElement(MusicVisualizer))
    expect(drawCount).toBe(1)
    expect(rafCount).toBe(0)
    rendered.unmount()
  })

  it('animates only while playing and stops when paused again', () => {
    useMusic.setState({ isPlaying: true })
    const rendered = renderElement(createElement(MusicVisualizer))
    expect(rafCount).toBeGreaterThanOrEqual(1)
    const scheduled = rafCount
    act(() => { useMusic.setState({ isPlaying: false }) })
    expect(cancelCount).toBeGreaterThanOrEqual(1)
    expect(rafCount).toBe(scheduled)
    rendered.unmount()
  })
})

describe('visualizer visibility and theme', () => {
  it('stops frames while the canvas is out of view and resumes when it returns', () => {
    useMusic.setState({ isPlaying: true })
    const rendered = renderElement(createElement(MusicVisualizer))
    const scheduled = rafCount
    act(() => { ioCallback?.([{ isIntersecting: false }]) })
    expect(cancelCount).toBeGreaterThanOrEqual(1)
    expect(rafCount).toBe(scheduled)
    act(() => { ioCallback?.([{ isIntersecting: true }]) })
    expect(rafCount).toBeGreaterThan(scheduled)
    rendered.unmount()
  })

  it('repaints the paused baseline when the theme flips, still without frames', async () => {
    useMusic.setState({ isPlaying: false })
    const rendered = renderElement(createElement(MusicVisualizer))
    const before = drawCount
    await act(async () => {
      document.documentElement.classList.add('theme-test-hook')
    })
    expect(drawCount).toBeGreaterThan(before)
    expect(rafCount).toBe(0)
    rendered.unmount()
  })
})

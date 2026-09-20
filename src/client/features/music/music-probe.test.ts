import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDurationMs } from './music-probe'

class FakeAudio {
  static instances: FakeAudio[] = []
  listeners = new Map<string, () => void>()
  duration = Number.NaN
  src = ''

  addEventListener(type: string, handler: () => void): void {
    this.listeners.set(type, handler)
  }

  removeAttribute(name: string): void {
    if (name === 'src') this.src = ''
  }

  emit(type: string): void {
    this.listeners.get(type)?.()
  }
}

function probeFile(): File {
  return new File([new Uint8Array(8)], 'song.mp3', { type: 'audio/mpeg' })
}

const revoke = vi.fn()
const createHostElement = document.createElement.bind(document)
const createdTags: string[] = []

beforeEach(() => {
  FakeAudio.instances = []
  createdTags.length = 0
  revoke.mockClear()
  vi.useFakeTimers()
  vi.stubGlobal('Audio', function () {
    const audio = new FakeAudio()
    FakeAudio.instances.push(audio)
    return audio
  })
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    createdTags.push(tag)
    if (tag !== 'video') return createHostElement(tag)
    const video = new FakeAudio()
    FakeAudio.instances.push(video)
    return video as unknown as HTMLElement
  }) as typeof document.createElement)
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:probe', revokeObjectURL: revoke })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('readDurationMs', () => {
  it('gives up on a container the browser never decodes', async () => {
    let resolved: number | undefined
    readDurationMs(probeFile()).then((value) => { resolved = value })
    vi.advanceTimersByTime(7_999)
    expect(resolved).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(resolved).toBe(0)
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(FakeAudio.instances[0]!.src).toBe('')
  })

  it('resolves with the decoded duration and ignores the later timeout', async () => {
    const pending = readDurationMs(probeFile())
    const audio = FakeAudio.instances[0]!
    audio.duration = 96
    audio.emit('loadedmetadata')
    expect(await pending).toBe(96_000)
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('resolves zero when the element reports an error', async () => {
    const pending = readDurationMs(probeFile())
    FakeAudio.instances[0]!.emit('error')
    expect(await pending).toBe(0)
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('probes a declared video container through a video element', async () => {
    const pending = readDurationMs(new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' }))
    expect(createdTags).toEqual(['video'])
    const video = FakeAudio.instances[0]!
    video.duration = 12
    video.emit('loadedmetadata')
    expect(await pending).toBe(12_000)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicTrack } from '@shared/types'
import type { MusicSet } from './types'

vi.mock('../../../lib/api', () => ({
  api: { music: {} },
  musicStreamUrl: (id: string) => `/api/music/tracks/${id}/stream`,
  uploadMusicTrack: vi.fn(),
  uploadMusicToWebdav: vi.fn(),
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
  toastUploadError: vi.fn(),
  toastUploadSkip: vi.fn(),
}))
vi.mock('../music-metadata', () => ({
  readFileMetadata: vi.fn(async () => null),
  scanTrackMetadata: vi.fn(),
  probeTrackDuration: vi.fn(async () => 0),
}))
vi.mock('../music-probe', () => ({ readDurationMs: vi.fn(async () => 0) }))
vi.mock('../music-export', () => ({ saveBlob: vi.fn() }))

import { uploadMusicToWebdav, uploadMusicTrack } from '../../../lib/api'
import { saveBlob } from '../music-export'
import { toastMusic, toastUploadError, toastUploadSkip } from '../music-feedback'
import { dismissUpload, uploadFiles } from './library-collections'
import { downloadTracks } from './transfers'
import { LIMITS } from '@shared/constants'

function makeStore() {
  const loadLibrary = vi.fn(async () => {})
  return { ...musicStoreStub({ tracks: [], uploads: [], downloads: [], loadLibrary }), loadLibrary }
}

function audioFile(name: string): File {
  return new File(['some bytes'], name, { type: 'audio/mpeg' })
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function track(id: string): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 0, sizeBytes: 4, source: 'r2',
    coverUrl: null, lyric: null, mime: 'audio/mpeg',
  } as MusicTrack
}

describe('uploadFiles', () => {
  it('uploads several files at once but never more than the cap', async () => {
    let active = 0
    let maxActive = 0
    vi.mocked(uploadMusicTrack).mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return { track: track('uploaded'), error: null }
    })
    const store = makeStore()
    const files = Array.from({ length: 6 }, (_, index) => audioFile(`s${index}.mp3`))

    await uploadFiles(store.set, store.get, files)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(uploadMusicTrack).toHaveBeenCalledTimes(6)
  })

  it('reloads the library once for the whole batch', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3'), audioFile('b.mp3')])

    expect(store.get().loadLibrary).toHaveBeenCalledTimes(1)
  })
})

describe('uploadFiles progress', () => {
  it('collapses a burst of progress callbacks into one store write per task', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    vi.mocked(uploadMusicTrack).mockImplementation(async (...args: unknown[]) => {
      const onProgress = args[2] as (percent: number) => void
      for (let percent = 1; percent <= 50; percent += 1) onProgress(percent)
      return { track: track('uploaded'), error: null }
    })
    const percents: number[] = []
    const store = makeStore()
    const record = store.set
    const capturing: MusicSet = (patch) => {
      record(patch)
      const percent = store.get().uploads[0]?.percent
      if (percent !== undefined) percents.push(percent)
    }
    store.set = capturing

    await uploadFiles(store.set, store.get, [audioFile('a.mp3')])

    expect(percents).toEqual([0, 1, 100])
    vi.useRealTimers()
  })
})

describe('uploadFiles pre-check', () => {
  it('skips files whose extension is not a supported audio format', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3'), audioFile('notes.txt'), audioFile('cover.JPG')])

    expect(uploadMusicTrack).toHaveBeenCalledTimes(1)
    expect(toastUploadSkip).toHaveBeenCalledWith('music.upload_unsupported', 2)
  })

  it('uploads a video container instead of skipping it as unsupported', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [
      new File(['some bytes'], 'concert.mov', { type: 'video/quicktime' }),
      new File(['some bytes'], 'clip.m4v', { type: 'video/x-m4v' }),
    ])

    expect(uploadMusicTrack).toHaveBeenCalledTimes(2)
    expect(toastUploadSkip).not.toHaveBeenCalled()
  })

  it('skips oversized files without a task row or a library reload', async () => {
    const store = makeStore()
    const big = audioFile('big.mp3')
    Object.defineProperty(big, 'size', { value: LIMITS.musicTrackMaxBytes + 1 })

    await uploadFiles(store.set, store.get, [big])

    expect(uploadMusicTrack).not.toHaveBeenCalled()
    expect(store.get().uploads).toEqual([])
    expect(store.get().loadLibrary).not.toHaveBeenCalled()
    expect(toastUploadSkip).toHaveBeenCalledWith('music.upload_too_large', 1)
  })

  it('uploads every file when all pass the pre-check', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3'), audioFile('b.flac')])

    expect(uploadMusicTrack).toHaveBeenCalledTimes(2)
    expect(toastUploadSkip).not.toHaveBeenCalled()
  })
})

describe('upload cancellation', () => {
  it('dismissing an in-flight upload aborts its request without an error toast', async () => {
    let capturedSignal: AbortSignal | undefined
    vi.mocked(uploadMusicTrack).mockImplementation((...args: unknown[]) => {
      capturedSignal = args[3] as AbortSignal
      return new Promise((resolve) => {
        capturedSignal?.addEventListener('abort', () => resolve({ track: null, error: 'aborted' }))
      })
    })
    const store = makeStore()
    const run = uploadFiles(store.set, store.get, [audioFile('a.mp3')])
    await vi.waitFor(() => expect(uploadMusicTrack).toHaveBeenCalledTimes(1))
    const id = store.get().uploads[0]!.id

    dismissUpload(store.set, store.get, id)

    expect(capturedSignal?.aborted).toBe(true)
    expect(store.get().uploads).toEqual([])
    await run
    expect(toastUploadError).not.toHaveBeenCalled()
    expect(toastMusic).not.toHaveBeenCalled()
  })

  it('hands the same cancellation plumbing to webdav uploads', async () => {
    let webdavSignal: unknown
    vi.mocked(uploadMusicToWebdav).mockImplementation((...args: unknown[]) => {
      webdavSignal = args[3]
      return Promise.resolve({ track: null, error: 'aborted' })
    })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3')], 'webdav')

    expect(webdavSignal).toBeInstanceOf(AbortSignal)
    expect(toastUploadError).not.toHaveBeenCalled()
  })
})

describe('upload batch feedback', () => {
  it('reports one success toast carrying the whole batch count', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3'), audioFile('b.mp3'), audioFile('c.mp3')])

    expect(toastMusic).toHaveBeenCalledTimes(1)
    expect(toastMusic).toHaveBeenCalledWith('music.upload_done', { value0: 3 })
  })

  it('reports a single error toast for the batch and keeps failed rows visible', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: null, error: 'storage_unavailable' })
    const store = makeStore()

    await uploadFiles(store.set, store.get, [audioFile('a.mp3'), audioFile('b.mp3')])

    expect(toastUploadError).toHaveBeenCalledTimes(1)
    expect(toastUploadError).toHaveBeenCalledWith('storage_unavailable')
    expect(store.get().uploads).toHaveLength(2)
    expect(store.get().uploads.every((task) => task.status === 'failed')).toBe(true)
    expect(toastMusic).not.toHaveBeenCalled()
  })
})

describe('downloadTracks', () => {
  it('fetches several tracks at once and saves each when its own download completes', async () => {
    let active = 0
    let maxActive = 0
    const fetchMock = vi.fn(async (url: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      const id = url.split('/').at(-2)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(id ?? ''))
          controller.close()
        },
      })
      return { ok: true, headers: new Headers({ 'content-length': '4' }), body }
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = makeStore()
    const ids = ['t1', 't2', 't3', 't4', 't5']
    store.set({ tracks: ids.map(track) })

    await downloadTracks(store.set, store.get, ids)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(saveBlob).toHaveBeenCalledTimes(ids.length)
    vi.unstubAllGlobals()
  })
})

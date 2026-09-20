import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../../lib/i18n'

vi.mock('../../../lib/api', () => {
  class FakeApiError extends Error {
    status: number
    constructor(status: number, _code: string, message: string) {
      super(message)
      this.status = status
    }
  }
  return {
    ApiError: FakeApiError,
    api: { music: { publicPlaylist: vi.fn() } },
  }
})

import { api, ApiError } from '../../../lib/api'
import type { PublicPlaylist } from '../../../lib/api'
import { MusicPlaylistSharePage } from './page'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const SLUG = 'abc234def567ghi890jkl'

function track(id: string, over: Partial<{ artist: string; coverUrl: string | null; mime: string }> = {}) {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Singer',
    album: '',
    durationMs: 60_000,
    lyric: null,
    mime: over.mime ?? 'audio/mpeg',
    coverUrl: over.coverUrl ?? null,
    streamUrl: `/api/blog/public/music/playlists/${SLUG}/tracks/${id}/stream`,
    tagIds: [],
    createdAt: 0,
    ...over,
  }
}

function playlist(tracks: ReturnType<typeof track>[]): PublicPlaylist {
  return { name: 'Night Drive', description: 'late-night drives', tracks } as PublicPlaylist
}

let root: Root | null = null

async function mount(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicPlaylistSharePage, { slug: SLUG }))
  })
}

function trackRow(id: string): HTMLButtonElement {
  return [...document.querySelectorAll('ol button')].find((button) => button.textContent?.includes(`Track ${id}`)) as HTMLButtonElement
}

// The page picks the element itself, so the helper that reads it has to follow the tag
// rather than assume audio: which element a track got is part of what these tests assert.
function media(): HTMLAudioElement | null {
  return document.querySelector('audio, video')
}

beforeEach(() => {
  vi.mocked(api.music.publicPlaylist).mockReset()
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('anonymous playlist page (M-51)', () => {
  it('shows a loading state before the fetch resolves', async () => {
    let resolve!: (value: PublicPlaylist) => void
    vi.mocked(api.music.publicPlaylist).mockReturnValue(new Promise((r) => { resolve = r }))
    await mount()
    expect(document.querySelector('[role="status"]')).not.toBeNull()
    resolve(playlist([track('t1')]))
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(document.body.textContent).toContain('Night Drive')
  })

  it('renders the shared tracks with their metadata and no audio bar before a pick', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('t1'), track('t2', { artist: '' })]))
    await mount()
    expect(document.querySelectorAll('ol li')).toHaveLength(2)
    expect(document.body.textContent).toContain('late-night drives')
    expect(document.body.textContent).toContain(t('music.unknown_artist'))
    expect(media()).toBeNull()
  })

  it('picking a track starts the keyed audio element at its stream url', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('t1'), track('t2')]))
    await mount()
    await act(async () => { trackRow('t2').click() })
    expect(media()?.getAttribute('src')).toContain('/tracks/t2/stream')
    expect(trackRow('t2').getAttribute('aria-current')).toBe('true')
    expect(media()?.hasAttribute('controls')).toBe(true)
  })

  it('plays a shared video track on a video element that shows its own picture', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([
      track('clip', { mime: 'video/mp4' }),
      track('clip2', { mime: 'video/mp4' }),
    ]))
    await mount()
    await act(async () => { trackRow('clip').click() })
    const element = document.querySelector('video') as HTMLVideoElement | null
    expect(element?.getAttribute('src')).toContain('/tracks/clip/stream')
    expect(element?.hasAttribute('controls')).toBe(true)
    expect(element?.hasAttribute('playsinline')).toBe(true)
    expect(document.querySelector('audio')).toBeNull()
    await act(async () => { media()!.dispatchEvent(new Event('ended', { bubbles: true })) })
    expect(media()).not.toBe(element)
    expect((media() as HTMLVideoElement).tagName).toBe('VIDEO')
  })

  it('keeps an audio track on an audio element, not a black video box', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('t1')]))
    await mount()
    await act(async () => { trackRow('t1').click() })
    expect(media()?.tagName).toBe('AUDIO')
    expect(document.querySelector('video')).toBeNull()
  })

  it('advances to the next track when the current one ends', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('t1'), track('t2')]))
    await mount()
    await act(async () => { trackRow('t1').click() })
    expect(media()?.getAttribute('src')).toContain('/tracks/t1/stream')
    const first = media()
    await act(async () => { media()!.dispatchEvent(new Event('ended', { bubbles: true })) })
    expect(media()?.getAttribute('src')).toContain('/tracks/t2/stream')
    // Advancing must hand the browser a fresh element: swapping src on the live one would keep
    // the previous track's decoder and buffer, which is what the key on the track id prevents.
    expect(media()).not.toBe(first)
    await act(async () => { media()!.dispatchEvent(new Event('ended', { bubbles: true })) })
    expect(media()?.getAttribute('src')).toContain('/tracks/t2/stream')
  })

  it('a revoked or unknown link reads as gone, not broken', async () => {
    vi.mocked(api.music.publicPlaylist).mockRejectedValue(new ApiError(404, 'not_found', 'gone'))
    await mount()
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(t('music.playlist_link_gone'))
    expect(document.querySelectorAll('ol li')).toHaveLength(0)
  })

  it('any other failure gets its own message', async () => {
    vi.mocked(api.music.publicPlaylist).mockRejectedValue(new Error('network'))
    await mount()
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(t('music.playlist_link_failed'))
  })

  it('an empty shared playlist still shows the header with zero tracks', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([]))
    await mount()
    expect(document.body.textContent).toContain('Night Drive')
    expect(document.body.textContent).toContain(t('music.playlist_empty'))
    expect(media()).toBeNull()
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, act, createElement } from 'react'
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

// `createdAt` is when the track itself was created and `addedAt` is when it entered this playlist;
// the visit cases set the second, and leave the first where it does not matter.
function track(id: string, over: Partial<{ artist: string; coverUrl: string | null; mime: string; createdAt: number; addedAt: number }> = {}) {
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
    addedAt: 0,
    ...over,
  }
}

function playlist(tracks: ReturnType<typeof track>[]): PublicPlaylist {
  return { name: 'Night Drive', description: 'late-night drives', coverUrl: null, tracks } as PublicPlaylist
}

let root: Root | null = null

// The app itself renders under StrictMode (main.tsx), which runs an effect twice, so a case that
// depends on what an effect decides has to be asked in that mode too — a claim that reads the stamp
// it just wrote answers differently the second time.
async function mount(strict = false): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const page = createElement(MusicPlaylistSharePage, { slug: SLUG })
  await act(async () => {
    root?.render(strict ? createElement(StrictMode, null, page) : page)
  })
  return container
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
  // The visit stamp lives in storage, so a case that sets one must not decide the next case's answer.
  window.localStorage.clear()
})

// One key per share slug, so the cases below share the name the page writes rather than each spelling
// the prefix out.
const visitKey = `inkstone.playlist-visit.${SLUG}`

// The reminder is a comparison against a stamp this browser keeps, so these cases pin both halves:
// what a returning reader is told, and that a first visit is told nothing.
describe('what changed since the last visit (M-51)', () => {
  it('says nothing at all on a first visit', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('t1', { addedAt: 5_000 })]))
    await mount()
    expect(document.body.textContent).not.toContain(t('music.share_new_badge'))
    expect(document.body.textContent).not.toContain(t('music.share_visit_memory_note'))
  })

  it('names the new tracks and marks each one', async () => {
    window.localStorage.setItem(visitKey, String(1_000))
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([
      track('old', { addedAt: 500 }),
      track('fresh', { addedAt: 2_000 }),
    ]))
    await mount()
    expect(document.body.textContent).toContain(t('music.share_new_since_visit', { value0: 1 }))
    expect(trackRow('fresh').textContent).toContain(t('music.share_new_badge'))
    expect(trackRow('old').textContent).not.toContain(t('music.share_new_badge'))
  })
  it('drops the reminder and the stamp when the reader says to stop', async () => {
    window.localStorage.setItem(visitKey, String(1_000))
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('fresh', { addedAt: 2_000 })]))
    await mount()
    const stop = [...document.querySelectorAll('button')].find((button) => button.textContent === t('music.share_forget_visit'))
    await act(async () => { stop?.click() })
    expect(window.localStorage.getItem(visitKey)).toBeNull()
    expect(document.body.textContent).not.toContain(t('music.share_new_since_visit', { value0: 1 }))
  })
})

// The stamp is written as the visit ends and records what was shown — not when the reader arrived.
// Without it the reminder would report the same tracks every time, and a stamp of "now" would swallow
// whatever appeared while the page was open, so both halves are pinned here.
describe('what a visit leaves behind (M-51)', () => {
  it('remembers what it showed once the visit ends, not when it began', async () => {
    window.localStorage.setItem(visitKey, String(1_000))
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('old', { addedAt: 500 })]))
    await mount()
    expect(window.localStorage.getItem(visitKey)).toBe(String(1_000))
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    expect(window.localStorage.getItem(visitKey)).toBe('500')
  })

  it('still reports a track that appeared while the page was open', async () => {
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([track('first', { addedAt: 1_000 })]))
    // The first page is taken out of the document rather than left behind: a second mount would
    // otherwise be read together with the first one's rows.
    const visited = await mount()
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    act(() => root?.unmount())
    root = null
    visited.remove()
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([
      track('first', { addedAt: 1_000 }),
      track('during', { addedAt: 1_500 }),
    ]))
    await mount()
    expect(document.body.textContent).toContain(t('music.share_new_since_visit', { value0: 1 }))
    expect(trackRow('during').textContent).toContain(t('music.share_new_badge'))
  })
})

// The app renders under StrictMode, so the same question is asked in the mode the app actually runs in:
// the claim has to answer the same thing twice, because the pass the reader sees is the last one.
describe('the reminder when the effect runs twice (M-51)', () => {
  it('still reports the change under StrictMode', async () => {
    window.localStorage.setItem(visitKey, String(1_000))
    vi.mocked(api.music.publicPlaylist).mockResolvedValue(playlist([
      track('old', { addedAt: 500 }),
      track('fresh', { addedAt: 2_000 }),
    ]))
    await mount(true)
    expect(document.body.textContent).toContain(t('music.share_new_since_visit', { value0: 1 }))
    expect(trackRow('fresh').textContent).toContain(t('music.share_new_badge'))
  })
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

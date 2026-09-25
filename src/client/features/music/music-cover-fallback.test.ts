import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { MusicNowPlaying } from './music-now-playing'
import { MusicPlayerControls } from './music-player-controls'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
})

let root: Root | null = null

function coveredTrack(): MusicTrack {
  return {
    id: 'track-1', title: 'Moonlight', artist: 'Hu Yanbin', album: 'Answer', durationMs: 200_000,
    source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 1024,
    coverUrl: '/covers/moonlight.png', lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
  }
}

async function mount(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root?.render(node) })
  return container
}

function seed(track: MusicTrack): void {
  useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0, toggleFavorite: vi.fn(), togglePin: vi.fn() })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// Two surfaces hand-rolled an <img> instead of drawing the cover through MusicArtwork, so a
// cover URL that 404s — a dead remote link, a WebDAV file moved out from under the library —
// left a broken image where every other surface in the app shows the music icon.
describe('a cover that fails to load', () => {
  it('falls back to the icon in the hub footer', async () => {
    seed(coveredTrack())
    const container = await mount(createElement(MusicPlayerControls, { queueOpen: false, onToggleQueue: () => {} }))
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    await act(async () => { img!.dispatchEvent(new Event('error')) })
    expect(container.querySelector('img')).toBeNull()
  })

  it('falls back to the icon in the now-playing column', async () => {
    seed(coveredTrack())
    const container = await mount(createElement(MusicNowPlaying, { tab: 'lyrics', onTabChange: () => {}, onEditTags: () => {} }))
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    await act(async () => { img!.dispatchEvent(new Event('error')) })
    expect(container.querySelector('img')).toBeNull()
  })
})

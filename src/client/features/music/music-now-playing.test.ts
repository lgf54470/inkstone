import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicNowPlaying } from './music-now-playing'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

function playingTrack(): MusicTrack {
  return {
    id: 'track-1',
    title: 'Moonlight',
    artist: 'Hu Yanbin',
    album: 'Answer',
    durationMs: 200_000,
    source: 'r2',
    format: 'mp3',
    webdavPath: null,
    mime: 'audio/mpeg',
    sizeBytes: 1024,
    coverUrl: null,
    lyric: null,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

let root: Root | null = null

async function mountDetails(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const node = createElement(MusicNowPlaying, {
    tab: 'details' as const,
    onTabChange: () => {},
    onEditTags: () => {},
  }) as ReactNode
  await act(async () => {
    root?.render(node)
  })
  return container
}

function buttonByLabel(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function seedStore(overrides: Record<string, unknown>) {
  const track = playingTrack()
  useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0, currentTimeMs: 0, ...overrides })
  return track
}

describe('MusicNowPlaying details panel', () => {
  it('routes a favorite click to the store toggle for the playing track', async () => {
    const track = seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountDetails()
    const favorite = buttonByLabel(container, t('music.favorite'))
    expect(favorite).toBeDefined()
    await act(async () => {
      favorite?.click()
    })
    expect(useMusic.getState().toggleFavorite).toHaveBeenCalledWith(track.id)
  })

  it('routes a pin click to the store toggle for the playing track', async () => {
    const track = seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountDetails()
    const pin = buttonByLabel(container, t('music.pin'))
    expect(pin).toBeDefined()
    await act(async () => {
      pin?.click()
    })
    expect(useMusic.getState().togglePin).toHaveBeenCalledWith(track.id)
  })
})

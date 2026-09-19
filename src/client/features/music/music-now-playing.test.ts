import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicNowPlaying } from './music-now-playing'
import { setProgressTime, useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
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
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

let root: Root | null = null

async function mountPanel(tab: 'lyrics' | 'details' = 'details'): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const node = createElement(MusicNowPlaying, {
    tab,
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
  setProgressTime(0)
})

function seedStore(overrides: Record<string, unknown>) {
  const track = playingTrack()
  useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0, ...overrides })
  return track
}

describe('MusicNowPlaying details panel', () => {
  it('routes a favorite click to the store toggle for the playing track', async () => {
    const track = seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountPanel()
    const favorite = buttonByLabel(container, t('music.favorite'))
    expect(favorite).toBeDefined()
    await act(async () => {
      favorite?.click()
    })
    expect(useMusic.getState().toggleFavorite).toHaveBeenCalledWith(track.id)
  })

  it('routes a pin click to the store toggle for the playing track', async () => {
    const track = seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountPanel()
    const pin = buttonByLabel(container, t('music.pin'))
    expect(pin).toBeDefined()
    await act(async () => {
      pin?.click()
    })
    expect(useMusic.getState().togglePin).toHaveBeenCalledWith(track.id)
  })
})

describe('MusicNowPlaying lyrics', () => {
  it('moves the highlighted line from progress ticks alone', async () => {
    const track = playingTrack()
    track.lyric = '[00:00.00]First\n[00:05.00]Second'
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track] })
    const container = await mountPanel('lyrics')
    const activeTexts = () => [...container.querySelectorAll('p')].flatMap((p) => (
      p.getAttribute('data-active-line') === 'true' ? [p.textContent] : []
    ))
    expect(activeTexts()).toEqual(['First'])
    await act(async () => {
      setProgressTime(6_000)
    })
    expect(activeTexts()).toEqual(['Second'])
  })
})

// A scrollable pane the keyboard can never reach hides its overflow from
// keyboard and screen-reader users; it must be a focus stop with a name.
describe('MusicNowPlaying scroll region (UI-17)', () => {
  it('lets the keyboard scroll the details pane under its own name', async () => {
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountPanel('details')
    const scroller = container.querySelector('.overflow-y-auto') as HTMLElement | null
    expect(scroller).not.toBeNull()
    expect(scroller?.getAttribute('tabindex')).toBe('0')
    expect(scroller?.getAttribute('aria-label')).toBe(t('music.details'))
  })
})

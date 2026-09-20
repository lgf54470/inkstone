import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t, setLocale } from '../../lib/i18n'
import { fullTime } from '../../lib/time'
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
    lastPlayedAt: null, contentHash: null,
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

afterEach(async () => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  setProgressTime(0)
  await setLocale('en-US', false)
})

function seedStore(overrides: Record<string, unknown>) {
  const track = playingTrack()
  useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0, ...overrides })
  return track
}

describe('MusicNowPlaying header (UI-20)', () => {
  it('names the playing track above the tabs', async () => {
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountPanel('lyrics')
    const header = container.querySelector('header')
    expect(header?.textContent).toContain('Moonlight')
    expect(header?.textContent).toContain('Hu Yanbin')
  })

  it('falls back to the unknown artist when the file carries none', async () => {
    const track = playingTrack()
    track.artist = ''
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track] })
    const container = await mountPanel('lyrics')
    expect(container.querySelector('header')?.textContent).toContain(t('music.unknown_artist'))
  })

  it('says nothing is playing when the queue is empty', async () => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
    const container = await mountPanel('lyrics')
    expect(container.querySelector('header')?.textContent).toContain(t('music.nothing_playing'))
  })
})

describe('MusicNowPlaying lyrics empty states (UI-20)', () => {
  function lyricPaneText(container: HTMLElement): string {
    return container.querySelector(`[aria-label="${t('music.lyrics')}"]`)?.textContent ?? ''
  }

  it('does not claim a track has no lyrics while the lyric is still on its way', async () => {
    const track = playingTrack()
    track.hasLyric = true
    track.lyric = null
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track], ensureTrackLyric: vi.fn(async () => {}) })
    const container = await mountPanel('lyrics')
    expect(lyricPaneText(container)).toContain(t('music.lyrics_loading'))
    expect(lyricPaneText(container)).not.toContain(t('music.no_lyrics'))
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it('swaps the loading line for the words once the lyric arrives', async () => {
    const track = playingTrack()
    track.hasLyric = true
    track.lyric = null
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track], ensureTrackLyric: vi.fn(async () => {}) })
    const container = await mountPanel('lyrics')
    await act(async () => {
      useMusic.setState({ tracks: [{ ...track, lyric: '[00:00.00]First' }] })
    })
    expect(lyricPaneText(container)).toContain('First')
    expect(lyricPaneText(container)).not.toContain(t('music.lyrics_loading'))
  })

  it('reports a track without lyrics as such', async () => {
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    const container = await mountPanel('lyrics')
    expect(lyricPaneText(container)).toContain(t('music.no_lyrics'))
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('says nothing is playing instead of blaming the track for having no lyrics', async () => {
    useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
    const container = await mountPanel('lyrics')
    expect(lyricPaneText(container)).toContain(t('music.nothing_playing'))
    expect(lyricPaneText(container)).not.toContain(t('music.no_lyrics'))
  })
})

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

  // The date belongs to the reader's language like everything else on the panel; the
  // browser default would answer in whatever language the OS is set to instead.
  it('writes the added-at date in the app locale, not in the browser default', async () => {
    const createdAt = Date.UTC(2026, 8, 3, 10, 24)
    const track = seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn() })
    track.createdAt = createdAt
    await setLocale('zh-CN', false)
    const container = await mountPanel()
    expect(container.textContent).toContain(fullTime(createdAt))
    expect(container.textContent).not.toContain(new Date(createdAt).toLocaleDateString())
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

// The playback element is engine-owned; a surface only lends it a box, so a track with a
// picture replaces the cover tile rather than rendering a second video player.
describe('MusicNowPlaying video picture', () => {
  it('shows the stage instead of the cover tile for a video track', async () => {
    const track = playingTrack()
    track.mime = 'video/mp4'
    track.coverUrl = 'https://example.test/cover.png'
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track] })
    const container = await mountPanel()
    expect(container.querySelector('.music-video-stage')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the cover tile for an audio track', async () => {
    const track = playingTrack()
    track.coverUrl = 'https://example.test/cover.png'
    seedStore({ toggleFavorite: vi.fn(), togglePin: vi.fn(), tracks: [track] })
    const container = await mountPanel()
    expect(container.querySelector('.music-video-stage')).toBeNull()
    expect(container.querySelector('img')).not.toBeNull()
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

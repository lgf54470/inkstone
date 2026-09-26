import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { MusicImmersivePlayer } from './music-immersive-player'
import { progressTimeMs, setProgressTime, useMusic } from './music-store'
import { MUSIC_NARROW_BREAKPOINT } from './music-utils'

// The count is a formatted string, so the assertions need the real resources.
beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
})

// This jsdom ships no matchMedia at all; the player reads one media query now.
function stubViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  stubViewportWidth(1280)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, lyricOffsets: {} })
  setProgressTime(0)
  vi.unstubAllGlobals()
})

let root: Root | null = null

async function mountPlayer(onClose: () => void): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicImmersivePlayer, { open: true, onClose }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
})

describe('MusicImmersivePlayer close affordances', () => {
  it('names the dialog instead of leaving the generic overlay label', async () => {
    await mountPlayer(vi.fn())
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe(t('music.immersive'))
  })

  it('offers a visible close button that calls onClose', async () => {
    const onClose = vi.fn()
    await mountPlayer(onClose)
    const close = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.exit_immersive'))
    expect(close).toBeDefined()
    await act(async () => {
      close?.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('MusicImmersivePlayer column stacking — UI-14', () => {
  function leftPane(): HTMLElement | null {
    return document.querySelector('[role="dialog"] section')
  }

  it('keeps the artwork column beside the lyrics when the viewport is wide', async () => {
    await mountPlayer(vi.fn())
    const pane = leftPane()
    expect(pane?.classList.contains('w-96')).toBe(true)
    expect(pane?.parentElement?.classList.contains('flex-col')).toBe(false)
  })

  it('stacks the artwork row above the lyrics below the narrow breakpoint', async () => {
    stubViewportWidth(MUSIC_NARROW_BREAKPOINT - 1)
    await mountPlayer(vi.fn())
    const pane = leftPane()
    expect(pane?.classList.contains('w-full')).toBe(true)
    expect(pane?.classList.contains('w-96')).toBe(false)
    expect(pane?.parentElement?.classList.contains('flex-col')).toBe(true)
  })
})

describe('MusicImmersivePlayer queue count (UI-18)', () => {
  function header(): HTMLElement | null {
    return document.querySelector('[role="dialog"]')
  }

  it('follows the queue instead of reading it once at mount', async () => {
    useMusic.setState({ tracks: [], queue: ['t1'], currentIndex: 0 })
    await mountPlayer(vi.fn())
    expect(header()?.textContent).toContain(t('music.queue_count', { value0: 1 }))

    await act(async () => {
      useMusic.setState({ queue: ['t1', 't2', 't3'] })
    })

    expect(header()?.textContent).toContain(t('music.queue_count', { value0: 3 }))
  })
})

describe('MusicImmersivePlayer video picture', () => {
  function videoTrack(): MusicTrack {
    return {
      id: 'video-1',
      title: 'Concert',
      artist: 'Hu Yanbin',
      album: 'Live',
      durationMs: 200_000,
      source: 'r2',
      format: 'mp4',
      webdavPath: null,
      mime: 'video/mp4',
      sizeBytes: 1024,
      coverUrl: 'https://example.test/cover.png',
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

  it('shows the stage instead of a cover tile when the playing track has a picture', async () => {
    const track = videoTrack()
    useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0 })
    await mountPlayer(vi.fn())
    const pane = document.querySelector('[role="dialog"] section')
    expect(pane?.querySelector('.music-video-stage')).not.toBeNull()
    expect(pane?.querySelector('img')).toBeNull()
  })
})

describe('MusicImmersivePlayer lyrics empty states (UI-6)', () => {
  function lyricPane(): HTMLElement | null {
    return document.querySelector(`[aria-label="${t('music.lyrics')}"]`)
  }

  function seedTrack(track: Partial<MusicTrack>): void {
    const full: MusicTrack = {
      id: 'track-1', title: 'Moonlight', artist: 'Hu Yanbin', album: 'Answer',
      durationMs: 200_000, source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg',
      sizeBytes: 1024, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
      isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
      createdAt: 0, updatedAt: 0,
      ...track,
    }
    useMusic.setState({ tracks: [full], queue: [full.id], currentIndex: 0, ensureTrackLyric: vi.fn(async () => {}) })
  }

  it('does not blame the file when nothing is playing', async () => {
    await mountPlayer(vi.fn())
    expect(lyricPane()?.textContent).toContain(t('music.nothing_playing'))
    expect(lyricPane()?.textContent).not.toContain(t('music.no_lyrics'))
  })

  it('says the words are on their way while the lyric is still loading', async () => {
    seedTrack({ hasLyric: true, lyric: null })
    await mountPlayer(vi.fn())
    expect(lyricPane()?.textContent).toContain(t('music.lyrics_loading'))
    expect(lyricPane()?.querySelector('[role="status"]')).not.toBeNull()
  })

  it('reports a track that really carries no words', async () => {
    seedTrack({ hasLyric: false, lyric: null })
    await mountPlayer(vi.fn())
    expect(lyricPane()?.textContent).toContain(t('music.no_lyrics'))
    expect(lyricPane()?.querySelector('[role="status"]')).toBeNull()
  })
})

describe('MusicImmersivePlayer scroll regions (UI-17)', () => {
  it('gives the lyrics and queue panes a keyboard focus stop each', async () => {
    const track: MusicTrack = {
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
      lyric: '[00:00.00]First',
      hasLyric: true,
      tagIds: [],
      isFavorite: false,
      isPinned: false,
      playCount: 0,
      lastPlayedAt: null, contentHash: null,
      createdAt: 0,
      updatedAt: 0,
    }
    useMusic.setState({ tracks: [track], queue: [track.id], currentIndex: 0 })
    await mountPlayer(vi.fn())
    const lyrics = document.querySelector(`[aria-label="${t('music.lyrics')}"]`) as HTMLElement | null
    const queue = document.querySelector(`[aria-label="${t('music.queue')}"]`) as HTMLElement | null
    expect(lyrics?.classList.contains('overflow-y-auto')).toBe(true)
    expect(lyrics?.getAttribute('tabindex')).toBe('0')
    expect(queue?.classList.contains('overflow-y-auto')).toBe(true)
    expect(queue?.getAttribute('tabindex')).toBe('0')
  })
})
const CALIBRATED_LYRIC = '[00:01.000]first line\n[00:05.000]second line'

function lyricTrack(lyric: string): MusicTrack {
  return {
    id: 't1', title: 'Calibrated', artist: 'Singer', album: 'Album', durationMs: 60_000,
    source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 1024,
    coverUrl: null, lyric, hasLyric: true, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

async function mountWithLyrics(offsetMs: number): Promise<void> {
  const track = lyricTrack(CALIBRATED_LYRIC)
  useMusic.setState({
    tracks: [track],
    queue: [track.id],
    currentIndex: 0,
    durationMs: track.durationMs,
    lyricOffsets: offsetMs ? { [track.id]: offsetMs } : {},
  })
  await mountPlayer(vi.fn())
}

function lyricLineButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .filter((button) => (button.textContent ?? '').includes('line'))
}

function activeLyricLineText(): (string | null)[] {
  return [...document.querySelectorAll('[data-active-line="true"]')].map((line) => line.textContent)
}

describe('MusicImmersivePlayer lyric line seek — F-1', () => {
  it('seeks to the lyric line that was clicked', async () => {
    await mountWithLyrics(0)
    await act(async () => {
      lyricLineButtons()[1]?.click()
    })
    expect(progressTimeMs()).toBe(5_000)
  })

  it('adds the track calibration to the seek target', async () => {
    await mountWithLyrics(1_000)
    await act(async () => {
      lyricLineButtons()[1]?.click()
    })
    expect(progressTimeMs()).toBe(6_000)
  })
})

describe('MusicImmersivePlayer lyric calibration — F-1', () => {
  it('holds the highlight back by the track calibration', async () => {
    await mountWithLyrics(1_000)
    await act(async () => {
      setProgressTime(5_500)
    })
    expect(activeLyricLineText()).toEqual(['first line'])
  })

  it('nudges and resets the calibration from the header controls', async () => {
    await mountWithLyrics(0)
    const control = (label: string) => [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === label)
    expect(control(t('music.lyric_offset_later'))).toBeDefined()

    await act(async () => {
      control(t('music.lyric_offset_later'))?.click()
    })
    expect(useMusic.getState().lyricOffsets.t1).toBe(250)

    await act(async () => {
      control(t('music.lyric_offset_reset'))?.click()
    })
    expect(useMusic.getState().lyricOffsets.t1).toBeUndefined()
  })
})

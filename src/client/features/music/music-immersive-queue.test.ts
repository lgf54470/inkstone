import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { MusicImmersivePlayer } from './music-immersive-player'
import { useMusic } from './music-store'
import { MUSIC_NARROW_BREAKPOINT } from './music-utils'

// FB2-U1: the same queue has two homes. A wide window keeps it in the artwork column, which had half
// a column of nothing under the transport while the queue spent a slice of the lyrics column below
// the words — and it gets the search the hub and the floating player already answer with. The stacked
// shape keeps the strip, because a phone has no second column to put it in. These are the layout
// facts jsdom can still see: which section hosts the queue, whether the search is there, and whether
// typing in it really narrows the rows. Which column that is on screen is the browser gate's read.
beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollIntoView = vi.fn()
})

function stubViewportWidth(width: number): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

let root: Root | null = null

async function mountPlayer(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicImmersivePlayer, { open: true, onClose: vi.fn() }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, lyricOffsets: {} })
  vi.unstubAllGlobals()
})

function queueTrack(id: string, title: string): MusicTrack {
  return {
    id, title, artist: 'Singer', album: 'Album', durationMs: 60_000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 1024, coverUrl: null, lyric: null, hasLyric: false,
    tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null,
    contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

function seedQueue(titles: string[]): void {
  const tracks = titles.map((title, index) => queueTrack(`track-${index}`, title))
  useMusic.setState({ tracks, queue: tracks.map((track) => track.id), currentIndex: 0 })
}

function dialogSections(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"] section')]
}

function queueGroup(): HTMLElement | null {
  return document.querySelector(`[aria-label="${t('music.queue')}"]`)
}

function queueSearch(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${t('music.queue_search')}"]`)
}

function queueToggleButton(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === t('music.queue_toggle'),
  ) as HTMLButtonElement | undefined
}

function queueRowTitles(): string[] {
  return [...(queueGroup()?.querySelectorAll('button') ?? [])]
    .map((button) => button.textContent ?? '')
    .filter((text) => text.includes('Song'))
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// FB3-U2: which shape opens with the queue already out. A wide window has a column whose lower half
// was empty on every open, and folding it first meant the reader had to ask for a panel the surface had
// room for; the stacked shape's queue is a strip that costs the lyrics ~160px, so it stays folded until
// it is asked for. The asymmetry is the point, and it is the default only: once the reader presses the
// toggle their answer wins, whatever the window does afterwards.
function queueEntryRow(): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === t('music.queue_toggle')
      && button.getAttribute('aria-expanded') === 'false',
  ) as HTMLButtonElement | undefined
}

describe('MusicImmersivePlayer queue fold default (FB3-U2)', () => {
  it('opens with the searchable queue already in the artwork column on a wide window', async () => {
    stubViewportWidth(1280)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    const [artwork, lyrics] = dialogSections()
    expect(artwork.querySelector(`[aria-label="${t('music.queue')}"]`)).not.toBeNull()
    expect(lyrics.querySelector(`[aria-label="${t('music.queue')}"]`)).toBeNull()
    expect(queueSearch()).not.toBeNull()
    expect(queueToggleButton()?.getAttribute('aria-expanded')).toBe('true')
  })

  it('still starts folded where the columns stack, with the strip row as the way in', async () => {
    stubViewportWidth(MUSIC_NARROW_BREAKPOINT - 1)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    expect(queueGroup()).toBeNull()
    expect(queueEntryRow()).toBeDefined()
  })

  it('keeps the fold the reader chose when the surface re-renders', async () => {
    stubViewportWidth(1280)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    await act(async () => { queueToggleButton()?.click() })
    expect(queueGroup()).toBeNull()
    await act(async () => { useMusic.setState({ durationMs: 12_345 }) })
    expect(queueGroup()).toBeNull()
    expect(queueToggleButton()?.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('MusicImmersivePlayer queue placement (FB2-U1)', () => {
  it('puts the searchable queue in the artwork column on a wide window', async () => {
    stubViewportWidth(1280)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    const [artwork, lyrics] = dialogSections()
    expect(artwork.querySelector(`[aria-label="${t('music.queue')}"]`)).not.toBeNull()
    expect(lyrics.querySelector(`[aria-label="${t('music.queue')}"]`)).toBeNull()
    expect(queueSearch()).not.toBeNull()
    expect(queueToggleButton()?.getAttribute('aria-expanded')).toBe('true')
  })

  it('narrows the queue from that search box', async () => {
    stubViewportWidth(1280)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    expect(queueRowTitles()).toEqual(['Song One', 'Song Two'])
    await act(async () => { typeInto(queueSearch()!, 'two') })
    expect(queueRowTitles()).toEqual(['Song Two'])
  })

  it('keeps the queue under the lyrics when the columns stack', async () => {
    stubViewportWidth(MUSIC_NARROW_BREAKPOINT - 1)
    seedQueue(['Song One', 'Song Two'])
    await mountPlayer()
    await act(async () => { queueEntryRow()?.click() })
    const [artwork, lyrics] = dialogSections()
    expect(artwork.querySelector(`[aria-label="${t('music.queue')}"]`)).toBeNull()
    expect(lyrics.querySelector(`[aria-label="${t('music.queue')}"]`)).not.toBeNull()
  })
})

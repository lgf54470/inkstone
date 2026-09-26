import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { MusicImmersivePlayer } from './music-immersive-player'
import { MusicNowPlaying } from './music-now-playing'
import { useMusic } from './music-store'

const lyric = '[00:01.000]first line\n[00:02.000]second line\n[00:03.000]third line'

function track(): MusicTrack {
  return {
    id: 't1', title: 'Song', artist: 'Artist', album: 'Album', durationMs: 10_000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null,
    lyric, hasLyric: true, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
  } as MusicTrack
}

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

async function mount(element: React.ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
  vi.unstubAllGlobals()
})

describe('lyric style applies to both lyric surfaces (FEA-C4)', () => {
  it('renders the immersive lines at the default size and alignment', async () => {
    stubViewportWidth(1280)
    useMusic.setState({ tracks: [track()], queue: ['t1'], currentIndex: 0 })
    await mount(createElement(MusicImmersivePlayer, { open: true, onClose: () => {} }))
    const line = document.querySelector('[data-active-line]') as HTMLElement | null
    expect(line?.className).toContain('text-[length:var(--text-15)]')
    expect(line?.className).toContain('text-left')
  })

  it('follows a style change immediately in the immersive panel', async () => {
    stubViewportWidth(1280)
    useMusic.setState({ tracks: [track()], queue: ['t1'], currentIndex: 0, lyricAlign: 'center', lyricTextSize: 'large' })
    await mount(createElement(MusicImmersivePlayer, { open: true, onClose: () => {} }))
    const line = document.querySelector('[data-active-line]') as HTMLElement | null
    expect(line?.className).toContain('text-[length:var(--text-18)]')
    expect(line?.className).toContain('text-center')
  })

  it('keeps the now-playing column in step with the same preference', async () => {
    useMusic.setState({ tracks: [track()], queue: ['t1'], currentIndex: 0, lyricAlign: 'right', lyricTextSize: 'large' })
    await mount(createElement(MusicNowPlaying, { tab: 'lyrics', onTabChange: () => {}, onEditTags: () => {} }))
    const line = document.querySelector('[data-active-line]') as HTMLElement | null
    expect(line?.className).toContain('text-[length:var(--text-14)]')
    // The column lines are plain paragraphs: the alignment lives on their container.
    const container = line?.parentElement
    expect(container?.className).toContain('text-right')
  })

  it('changes the alignment from the style popover', async () => {
    stubViewportWidth(1280)
    useMusic.setState({ tracks: [track()], queue: ['t1'], currentIndex: 0 })
    await mount(createElement(MusicImmersivePlayer, { open: true, onClose: () => {} }))
    const trigger = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.lyric_style'))
    expect(trigger).toBeDefined()
    await act(async () => {
      trigger?.click()
    })
    const right = [...document.querySelectorAll('[role="radio"]')].find((radio) => radio.getAttribute('aria-label') === t('music.lyric_align_right')) as HTMLElement | undefined
    expect(right).toBeDefined()
    await act(async () => {
      right?.click()
    })
    expect(useMusic.getState().lyricAlign).toBe('right')
  })
})

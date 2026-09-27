import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicHubModal } from './music-hub-modal'
import { hubStyle } from './music-hub-window'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

// This jsdom ships no matchMedia at all; the hub reads one media query now.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

let root: Root | null = null

async function mountHub(): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicHubModal, { open: true, onClose: () => {} }))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], tags: [], playlists: [], loading: false, loadError: null, query: '', scope: { kind: 'all' } })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// REF-9: the hub was a fixed 84vh centred sheet at every size, which on a phone or a
// short laptop window left the track list a couple of hundred pixels once the header,
// toolbar and transport had taken their fixed share.
describe('MusicHubModal viewport fit (REF-9)', () => {
  // This jsdom ships no matchMedia; the stub answers width and height queries apart.
  function stubViewport(widthMatches: boolean, heightMatches: boolean): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('min-width') ? widthMatches : heightMatches,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  }

  function panel(): HTMLElement | null {
    return document.querySelector('[role="dialog"]')
  }

  it('fills the viewport when the screen is narrow', async () => {
    stubViewport(false, true)
    await mountHub()
    expect(panel()?.classList.contains('h-full')).toBe(true)
    expect(panel()?.classList.contains('min-h-145')).toBe(false)
  })

  it('fills the viewport when the window is too short for 84vh', async () => {
    stubViewport(true, false)
    await mountHub()
    expect(panel()?.classList.contains('h-full')).toBe(true)
  })

  it('stays a centred sheet on a roomy desktop window', async () => {
    stubViewport(true, true)
    await mountHub()
    expect(panel()?.classList.contains('h-[84vh]')).toBe(true)
    expect(panel()?.classList.contains('min-h-145')).toBe(true)
    expect(panel()?.classList.contains('h-full')).toBe(false)
  })
})

// REF-1a: the header owned a close button and nothing else, so the library could never
// grow past the width it was built with. Maximising is a state flip on the same dialog.
describe('MusicHubModal maximised window (REF-1a)', () => {
  beforeEach(() => {
    useMusic.setState({ hubMaximized: false })
  })

  function headerButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined
  }

  it('offers a maximise button beside the close button', async () => {
    await mountHub()
    expect(headerButton(t('music.maximize_hub'))).toBeDefined()
    expect(headerButton(t('music.restore_hub'))).toBeUndefined()
  })

  it('grows the dialog to the viewport and remembers it', async () => {
    await mountHub()
    await act(async () => {
      headerButton(t('music.maximize_hub'))?.click()
    })
    const panel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.classList.contains('rounded-none')).toBe(true)
    expect(panel.classList.contains('h-[84vh]')).toBe(false)
    expect(useMusic.getState().hubMaximized).toBe(true)
  })

  it('restores the window from the same button', async () => {
    useMusic.setState({ hubMaximized: true })
    await mountHub()
    await act(async () => {
      headerButton(t('music.restore_hub'))?.click()
    })
    const panel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.classList.contains('h-[84vh]')).toBe(true)
    expect(useMusic.getState().hubMaximized).toBe(false)
  })
})

describe('MusicHubModal load failure state', () => {
  it('shows a retry action and keeps the technical error string off the screen', async () => {
    const reload = vi.fn(async () => {})
    useMusic.setState({ loadError: 'fetch failed', loadLibrary: reload })
    await mountHub()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain(t('music.load_failed'))
    expect(dialog?.textContent).not.toContain('fetch failed')
    const retry = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.includes(t('music.retry')))
    expect(retry).toBeDefined()
    const callsBefore = reload.mock.calls.length
    await act(async () => {
      retry?.click()
    })
    expect(reload).toHaveBeenCalledTimes(callsBefore + 1)
  })

  it('keeps the normal track area when the library loaded fine', async () => {
    useMusic.setState({ loadLibrary: vi.fn(async () => {}) })
    await mountHub()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).not.toContain(t('music.load_failed'))
  })
})

describe('MusicHubModal search truncation — UI-16', () => {
  function manyTracks(count: number): MusicTrack[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `t${index}`, title: `moonlight ${index}`, artist: '', album: '', durationMs: 0, source: 'r2',
      format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null,
      hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null,
      contentHash: null, createdAt: 0, updatedAt: 0,
    }))
  }

  async function mountQueryResults(count: number): Promise<void> {
    useMusic.setState({ loadLibrary: vi.fn(async () => {}), tracks: manyTracks(count), query: 'moonlight' })
    await mountHub()
  }

  it('says how many matches the capped grid leaves out', async () => {
    useMusic.setState({ viewMode: 'grid' })
    await mountQueryResults(250)
    expect(document.body.textContent).toContain(t('music.search_truncated', { value0: 200, value1: 250 }))
  })

  it('stays quiet in the list view, whose table windows every match', async () => {
    useMusic.setState({ viewMode: 'list' })
    await mountQueryResults(250)
    expect(document.body.textContent).not.toContain(t('music.search_truncated', { value0: 200, value1: 250 }))
    expect(document.querySelectorAll('[role="rowgroup"] > [role="row"]').length).toBeLessThan(250)
  })

  it('stays quiet while every match is on screen', async () => {
    useMusic.setState({ viewMode: 'grid' })
    await mountQueryResults(120)
    expect(document.body.textContent).not.toContain(t('music.search_truncated', { value0: 200, value1: 120 }))
  })
})

describe('MusicHubModal column folding — UI-14', () => {
  function stubViewportWidth(width: number): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /min-width:\s*(\d+)px/.test(query) ? width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1]) : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  }

  function findButton(dialog: Element | null, label: string): HTMLElement | undefined {
    return [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.getAttribute('aria-label') === label)
  }

  it('keeps both side columns inline on a wide viewport', async () => {
    stubViewportWidth(1280)
    useMusic.setState({ loadLibrary: vi.fn(async () => {}) })
    await mountHub()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.querySelector(`aside[aria-label="${t('music.hub_sidebar')}"]`)).toBeDefined()
    expect(dialog?.querySelector(`aside[aria-label="${t('music.now_playing')}"]`)).toBeNull()
    expect(findButton(dialog, t('music.hub_open_navigation'))).toBeUndefined()
  })

  it('folds the side columns into drawers below the 900px breakpoint', async () => {
    stubViewportWidth(375)
    useMusic.setState({ loadLibrary: vi.fn(async () => {}) })
    await mountHub()
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.querySelector(`aside[aria-label="${t('music.hub_sidebar')}"]`)).toBeNull()
    const opener = findButton(dialog, t('music.hub_open_navigation'))
    expect(opener).toBeDefined()
    await act(async () => {
      opener?.click()
    })
    const drawer = document.querySelector('[data-surface="drawer"]')
    expect(drawer?.querySelector(`aside[aria-label="${t('music.hub_sidebar')}"]`)).toBeDefined()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[data-surface="drawer"]')).toBeNull()
  })
})

// REF-1b: the hub was a fixed box that could not be moved or stretched, so the library
// either overflowed its own window or wasted the screen around it.
describe('MusicHubModal windowed chrome (REF-1b)', () => {
  beforeEach(() => {
    useMusic.setState({ hubMaximized: false, hubGeometry: {} })
  })

  function grip(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === t('music.resize_hub'),
    ) as HTMLButtonElement | undefined
  }

  function moveButton(): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === t('music.move_hub'),
    ) as HTMLButtonElement | undefined
  }

  it('offers a resize grip and a keyboard move control while windowed', async () => {
    await mountHub()
    expect(grip()).toBeDefined()
    expect(moveButton()).toBeDefined()
  })

  it('resizes the window from the keyboard and keeps the change in the store', async () => {
    await mountHub()
    await act(async () => {
      grip()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(useMusic.getState().hubGeometry.width).toBeGreaterThan(0)
    expect(useMusic.getState().hubGeometry.height).toBeGreaterThan(0)
  })

  it('moves the window from the keyboard', async () => {
    await mountHub()
    await act(async () => {
      moveButton()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(useMusic.getState().hubGeometry.dy).toBe(24)
  })

  it('drops the window chrome once the hub fills the viewport', async () => {
    useMusic.setState({ hubMaximized: true })
    await mountHub()
    expect(grip()).toBeUndefined()
    expect(moveButton()).toBeUndefined()
  })
})

// FB-F1: the offset has to be a declaration the entrance animation cannot reach. The dialog
// carries `.anim-pop`, whose finished `ink-pop` keyframes end on `transform: none` with a `both`
// fill, and an animation beats an inline style in the cascade — so the `transform` this used to
// write was painted as `none` for the whole life of the dialog. The store was right the entire
// time, which is why writing to it was never enough: the browser gate drags the header and
// measures the box, and these pin the declaration that paint depends on.
describe('MusicHubModal drag offset (FB-F1)', () => {
  it('carries the offset in a property the entrance animation cannot override', () => {
    expect(hubStyle({ dx: 24, dy: 12, width: 800, height: 600 })).toEqual({ width: 800, height: 600, translate: '24px 12px' })
    expect(hubStyle({ dx: 24 })).toEqual({ width: undefined, height: undefined, translate: '24px 0px' })
  })

  it('leaves an untouched window where the dialog already centres it', () => {
    expect(hubStyle({})).toEqual({ width: undefined, height: undefined, translate: undefined })
  })
})

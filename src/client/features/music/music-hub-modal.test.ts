import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicHubModal } from './music-hub-modal'
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

import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
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

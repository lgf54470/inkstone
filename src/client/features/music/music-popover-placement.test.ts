import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicQueueButton } from './music-transport-widgets'
import { useMusic } from './music-store'

// The panel's coordinates have to come from the placement every other anchored panel in the app
// uses; a private copy of that arithmetic is how the two drift apart.
vi.mock('../../components/popover-placement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../components/popover-placement')>()
  return {
    ...actual,
    placePanel: vi.fn(() => ({ top: 222, left: 111, flipped: false, origin: 'top right' })),
  }
})

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

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  useMusic.setState({ queue: [], currentIndex: 0, clearQueue: vi.fn() })
})

describe('music popover placement (UI-5)', () => {
  it('asks the shared placement where to sit and lands where it says', async () => {
    const { placePanel } = await import('../../components/popover-placement')
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(MusicQueueButton, {}))
    })
    const trigger = [...document.querySelectorAll('button')]
      .find((button) => button.getAttribute('aria-label') === t('music.queue')) as HTMLButtonElement
    await act(async () => { trigger.click() })

    expect(placePanel).toHaveBeenCalled()
    const panel = document.querySelector('[role="dialog"]') as HTMLElement
    expect(panel.style.left).toBe('111px')
    expect(panel.style.top).toBe('222px')
  })
})

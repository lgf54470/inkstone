import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { ConfirmHost } from '../../components/overlay'
import { initI18n, t } from '../../lib/i18n'
import { MusicQueuePanel } from './music-queue-panel'
import { useMusic } from './music-store'
import { MusicQueueButton } from './music-transport-widgets'

// The real English strings are the point here: both surfaces have to ask the same question.
beforeAll(async () => {
  await initI18n()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ queue: [], currentIndex: 0, tracks: [] })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function mount(clearQueue: () => void, element: ReactElement, queue: string[] = ['t1']): Promise<void> {
  useMusic.setState({ queue, currentIndex: 0, tracks: [], clearQueue })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement('div', null, createElement(ConfirmHost), element))
  })
}

function byLabel(label: string): HTMLElement | undefined {
  return [...document.querySelectorAll('button')].find((entry) => entry.getAttribute('aria-label') === label)
}

function byText(scope: ParentNode, label: string): HTMLElement | undefined {
  return [...scope.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === label)
}

// The queue popover is a dialog too, so the prompt is named by the pair of
// buttons only the archive-style confirm carries.
function confirmDialog(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .find((entry) => byText(entry, t('common.cancel')) && byText(entry, t('music.clear_queue')))
}

async function click(element: HTMLElement | undefined): Promise<void> {
  await act(async () => {
    element?.click()
  })
}

// Both surfaces ask the same question, so both are driven the same way.
async function openQueuePopover(): Promise<void> {
  await click(byLabel(t('music.queue')))
  await click(byText(document, t('music.clear_queue')))
}

async function openPanelTrash(): Promise<void> {
  await click(byLabel(t('music.clear_queue')))
}

const surfaces = [
  { name: 'the transport popover', open: openQueuePopover },
  { name: 'the immersive queue panel', open: openPanelTrash },
]

describe('clearing the queue asks first', () => {
  for (const surface of surfaces) {
    const surfaceElement = (): ReactElement => (surface.name === 'the transport popover'
      ? createElement(MusicQueueButton)
      : createElement(MusicQueuePanel, { open: true, onClose: () => {} }))

    it(`${surface.name} waits for the confirmation`, async () => {
      const clearQueue = vi.fn()
      await mount(clearQueue, surfaceElement())

      await surface.open()

      expect(clearQueue).not.toHaveBeenCalled()
      expect(confirmDialog()?.textContent).toContain(t('music.clear_queue_confirm', { value0: 1 }))
      await click(byText(confirmDialog() ?? document, t('music.clear_queue')))
      expect(clearQueue).toHaveBeenCalledTimes(1)
    })

    it(`${surface.name} keeps the queue when the prompt is declined`, async () => {
      const clearQueue = vi.fn()
      await mount(clearQueue, surfaceElement())

      await surface.open()
      await click(byText(confirmDialog() ?? document, t('common.cancel')))

      expect(clearQueue).not.toHaveBeenCalled()
      expect(useMusic.getState().queue).toEqual(['t1'])
    })

    it(`${surface.name} does not ask about an empty queue`, async () => {
      const clearQueue = vi.fn()
      await mount(clearQueue, surfaceElement(), [])

      await surface.open()

      expect(clearQueue).not.toHaveBeenCalled()
      expect(confirmDialog()).toBeUndefined()
    })
  }
})

// A11Y-6: the word "clear" in the queue popover was a bare line of 10px text, so the tap
// target was the height of its own glyphs.
describe('the clear-queue word is still a fingertip-sized button', () => {
  it('gives it the same minimum box the icon buttons have', async () => {
    await mount(vi.fn(), createElement(MusicQueueButton))
    await click(byLabel(t('music.queue')))
    const clear = byText(document, t('music.clear_queue'))
    expect(clear?.classList.contains('min-h-6')).toBe(true)
  })
})

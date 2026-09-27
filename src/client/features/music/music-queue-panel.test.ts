import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { MusicQueuePanel, QUEUE_PANEL_DEFAULT_HEIGHT } from './music-queue-panel'
import { useMusic } from './music-store'

beforeAll(async () => {
  await initI18n()
})

let rendered: ReturnType<typeof renderElement> | null = null

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0 })
})

function mount(height = QUEUE_PANEL_DEFAULT_HEIGHT): number[] {
  const calls: number[] = []
  act(() => {
    rendered = renderElement(
      createElement(MusicQueuePanel, { open: true, onClose: vi.fn(), height, onResize: (next: number) => calls.push(next) }),
    )
  })
  return calls
}

function handle(): HTMLElement {
  return document.querySelector('[role="separator"]') as HTMLElement
}

function panel(): HTMLElement {
  return handle().parentElement as HTMLElement
}

// REF-11: the panel held a fixed 288px over the end of the track list, so opening the
// queue meant giving up the last rows. The height is the reader's now.
describe('hub queue panel resize (REF-11)', () => {
  it('states the height it is showing and the range it allows', () => {
    mount()
    const grip = handle()
    expect(grip.getAttribute('aria-label')).toBe(t('music.queue_resize'))
    expect(grip.getAttribute('aria-valuenow')).toBe(String(QUEUE_PANEL_DEFAULT_HEIGHT))
    expect(Number(grip.getAttribute('aria-valuemin'))).toBeLessThan(QUEUE_PANEL_DEFAULT_HEIGHT)
    expect(Number(grip.getAttribute('aria-valuemax'))).toBeGreaterThan(QUEUE_PANEL_DEFAULT_HEIGHT)
  })

  it('grows and shrinks the panel from the keyboard', () => {
    const calls = mount()
    const grip = handle()
    expect(grip.getAttribute('tabindex')).toBe('0')
    act(() => {
      grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    act(() => {
      handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(calls).toEqual([QUEUE_PANEL_DEFAULT_HEIGHT + 32, QUEUE_PANEL_DEFAULT_HEIGHT - 32])
  })

  it('renders the panel at the height it is given', () => {
    mount(320)
    expect(panel().style.height).toBe('320px')
  })
})

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { MusicHubModal } from './music-hub-modal'
import { HUB_MAX_OFFSET_PX, HUB_MAX_WIDTH, HUB_MIN_HEIGHT, HUB_MIN_WIDTH, resizeHubGeometry } from './music-hub-window'
import { useMusic } from './music-store'
import { MUSIC_NARROW_BREAKPOINT } from './music-utils'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom ships no pointer capture; the component asks for it, and nothing in these cases
  // depends on what it does.
  if (typeof HTMLElement.prototype.setPointerCapture !== 'function') {
    HTMLElement.prototype.setPointerCapture = () => {}
  }
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

// The hub floats only on a roomy, wide desktop window; both queries are stubbed true so the
// chrome under test is the one that is on screen.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  // A maximised hub is a full screen surface and carries no chrome at all, so every case below
  // starts from the windowed state its own test is about.
  useMusic.setState({ hubMaximized: false, hubGeometry: {} })
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

// jsdom has no PointerEvent either, so the gesture carries the two fields the handlers read.
function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 })
  return event
}

async function dragZone(key: string, delta: { x: number; y: number }): Promise<void> {
  const zone = document.querySelector(`[data-hub-resize="${key}"]`) as HTMLElement
  await act(async () => {
    zone.dispatchEvent(pointer('pointerdown', 400, 300))
    zone.dispatchEvent(pointer('pointermove', 400 + delta.x, 300 + delta.y))
    zone.dispatchEvent(pointer('pointerup', 400 + delta.x, 300 + delta.y))
  })
}

function stubViewportSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

// Below the hub's own fold the two side columns are drawers, so the header's disclosures only exist
// in that layout; the file's own stub reports a roomy window for every query.
function stubNarrowLayout(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: !query.includes(`${MUSIC_NARROW_BREAKPOINT}px`),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ tracks: [], tags: [], playlists: [], loading: false, loadError: null, query: '', scope: { kind: 'all' } })
  stubViewportSize(1024, 768)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// FB-C3: the header's two drawer controls were controls whose only state was the tint of their own
// icon — the drawers they unfold are what the gate's toolbar sweep holds the row's height against,
// and a disclosure that cannot say whether it is open is not one a screen reader can read.
describe('hub header disclosures (FB-C3)', () => {
  const control = (name: string): HTMLElement | null =>
    document.querySelector<HTMLElement>(`button[aria-label="${name}"]`)

  it('names the layer it opens and starts closed', async () => {
    stubNarrowLayout()
    await mountHub()
    const navigation = control(t('music.hub_open_navigation'))
    const nowPlaying = control(t('music.hub_open_now_playing'))
    expect([navigation?.getAttribute('aria-haspopup'), nowPlaying?.getAttribute('aria-haspopup')])
      .toEqual(['dialog', 'dialog'])
    expect([navigation?.getAttribute('aria-expanded'), nowPlaying?.getAttribute('aria-expanded')])
      .toEqual(['false', 'false'])
  })

  it('says which of the two is unfolded, and follows the other one being pressed', async () => {
    stubNarrowLayout()
    await mountHub()
    await act(async () => { control(t('music.hub_open_navigation'))?.click() })
    expect([control(t('music.hub_open_navigation'))?.getAttribute('aria-expanded'),
      control(t('music.hub_open_now_playing'))?.getAttribute('aria-expanded')]).toEqual(['true', 'false'])
    await act(async () => { control(t('music.hub_open_now_playing'))?.click() })
    expect([control(t('music.hub_open_navigation'))?.getAttribute('aria-expanded'),
      control(t('music.hub_open_now_playing'))?.getAttribute('aria-expanded')]).toEqual(['false', 'true'])
  })
})

// FB-U1: the window had one 16px corner grip that grew both dimensions at once. Growth is what a
// corner is for; an edge is how a window is made wider *or* narrower without also getting taller,
// and the box is centred — so half of every change lands on the side the pointer is not holding.
describe('hub resize geometry (FB-U1)', () => {
  const start = { width: 800, height: 600, dx: 0, dy: 0 }
  const east = { dx: 1, dy: 0 } as const
  const west = { dx: -1, dy: 0 } as const
  const north = { dx: 0, dy: -1 } as const
  const southEast = { dx: 1, dy: 1 } as const

  it('grows the window by the drag when the pointer holds the east edge', () => {
    expect(resizeHubGeometry(start, east, { x: 100, y: 40 })).toEqual({ width: 900, height: 600, dx: 50, dy: 0 })
  })

  it('keeps the far edge still when the pointer holds the near one', () => {
    // Dragging the west edge 100px further left widens the box by 100 and moves it left by 50,
    // which is exactly the half the centring would otherwise have taken back.
    expect(resizeHubGeometry(start, west, { x: -100, y: 0 })).toEqual({ width: 900, height: 600, dx: -50, dy: 0 })
  })

  it('leaves the width alone when the pointer holds a horizontal edge', () => {
    expect(resizeHubGeometry(start, north, { x: 90, y: -60 })).toEqual({ width: 800, height: 660, dx: 0, dy: -30 })
  })

  it('resizes both dimensions from a corner', () => {
    expect(resizeHubGeometry(start, southEast, { x: 60, y: 40 })).toEqual({ width: 860, height: 640, dx: 30, dy: 20 })
  })

  it('stops at the smallest window worth using', () => {
    const shrunk = resizeHubGeometry({ width: HUB_MIN_WIDTH, height: HUB_MIN_HEIGHT, dx: 0, dy: 0 }, west, { x: 400, y: 0 })
    expect(shrunk.width).toBe(HUB_MIN_WIDTH)
    expect(shrunk.dx).toBe(0)
  })

  it('stops before the window is pushed past its offset budget', () => {
    // A roomy screen, so the width clamp is not what ends the drag: growing from the smallest
    // window to the widest one travels half of 520px, and only part of that fits the budget the
    // pointer drag also answers to.
    stubViewportSize(4000, 3000)
    const huge = resizeHubGeometry({ width: HUB_MIN_WIDTH, height: 600, dx: 0, dy: 0 }, west, { x: -4000, y: 0 })
    expect(huge.width).toBe(HUB_MAX_WIDTH)
    expect(huge.dx).toBe(-HUB_MAX_OFFSET_PX)
  })
})

// FB-U1: a resize zone per edge and corner, one of which is the control a keyboard and a screen
// reader are told about; the rest are pointer affordances of the window frame rather than seven
// more entries in the tab order.
describe('hub resize handles (FB-U1)', () => {
  const zones = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[data-hub-resize]')]

  it('offers a zone on every edge and corner', async () => {
    await mountHub()
    expect(zones().map((zone) => zone.dataset.hubResize).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
  })

  it('tells assistive tech about one control and keeps the other seven out of its way', async () => {
    await mountHub()
    const named = zones().filter((zone) => !zone.hasAttribute('aria-hidden'))
    expect(named).toHaveLength(1)
    expect(named[0].getAttribute('aria-label')).toBe(t('music.resize_hub'))
    expect(named[0].tabIndex).toBe(0)
    for (const zone of zones().filter((zone) => zone.hasAttribute('aria-hidden'))) {
      expect(zone.getAttribute('aria-hidden')).toBe('true')
      expect(zone.tabIndex).toBe(-1)
    }
  })

  it('draws the grip so it can be found without hunting for the exact pixel', async () => {
    await mountHub()
    const named = zones().find((zone) => !zone.hasAttribute('aria-hidden'))
    expect(named?.querySelector('svg')).toBeDefined()
  })

  it('hands the gesture to the window instead of scrolling the page', async () => {
    await mountHub()
    for (const zone of zones()) expect(zone.classList.contains('touch-none')).toBe(true)
    expect(document.querySelector('[role="dialog"] header')?.classList.contains('touch-none')).toBe(true)
  })

  it('maximises the window when its header is double clicked', async () => {
    await mountHub()
    const header = document.querySelector('[role="dialog"] header') as HTMLElement
    await act(async () => {
      header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(useMusic.getState().hubMaximized).toBe(true)
  })

})

// FB-U1: the window answers the screen it is on rather than the one it was sized on.
describe('hub window against the viewport (FB-U1)', () => {
  it('starts a gesture from the box on screen rather than from a default', async () => {
    stubViewportSize(1280, 900)
    await mountHub()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    // jsdom lays nothing out, so the box is stated the way the browser would report it — smaller
    // than the fallback, which is exactly the case a default would get wrong.
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ width: 900, height: 700 } as DOMRect)
    await dragZone('e', { x: 100, y: 0 })
    expect(useMusic.getState().hubGeometry).toEqual({ width: 1000, height: 700, dx: 50, dy: 0 })
  })

  it('re-clamps a window that no longer fits when the viewport shrinks', async () => {
    stubViewportSize(1280, 900)
    useMusic.setState({ hubGeometry: { width: 1200, height: 800, dx: 120, dy: 0 } })
    await mountHub()
    expect(useMusic.getState().hubGeometry.width).toBe(1200)
    stubViewportSize(700, 600)
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
    })
    // 700 - 32 is all the width the app keeps for itself, and the offset budget is the same one
    // the pointer drag answers to.
    expect(useMusic.getState().hubGeometry).toEqual({ width: 668, height: 568, dx: 120, dy: 0 })
  })
})

// FB-F4: the music preferences had no door of their own on the library, so the header now
// carries one and it opens the settings panel already turned to the music page.
describe('hub settings shortcut (FB-F4)', () => {
  it('opens the settings panel on the music section', async () => {
    await mountHub()
    const gear = document.querySelector<HTMLButtonElement>(`button[aria-label="${t('music.open_settings')}"]`)
    expect(gear).not.toBeNull()
    await act(async () => { gear!.click() })
    expect(useUi.getState().panel).toBe('settings')
    expect(useUi.getState().settingsSection).toBe('music')
    useUi.getState().closePanel()
  })
})

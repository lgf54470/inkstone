import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { MusicPlayerControls } from './music-player-controls'
import { useMusic } from './music-store'

// The tier thresholds are read from the rendered labels, so the real resources are needed.
beforeAll(async () => {
  await initI18n()
})

const PROPS = { queueOpen: false, onToggleQueue: vi.fn() }

// REF-8: the bar reads its own width now; jsdom has no layout, so the observer is the
// only way in. A missing observer falls back to the wide layout.
function stubContainerWidth(width: number): void {
  class Observer {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(): void {
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
}

function hasLabeledButton(label: string): boolean {
  return [...document.querySelectorAll('button')].some((button) => button.getAttribute('aria-label') === label)
}

function volumeSlider(): HTMLElement | null {
  return document.querySelector(`input[type="range"][aria-label="${t('music.volume')}"]`)
}

let rendered: ReturnType<typeof renderElement> | null = null

// The mini player starts visible, which flips the folded menu's label to "hide"; every
// case below starts from a known store so the assertions read the same either way.
beforeEach(() => {
  useMusic.setState({ floatingVisible: false, immersive: false })
})

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function mount(): void {
  act(() => { rendered = renderElement(createElement(MusicPlayerControls, PROPS)) })
}

describe('hub transport bar width tiers (REF-8)', () => {
  it('keeps the whole row, slider included, when the container is wide', () => {
    stubContainerWidth(1200)
    mount()
    expect(volumeSlider()).not.toBeNull()
    expect(hasLabeledButton(t('music.immersive'))).toBe(true)
    expect(hasLabeledButton(t('music.more_actions'))).toBe(false)
  })

  it('trades the volume slider for a button on the hub centre column', () => {
    stubContainerWidth(760)
    mount()
    expect(volumeSlider()).toBeNull()
    expect(hasLabeledButton(t('music.volume'))).toBe(true)
    expect(hasLabeledButton(t('music.more_actions'))).toBe(false)
  })

  it('folds the low-frequency toggles into a more menu at phone width', () => {
    stubContainerWidth(420)
    mount()
    expect(volumeSlider()).toBeNull()
    expect(hasLabeledButton(t('music.immersive'))).toBe(false)
    expect(hasLabeledButton(t('music.queue'))).toBe(true)
    expect(hasLabeledButton(t('music.more_actions'))).toBe(true)
  })

})

describe('hub transport bar more menu (REF-8)', () => {
  function menuItems(): string[] {
    const trigger = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === t('music.more_actions'),
    ) as HTMLButtonElement
    act(() => { trigger.click() })
    return [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim() ?? '')
  }

  it('still offers the folded toggles as menu items', () => {
    stubContainerWidth(420)
    mount()
    const menuLabels = menuItems()
    expect(menuLabels).toContain(t('music.immersive'))
    expect(menuLabels).toContain(t('music.show_mini_player'))
  })

  it('opens the immersive player from the folded menu', () => {
    stubContainerWidth(420)
    mount()
    const trigger = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === t('music.more_actions'),
    ) as HTMLButtonElement
    act(() => { trigger.click() })
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (entry) => entry.textContent?.trim() === t('music.immersive'),
    ) as HTMLElement
    act(() => { item.click() })
    expect(useMusic.getState().immersive).toBe(true)
  })
})

import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { t } from '../../lib/i18n'
import { MusicFloatingPlayer } from './music-floating-player'
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

async function mountPlayer(setFloatingPosition: (position: { x: number; y: number }) => void): Promise<void> {
  useMusic.setState({ floatingVisible: true, floatingCollapsed: false, floatingPosition: { x: 100, y: 100 }, setFloatingPosition })
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(MusicFloatingPlayer))
  })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({ floatingVisible: false, floatingPosition: null })
})

describe('floating player drag handle', () => {
  it('is a real button with an accurate label, not a role-imitating span', async () => {
    await mountPlayer(vi.fn())
    expect(document.querySelector('span[role="button"]')).toBeNull()
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    expect(handle).toBeDefined()
  })

  it('moves the card by the keyboard step on arrow keys', async () => {
    const setPosition = vi.fn()
    await mountPlayer(setPosition)
    const handle = [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === t('music.move_player'))
    await act(async () => {
      handle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(setPosition).toHaveBeenCalledWith({ x: 116, y: 100 })
  })
})

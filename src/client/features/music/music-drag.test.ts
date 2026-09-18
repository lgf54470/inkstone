import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useCardDrag } from './music-drag'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

const CARD_SIZE = { width: 100, height: 50 }
let renders = 0
let root: Root | null = null

function Probe({ position, onCommit }: {
  position: { x: number; y: number } | null
  onCommit: (position: { x: number; y: number }) => void
}): ReactNode {
  renders += 1
  const drag = useCardDrag(position, CARD_SIZE, onCommit)
  return createElement('div', {
    ref: drag.setNode,
    style: drag.style,
    onPointerDown: drag.startDrag,
    'data-card': true,
  })
}

async function mount(position: { x: number; y: number } | null, onCommit: (position: { x: number; y: number }) => void): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(Probe, { position, onCommit }))
  })
  return container.querySelector('[data-card]') as HTMLElement
}

function pointerEvent(type: string, target: EventTarget, clientX: number, clientY: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

afterAll(() => {
  vi.useRealTimers()
})

describe('useCardDrag', () => {
  it('follows the pointer through the element style without re-rendering on every move', async () => {
    const commit = vi.fn()
    const node = await mount({ x: 20, y: 30 }, commit)
    await act(async () => {
      pointerEvent('pointerdown', node, 50, 60)
    })
    const baseline = renders
    await act(async () => {
      pointerEvent('pointermove', window, 110, 60)
      pointerEvent('pointermove', window, 120, 66)
    })
    expect(renders).toBe(baseline)
    expect(node.style.left).toBe('70px')
    expect(node.style.top).toBe('8px')
    expect(commit).not.toHaveBeenCalled()
    await act(async () => {
      pointerEvent('pointerup', window, 130, 70)
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith({ x: 80, y: 10 })
  })

  it('moves an element that has no committed position yet', async () => {
    const commit = vi.fn()
    const node = await mount(null, commit)
    await act(async () => {
      pointerEvent('pointerdown', node, 50, 60)
    })
    await act(async () => {
      pointerEvent('pointermove', window, 110, 60)
    })
    expect(node.style.left).toBe('60px')
    expect(commit).not.toHaveBeenCalled()
  })
})

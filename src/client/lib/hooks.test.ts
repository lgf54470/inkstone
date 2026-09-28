// FB3-C9: the hooks the music surfaces fold on hand out the ref they measure, so the box is observed
// when it appears rather than from the component's mount effect. The case these two pin is the one the
// running app was in: a surface that draws a loading state first mounts the box its content lives in
// later, and an observer attached at mount never sees it — measured there, a 1060px hub window whose
// centre column was 538px drew the full 572px-wide table, a row wider than the column holding it.
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { ReactElement } from 'react'
import { useElementWidth } from './hooks'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Renders the measured box only once `ready`, the way a list renders it once it has rows. */
function Boxes({ ready }: { ready: boolean }): ReactElement {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  return createElement(
    'div',
    null,
    ready ? createElement('div', { ref, 'data-box': '' }) : createElement('span', null, 'loading'),
    createElement('span', { 'data-width': width === null ? 'none' : String(width) }),
  )
}

function reportedWidth(): string {
  return document.querySelector('[data-width]')?.getAttribute('data-width') ?? ''
}

async function mount(ready: boolean): Promise<() => Promise<void>> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(Boxes, { ready }))
  })
  return async () => {
    await act(async () => {
      root?.render(createElement(Boxes, { ready: true }))
    })
  }
}

// A stub that answers the way a real observer does: only about the node it was given.
function stubObserver(width: number): () => number {
  const observed: Element[] = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(node: Element): void {
      observed.push(node)
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    unobserve(): void {}
    disconnect(): void {}
  })
  return () => observed.length
}

describe('useElementWidth (FB3-C9)', () => {
  it('measures a box that appears after the surface first painted', async () => {
    const observed = stubObserver(640)
    const show = await mount(false)
    expect(reportedWidth()).toBe('none')
    expect(observed()).toBe(0)
    await show()
    expect(observed()).toBe(1)
    expect(reportedWidth()).toBe('640')
  })

  it('reads the box in the commit that attaches it, before the observer answers', async () => {
    // An observer that never calls back: whatever arrives has to come from the node's own box.
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(720)
    await mount(true)
    expect(reportedWidth()).toBe('720')
  })

  it('keeps nothing measured for a box the browser draws no size for', async () => {
    // jsdom has no layout and answers 0 for every box; the caller's fallback is the honest answer there.
    const observed = stubObserver(0)
    await mount(true)
    expect(observed()).toBe(1)
    expect(reportedWidth()).toBe('0')
  })
})

import { act, createElement, useRef, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import {
  extractSlideHeading,
  observeThumbElement,
  pageLabel,
  resetSharedThumbObserverForTesting,
  sharedThumbObserverMetrics,
  thumbMetrics,
  ThumbRootContext,
  useNearViewport,
} from './slide-thumb'
import { SLIDE_PAD_X, SLIDE_PAD_Y } from './slide-stage'
import type { RailEntry } from './presentation-state'

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly elements = new Set<Element>()
  readonly callback: (entries: Partial<IntersectionObserverEntry>[]) => void
  readonly options?: IntersectionObserverInit
  disconnected = false

  constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }

  observe(element: Element) {
    this.elements.add(element)
  }

  unobserve(element: Element) {
    this.elements.delete(element)
  }

  disconnect() {
    this.disconnected = true
    this.elements.clear()
  }

  trigger(entries: Array<{ target: Element; isIntersecting: boolean }>) {
    this.callback(entries)
  }
}

function renderElement(element: ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function DummyThumbCard({ onNearChange }: { onNearChange?: (near: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNearViewport(ref)
  if (onNearChange) onNearChange(near)
  return createElement('div', { ref, 'data-near': String(near) })
}

function ScrollContainerDummy({ count = 2 }: { count?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return createElement(
    ThumbRootContext.Provider,
    { value: containerRef },
    createElement(
      'div',
      { ref: containerRef },
      Array.from({ length: count }, (_, i) => createElement(DummyThumbCard, { key: i })),
    ),
  )
}

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  MockIntersectionObserver.instances = []
  resetSharedThumbObserverForTesting()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  resetSharedThumbObserverForTesting()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('sharedThumbObserver singleton', () => {
  it('shares exactly one IntersectionObserver instance across multiple observed elements', () => {
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const el3 = document.createElement('div')
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const cb3 = vi.fn()

    const unobserve1 = observeThumbElement(el1, cb1)
    const unobserve2 = observeThumbElement(el2, cb2)
    const unobserve3 = observeThumbElement(el3, cb3)

    expect(MockIntersectionObserver.instances.length).toBe(1)
    const metrics = sharedThumbObserverMetrics()
    expect(metrics.created).toBe(1)
    expect(metrics.connected).toBe(true)
    expect(metrics.subscribers).toBe(3)

    const observer = MockIntersectionObserver.instances[0]!
    expect(observer.elements.has(el1)).toBe(true)
    expect(observer.elements.has(el2)).toBe(true)
    expect(observer.elements.has(el3)).toBe(true)

    unobserve1()
    unobserve2()
    unobserve3()
  })
})

describe('sharedThumbObserver routing', () => {
  it('routes intersection notifications strictly to the corresponding element callbacks', () => {
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    const unobserve1 = observeThumbElement(el1, cb1)
    const unobserve2 = observeThumbElement(el2, cb2)

    const observer = MockIntersectionObserver.instances[0]!
    observer.trigger([
      { target: el1, isIntersecting: true },
    ])

    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb1).toHaveBeenCalledWith(true)
    expect(cb2).not.toHaveBeenCalled()

    observer.trigger([
      { target: el2, isIntersecting: true },
      { target: el1, isIntersecting: false },
    ])

    expect(cb1).toHaveBeenCalledTimes(2)
    expect(cb1).toHaveBeenLastCalledWith(false)
    expect(cb2).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledWith(true)

    unobserve1()
    unobserve2()
  })
})

describe('sharedThumbObserver teardown and recreation', () => {
  it('disconnects and cleans up when all subscribers unobserve, then recreates on demand', () => {
    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    const unobserve1 = observeThumbElement(el1, cb1)
    const unobserve2 = observeThumbElement(el2, cb2)

    const firstObserver = MockIntersectionObserver.instances[0]!
    expect(firstObserver.disconnected).toBe(false)

    unobserve1()
    expect(sharedThumbObserverMetrics().subscribers).toBe(1)
    expect(firstObserver.disconnected).toBe(false)

    firstObserver.trigger([{ target: el1, isIntersecting: true }])
    expect(cb1).not.toHaveBeenCalled()

    unobserve2()
    expect(sharedThumbObserverMetrics().subscribers).toBe(0)
    expect(sharedThumbObserverMetrics().connected).toBe(false)
    expect(firstObserver.disconnected).toBe(true)

    const el3 = document.createElement('div')
    const cb3 = vi.fn()
    const unobserve3 = observeThumbElement(el3, cb3)

    expect(MockIntersectionObserver.instances.length).toBe(2)
    expect(sharedThumbObserverMetrics().created).toBe(2)
    expect(sharedThumbObserverMetrics().connected).toBe(true)
    expect(sharedThumbObserverMetrics().subscribers).toBe(1)

    unobserve3()
    expect(sharedThumbObserverMetrics().connected).toBe(false)
  })
})

describe('sharedThumbObserver unregistered target', () => {
  it('ignores intersection entries for elements not registered in the callbacks map', () => {
    const el = document.createElement('div')
    const cb = vi.fn()
    const unobserve = observeThumbElement(el, cb)

    const unknown = document.createElement('span')
    const observer = MockIntersectionObserver.instances[0]!
    expect(() => {
      observer.trigger([{ target: unknown, isIntersecting: true }])
    }).not.toThrow()

    expect(cb).not.toHaveBeenCalled()
    unobserve()
  })
})

describe('sharedThumbObserver component mount lifecycle', () => {
  it('manages lifecycle correctly through useNearViewport component mount and unmount', () => {
    const view1 = renderElement(createElement(DummyThumbCard))
    const view2 = renderElement(createElement(DummyThumbCard))

    expect(MockIntersectionObserver.instances.length).toBe(1)
    expect(sharedThumbObserverMetrics().created).toBe(1)
    expect(sharedThumbObserverMetrics().subscribers).toBe(2)

    const observer = MockIntersectionObserver.instances[0]!
    const target1 = view1.container.firstElementChild!
    const target2 = view2.container.firstElementChild!

    expect(target1.getAttribute('data-near')).toBe('false')

    act(() => {
      observer.trigger([{ target: target1, isIntersecting: true }])
    })

    expect(target1.getAttribute('data-near')).toBe('true')
    expect(target2.getAttribute('data-near')).toBe('false')

    view1.unmount()
    expect(sharedThumbObserverMetrics().subscribers).toBe(1)
    expect(sharedThumbObserverMetrics().connected).toBe(true)

    view2.unmount()
    expect(sharedThumbObserverMetrics().subscribers).toBe(0)
    expect(sharedThumbObserverMetrics().connected).toBe(false)
  })
})

describe('sharedThumbObserver rail and overview co-existence', () => {
  it('shares the same observer when rail and overview grid cards are both mounted', () => {
    const railCard1 = renderElement(createElement(DummyThumbCard))
    const railCard2 = renderElement(createElement(DummyThumbCard))
    const gridCard1 = renderElement(createElement(DummyThumbCard))
    const gridCard2 = renderElement(createElement(DummyThumbCard))

    expect(MockIntersectionObserver.instances.length).toBe(1)
    expect(sharedThumbObserverMetrics().created).toBe(1)
    expect(sharedThumbObserverMetrics().subscribers).toBe(4)

    railCard1.unmount()
    railCard2.unmount()
    expect(sharedThumbObserverMetrics().subscribers).toBe(2)
    expect(sharedThumbObserverMetrics().connected).toBe(true)

    gridCard1.unmount()
    gridCard2.unmount()
    expect(sharedThumbObserverMetrics().subscribers).toBe(0)
    expect(sharedThumbObserverMetrics().connected).toBe(false)
  })
})

describe('sharedThumbObserver with scroll container roots', () => {
  it('assigns container root and prefetch margin to the observer instance', () => {
    const rootEl = document.createElement('div')
    const thumbEl = document.createElement('span')
    const cb = vi.fn()
    const unobserve = observeThumbElement(thumbEl, cb, rootEl)

    expect(MockIntersectionObserver.instances.length).toBe(1)
    const observer = MockIntersectionObserver.instances[0]!
    expect(observer.options?.root).toBe(rootEl)
    expect(observer.options?.rootMargin).toBe('320px')

    const metrics = sharedThumbObserverMetrics(rootEl)
    expect(metrics.connected).toBe(true)
    expect(metrics.subscribers).toBe(1)
    expect(metrics.roots).toBe(1)

    unobserve()
    expect(sharedThumbObserverMetrics(rootEl).connected).toBe(false)
    expect(sharedThumbObserverMetrics().roots).toBe(0)
  })
})

describe('sharedThumbObserver container context integration', () => {
  it('shares observer per scroll container and isolates across distinct containers', () => {
    const view1 = renderElement(createElement(ScrollContainerDummy, { count: 3 }))
    const view2 = renderElement(createElement(ScrollContainerDummy, { count: 2 }))

    expect(MockIntersectionObserver.instances.length).toBe(2)
    const metrics = sharedThumbObserverMetrics()
    expect(metrics.created).toBe(2)
    expect(metrics.roots).toBe(2)

    const observer1 = MockIntersectionObserver.instances[0]!
    const observer2 = MockIntersectionObserver.instances[1]!
    expect(observer1.options?.root).not.toBe(observer2.options?.root)
    expect(observer1.elements.size).toBe(3)
    expect(observer2.elements.size).toBe(2)

    view1.unmount()
    expect(sharedThumbObserverMetrics().roots).toBe(1)
    expect(observer1.disconnected).toBe(true)
    expect(observer2.disconnected).toBe(false)

    view2.unmount()
    expect(sharedThumbObserverMetrics().roots).toBe(0)
    expect(observer2.disconnected).toBe(true)
  })
})

describe('thumbMetrics', () => {
  it('computes aspect ratio, scale factor and inner content box dimensions', () => {
    const metrics = thumbMetrics(160, 1280, 720)
    expect(metrics.width).toBe(160)
    expect(metrics.height).toBe(90)
    expect(metrics.scale).toBe(160 / 1280)
    expect(metrics.contentWidth).toBe(1280 - SLIDE_PAD_X * 2)
    expect(metrics.contentHeight).toBe(720 - SLIDE_PAD_Y * 2)
  })
})

describe('extractSlideHeading', () => {
  it('extracts top heading from markdown headings', () => {
    expect(extractSlideHeading('# First Slide\nContent here')).toBe('First Slide')
    expect(extractSlideHeading('## Second Level\nContent')).toBe('Second Level')
    expect(extractSlideHeading('### Deep Title\nContent')).toBe('Deep Title')
  })

  it('skips code blocks and comments and takes first prose line up to 30 characters when no markdown heading', () => {
    const source = '```\nconst x = 1\n```\n<!-- note: comment -->\n--- \nThis is a long introductory sentence that exceeds thirty characters in total'
    expect(extractSlideHeading(source)).toBe('This is a long introductory se')
  })

  it('returns empty string if nothing recognizable is present', () => {
    expect(extractSlideHeading('```\ncode\n```\n<!-- note: hello -->\n---')).toBe('')
  })
})

describe('pageLabel', () => {
  it('formats single-page slide label', () => {
    const entry: RailEntry = { slide: 2, sub: 0, pageCount: 1 }
    expect(pageLabel(entry, 10)).toBe('Slide 3 of 10')
  })

  it('formats multi-subpage slide label', () => {
    const entry: RailEntry = { slide: 3, sub: 1, pageCount: 3 }
    expect(pageLabel(entry, 10)).toBe('Slide 4 of 10, page 2 of 3')
  })
})

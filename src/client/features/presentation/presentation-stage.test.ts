import { createElement, type RefObject } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { installTestGlobals, renderElement } from '../../lib/test-render'
import { PresentationStage, type PresentationStageProps } from './presentation-stage'
import type { StageMetrics } from './slide-stage'

installTestGlobals()

beforeAll(async () => {
  await initI18n()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const METRICS: StageMetrics = { scale: 1, designWidth: 1280, designHeight: 720, contentWidth: 1168, contentHeight: 632 }

// The projector's corner chip is the number a speaker reads across a room, and the pill's is the one
// they read on their own screen. Both are `formatDeckPosition` of the same position, so this pins the
// wiring on the surface that had no case of its own: a chip that stopped carrying the reveal would
// otherwise only be caught in a browser.
function chip(props: Partial<PresentationStageProps>): string {
  const stageRef: RefObject<HTMLDivElement | null> = { current: null }
  const { container } = renderElement(createElement(PresentationStage, {
    stageRef,
    metrics: METRICS,
    cacheKey: 'cache-key',
    source: '<p>body</p>',
    subPage: 0,
    step: 0,
    steps: 0,
    pageCount: 1,
    index: 0,
    count: 1,
    onPlan: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    occluded: false,
    ...props,
  }))
  return container.querySelector('[data-deck-position]')?.textContent?.trim() ?? ''
}

describe('the projector corner chip', () => {
  it('names the slide and the deck it sits in', () => {
    expect(chip({ index: 3, count: 14 })).toBe('4 / 14')
  })

  it('carries the page of the slide, and the reveal of that page', () => {
    expect(chip({ index: 2, count: 14, subPage: 1, pageCount: 4, step: 1, steps: 2 })).toBe('3 / 14 · 2/4 · 2/3')
  })

  it('says nothing about reveals on a page that arrives all at once', () => {
    expect(chip({ index: 2, count: 14, subPage: 1, pageCount: 4, step: 0, steps: 0 })).toBe('3 / 14 · 2/4')
  })
})

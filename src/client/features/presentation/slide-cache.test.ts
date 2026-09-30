import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { clearSlidePlanCache, readSlidePlan, rememberSlideHtml, rememberSlidePlan, subscribeSlideHtmlKey } from './slide-html'
import type { SlidePlan } from './slide-pagination'
import { useSlidePlans } from './presentation-overlay'

describe('slidePlanCache', () => {
  beforeEach(() => {
    clearSlidePlanCache()
  })

  it('stores and retrieves plans by slide hash', () => {
    const dummyPlan: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }
    expect(readSlidePlan('hash-1')).toBeUndefined()
    rememberSlidePlan('hash-1', dummyPlan)
    expect(readSlidePlan('hash-1')).toBe(dummyPlan)
  })
})

describe('useSlidePlans incremental caching', () => {
  beforeEach(() => {
    clearSlidePlanCache()
  })

  it('preserves cached plan reference when other slides change', () => {
    let latestPlans: Record<number, SlidePlan> = {}
    let reportPlanFn: (slide: number, plan: SlidePlan) => void = () => {}

    function TestHarness({ deck }: { deck: string[] }) {
      const { plans, reportPlan } = useSlidePlans(deck)
      latestPlans = plans
      reportPlanFn = reportPlan
      return null
    }

    const planA: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }
    const planB: SlidePlan = { pages: [{ from: 0, to: 2, top: 0 }], scales: [1, 1] }

    const rendered = renderElement(createElement(TestHarness, { deck: ['Slide A', 'Slide B'] }))
    act(() => {
      reportPlanFn(0, planA)
      reportPlanFn(1, planB)
    })

    expect(latestPlans[0]).toBe(planA)
    expect(latestPlans[1]).toBe(planB)

    rendered.rerender(createElement(TestHarness, { deck: ['Slide A modified', 'Slide B'] }))

    expect(latestPlans[0]).toBeUndefined()
    expect(latestPlans[1]).toBe(planB)
    rendered.unmount()
  })
})

describe('subscribeSlideHtmlKey fine-grained subscription', () => {
  it('triggers only listeners matching the updated cacheKey', () => {
    const fnKey1 = vi.fn()
    const fnKey2 = vi.fn()

    const unsub1 = subscribeSlideHtmlKey('key-1', fnKey1)
    const unsub2 = subscribeSlideHtmlKey('key-2', fnKey2)

    rememberSlideHtml('key-1', { html: '<p>slide 1</p>', fences: createFenceBodies() })

    expect(fnKey1).toHaveBeenCalledTimes(1)
    expect(fnKey2).not.toHaveBeenCalled()

    rememberSlideHtml('key-2', { html: '<p>slide 2</p>', fences: createFenceBodies() })

    expect(fnKey1).toHaveBeenCalledTimes(1)
    expect(fnKey2).toHaveBeenCalledTimes(1)

    unsub1()
    unsub2()

    rememberSlideHtml('key-1', { html: '<p>slide 1 updated</p>', fences: createFenceBodies() })
    expect(fnKey1).toHaveBeenCalledTimes(1)
  })
})

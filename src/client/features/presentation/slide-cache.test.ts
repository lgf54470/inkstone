import { act, createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { clearSlidePlanCache, readSlidePlan, rememberSlidePlan } from './slide-html'
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

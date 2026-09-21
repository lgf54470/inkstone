import { createElement } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n, t } from '../lib/i18n'
import { renderElement } from '../lib/test-render'
import { BreakdownRow, KpiCard } from './dashboard-blocks'

type KpiProps = Parameters<typeof KpiCard>[0]

function renderKpi(props: Partial<KpiProps>) {
  return renderElement(createElement(KpiCard, { icon: null, label: 'Views', value: 0, ...props } as KpiProps))
}

describe('dashboard KPI numbers (SH-57)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('formats the value in the app locale rather than the browser default', () => {
    const rendered = renderKpi({ value: 1234567 })
    expect(rendered.container.textContent).toContain(new Intl.NumberFormat('en-US').format(1234567))
    rendered.unmount()
  })

  it('formats breakdown counts and percentages too', () => {
    const rendered = renderElement(createElement(BreakdownRow, { name: 'Germany', count: 4321, percentage: 12 }))
    expect(rendered.container.textContent).toContain(new Intl.NumberFormat('en-US').format(4321))
    rendered.unmount()
  })
})

describe('dashboard KPI semantics (SH-57)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('announces the delta with what it was measured against', () => {
    const hint = t('share.delta_vs_previous')
    const rendered = renderKpi({ value: 10, delta: 12, deltaHint: hint })
    expect(rendered.container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(`+12% ${hint}`)
    expect(rendered.container.textContent).toContain('+12%')
    rendered.unmount()
  })

  it('keeps the sparkline out of the reading order', () => {
    const rendered = renderKpi({ value: 10, sparkline: [1, 4, 2] })
    expect(rendered.container.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
    rendered.unmount()
  })
})

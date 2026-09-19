import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { KpiCard } from './dashboard-blocks'
import { renderElement } from '../lib/test-render'

function renderKpi(props: Record<string, unknown>) {
  return renderElement(createElement(KpiCard, { icon: null, label: 'PV', value: 0, ...props }))
}

describe('KpiCard delta badge', () => {
  it('hides the badge entirely when the server reported no delta', () => {
    const { container, unmount } = renderKpi({})
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).not.toContain('%')
    unmount()
  })

  it('paints a flat zero percent for a genuinely unchanged period', () => {
    const { container, unmount } = renderKpi({ delta: 0 })
    expect(container.querySelector('svg.lucide-minus')).not.toBeNull()
    expect(container.textContent).toContain('0%')
    unmount()
  })

  it('keeps up and down arrows for non-zero deltas', () => {
    const up = renderKpi({ delta: 5 })
    expect(up.container.querySelector('svg.lucide-trending-up')).not.toBeNull()
    expect(up.container.textContent).toContain('+5%')
    up.unmount()
    const down = renderKpi({ delta: -5 })
    expect(down.container.querySelector('svg.lucide-trending-down')).not.toBeNull()
    expect(down.container.textContent).toContain('-5%')
    down.unmount()
  })
})

describe('KpiCard sparkline', () => {
  it('hides an all-zero sparkline that would fake a flat trend', () => {
    const { container, unmount } = renderKpi({ sparkline: [0, 0, 0] })
    expect(container.querySelector('[viewBox="0 0 100 28"]')).toBeNull()
    unmount()
  })

  it('shows the sparkline once a bucket carries traffic', () => {
    const { container, unmount } = renderKpi({ sparkline: [0, 3, 0] })
    expect(container.querySelector('[viewBox="0 0 100 28"]')).not.toBeNull()
    unmount()
  })
})

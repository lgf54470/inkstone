// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A post's chart.js block takes its series colours from the site's accent, the way its echarts blocks
 * already do. chart.js is mocked here because what is being pinned is the configuration the page hands
 * the library, not what the canvas does with it.
 */

const captured = vi.hoisted(() => ({ configs: [] as Record<string, unknown>[] }))

vi.mock('chart.js/auto', () => ({
  default: class MockChart {
    constructor(_canvas: unknown, config: Record<string, unknown>) {
      captured.configs.push(config)
    }
    destroy() {}
    resize() {}
  },
}))

import { initDiagramLazyRender } from './diagram-reveal'

const CINNABAR = 'oklch(49% 0.15 30)'

function mount(config: unknown): void {
  document.documentElement.style.setProperty('--accent', CINNABAR)
  const root = document.createElement('div')
  root.className = 'ink-prose'
  root.innerHTML = `<div class="chartjs-block loading" data-chart="${encodeURIComponent(JSON.stringify(config))}" aria-busy="true"></div>`
  document.body.replaceChildren(root)
  initDiagramLazyRender()
}

async function handedToChartJs(): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline && captured.configs.length === 0) {
    await new Promise((resolve) => { setTimeout(resolve, 20) })
  }
  expect(captured.configs.length, 'chart.js was never handed a configuration').toBeGreaterThan(0)
  return captured.configs.at(-1)!
}

beforeEach(() => {
  captured.configs.length = 0
})

describe('a post drawing a chart.js block', () => {
  it('colours the datasets the note left uncoloured and leaves a named colour alone', async () => {
    mount({
      type: 'bar',
      data: { labels: ['A', 'B'], datasets: [{ label: 'x', data: [1, 2] }, { label: 'y', data: [3, 4], backgroundColor: 'rgb(1, 2, 3)' }] },
    })
    const config = await handedToChartJs()
    const datasets = (config.data as { datasets: Record<string, unknown>[] }).datasets
    expect(String(datasets[0]?.backgroundColor)).toMatch(/^#[0-9a-f]{6}$/)
    expect(datasets[0]?.borderColor).toBe(datasets[0]?.backgroundColor)
    expect(datasets[1]?.backgroundColor).toBe('rgb(1, 2, 3)')
    document.documentElement.style.removeProperty('--accent')
  })

  it('gives each series its own colour from the group rather than the same one twice', async () => {
    mount({
      type: 'bar',
      data: { labels: ['A'], datasets: [{ data: [1] }, { data: [2] }, { data: [3] }] },
    })
    const config = await handedToChartJs()
    const colours = (config.data as { datasets: Record<string, unknown>[] }).datasets.map((dataset) => dataset.backgroundColor)
    expect(new Set(colours).size).toBe(3)
    document.documentElement.style.removeProperty('--accent')
  })
})

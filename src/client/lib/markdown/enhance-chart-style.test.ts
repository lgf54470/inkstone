import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../i18n'
import { destroyChartInstances, destroyEchartsInstances, renderChartJs, renderEcharts } from './enhance'
import { encodeDataValue } from './data-attr'
import { createFenceBodies, registerFenceBodies, takeFenceIndex } from './fence-bodies'
import { stubCanvasContext } from './enhance.test-helpers'
import { renderMarkdown } from './renderer'

/**
 * The format a block states for its own body decides which reader runs. Inference from the body's shape
 * is what a note that says nothing gets; the annotation is what a note asks for, and it is not a second
 * opinion about the same fact — a table whose `| --- |` row is broken is a table the shape cannot see,
 * and the author deserves the sentence about the row rather than one about JSON.
 */

beforeAll(async () => {
  await initI18n()
})

const CHART_TABLE = '| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |'
const CHART_JSON = JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } }, null, 2)
const ECHARTS_OPTION = "{\n  title: { text: 'Tally' },\n  series: []\n}"

const DRAW = { allowScript: false, dark: false, instant: false }

function chartRoot(body: string, style?: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = `<div class="chartjs-block loading" data-chart="${encodeDataValue(body)}"${style ? ` data-chart-style="${style}"` : ''}></div>`
  document.body.append(root)
  return root
}

/** An echarts block as the renderer leaves it, with its option in the document's fence-body set. */
function echartsRoot(body: string, info: string): HTMLElement {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'echarts', body)
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown('```' + info + '\n' + body + '\n```').html
  registerFenceBodies(root, fences)
  document.body.append(root)
  return root
}

const banner = (root: HTMLElement): string => root.querySelector('.chart-error-text')?.textContent ?? ''

describe('the format a chart block states', () => {
  it('draws the body in the format the note states', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = chartRoot(CHART_TABLE, 'table')
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).not.toBeNull()
      expect((root.querySelector<HTMLElement>('[data-chart]')!.dataset.rendered ?? '')).toContain(':table')
    }
    finally {
      destroyChartInstances(root)
      restoreCanvasContext()
      root.remove()
    }
  })

  it('reports the format the author asked for, not the one the body looks like', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = chartRoot(CHART_JSON, 'table')
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).toBeNull()
      expect(banner(root)).toContain('The first cell must name the chart')
      expect(root.querySelector('pre code')?.textContent).toContain('"type": "bar"')
    }
    finally {
      destroyChartInstances(root)
      restoreCanvasContext()
      root.remove()
    }
  })
})

describe('a stated format that does not fit the body', () => {
  it('says the JSON sentence when a stated json body is not readable', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = chartRoot(CHART_TABLE, 'json')
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).toBeNull()
      expect(banner(root)).toContain('The JSON in this block cannot be read')
    }
    finally {
      destroyChartInstances(root)
      restoreCanvasContext()
      root.remove()
    }
  })

  // A stated format is nowhere in the body's text, so a note that changes only that line has to look
  // changed to the draw signature — and the refusal a typo leaves is lifted by restating it, with the
  // body never touched.
  it('refuses a format the note did not name, and redraws once it is restated', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = chartRoot(CHART_JSON, 'tabel')
    const block = () => root.querySelector<HTMLElement>('[data-chart]')!
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).toBeNull()
      expect(banner(root)).toContain('names no format')
      block()!.dataset.chartStyle = 'json'
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).not.toBeNull()
    }
    finally {
      destroyChartInstances(root)
      restoreCanvasContext()
      root.remove()
    }
  })
})

describe('the format an echarts block states', () => {
  it('runs the reader the fence states, and reports that format', async () => {
    const root = echartsRoot(ECHARTS_OPTION, 'echarts style=table')
    try {
      await renderEcharts(root, DRAW)
      expect(root.querySelector('[data-echarts] svg')).toBeNull()
      expect(banner(root)).toContain('The first cell must name the chart')
      expect((root.querySelector<HTMLElement>('[data-echarts]')!.dataset.rendered ?? '')).toContain(':table')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('reads a table body as an option when the fence says so', async () => {
    const root = echartsRoot(CHART_TABLE, 'echarts style=json')
    try {
      await renderEcharts(root, DRAW)
      expect(root.querySelector('[data-echarts] svg')).toBeNull()
      expect(banner(root)).toContain('not readable as JSON5')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('refuses a format the note did not name, and draws once it is restated', async () => {
    const root = echartsRoot(ECHARTS_OPTION, 'echarts style=tabel')
    const block = () => root.querySelector<HTMLElement>('[data-echarts]')!
    try {
      await renderEcharts(root, DRAW)
      expect(root.querySelector('[data-echarts] svg')).toBeNull()
      expect(banner(root)).toContain('names no format')
      expect(block().dataset.rendered).toContain('!tabel')
      block().dataset.echartsStyle = 'json'
      await renderEcharts(root, DRAW)
      expect(root.querySelector('[data-echarts] svg')).not.toBeNull()
      expect(block().dataset.rendered).not.toContain('!tabel')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })
})

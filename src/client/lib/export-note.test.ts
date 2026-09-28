import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from './i18n'
import { exportNoteAsMarkdown, renderNoteToExportHtml } from './export-note'

// The library is replaced so the config the export hands it can be read back: jsdom refuses to draw,
// and the chart picture is a question only a browser can answer (the visual gate reads the pixels).
const { chartConfigs } = vi.hoisted(() => ({ chartConfigs: [] as Array<{ options?: { animation?: unknown } }> }))

vi.mock('chart.js/auto', () => ({
  Chart: class MockChart {
    constructor(_canvas: unknown, config: { options?: { animation?: unknown } }) {
      chartConfigs.push(config)
    }

    destroy(): void {}

    resize(): void {}
  },
}))

beforeAll(async () => {
  await initI18n()
})

const MARKDOWN_FIXTURE = [
  '# Title',
  '',
  '- [x] Done task',
  '- [/] In progress task',
  '- [-] Cancelled task',
  '',
  'Formula: $E=mc^2$',
  '',
  '```typescript',
  'const x: number = 42;',
  '```',
  '',
  '::: details Detail Title',
  'Some content inside details',
  ':::',
].join('\n')

async function withCanvasMock(run: () => Promise<void>): Promise<void> {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = (() => ({
    canvas: document.createElement('canvas'),
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    measureText: () => ({ width: 0 }),
    save: () => {},
    restore: () => {},
  })) as never
  try {
    await run()
  } finally {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  }
}

describe('export-note markdown export', () => {
  it('formats markdown export with title frontmatter', () => {
    const clickSpy = vi.fn()
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        node.click = clickSpy
      }
      return node
    })

    exportNoteAsMarkdown({ title: 'My Note', content: '# Hello\nWorld' })

    expect(clickSpy).toHaveBeenCalled()
    appendSpy.mockRestore()
  })
})

// The exported document is read as pixels, not looked at: every chart in it becomes a PNG inside the
// same tick the chart was created, and chart.js draws its first frame on a later one. So an exported
// note carried fully transparent chart pictures — measured on a four-bar chart, 0 of the 69246 pixels
// a finished chart paints were on the canvas when the export read it, and the exported file held the
// same nothing; asking for the instant draw is what makes the read land on a drawn canvas.
describe('export-note chart pictures', () => {
  const CHART_NOTE = [
    '# Chart note',
    '',
    '```chart',
    JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } }),
    '```',
  ].join('\n')

  it('asks for charts that are drawn by the time the picture is taken', async () => {
    await withCanvasMock(async () => {
      chartConfigs.length = 0
      await renderNoteToExportHtml({ title: 'Chart Note', content: CHART_NOTE }, 'zh-CN')
      expect(chartConfigs).toHaveLength(1)
      expect(chartConfigs[0].options?.animation).toBe(false)
    })
  })
})

describe('export-note html export', () => {
  it('renders all markdown features into self-contained html document', async () => {
    await withCanvasMock(async () => {
      const html = await renderNoteToExportHtml({ title: 'Test Note', content: MARKDOWN_FIXTURE }, 'zh-CN')

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<title>Test Note</title>')
      expect(html).toContain('.task-status-in-progress')
      expect(html).toContain('.task-status-cancelled')
      expect(html).toContain('.code-block')
      expect(html).toContain('katex')
    })
  })
})
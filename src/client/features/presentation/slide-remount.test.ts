import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { enhancePreview, renderChartJs, renderPendingMermaid } from '../../lib/markdown/enhance'
import { stubCanvasContext } from '../../lib/markdown/enhance.test-helpers'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { captureSlideHtml } from './slide-html'

// A diagram is the one rich block whose rendered form survives serialization: the SVG is markup and
// its marker is what lets a cached copy be hydrated instead of drawn again. Rendering it for real
// needs the mermaid library, so the library is stubbed and counted: what these tests are about is
// the pipeline around it, not mermaid itself.
const mermaidStub = vi.hoisted(() => ({ render: vi.fn(async (_id: string, _source: string) => ({ svg: '<svg class="stub-diagram"></svg>' })) }))
vi.mock('mermaid', () => ({
  default: {
    initialize: () => { },
    render: (id: string, source: string) => mermaidStub.render(id, source),
  },
}))

beforeAll(async () => {
  await initI18n()
})

const SOURCE = [
  '## Rich blocks',
  '',
  '```chart',
  '{"type":"bar","data":{"labels":["A"],"datasets":[{"data":[1]}]}}',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A --> B',
  '```',
  '',
  '```javascript-example',
  'console.log(1 + 1)',
  '```',
  '',
].join('\n')

// The page a measuring canvas hands to the cache, built the way the canvas builds it: the real
// renderer, inside the element the capture reads.
function measuredPage(source: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<div data-slide-page>${renderMarkdown(source, { externalImages: false, hideFrontMatter: true }).html}</div>`
  return host
}

// What a later mount of a cached slide receives: the captured markup, mounted into a fresh host and
// put through the same enhancement the projector, the preview and the printed deck run on mount.
async function remount(captured: string): Promise<HTMLElement> {
  const host = document.createElement('div')
  host.innerHTML = captured
  document.body.append(host)
  await enhancePreview(host, { math: true, mermaid: true, dark: false, codeBlockCollapseLines: 0 })
  return host
}

async function captureRendered(source: string): Promise<string> {
  const live = measuredPage(source)
  document.body.append(live)
  await renderPendingMermaid(live, false)
  await renderChartJs(live, false)
  const canvas = live.querySelector('canvas')
  if (canvas) vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,still')
  const captured = captureSlideHtml(live) ?? ''
  live.remove()
  return captured
}

// Every case here renders a chart, so they all need the canvas stub; one runner keeps the restore
// in a single place instead of one per case.
async function withCanvas(run: () => Promise<void>): Promise<void> {
  const restore = stubCanvasContext()
  try {
    await run()
  }
  finally {
    restore()
  }
}

describe('a cached slide mounted again — the chart', () => {
  it('draws the chart again instead of trusting the marker the cache carries', () => withCanvas(async () => {
    const captured = await captureRendered(SOURCE)
    const cached = document.createElement('div')
    cached.innerHTML = captured
    // The capture keeps a picture of the chart for the surfaces that only display it, and drops the
    // chart's marker: a marker that survived serialization while the pixels did not is what handed
    // every later mount an empty chart box.
    expect(cached.querySelector('img.chartjs-still')).not.toBeNull()
    expect(cached.querySelector('[data-chart]')!.hasAttribute('data-rendered')).toBe(false)
    const host = await remount(captured)
    const block = host.querySelector<HTMLElement>('[data-chart]')!
    expect(block.classList.contains('has-error')).toBe(false)
    expect(host.querySelector('canvas.chartjs-canvas')).not.toBeNull()
    // The still was for the display surfaces; the live chart replaced it.
    expect(block.querySelector('img.chartjs-still')).toBeNull()
    host.remove()
  }))
})

describe('a cached slide mounted again — the diagram', () => {
  it('shows what the cache rendered without drawing it a second time', () => withCanvas(async () => {
    const captured = await captureRendered(SOURCE)
    const drawnOnce = mermaidStub.render.mock.calls.length
    const host = await remount(captured)
    const block = host.querySelector<HTMLElement>('[data-mermaid]')!
    expect(block.querySelector('svg')).not.toBeNull()
    expect(block.dataset.rendered).toBeTruthy()
    // The capture kept the marker, so the mount reads the diagram it already has instead of putting
    // it through the render queue again.
    expect(mermaidStub.render.mock.calls.length).toBe(drawnOnce)
    host.remove()
  }))

  it('leaves every rich block out of its placeholder state', () => withCanvas(async () => {
    const host = await remount(await captureRendered(SOURCE))
    // The rule behind the marker bug: a cached copy is mounted, not rendered from scratch, so a
    // block waiting for work no one will ever run shows its placeholder forever.
    const placeholders = [...host.querySelectorAll<HTMLElement>('[data-chart], [data-mermaid]')]
      .filter((node) => node.classList.contains('loading') || (node.hasAttribute('aria-busy') && node.getAttribute('aria-busy') !== 'false'))
    expect(placeholders.map((node) => node.className)).toEqual([])
    host.remove()
  }))
})

describe('a cached slide mounted again — the runnable example', () => {
  it('keeps the example running from the cached copy', () => withCanvas(async () => {
    const host = await remount(await captureRendered(SOURCE))
    const block = host.querySelector<HTMLElement>('.js-example-block')!
    expect(block.querySelector('[data-js-run]')).not.toBeNull()
    expect(block.querySelector('[data-js-switch]')).not.toBeNull()
    expect(block.querySelector('.code-block pre code')?.textContent).toContain('console.log(1 + 1)')
    expect(block.querySelector('.js-example-output-body')).not.toBeNull()
    host.remove()
  }))
})

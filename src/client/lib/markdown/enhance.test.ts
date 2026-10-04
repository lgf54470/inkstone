import { beforeAll, describe, expect, it } from 'vitest'
import { initI18n } from '../i18n'
import { configureCodeBlockCollapsing, decorateCodeBlock, destroyChartInstances, destroyEchartsInstances, enhancePreview, renderChartJs, renderEcharts, renderStaticEcharts, showEchartsSource, toggleCodeBlockCollapse } from './enhance'
import { highlightWithPrism } from './prism'
import { encodeDataValue } from './data-attr'
import { createFenceBodies, type FenceBodies, registerFenceBodies, takeFenceIndex } from './fence-bodies'
import { installTestGlobals } from '../test-render'
import { stubCanvasContext } from './enhance.test-helpers'
import { renderMarkdown } from './renderer'

beforeAll(async () => {
  await initI18n()
})

describe('code block collapsing — Prism languages', () => {
  it('loads every configured Prism language on demand', async () => {
    const languages = [
      'html', 'xml', 'css', 'javascript', 'typescript', 'jsx', 'tsx', 'json', 'markdown',
      'bash', 'powershell', 'python', 'java', 'c', 'c++', 'c#', 'go', 'rust', 'php', 'ruby',
      'sql', 'yaml', 'toml', 'dockerfile', 'nginx', 'diff', 'http', 'graphql', 'scss', 'less',
    ]

    const results = await Promise.all(languages.map((language) => highlightWithPrism('const value = 1', language)))

    expect(results.every(Boolean)).toBe(true)
  })

  it('highlights supported languages with Prism while preserving line wrappers', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="code-block" data-lang="tsx"><div class="code-block-head"><span class="code-title">tsx</span><button data-copy type="button">Copy</button></div><pre><code>const App = () =&gt; (\n  &lt;main&gt;Hello&lt;/main&gt;\n)</code></pre></div>'

    await enhancePreview(root, { math: false, mermaid: false, dark: false, codeBlockCollapseLines: 8 })

    expect(root.querySelector('code')!.classList.contains('language-tsx')).toBe(true)
    expect(root.querySelector('.token.keyword')?.textContent).toBe('const')
    expect(root.querySelector('.token.tag')?.textContent).toContain('main')
    const lines = [...root.querySelectorAll<HTMLElement>('.line')]
    expect(lines).toHaveLength(3)
    expect(lines.map((line) => line.textContent).join('\n')).toBe('const App = () => (\n  <main>Hello</main>\n)')
  })

  it('leaves unknown languages as plain text without throwing', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="code-block" data-lang="not-a-language"><pre><code>&lt;plain&gt;\ntext</code></pre></div>'

    await expect(enhancePreview(root, { math: false, mermaid: false, dark: false })).resolves.toBeUndefined()

    expect(root.querySelector('.token')).toBeNull()
    expect(root.querySelectorAll('.line')).toHaveLength(2)
    expect(root.querySelector('code')!.textContent).toBe('<plain>\ntext')
  })
})

describe('code block collapsing — collapse and math source', () => {
  it('collapses long blocks and restores their full height when expanded', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="code-block"><div class="code-block-head"><span class="code-title">text</span><button data-copy type="button">Copy</button></div><pre><code>1\n2\n3\n4\n5\n6\n7\n8\n9\n10</code></pre></div>'
    const block = root.querySelector<HTMLElement>('.code-block')!

    decorateCodeBlock(block)
    configureCodeBlockCollapsing(root, 8)

    const toggle = block.querySelector<HTMLButtonElement>('[data-code-collapse]')!
    expect(block.classList.contains('is-code-collapsed')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(block.querySelector('pre')!.id)
    expect(toggle.textContent).toContain('2')

    toggleCodeBlockCollapse(toggle)
    expect(block.classList.contains('is-code-expanded')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(block.querySelector('pre')!.style.maxHeight).toBe('')

    configureCodeBlockCollapsing(root, 8)
    expect(block.classList.contains('is-code-expanded')).toBe(true)
    expect(block.querySelector<HTMLButtonElement>('[data-code-collapse]')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('shows readable math source when math rendering is disabled', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Value: <span class="math-inline" data-math="x^2"></span></p><div class="math-block" data-math="a+b"></div>'

    await enhancePreview(root, { math: false, mermaid: false, dark: false })

    expect(root.querySelector('.math-inline')!.textContent).toBe('$x^2$')
    expect(root.querySelector('.math-block')!.textContent).toBe('$$\na+b\n$$')
    expect(root.querySelectorAll('.math-source')).toHaveLength(2)
  })

  it('keeps hostile markup inside code fences inert after syntax highlighting', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="code-block" data-lang="html"><pre><code>&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;&lt;svg onload=alert(3)&gt;&lt;/svg&gt;</code></pre></div>'

    await enhancePreview(root, { math: false, mermaid: false, dark: false })

    expect(root.querySelector('img, script, svg, iframe')).toBeNull()
    // Highlighting still ran, but the hostile source survives only as inert text.
    expect(root.querySelector('.token.tag')).not.toBeNull()
    expect(root.querySelector('code')!.textContent).toBe('<img src=x onerror=alert(1)><script>alert(2)</script><svg onload=alert(3)></svg>')
  })
})

describe('code block collapsing — hostile markup inertness', () => {
  it('keeps hostile markup inside math inert after KaTeX rendering', async () => {
    const root = document.createElement('div')
    const math = document.createElement('span')
    math.className = 'math-inline'
    math.dataset.math = '\\text{<img src=x onerror=alert(1)> <script>alert(2)</script>}'
    root.append(math)

    await enhancePreview(root, { math: true, mermaid: false, dark: false })

    expect(root.querySelector('img, script, svg[onload], iframe')).toBeNull()
    expect(root.querySelector('.katex')).not.toBeNull()
    // KaTeX renders inter-word spaces as U+00A0; normalize before comparing.
    const text = root.querySelector('.math-inline')!.textContent!.replace(/\u00a0/g, ' ')
    expect(text).toContain('<img src=x onerror=alert(1)> <script>alert(2)</script>')
  })
})

describe('chart rendering', () => {
  it('renders and destroys chart blocks', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = document.createElement('div')
    const chartJson = JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } })
    const encoded = encodeDataValue(chartJson)
    root.innerHTML = `<div class="chartjs-block loading" data-chart="${encoded}"></div>`
    document.body.appendChild(root)
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).not.toBeNull()
      destroyChartInstances(root)
    } finally {
      restoreCanvasContext()
      root.remove()
    }
  })
})

// The surfaces that read the canvas instead of watching it — the printed deck — ask for a chart with no
// entrance animation. chart.js animates towards its data, so a canvas sampled while one is running is
// blank, and a resize clears the canvas and starts another: the deck's sheet is resized exactly as it is
// handed to the print pipeline (the webfonts land and the pages reflow), which printed an empty chart box
// on a page that looked finished (e2e-visual export: `live=1 painted=0`, reproduced with the canvas's
// painted pixels dropping from 1569 to 203 a second after the sheet said it was ready). jsdom gets no
// further than the options the library was handed — it cannot draw, and the library refuses its stub
// canvas — so what is pinned here is the config; the pixels are read by the visual gate.
describe('chart animation', () => {
  it('leaves out the entrance animation when the caller says it reads the canvas', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const chartJson = JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } })
    const block = `<div data-chart="${encodeDataValue(chartJson)}"></div>`
    const animateRoot = document.createElement('div')
    const instantRoot = document.createElement('div')
    animateRoot.innerHTML = block
    instantRoot.innerHTML = block
    document.body.append(animateRoot, instantRoot)
    const animationOf = (root: HTMLElement): unknown =>
      (root.querySelector<HTMLElement>('[data-chart]') as unknown as { __chartInstance?: { options: { animation?: unknown } } })
        .__chartInstance?.options.animation
    try {
      await Promise.all([renderChartJs(animateRoot, false), renderChartJs(instantRoot, false, { instant: true })])
      // The default keeps whatever the fence asked for; the instant surface pins it off.
      expect(animationOf(instantRoot)).toBe(false)
      expect(animationOf(animateRoot)).not.toBe(false)
    } finally {
      destroyChartInstances(animateRoot)
      destroyChartInstances(instantRoot)
      restoreCanvasContext()
      animateRoot.remove()
      instantRoot.remove()
    }
  })
})

describe('chart sizing', () => {
  // jsdom lays nothing out, so the box the stylesheet would give the container is stubbed. This is
  // the size the chart has to be drawn at: the slide canvas is scaled with a CSS transform, and a
  // chart that measures the container's bounding rect comes out stage-scale times too big — the
  // chart block then grows a scrollbar in both directions, one size larger on every geometry change.
  function stubContainerBox(width: number, height: number): () => void {
    const originalWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
    const originalHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
    const box = (value: number, original: PropertyDescriptor | undefined): PropertyDescriptor => ({
      configurable: true,
      get(this: Element): number {
        return this.classList.contains('chartjs-container') ? value : (original?.get?.call(this) ?? 0)
      },
    })
    Object.defineProperty(Element.prototype, 'clientWidth', box(width, originalWidth))
    Object.defineProperty(Element.prototype, 'clientHeight', box(height, originalHeight))
    return () => {
      const none = (): number => 0
      Object.defineProperty(Element.prototype, 'clientWidth', originalWidth ?? { configurable: true, get: none })
      Object.defineProperty(Element.prototype, 'clientHeight', originalHeight ?? { configurable: true, get: none })
    }
  }

  it('draws at the container box instead of the library measuring a scaled rect', async () => {
    installTestGlobals()
    const restoreCanvasContext = stubCanvasContext()
    const restoreBox = stubContainerBox(480, 260)
    const root = document.createElement('div')
    root.innerHTML = `<div data-chart="${encodeDataValue(JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } }))}"></div>`
    document.body.appendChild(root)
    const node = root.querySelector<HTMLElement>('[data-chart]')!
    try {
      await renderChartJs(root, false)
      const container = node.querySelector<HTMLElement>('.chartjs-container')!
      const canvas = node.querySelector('canvas')!
      // The canvas carries the box's size, which is the size chart.js then reads as its own: it
      // would otherwise measure the container's bounding rect and come out stage-scale too big.
      expect(`${container.clientWidth}x${container.clientHeight}`).toBe('480x260')
      expect(`${canvas.width}x${canvas.height}`).toBe('480x260')
      // jsdom cannot take a chart further than this (its stubbed 2D context is not one chart.js
      // accepts), so the rest of the promise — no scrollbar after a geometry change — is asserted
      // in the visual gate, against the real renderer in a real browser.
    } finally {
      destroyChartInstances(root)
      restoreBox()
      restoreCanvasContext()
      root.remove()
    }
  })
})

describe('chart rendering from cached markup', () => {
  it('draws again when the markup carries the marker but no live instance', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = document.createElement('div')
    const chartJson = JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } })
    root.innerHTML = `<div class="chartjs-block loading" data-chart="${encodeDataValue(chartJson)}"></div>`
    document.body.appendChild(root)
    try {
      await renderChartJs(root, false)
      const marker = root.querySelector<HTMLElement>('[data-chart]')!.dataset.rendered
      expect(marker).toBeTruthy()
      // What the slide cache holds: the attribute survives serialization, the canvas pixels and the
      // instance do not.
      const cached = document.createElement('div')
      cached.innerHTML = root.innerHTML
      expect(cached.querySelector<HTMLElement>('[data-chart]')!.dataset.rendered).toBe(marker)
      // The serialized canvas has no drawing, so a fresh canvas node is what proves the chart was
      // built again rather than trusted as already rendered.
      const serialized = cached.querySelector('canvas')
      await renderChartJs(cached, false)
      const block = cached.querySelector<HTMLElement>('[data-chart]')!
      expect(block.classList.contains('has-error')).toBe(false)
      expect(cached.querySelector('canvas.chartjs-canvas')).not.toBeNull()
      expect(cached.querySelector('canvas')).not.toBe(serialized)
      destroyChartInstances(cached)
    } finally {
      restoreCanvasContext()
      root.remove()
    }
  })
})

describe('chart rendering — tolerant config parsing', () => {
  it('parses charts with tolerant formatting such as trailing commas or markdown markers', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = document.createElement('div')
    const rawWithGlitch = '{\n  "type": "bar",**\n  "data": {\n    "labels": ["A",],\n    "datasets": [{ "data": [10,] }]\n  }\n}'
    const encoded = encodeDataValue(rawWithGlitch)
    root.innerHTML = `<div class="chartjs-block loading" data-chart="${encoded}"></div>`
    document.body.appendChild(root)
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).not.toBeNull()
      destroyChartInstances(root)
    } finally {
      restoreCanvasContext()
      root.remove()
    }
  })
})

const BOARD = {
  title: 'Release plan',
  activeViewId: 'view-board',
  columns: [
    { id: 'title', name: 'Title', type: 'title' },
    { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
  ],
  views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
  items: [{ id: 'i1', title: 'Write the changelog', properties: { status: 'todo' } }],
}

// A host hands the enhancement the markup and the set it was rendered from, and the enhancement puts
// that set where every block reads it back — which is the whole claim behind the preview pane, the
// share page, an export and a card not registering anything themselves (P-01).
function boardRoot(): { root: HTMLElement, fences: FenceBodies } {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'kanban', JSON.stringify(BOARD))
  const root = document.createElement('div')
  root.innerHTML = `<div class="kanban-block loading" data-kanban="" data-kanban-index="0" aria-busy="true"><div class="kanban-block-head"><button type="button" data-kanban-fullscreen></button></div><div class="kanban-block-placeholder" data-kanban-placeholder>Loading kanban...</div></div>`
  return { root, fences }
}

// The deck a ```bento-slides fence carries, in the shape the block arrives at the enhancement in.
const SLIDES_BODY = JSON.stringify({
  format: 'bento-slides',
  version: 1,
  title: 'Gate deck',
  slides: [{ id: 'a', title: 'Why now', elements: [{ id: 'e1', type: 'text', html: 'The deadline is Friday.', x: 0, y: 0, w: 10, h: 10 }] }],
})

function slidesRoot(): { root: HTMLElement, fences: FenceBodies } {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'slides', SLIDES_BODY)
  const root = document.createElement('div')
  root.innerHTML = '<div class="bento-slides-block loading" data-bento-slides="" data-bento-slides-index="0" aria-busy="true"><div class="bento-slides-block-placeholder" data-bento-slides-placeholder>Loading slides...</div></div>'
  return { root, fences }
}

function boardNode(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[data-kanban]')!
}

describe('kanban blocks — what each surface gets', () => {
  it('shows the fence where the surface declares nothing about boards', async () => {
    const { root, fences } = boardRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, fences })

    const node = boardNode(root)
    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.querySelector('code')?.textContent).toContain('Write the changelog')
  })

  it('leaves the block to its host when the surface mounts boards itself', async () => {
    const { root, fences } = boardRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, kanban: 'live', fences })

    const node = boardNode(root)
    expect(node.classList.contains('loading')).toBe(true)
    expect(node.getAttribute('aria-busy')).toBe('true')
    expect(node.querySelector('[data-kanban-fullscreen]')).not.toBeNull()
    expect(node.querySelector('code')).toBeNull()
  })

  it('draws the cards as a still list when the markup is serialized or printed', async () => {
    const { root, fences } = boardRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, kanban: 'snapshot', fences })

    const node = boardNode(root)
    expect(node.querySelector('[data-kanban-snapshot]')?.textContent).toContain('Write the changelog')
    expect(node.getAttribute('aria-busy')).toBe('false')
    expect(node.querySelector('[data-kanban-fullscreen]')).toBeNull()
  })

  // Written after the channel it pins (the board shape itself is asserted in `kanban/static.test.ts`);
  // its job is the routing, which no other file reads: a surface that asks for a board and is handed
  // the fence, or the list, would still pass every test beside this one.
  it('lays the cards out as the board when the surface is read from a distance', async () => {
    const { root, fences } = boardRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, kanban: 'board', fences })

    const node = boardNode(root)
    expect(node.querySelector('.kanban-board-column')?.textContent).toContain('Write the changelog')
    expect(node.querySelector('.kanban-snapshot-board'), 'a board channel that drew a list').not.toBeNull()
    expect(node.getAttribute('aria-busy')).toBe('false')
  })
})

describe('slides blocks — what each surface gets', () => {
  it('draws the card grid when the markup is serialized or printed', async () => {
    const { root, fences } = slidesRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, slides: 'snapshot', fences })

    const node = root.querySelector<HTMLElement>('[data-bento-slides]')!
    expect(node.querySelector('.bento-slides-fallback-card')?.textContent).toContain('Why now')
    expect(node.textContent).not.toContain('Loading slides...')
    expect(node.getAttribute('aria-busy')).toBe('false')
  })

  it('leaves the deck to its host when the surface mounts decks itself', async () => {
    const { root, fences } = slidesRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, slides: 'live', fences })

    const node = root.querySelector<HTMLElement>('[data-bento-slides]')!
    expect(node.classList.contains('loading')).toBe(true)
    expect(node.querySelector('.bento-slides-fallback-card')).toBeNull()
  })

  it('draws the deck once, however often its markup is enhanced again', async () => {
    // The printed sheet runs the enhancement over pages the cache already prepared; a second pass
    // must not stack a second grid under the first.
    const { root, fences } = slidesRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, slides: 'snapshot', fences })
    await enhancePreview(root, { math: false, mermaid: false, dark: false, slides: 'snapshot', fences })

    expect(root.querySelectorAll('.bento-slides-fallback-grid')).toHaveLength(1)
  })
})

describe('kanban blocks — a set that never arrived', () => {
  it('reads a board with no bodies of its own as an empty fence, not as another block body', async () => {
    // The other half of the same claim: a host that forgets the option gets the loud error state the
    // family already answers with, rather than a board drawn out of some other document's numbering.
    const { root } = boardRoot()
    await enhancePreview(root, { math: false, mermaid: false, dark: false, kanban: 'snapshot' })

    const node = boardNode(root)
    expect(node.querySelector('[data-kanban-snapshot]')?.textContent).not.toContain('Write the changelog')
    expect(node.getAttribute('aria-busy')).toBe('false')
  })
})

// A table body reaches the same mount a JSON one does: only how the note says the chart differs, so
// these blocks are built from rendered markup rather than a hand-made attribute.
describe('chart table bodies', () => {
  const tableFence = (rows: string[]) => ['```chart', ...rows, '```'].join('\n')

  it('draws a chart from a table body', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(tableFence(['| :bar: | A | B |', '| --- | --- | --- |', '| s | 1 | 2 |'])).html
    document.body.appendChild(root)
    try {
      await renderChartJs(root, false)
      expect(root.querySelector('canvas.chartjs-canvas')).not.toBeNull()
      const instance = (root.querySelector('[data-chart]') as unknown as { __chartInstance?: { config: { type?: string; data?: { labels?: unknown } } } }).__chartInstance
      expect(instance?.config.type).toBe('bar')
      expect(instance?.config.data?.labels).toEqual(['A', 'B'])
      destroyChartInstances(root)
    }
    finally {
      restoreCanvasContext()
      root.remove()
    }
  })

  it('points a table naming an echarts-only kind at the block that draws it', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(tableFence(['| :heatmap: | a |', '| --- | --- |', '| r | 1 |'])).html
    document.body.appendChild(root)
    try {
      await renderChartJs(root, false)
      const block = root.querySelector<HTMLElement>('[data-chart]')!
      expect(block.classList.contains('chart-error')).toBe(true)
      expect(block.querySelector('.chart-error-text')?.textContent).toContain('an `echarts` block')
      expect(block.textContent).toContain(':heatmap:')
      expect(root.querySelector('canvas.chartjs-canvas')).toBeNull()
    }
    finally {
      restoreCanvasContext()
      root.remove()
    }
  })
})

const ECHARTS_OPTION = "{ title: { text: 'Tally' }, xAxis: { type: 'category', data: ['a', 'b'] }, yAxis: {}, series: [{ type: 'bar', data: [3, 5] }] }"
const ECHARTS_SCRIPT = "{ xAxis: {}, yAxis: {}, series: [{ type: 'line', data: [1], tooltip: { formatter: (p) => p.value } }] }"

/** A block as the renderer leaves it, with its option in the document's fence-body set. */
function echartsRoot(body: string, info = 'echarts'): HTMLElement {
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'echarts', body)
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown('```' + info + '\n' + body + '\n```').html
  registerFenceBodies(root, fences)
  document.body.append(root)
  return root
}

const drawn = (root: HTMLElement): boolean => Boolean(root.querySelector('[data-echarts] svg'))
const blockOf = (root: HTMLElement): HTMLElement => root.querySelector<HTMLElement>('[data-echarts]')!

describe('the accent palette reaches the drawings', () => {
  it('colours a chart.js dataset the note left unstyled, and leaves a named colour alone', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const json = JSON.stringify({
      type: 'bar',
      data: { labels: ['A', 'B'], datasets: [{ label: 'x', data: [1, 2] }, { label: 'y', data: [3, 4], backgroundColor: 'rgb(1, 2, 3)' }] },
    })
    const root = document.createElement('div')
    root.innerHTML = `<div data-chart="${encodeDataValue(json)}"></div>`
    document.body.append(root)
    try {
      await renderChartJs(root, false)
      const datasets = (root.querySelector('[data-chart]') as unknown as { __chartInstance?: { data: { datasets: { backgroundColor?: unknown }[] } } }).__chartInstance?.data.datasets ?? []
      expect(datasets).toHaveLength(2)
      expect(String(datasets[0]?.backgroundColor)).toMatch(/^#[0-9a-f]{6}$/)
      expect(datasets[1]?.backgroundColor).toBe('rgb(1, 2, 3)')
      destroyChartInstances(root)
    }
    finally {
      restoreCanvasContext()
      root.remove()
    }
  })
})

describe('echarts blocks', () => {
  it('draws the option and stops announcing a pending block', async () => {
    const root = echartsRoot(ECHARTS_OPTION)
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(drawn(root)).toBe(true)
      expect(blockOf(root).classList.contains('loading')).toBe(false)
      expect(blockOf(root).getAttribute('aria-busy')).toBeNull()
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('honours a fence that asked to run JavaScript, on the surface that allows it', async () => {
    const root = echartsRoot(ECHARTS_SCRIPT, 'echarts js')
    try {
      await renderEcharts(root, { allowScript: true, dark: false, instant: false })
      expect(drawn(root)).toBe(true)
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  // Two keys turn this lock: a surface that runs a note's JavaScript does not run one it was never
  // asked to, and a fence that asks does not get its way on a surface that never offers.
  it('will not run a function body the fence never asked to run', async () => {
    const root = echartsRoot(ECHARTS_SCRIPT)
    try {
      await renderEcharts(root, { allowScript: true, dark: false, instant: false })
      expect(drawn(root)).toBe(false)
      expect(blockOf(root).querySelector('.chart-error-text')?.textContent).toContain('not readable as JSON5')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('refuses the same fence where the surface does not run a note\'s JavaScript', async () => {
    const root = echartsRoot(ECHARTS_SCRIPT)
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(drawn(root)).toBe(false)
      expect(blockOf(root).querySelector('.chart-error-text')?.textContent).toContain('write `js` after the fence marker')
      expect(blockOf(root).textContent).toContain('formatter')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('redraws under a changed theme rather than keeping the colours it first read', async () => {
    const root = echartsRoot(ECHARTS_OPTION)
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      const first = blockOf(root).dataset.rendered
      const firstSvg = root.querySelector('[data-echarts] svg')
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(blockOf(root).dataset.rendered).toBe(first)
      expect(root.querySelector('[data-echarts] svg')).toBe(firstSvg)
      await renderEcharts(root, { allowScript: false, dark: true, instant: false })
      expect(blockOf(root).dataset.rendered).not.toBe(first)
      expect(root.querySelector('[data-echarts] svg')).not.toBe(firstSvg)
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('shows the option it could not read', async () => {
    const root = echartsRoot('{ this is not: readable')
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(blockOf(root).classList.contains('echarts-error')).toBe(true)
      expect(blockOf(root).querySelector('.chart-error-text')?.textContent).toContain('not readable as JSON5')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('draws a snapshot with no entrance animation to catch mid-flight', async () => {
    const root = echartsRoot(ECHARTS_OPTION)
    try {
      await renderStaticEcharts(root, false)
      expect(drawn(root)).toBe(true)
      expect(blockOf(root).dataset.rendered).toContain(':j')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('draws a chart from a table body', async () => {
    const root = echartsRoot(['| :bar:{\"title\": \"Tally\"} | A | B |', '| --- | --- | --- |', '| s | 1 | 2 |'].join('\n'))
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(drawn(root)).toBe(true)
      expect(blockOf(root).querySelector('svg')?.textContent).toContain('Tally')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('refuses a map whose outlines come from off the allowlist', async () => {
    const root = echartsRoot(['| :map:{"mapDataSource": "https://evil.example.com/geo.json"} | v |', '| --- | --- |', '| 北京 | 1 |'].join('\n'))
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(drawn(root)).toBe(false)
      expect(blockOf(root).querySelector('.chart-error-text')?.textContent).toContain('allowed https source')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  // A bare table-chart reads its data back out of the table next to it, so the assertion is that the
  // picture and the table agree rather than that some second copy was handed over.
  it('draws a chart above a bare table-chart', async () => {
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown([
      '| :bar:{"title": "Tally"} | A | B |',
      '| --- | --- | --- |',
      '| s1 | 12 | 19 |',
      '| s2 | 3 | 4 |',
    ].join('\n')).html
    document.body.append(root)
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      const marker = root.querySelector<HTMLElement>('[data-table-chart]')!
      expect(marker.querySelector('svg')).not.toBeNull()
      expect(marker.querySelector('svg')?.textContent).toContain('Tally')
      expect(root.querySelectorAll('tbody tr')).toHaveLength(2)
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('removes a bare table-chart from a surface that draws no charts, leaving the table', () => {
    const root = document.createElement('div')
    root.innerHTML = renderMarkdown(['| :bar: | A |', '| --- | --- |', '| s | 1 |'].join('\n')).html
    showEchartsSource(root)
    expect(root.querySelector('[data-table-chart]')).toBeNull()
    expect(root.querySelector('table')).not.toBeNull()
  })

  // The accent is switchable per account and the palette is read at draw time, so a block must be
  // redrawn when it moves rather than keeping the colours it first read (ADR-0002 §5). The token is
  // written by hand because jsdom ships no stylesheet for it.
  it('redraws when the accent moves, without the note changing', async () => {
    const root = echartsRoot(['| :heatmap: | a | b |', '| --- | --- | --- |', '| r | 1 | 2 |'].join('\n'))
    document.documentElement.style.setProperty('--accent', 'oklch(49% 0.15 30)')
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      const block = root.querySelector<HTMLElement>('[data-echarts]')!
      const before = block.dataset.rendered
      expect(before).toContain('oklch(49% 0.15 30)')
      document.documentElement.style.setProperty('--accent', 'oklch(55% 0.12 210)')
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(block.dataset.rendered).not.toBe(before)
      expect(block.dataset.rendered).toContain('oklch(55% 0.12 210)')
    }
    finally {
      document.documentElement.style.removeProperty('--accent')
      destroyEchartsInstances(root)
      root.remove()
    }
  })

  it('shows the source to a surface that names no echarts mode', async () => {
    const root = echartsRoot(ECHARTS_OPTION)
    showEchartsSource(root)
    expect(blockOf(root).querySelector('pre code')?.textContent).toContain('Tally')
    expect(drawn(root)).toBe(false)
    root.remove()
  })

  it('reads an unregistered block as an empty option rather than as someone else\'s chart', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="echarts-block loading" data-echarts="" data-echarts-index="0"></div>'
    document.body.append(root)
    try {
      await renderEcharts(root, { allowScript: false, dark: false, instant: false })
      expect(blockOf(root).querySelector('.chart-error-text')?.textContent).toContain('no chart option in it')
    }
    finally {
      destroyEchartsInstances(root)
      root.remove()
    }
  })
})

import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { EditorView, type WidgetType } from '@codemirror/view'
import { createFenceBodies, takeFenceIndex } from '../lib/markdown/fence-bodies'
import { renderMarkdown } from '../lib/markdown/renderer'
import { stubCanvasContext } from '../lib/markdown/enhance.test-helpers'
import { collectRenderedBlocks, liveBlockRanges, livePreviewExtensions, publishLiveBlocks } from './live-preview'

function docOf(source: string): Text {
  return Text.of(source.split('\n'))
}

const FENCES = createFenceBodies()

/**
 * A board a snapshot can group: cards live under `properties`, so a body written from memory can
 * parse and still break the grouping that draws it.
 */
function boardWith(title: string) {
  return {
    title: 'Roadmap',
    activeViewId: 'view-board',
    columns: [
      { id: 'title', name: 'Title', type: 'title' },
      { id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] },
    ],
    views: [{ id: 'view-board', name: 'Board', type: 'board', groupBy: 'status' }],
    items: [{ id: 'i1', title, properties: { status: 'todo' } }],
  }
}

function boardFence(title: string): string {
  return '```kanban\n' + JSON.stringify(boardWith(title)) + '\n```\n'
}
const BLOCKS = [
  { line: 0, html: '<h1 data-line="0">Title</h1>', fences: FENCES, bodies: [] },
  { line: 2, html: '<p data-line="2">Body text</p>', fences: FENCES, bodies: [] },
  { line: 4, html: '<ul data-line="4"><li>item</li></ul>', fences: FENCES, bodies: [] },
]

function decorationRanges(state: EditorState): number[][] {
  const ranges: number[][] = []
  for (const set of state.facet(EditorView.decorations)) {
    if (typeof set === 'function') throw new Error('a view plugin provided decorations')
    const iter = set.iter()
    while (iter.value) {
      ranges.push([iter.from, iter.to])
      iter.next()
    }
  }
  return ranges
}

describe('collectRenderedBlocks', () => {
  it('keeps the source line of every top-level block', () => {
    const blocks = collectRenderedBlocks(
      '<h1 data-line="0">Title</h1><p data-line="2">Body</p><ul data-line="4"><li>One</li></ul>',
      FENCES,
    )
    expect(blocks.map((block) => block.line)).toEqual([0, 2, 4])
    expect(blocks[0]!.html).toContain('Title')
  })

  it('drops elements that carry no source line', () => {
    expect(collectRenderedBlocks('<p>No line</p><p data-line="3">Yes</p>', FENCES)).toEqual([
      { line: 3, html: '<p data-line="3">Yes</p>', fences: FENCES, bodies: [] },
    ])
  })

  it('carries the fence body a rich block was rendered from, beside its markup', () => {
    const board = '{"title":"Roadmap","items":[{"title":"Ship P-01"}]}'
    const rendered = renderMarkdown('Intro\n\n```kanban\n' + board + '\n```\n')
    const blocks = collectRenderedBlocks(rendered.html, rendered.fences)
    // Every block of the render carries the same set, and only the fence points at a body: the
    // intro paragraph reads as an empty list, since nothing was rendered out of it.
    expect(blocks.map((block) => block.bodies)).toEqual([[], [`${board}\n`]])
    // The markup names only the block; the body it points at is what the paint reads (P-01).
    for (const block of blocks) expect(block.fences).toBe(rendered.fences)
  })

  it('reads a fence whose body is not in the set as empty, not as another block body', () => {
    const markup = '<div data-line="4" data-kanban="" data-kanban-index="7"></div>'
    const fences = createFenceBodies()
    takeFenceIndex(fences, 'kanban', 'a board this block never read')
    expect(collectRenderedBlocks(markup, fences)[0]!.bodies).toEqual([''])
  })
})

describe('live blocks and fence bodies', () => {
  function boardWidget(title: string): WidgetType {
    const source = `# Title\n\n${boardFence(title)}`
    const rendered = renderMarkdown(source)
    const blocks = collectRenderedBlocks(rendered.html, rendered.fences).filter((block) => block.bodies.length > 0)
    // The caret stays in the title line: a block the caret is not in is the only kind a live
    // decoration is built for. The widget is what the editor compares before it keeps a block's
    // picture, and the decoration standing for the block is the only way to reach it.
    return liveBlockRanges({ blocks, doc: docOf(source), cursor: 0 })[0]!.value.spec.widget
  }

  it('keeps a widget whose board body did not change', () => {
    expect(boardWidget('Roadmap').eq(boardWidget('Roadmap'))).toBe(true)
  })

  it('replaces a widget whose board body changed, markup and all', () => {
    // An undo, or a sync update landing: the caret never entered the block, so its string is the
    // only thing that stayed the same — and a string with a picture of a board inside it.
    expect(boardWidget('Roadmap').eq(boardWidget('Backlog'))).toBe(false)
  })
})

describe('liveBlockRanges', () => {
  const source = '# Title\n\nBody text\n\n- item\n'

  it('replaces every block the caret is not in', () => {
    const doc = docOf(source)
    const ranges = liveBlockRanges({ blocks: BLOCKS, doc, cursor: 0 })
    expect(ranges.map((range) => [range.from, range.to])).toEqual([
      [doc.line(3).from, doc.line(5).from - 1],
      [doc.line(5).from, doc.length],
    ])
  })

  it('keeps the block holding the caret as source', () => {
    const doc = docOf(source)
    const caret = doc.line(3).from + 2
    const ranges = liveBlockRanges({ blocks: BLOCKS, doc, cursor: caret })
    expect(ranges.some((range) => range.from <= caret && caret <= range.to)).toBe(false)
  })
})

describe('livePreviewField', () => {
  const source = '# Title\n\nBody text\n\n- item\n'

  function publish(blocks = BLOCKS, state = EditorState.create({ doc: source, extensions: livePreviewExtensions() })): EditorState {
    return state.update({ effects: publishLiveBlocks.of(blocks) }).state
  }

  it('replaces the published blocks the caret is not in', () => {
    expect(decorationRanges(publish())).toEqual([
      [9, 19],
      [20, 27],
    ])
  })

  it('reveals the block the caret moves into and hides the one it left', () => {
    const moved = publish(BLOCKS, publish()).update({ selection: { anchor: 21 } }).state
    expect(decorationRanges(moved)).toEqual([
      [0, 8],
      [9, 19],
    ])
  })

  it('keeps the blocks aligned with the text while an edit is waiting for its render', () => {
    const edited = publish().update({ changes: { from: 0, to: 0, insert: 'x' } }).state
    expect(edited.doc.toString().startsWith('x# Title')).toBe(true)
    expect(decorationRanges(edited)).toEqual([
      [10, 20],
      [21, 28],
    ])
  })
})

describe('livePreviewExtensions', () => {
  it('mounts a view that renders the blocks the caret is not in', async () => {
    const source = '# Title\n\nBody text\n\n- item\n'
    const { view, hosts } = mountLive(source)
    const rendered = () => renderedBlocks(view)
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(rendered()).toHaveLength(2)
      expect(rendered().join('\n')).toContain('Body text')
      expect(rendered().join('\n')).not.toContain('Title')
      view.dispatch({ selection: { anchor: source.indexOf('- item') } })
      expect(rendered()).toHaveLength(2)
      expect(rendered().join('\n')).toContain('Title')
      expect(rendered().join('\n')).not.toContain('item')
    } finally {
      view.destroy()
      hosts.remove()
    }
  })

})

describe('live block painting — formulas', () => {
  it('draws the formula a block holds instead of leaving the renderer placeholder', async () => {
    const { view, hosts } = mountLive('# Title\n\nValue: $x^2$ here\n')
    try {
      await vi.waitFor(
        () => expect(view.contentDOM.querySelector('.cm-live-block .katex')).not.toBeNull(),
        { timeout: 5_000 },
      )
    } finally {
      view.destroy()
      hosts.remove()
    }
  })

  it('draws nothing while the pane holding the block has no layout', async () => {
    const original = HTMLElement.prototype.checkVisibility
    const laidOut = { value: false }
    HTMLElement.prototype.checkVisibility = () => laidOut.value
    try {
      const hidden = mountLive('# Title\n\nValue: $x^2$ here\n')
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(hidden.view.contentDOM.querySelector('.cm-live-block .katex')).toBeNull()
      hidden.view.destroy()
      hidden.hosts.remove()

      laidOut.value = true
      const visible = mountLive('# Title\n\nValue: $x^2$ here\n')
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(visible.view.contentDOM.querySelector('.cm-live-block .katex')).not.toBeNull()
      visible.view.destroy()
      visible.hosts.remove()
    } finally {
      if (original) HTMLElement.prototype.checkVisibility = original
      else Reflect.deleteProperty(HTMLElement.prototype, 'checkVisibility')
    }
  })

})

describe('live block painting — charts', () => {
  it('draws the chart a block holds with the renderer the preview pane uses', async () => {
    const restoreCanvasContext = stubCanvasContext()
    const config = JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [1] }] } })
    const { view, hosts } = mountLive(`# Title\n\n\`\`\`chart\n${config}\n\`\`\`\n`)
    try {
      await vi.waitFor(
        () => expect(view.contentDOM.querySelector('.cm-live-block canvas.chartjs-canvas')).not.toBeNull(),
        { timeout: 5_000 },
      )
      expect(view.contentDOM.querySelector('.cm-live-block .chartjs-block.loading')).toBeNull()
    } finally {
      view.destroy()
      hosts.remove()
      restoreCanvasContext()
    }
  })
})

describe('live block painting — boards', () => {
  it('draws the board a fence block holds out of the render that made it', async () => {
    const { view, hosts } = mountLive(`# Title\n\n${boardFence('Ship the channel')}`)
    try {
      await vi.waitFor(
        () => expect(view.contentDOM.querySelector('.cm-live-block .kanban-snapshot')).not.toBeNull(),
        { timeout: 5_000 },
      )
      // The card title only reaches the pane through the fence body: the markup the block holds
      // carries a block number, and nothing else that could answer for this board (P-01).
      expect(view.contentDOM.querySelector('.kanban-snapshot-card')?.textContent).toBe('Ship the channel')
      expect(view.contentDOM.querySelector('.cm-live-block .has-error')).toBeNull()
    } finally {
      view.destroy()
      hosts.remove()
    }
  })
})

function mountLive(source: string): { view: EditorView; hosts: HTMLElement } {
  const hosts = document.createElement('div')
  hosts.dataset.live = 'true'
  document.body.appendChild(hosts)
  const view = new EditorView({
    state: EditorState.create({ doc: source, extensions: livePreviewExtensions() }),
    parent: hosts,
  })
  return { view, hosts }
}

function renderedBlocks(view: EditorView): string[] {
  return Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-live-block'), (block) => block.textContent ?? '')
}

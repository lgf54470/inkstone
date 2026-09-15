import { describe, expect, it, vi } from 'vitest'
import { EditorState, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { stubCanvasContext } from '../lib/markdown/enhance.test-helpers'
import { collectRenderedBlocks, liveBlockRanges, livePreviewExtensions, publishLiveBlocks } from './live-preview'

function docOf(source: string): Text {
  return Text.of(source.split('\n'))
}

const BLOCKS = [
  { line: 0, html: '<h1 data-line="0">Title</h1>' },
  { line: 2, html: '<p data-line="2">Body text</p>' },
  { line: 4, html: '<ul data-line="4"><li>item</li></ul>' },
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
    )
    expect(blocks.map((block) => block.line)).toEqual([0, 2, 4])
    expect(blocks[0]!.html).toContain('Title')
  })

  it('drops elements that carry no source line', () => {
    expect(collectRenderedBlocks('<p>No line</p><p data-line="3">Yes</p>')).toEqual([
      { line: 3, html: '<p data-line="3">Yes</p>' },
    ])
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

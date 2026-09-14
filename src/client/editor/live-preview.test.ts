import { describe, expect, it } from 'vitest'
import { Text } from '@codemirror/state'
import { collectRenderedBlocks, liveBlockRanges } from './live-preview'

function docOf(source: string): Text {
  return Text.of(source.split('\n'))
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
  const blocks = [
    { line: 0, html: '<h1 data-line="0">Title</h1>' },
    { line: 2, html: '<p data-line="2">Body text</p>' },
    { line: 4, html: '<ul data-line="4"><li>item</li></ul>' },
  ]

  it('replaces every block the caret is not in', () => {
    const doc = docOf(source)
    const ranges = liveBlockRanges({ blocks, doc, cursor: 0, visibleFrom: 0, visibleTo: doc.length })
    expect(ranges.map((range) => [range.from, range.to])).toEqual([
      [doc.line(3).from, doc.line(5).from - 1],
      [doc.line(5).from, doc.length],
    ])
  })

  it('keeps the block holding the caret as source', () => {
    const doc = docOf(source)
    const caret = doc.line(3).from + 2
    const ranges = liveBlockRanges({ blocks, doc, cursor: caret, visibleFrom: 0, visibleTo: doc.length })
    expect(ranges.some((range) => range.from <= caret && caret <= range.to)).toBe(false)
  })

  it('skips blocks outside the viewport', () => {
    const doc = docOf(source)
    const ranges = liveBlockRanges({ blocks, doc, cursor: 0, visibleFrom: doc.line(5).from, visibleTo: doc.length })
    expect(ranges).toHaveLength(1)
  })
})

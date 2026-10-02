import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { detectEditorContext, detectPreviewContext } from './context-menu-detect'
import { encodeDataValue } from '../../lib/markdown/data-attr'
import { createFenceBodies, registerFenceBodies, takeFenceIndex } from '../../lib/markdown/fence-bodies'
import { clearHeading } from '../../editor/commands'

function withView(doc: string, selection: { from: number; to: number } | undefined, run: (view: EditorView) => void) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    selection: selection ? EditorSelection.single(selection.from, selection.to) : undefined,
  })
  const view = new EditorView({ state, parent })
  try {
    run(view)
  } finally {
    view.destroy()
  }
}

function mountTable(): HTMLTableElement {
  const table = document.createElement('table')
  table.dataset.sourceLine = '10'
  const tbody = document.createElement('tbody')
  const tr = document.createElement('tr')
  const td = document.createElement('td')
  td.textContent = 'Cell 1'
  tr.appendChild(td)
  tbody.appendChild(tr)
  table.appendChild(tbody)
  document.body.appendChild(table)
  return table
}

function mountChart(): HTMLDivElement {
  const chart = document.createElement('div')
  chart.className = 'chartjs-block'
  chart.dataset.chart = encodeDataValue('{"type":"bar"}')
  chart.dataset.sourceLine = '15'
  document.body.appendChild(chart)
  return chart
}

// A rendered block names its fence and carries the body's number, while the body itself lives in the set
// registered on the element holding the markup — written with its trailing newline, since the accessor
// is what strips it (P-01).
function mountKanban(): HTMLDivElement {
  const kanban = document.createElement('div')
  kanban.className = 'kanban-block'
  kanban.dataset.kanban = ''
  kanban.dataset.kanbanIndex = '0'
  kanban.dataset.sourceLine = '20'
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'kanban', '{"title":"Project"}\n')
  registerFenceBodies(kanban, fences)
  document.body.appendChild(kanban)
  return kanban
}

function mountSlides(): HTMLDivElement {
  const slides = document.createElement('div')
  slides.className = 'bento-slides-block'
  slides.dataset.bentoSlides = ''
  slides.dataset.bentoSlidesIndex = '0'
  slides.dataset.sourceLine = '25'
  const fences = createFenceBodies()
  takeFenceIndex(fences, 'slides', '{"title":"Demo Deck"}\n')
  registerFenceBodies(slides, fences)
  document.body.appendChild(slides)
  return slides
}

function detectAt(doc: string, pos: number, selection?: { from: number; to: number }): ReturnType<typeof detectEditorContext> {
  let result!: ReturnType<typeof detectEditorContext>
  withView(doc, selection, (view) => {
    result = detectEditorContext(view, pos)
  })
  return result
}

describe('detectEditorContext basic syntax', () => {
  it('detects text selection', () => {
    const ctx = detectAt('Hello world from Inkstone', 8, { from: 6, to: 11 })
    expect(ctx.type).toBe('selection')
    expect(ctx.selectedText).toBe('world')
  })

  it('detects table context', () => {
    const ctx = detectAt('| A | B |\n| --- | --- |\n| 1 | 2 |', 2)
    expect(ctx.type).toBe('table')
    expect(ctx.table).toBeDefined()
    expect(ctx.table?.columnCount).toBe(2)
  })

  it('detects wikilink and normal link', () => {
    const wikiCtx = detectAt('Check this [[My Note|Alias]] and [Inkstone](https://inkstone.app)', 18)
    expect(wikiCtx.type).toBe('wikilink')
    expect(wikiCtx.wikiLink?.target).toBe('My Note')
    expect(wikiCtx.wikiLink?.alias).toBe('Alias')

    const linkCtx = detectAt('Check this [[My Note|Alias]] and [Inkstone](https://inkstone.app)', 40)
    expect(linkCtx.type).toBe('link')
    expect(linkCtx.link?.text).toBe('Inkstone')
    expect(linkCtx.link?.url).toBe('https://inkstone.app')
  })

  it('detects heading context in editor', () => {
    const h1Ctx = detectAt('# Main Title\nParagraph', 4)
    expect(h1Ctx.type).toBe('heading')
    expect(h1Ctx.heading?.level).toBe(1)
    expect(h1Ctx.heading?.text).toBe('Main Title')

    const h3Ctx = detectAt('# Main Title\n### Subsection\nBody', 18)
    expect(h3Ctx.type).toBe('heading')
    expect(h3Ctx.heading?.level).toBe(3)
    expect(h3Ctx.heading?.text).toBe('Subsection')

    const trailingHashCtx = detectAt('## Heading with hashes ##\nBody', 5)
    expect(trailingHashCtx.type).toBe('heading')
    expect(trailingHashCtx.heading?.level).toBe(2)
    expect(trailingHashCtx.heading?.text).toBe('Heading with hashes')

    const linkInHeading = detectAt('# Title with [Inkstone](https://inkstone.app)', 20)
    expect(linkInHeading.type).toBe('link')
    expect(linkInHeading.link?.text).toBe('Inkstone')

    const headingOutsideLink = detectAt('# Title with [Inkstone](https://inkstone.app)', 4)
    expect(headingOutsideLink.type).toBe('heading')
    expect(headingOutsideLink.heading?.level).toBe(1)
  })
})

describe('detectEditorContext blocks and diagrams', () => {
  it('detects fenced code block', () => {
    const ctx = detectAt('```typescript\nconst x = 1;\n```', 18)
    expect(ctx.type).toBe('codeblock')
    expect(ctx.codeBlock?.language).toBe('typescript')
    expect(ctx.codeBlock?.code).toBe('const x = 1;')
  })

  it('does not detect empty lines between code blocks as codeblock', () => {
    const doc = '```typescript\nconst a = 1;\n```\n\n```typescript\nconst b = 2;\n```'
    const emptyLinePos = 31
    const ctx = detectAt(doc, emptyLinePos)
    expect(ctx.type).toBe('empty')
  })

  it('detects empty line with whitespace as empty', () => {
    const doc = '```typescript\nconst a = 1;\n```\n   \n```typescript\nconst b = 2;\n```'
    const emptyLinePos = 32
    const ctx = detectAt(doc, emptyLinePos)
    expect(ctx.type).toBe('empty')
  })

  it('does not detect empty lines between math blocks as math', () => {
    const doc = '$$\nx = 1\n$$\n\n$$\ny = 2\n$$'
    const emptyLinePos = 12
    const ctx = detectAt(doc, emptyLinePos)
    expect(ctx.type).toBe('empty')
  })

  it('detects mermaid block', () => {
    const ctx = detectAt('```mermaid\nflowchart TD\nA --> B\n```', 15)
    expect(ctx.type).toBe('mermaid')
    expect(ctx.mermaid?.code).toBe('flowchart TD\nA --> B')
  })

  it('detects chart block', () => {
    const ctx = detectAt('```chart\n{"type":"bar"}\n```', 15)
    expect(ctx.type).toBe('chart')
    expect(ctx.chart?.code).toBe('{"type":"bar"}')
  })

  it('detects kanban block', () => {
    const ctx = detectAt('```kanban\n## Todo\n- Task 1\n```', 15)
    expect(ctx.type).toBe('kanban')
    expect(ctx.kanban?.code).toBe('## Todo\n- Task 1')
  })

  it('detects bento-slides block', () => {
    const ctx = detectAt('```bento-slides\n# Slide 1\n```', 20)
    expect(ctx.type).toBe('slides')
    expect(ctx.slides?.code).toBe('# Slide 1')
  })

  it('detects ppt block', () => {
    const ctx = detectAt('```ppt\n# Slide A\n```', 10)
    expect(ctx.type).toBe('slides')
    expect(ctx.slides?.code).toBe('# Slide A')
  })
})

describe('detectPreviewContext', () => {
  it('detects table cell in preview DOM', () => {
    const table = mountTable()
    const td = table.querySelector('td')!
    const ctx = detectPreviewContext(td)
    expect(ctx.type).toBe('table')
    expect(ctx.table?.rowIndex).toBe(1)
    expect(ctx.table?.colIndex).toBe(0)
    expect(ctx.table?.sourceLine).toBe(10)
    table.remove()
  })

  it('detects chart element in preview DOM', () => {
    const chart = mountChart()
    const ctx = detectPreviewContext(chart)
    expect(ctx.type).toBe('chart')
    expect(ctx.chart?.code).toBe('{"type":"bar"}')
    expect(ctx.chart?.sourceLine).toBe(15)
    chart.remove()
  })

  it('detects kanban element in preview DOM', () => {
    const kanban = mountKanban()
    const ctx = detectPreviewContext(kanban)
    expect(ctx.type).toBe('kanban')
    expect(ctx.kanban?.code).toBe('{"title":"Project"}')
    expect(ctx.kanban?.sourceLine).toBe(20)
    kanban.remove()
  })

  it('detects slides element in preview DOM', () => {
    const slides = mountSlides()
    const ctx = detectPreviewContext(slides)
    expect(ctx.type).toBe('slides')
    expect(ctx.slides?.code).toBe('{"title":"Demo Deck"}')
    expect(ctx.slides?.sourceLine).toBe(25)
    slides.remove()
  })

  it('detects heading element in preview DOM', () => {
    const h2 = document.createElement('h2')
    h2.textContent = 'Preview Section'
    h2.dataset.sourceLine = '8'
    document.body.appendChild(h2)
    const ctx = detectPreviewContext(h2)
    expect(ctx.type).toBe('heading')
    expect(ctx.heading?.level).toBe(2)
    expect(ctx.heading?.text).toBe('Preview Section')
    expect(ctx.heading?.sourceLine).toBe(8)
    h2.remove()
  })

  it('detects link inside heading element in preview DOM', () => {
    const h1 = document.createElement('h1')
    const link = document.createElement('a')
    link.href = 'https://inkstone.app'
    link.textContent = 'Inkstone Site'
    h1.appendChild(link)
    document.body.appendChild(h1)

    const ctx = detectPreviewContext(link)
    expect(ctx.type).toBe('link')
    expect(ctx.link?.url).toBe('https://inkstone.app/')
    expect(ctx.link?.text).toBe('Inkstone Site')
    h1.remove()
  })
})

describe('clearHeading command', () => {
  it('clears heading prefix from line', () => {
    withView('### Heading Level 3\nParagraph', { from: 5, to: 5 }, (view) => {
      clearHeading(view)
      expect(view.state.doc.toString()).toBe('Heading Level 3\nParagraph')
    })
  })
})
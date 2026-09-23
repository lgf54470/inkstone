import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { detectEditorContext, detectPreviewContext } from './context-menu-detect'
import { encodeDataValue } from '../../lib/markdown/data-attr'
import { createFenceBodies, registerFenceBodies, takeFenceIndex } from '../../lib/markdown/fence-bodies'

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
})

describe('detectEditorContext blocks and diagrams', () => {
  it('detects fenced code block', () => {
    const ctx = detectAt('```typescript\nconst x = 1;\n```', 18)
    expect(ctx.type).toBe('codeblock')
    expect(ctx.codeBlock?.language).toBe('typescript')
    expect(ctx.codeBlock?.code).toBe('const x = 1;')
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
})
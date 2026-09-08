import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { detectEditorContext, detectPreviewContext } from './context-menu-detect'
import { encodeDataValue } from '../../lib/markdown/data-attr'

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

function detectAt(doc: string, pos: number, selection?: { from: number; to: number }): ReturnType<typeof detectEditorContext> {
  let result!: ReturnType<typeof detectEditorContext>
  withView(doc, selection, (view) => {
    result = detectEditorContext(view, pos)
  })
  return result
}

describe('detectEditorContext', () => {
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
})
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { renderElement } from '../../lib/test-render'
import { initI18n } from '../../lib/i18n'
import { useEditorContextMenu } from './use-editor-context-menu'
import { detectEditorContext, type EditorContextData, type PreviewContextData } from './context-menu-detect'
import { ECHARTS_TEMPLATES } from '../../editor/echarts-templates'
import { detectEchartsMode, echartsFenceAt, readEchartsBody } from '../../lib/markdown/echarts'
import { isAllowedMapSource, mapGeometryUrl } from '@shared/map-sources'

/**
 * The chart block families' right-click menu. Two things are pinned here that no unit test of the
 * converters covers: that a block of each family *gets* the menu at all, and that the templates the
 * insert menu offers are bodies the block can draw — a template that lands on an error box is a menu
 * item that teaches the syntax wrong.
 */

beforeAll(async () => {
  await initI18n()
})

function createEditorView(doc: string, selection?: { from: number; to: number }) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    selection: selection ? EditorSelection.single(selection.from, selection.to) : undefined,
  })
  return new EditorView({ state, parent })
}

function Probe({
  editorView,
  editorContext,
  previewContext,
  content,
  onEditContent,
  onCapture,
}: {
  editorView?: EditorView | null
  editorContext?: EditorContextData | null
  previewContext?: PreviewContextData | null
  content: string
  onEditContent?: (content: string) => void
  onCapture: (data: ReturnType<typeof useEditorContextMenu>) => void
}) {
  const data = useEditorContextMenu({
    point: { x: 100, y: 100 },
    onClose: vi.fn(),
    editorView,
    editorContext,
    previewContext,
    content,
    onEditContent: onEditContent ?? vi.fn(),
    onJumpToLine: vi.fn(),
  })
  onCapture(data)
  return null
}

const OPTION_FENCE = '```echarts\n{\n  xAxis: { type: "category", data: ["A", "B"] },\n  yAxis: { type: "value" },\n  series: [{ name: "s", type: "bar", data: [1, 2] }]\n}\n```'
const TABLE_FENCE = '```chart\n| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |\n```'

function menuFor(doc: string, cursorInsideBody: number, onEditContent?: (next: string) => void) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  const view = createEditorView(doc)
  let captured!: ReturnType<typeof useEditorContextMenu>
  const rendered = renderElement(
    createElement(Probe, {
      editorView: view,
      editorContext: detectEditorContext(view, cursorInsideBody),
      content: doc,
      onEditContent,
      onCapture: (data) => {
        captured = data
      },
    }),
  )
  return { view, rendered, items: captured.menuItems }
}

describe('the chart block menus in the editor', () => {
  it('offers an echarts fence its own templates and the way back to an option body', () => {
    const doc = '```echarts\n| :bar: | A | B |\n| --- | --- | --- |\n| s | 1 | 2 |\n```'
    const edits: string[] = []
    const { rendered, view, items } = menuFor(doc, doc.indexOf('| s |'), (next) => edits.push(next))
    expect(items.some((item) => item.id === 'echarts-templates-sub')).toBe(true)
    const convert = items.find((item) => item.id === 'echarts-convert-format')
    expect(convert?.label).toBe('Write this chart as an option')
    convert?.onSelect?.()
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```echarts style=json\n')
    expect(edits[0]).toContain('"series"')
    rendered.unmount()
    view.destroy()
  })

  it('offers a chart fence the same switch, in the chart family’s own words', () => {
    const edits: string[] = []
    const { rendered, view, items } = menuFor(TABLE_FENCE, TABLE_FENCE.indexOf('| s |'), (next) => edits.push(next))
    expect(items.some((item) => item.id === 'chart-templates-sub')).toBe(true)
    const convert = items.find((item) => item.id === 'chart-convert-format')
    expect(convert?.label).toBe('Write this chart as JSON')
    convert?.onSelect?.()
    expect(edits).toHaveLength(1)
    expect(edits[0]).toContain('```chart style=json\n')
    rendered.unmount()
    view.destroy()
  })

  it('keeps the two families apart: an echarts fence offers no chart templates', () => {
    const { rendered, view, items } = menuFor(OPTION_FENCE, OPTION_FENCE.indexOf('series'))
    expect(items.map((item) => item.id)).not.toContain('chart-templates-sub')
    expect(items.map((item) => item.id)).toContain('echarts-templates-sub')
    rendered.unmount()
    view.destroy()
  })
})

describe('a rendered echarts block', () => {
  it('offers the way back to its own line in the editor', () => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    const target = document.createElement('div')
    target.className = 'echarts-block'
    target.dataset.echarts = ''
    target.dataset.line = '3'
    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        content: OPTION_FENCE,
        previewContext: { type: 'echarts', target, echarts: { code: '{ series: [] }', sourceLine: 3 } },
        onCapture: (data) => {
          captured = data
        },
      }),
    )
    expect(captured.menuItems.some((item) => item.id === 'jump-echarts')).toBe(true)
    expect(captured.menuItems.some((item) => item.id === 'echarts-convert-format')).toBe(true)
    rendered.unmount()
  })
})

describe('the echarts templates', () => {
  it('each writes a body the block can draw', () => {
    for (const tpl of ECHARTS_TEMPLATES) {
      const note = '```echarts\n' + tpl.code + '\n```'
      const fence = echartsFenceAt(note, 0)
      expect(fence, tpl.id).not.toBeNull()
      expect(() => readEchartsBody(fence!.body, { allowScript: false }), tpl.id).not.toThrow()
    }
  })

  // The insert menu is how a person learns the syntax exists, so the two shapes have to be the two the
  // format control switches between: an option body detected as an option, a table body as a table.
  it('offer both body shapes, and each is detected as the one it is', () => {
    expect(ECHARTS_TEMPLATES.filter((tpl) => detectEchartsMode(tpl.code) === 'table').map((tpl) => tpl.id))
      .toEqual(['table', 'map'])
    expect(ECHARTS_TEMPLATES.filter((tpl) => detectEchartsMode(tpl.code) === 'option').map((tpl) => tpl.id))
      .toEqual(['bar', 'line', 'pie'])
  })

  it('the map template asks for outlines the app itself can serve', () => {
    const map = ECHARTS_TEMPLATES.find((tpl) => tpl.id === 'map')!
    const drawn = readEchartsBody(map.code)
    // No third-party host is contacted from the reader's browser, and no setting has to be turned on.
    expect(isAllowedMapSource(drawn.mapSource!)).toBe(true)
    expect(mapGeometryUrl(drawn.mapSource!)).toMatch(/^\/api\/map-geojson\?source=https%3A%2F%2F/)
  })

  it('none of them name a colour, so the accent ramp is what paints them', () => {
    for (const tpl of ECHARTS_TEMPLATES) {
      expect(tpl.code, tpl.id).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
  })
})

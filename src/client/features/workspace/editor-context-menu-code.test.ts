import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderElement } from '../../lib/test-render'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEditorContextMenu } from './use-editor-context-menu'
import { detectEditorContext, type EditorContextData, type PreviewContextData } from './context-menu-detect'

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

const NESTED_MD_DOC = [
  '~~~~md-example title="Code block with title, line numbers and highlight"',
  '```ts title="hello.ts" line-numbers {2}',
  '  const name = \'Inkstone\'',
  'const age=45',
  'console.log(`Hello, ${name}!`)',
  '```',
  '~~~~',
].join('\n')

const NESTED_MD_EXPECTED = [
  '~~~~md-example title="Code block with title, line numbers and highlight"',
  '```ts title="hello.ts" line-numbers {2}',
  'const name = \'Inkstone\'',
  'const age = 45',
  'console.log(`Hello, ${name}!`)',
  '```',
  '~~~~',
].join('\n')

describe('useEditorContextMenu code block operations', () => {
  it('formats nested code block inside md-example container preserving attributes', () => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    const view = createEditorView(NESTED_MD_DOC)
    const ctx = detectEditorContext(view, NESTED_MD_DOC.indexOf('const age=45'))
    expect(ctx.type).toBe('codeblock')
    expect(ctx.codeBlock?.language).toBe('ts')

    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: ctx,
        content: NESTED_MD_DOC,
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    const formatItem = captured.menuItems.find((i) => i.id === 'format-code')
    expect(formatItem).toBeDefined()
    formatItem?.onSelect?.()
    expect(view.state.doc.toString()).toBe(NESTED_MD_EXPECTED)
    rendered.unmount()
    view.destroy()
  })

  it('formats unclosed code block inside container without deleting subsequent lines', () => {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList
    const doc = [
      '~~~~md-example',
      '```ts',
      'const age=45',
      '~~~~',
      '## Next Section',
    ].join('\n')
    const view = createEditorView(doc)
    const ctx = detectEditorContext(view, doc.indexOf('const age=45'))
    expect(ctx.type).toBe('codeblock')
    expect(ctx.codeBlock?.isClosed).toBe(false)

    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: ctx,
        content: doc,
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    const formatItem = captured.menuItems.find((i) => i.id === 'format-code')
    expect(formatItem).toBeDefined()
    formatItem?.onSelect?.()
    expect(view.state.doc.toString()).toBe([
      '~~~~md-example',
      '```ts',
      'const age = 45',
      '~~~~',
      '## Next Section',
    ].join('\n'))
    rendered.unmount()
    view.destroy()
  })

  it('changes language preserving spacing when fence has attributes but no initial language', () => {
    const doc = [
      '``` title="hello.ts"',
      'const x = 1',
      '```',
    ].join('\n')
    const view = createEditorView(doc)
    const ctx = detectEditorContext(view, doc.indexOf('const x = 1'))

    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: ctx,
        content: doc,
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    const changeLangItem = captured.menuItems.find((i) => i.id === 'change-lang-sub')
    expect(changeLangItem?.subItems).toBeDefined()
    const jsItem = changeLangItem?.subItems?.find((i) => i.id === 'lang-javascript')
    expect(jsItem).toBeDefined()
    jsItem?.onSelect?.()
    expect(view.state.doc.toString()).toBe([
      '```javascript title="hello.ts"',
      'const x = 1',
      '```',
    ].join('\n'))
    rendered.unmount()
    view.destroy()
  })

  it('formats nested code block from preview context without deleting outer container', () => {
    let edited = ''
    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: null,
        previewContext: {
          type: 'codeblock',
          target: document.createElement('div'),
          sourceLine: 0,
          codeBlock: {
            language: 'ts',
            code: '  const name = \'Inkstone\'\nconst age=45\nconsole.log(`Hello, ${name}!`)',
            sourceLine: 0,
          },
        },
        content: NESTED_MD_DOC,
        onEditContent: (c) => {
          edited = c
        },
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    const formatItem = captured.menuItems.find((i) => i.id === 'format-code-preview')
    expect(formatItem).toBeDefined()
    formatItem?.onSelect?.()
    expect(edited).toBe(NESTED_MD_EXPECTED)
    rendered.unmount()
  })
})

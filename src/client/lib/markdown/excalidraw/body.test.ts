import { describe, expect, it } from 'vitest'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  applyExcalidrawBodyAtFence,
  countExcalidrawElements,
  emptyScene,
  parseExcalidrawScene,
  serializeExcalidrawScene,
} from './body'

function element(overrides: Record<string, unknown> = {}): ExcalidrawElement {
  return { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10, ...overrides } as unknown as ExcalidrawElement
}

function sceneOf(body: string) {
  const parsed = parseExcalidrawScene(body)
  if (!parsed.ok) throw new Error(`expected a scene, got: ${parsed.error}`)
  return parsed.scene
}

describe('excalidraw scene bodies', () => {
  it('reads an empty body as a blank board', () => {
    const scene = sceneOf('')
    expect(scene.elements).toEqual([])
    expect(scene.type).toBe('excalidraw')
    expect(scene.files).toEqual({})
  })

  it('reads elements, the palette and the background, and drops the camera', () => {
    const scene = sceneOf(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'https://excalidraw.com',
      elements: [element()],
      appState: { viewBackgroundColor: '#ffffff', scrollX: 12, zoom: { value: 2 }, currentItemStrokeColor: '#e03131' },
      files: {},
    }))
    expect(scene.elements).toHaveLength(1)
    expect(scene.source).toBe('https://excalidraw.com')
    expect(scene.appState.viewBackgroundColor).toBe('#ffffff')
    expect(scene.appState.currentItemStrokeColor).toBe('#e03131')
    expect(scene.appState.scrollX).toBeUndefined()
    expect(scene.appState.zoom).toBeUndefined()
  })

  it('reads a bare array as the element list', () => {
    expect(sceneOf('[{"type":"ellipse"}]').elements).toHaveLength(1)
  })

  it('drops deleted elements, which are the library’s undo history', () => {
    const scene = sceneOf(JSON.stringify({ elements: [element(), element({ id: 'b', isDeleted: true })] }))
    expect(countExcalidrawElements(scene)).toBe(1)
  })

  it('keeps files that carry an image and drops anything else', () => {
    const scene = sceneOf(JSON.stringify({
      elements: [],
      files: {
        keep: { mimeType: 'image/png', id: 'keep', dataURL: 'data:image/png;base64,AA' },
        drop: { id: 'drop' },
      },
    }))
    expect(Object.keys(scene.files)).toEqual(['keep'])
  })

  it('says why a body has no elements to draw', () => {
    expect(parseExcalidrawScene('[]').ok).toBe(true)
  })
})

describe('excalidraw scene bodies — a body it cannot read', () => {
  it('says why instead of drawing nothing', () => {
    expect(parseExcalidrawScene('{')).toMatchObject({ ok: false })
    expect(parseExcalidrawScene('{"elements":{}}')).toMatchObject({ ok: false })
    expect(parseExcalidrawScene('{"elements":[{"id":"a"}]}')).toMatchObject({ ok: false })
  })
})

describe('excalidraw scene bodies — writing them out', () => {
  it('survives a round trip through the note', () => {
    const scene = sceneOf(JSON.stringify({ elements: [element(), element({ id: 'b' })], appState: { gridSize: 20 } }))
    const again = sceneOf(serializeExcalidrawScene(scene))
    expect(again.elements).toHaveLength(2)
    expect(again.appState.gridSize).toBe(20)
    expect(serializeExcalidrawScene(again)).toBe(serializeExcalidrawScene(scene))
  })

  it('writes scenes as indented JSON the standard readers accept', () => {
    const text = serializeExcalidrawScene(emptyScene())
    expect(text.startsWith('{\n  "type": "excalidraw"')).toBe(true)
    expect(JSON.parse(text)).toMatchObject({ type: 'excalidraw', version: 2, elements: [] })
  })
})

describe('writing a scene back into its fence', () => {
  const note = ['# Title', '', '```excalidraw', '{}', '```', '', 'tail'].join('\n')

  it('rewrites only the body, keeping the note’s own lines', () => {
    const next = applyExcalidrawBodyAtFence(note, { line: 2, body: '{}' }, '{\n  "elements": []\n}')
    expect(next?.split('\n')).toEqual(['# Title', '', '```excalidraw', '{', '  "elements": []', '}', '```', '', 'tail'])
  })

  it('finds the fence again when the note was edited above it', () => {
    const moved = ['intro', ...note.split('\n')].join('\n')
    expect(applyExcalidrawBodyAtFence(moved, { line: 2, body: '{}' }, '{}')).not.toBeNull()
  })

  it('declines to write when the fence no longer holds the body', () => {
    const edited = note.replace('{}', '{"elements":[]}')
    expect(applyExcalidrawBodyAtFence(edited, { line: 2, body: '{}' }, '{}')).toBeNull()
  })
})

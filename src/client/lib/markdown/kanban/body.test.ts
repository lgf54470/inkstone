import { describe, expect, it } from 'vitest'
import {
  applyKanbanBodyAtFence,
  detectKanbanMode,
  kanbanFenceRange,
  parseKanbanBody,
  serializeKanban,
} from './body'
import type { KanbanData, KanbanFenceRef } from './types'

describe('detectKanbanMode', () => {
  it('detects JSON objects and arrays', () => {
    expect(detectKanbanMode('{"title": "Test"}')).toBe('json')
    expect(detectKanbanMode('  [{"id": "item-1"}]')).toBe('json')
    expect(detectKanbanMode('\n\n  {\n    "items": []\n  }')).toBe('json')
  })

  it('detects markdown outline lists and headings', () => {
    expect(detectKanbanMode('- [ ] First task')).toBe('outline')
    expect(detectKanbanMode('## To Do\n- Task A')).toBe('outline')
    expect(detectKanbanMode('')).toBe('outline')
  })
})

describe('parseKanbanBody with JSON', () => {
  it('parses valid JSON with default fallbacks for missing columns or views', () => {
    const json = JSON.stringify({
      title: 'Sprint 1',
      items: [
        { id: '1', title: 'Task 1', properties: { status: 'todo' } },
      ],
    })
    const result = parseKanbanBody(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.mode).toBe('json')
    expect(result.data.title).toBe('Sprint 1')
    expect(result.data.items).toHaveLength(1)
    expect(result.data.columns.length).toBeGreaterThan(0)
    expect(result.data.views.length).toBeGreaterThan(0)
  })

  it('returns failure on invalid JSON', () => {
    const result = parseKanbanBody('{ bad json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeTruthy()
    expect(result.raw).toBe('{ bad json')
  })
})

// Deleting a view is a thing a reader can now do from the header, so the parser must stop adding
// one back: a fence that lists no chart view means a board whose chart view is gone, and a view
// that returns after every save is a view nobody can remove.
describe('parseKanbanBody with the views the fence states', () => {
  it('keeps the view list the fence states, chart view or not', () => {
    const json = JSON.stringify({
      title: 'Lean',
      columns: [{ id: 'status', name: 'Status', type: 'select', options: [{ id: 'todo', label: 'To Do', color: 'gray' }] }],
      items: [],
      views: [{ id: 'view-board', name: 'board', type: 'board', groupBy: 'status' }],
    })
    const result = parseKanbanBody(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.views.map((view) => view.type)).toEqual(['board'])
    expect(result.data.activeViewId).toBe('view-board')
  })

  it('keeps a hand-written activeViewId that names a view the board has', () => {
    const json = JSON.stringify({
      title: 'Lean',
      views: [
        { id: 'view-board', name: 'board', type: 'board' },
        { id: 'view-list', name: 'list', type: 'list' },
      ],
      activeViewId: 'view-list',
    })
    const result = parseKanbanBody(json)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.activeViewId).toBe('view-list')
  })
})

describe('parseKanbanBody URL whitelist', () => {
  it('keeps a board whose cover and file urls are on the whitelist', () => {
    const json = JSON.stringify({
      items: [{
        id: '1',
        title: 'Task 1',
        cover: '/api/kanban/file/default/1-cover.png',
        files: [{ id: 'f1', name: 'spec.pdf', size: 10, mime: 'application/pdf', url: 'https://cdn.example.com/spec.pdf' }],
        properties: {},
      }],
    })
    const result = parseKanbanBody(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.items[0]!.cover).toBe('/api/kanban/file/default/1-cover.png')
  })

  it('fails with an error state when item.cover uses a non-whitelisted protocol', () => {
    const json = JSON.stringify({
      items: [{ id: '1', title: 'Task 1', cover: 'javascript:alert(1)', properties: {} }],
    })
    const result = parseKanbanBody(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('cover')
  })

  it('fails with an error state when a file url uses a non-whitelisted protocol', () => {
    const json = JSON.stringify({
      items: [{
        id: '1',
        title: 'Task 1',
        files: [{ id: 'f1', name: 'x', size: 1, mime: 'image/png', url: 'data:text/html,<script>' }],
        properties: {},
      }],
    })
    const result = parseKanbanBody(json)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('files')
  })
})

describe('serializeKanban', () => {
  const sampleData: KanbanData = {
    title: 'Test Board',
    activeViewId: 'view-board',
    columns: [
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { id: 'todo', label: 'To Do', color: 'gray' },
        ],
      },
    ],
    views: [
      { id: 'view-board', name: 'Board', type: 'board' },
    ],
    items: [
      { id: 'item-1', title: 'Write tests', properties: { status: 'todo' } },
    ],
  }

  it('serializes to JSON formatted text in json mode', () => {
    const out = serializeKanban(sampleData, 'json')
    expect(out).toContain('"title": "Test Board"')
    expect(out).toContain('"Write tests"')
    const parsed = JSON.parse(out)
    expect(parsed.items[0].title).toBe('Write tests')
  })

  it('serializes to Markdown outline in outline mode', () => {
    const out = serializeKanban(sampleData, 'outline')
    expect(out).toContain('## To Do')
    expect(out).toContain('- [ ] Write tests')
  })

  it('keeps a view hidden column list through a read and write cycle', () => {
    const withHidden: KanbanData = {
      ...sampleData,
      views: [{ id: 'view-table', name: 'Table', type: 'table', hiddenColumns: ['priority', 'files'] }],
    }
    const reread = parseKanbanBody(serializeKanban(withHidden, 'json'))
    if (!reread.ok) throw new Error(reread.error)
    expect(reread.data.views[0]?.hiddenColumns).toEqual(['priority', 'files'])
  })
})

describe('applyKanbanBodyAtFence & kanbanFenceRange', () => {
  const doc = [
    '# Note Title',
    '',
    '```kanban',
    '{"title": "Initial"}',
    '```',
    '',
    'Footer text',
  ].join('\n')

  it('locates kanban fence range', () => {
    const target: KanbanFenceRef = { line: 2, body: '{"title": "Initial"}' }
    const range = kanbanFenceRange(doc, target)
    expect(range).not.toBeNull()
    expect(range?.start).toBe(2)
    expect(range?.end).toBe(5)
  })

  it('patches kanban fence with updated body', () => {
    const target: KanbanFenceRef = { line: 2, body: '{"title": "Initial"}' }
    const nextDoc = applyKanbanBodyAtFence(doc, target, '{"title": "Updated"}')
    expect(nextDoc).not.toBeNull()
    expect(nextDoc).toContain('```kanban\n{"title": "Updated"}\n```')
    expect(nextDoc).toContain('Footer text')
  })

  it('returns null when target fence is not found', () => {
    const target: KanbanFenceRef = { line: 99, body: 'missing' }
    const range = kanbanFenceRange(doc, target)
    expect(range).toBeNull()
    const nextDoc = applyKanbanBodyAtFence(doc, target, 'test')
    expect(nextDoc).toBeNull()
  })
})

// A width the reader dragged to is a fact about the document, not about this render, so it has to
// leave in the fence and come back out of it: otherwise every reload puts the columns back to the
// guess the type makes. Only the JSON body carries it, since an outline has no columns of its own.
describe('a column width through the fence', () => {
  const authored = JSON.stringify({
    title: 'Wide',
    columns: [{ id: 'spec', name: 'Spec file', type: 'text', width: 320 }],
    items: [],
  })

  function onlyColumn(data: KanbanData) {
    return data.columns.find((column) => column.id === 'spec')
  }

  it('reads the width the fence authored', () => {
    const result = parseKanbanBody(authored)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(onlyColumn(result.data)?.width).toBe(320)
  })

  it('writes it back out, so the next parse draws the same table', () => {
    const parsed = parseKanbanBody(authored)
    if (!parsed.ok) throw new Error('the fixture should parse')
    const again = parseKanbanBody(serializeKanban(parsed.data, 'json'))
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(onlyColumn(again.data)?.width).toBe(320)
  })
})

// F-09. A limit lives on the workflow state rather than on the column, and a fence may have been
// written by hand or exported by another tool, so what comes through here is only as trustworthy as
// the reader that draws the rule from it.
describe('a work-in-progress limit through the fence', () => {
  const authored = JSON.stringify({
    title: 'Sprint',
    columns: [{
      id: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'doing', label: 'Doing', color: 'blue', wipLimit: 3 },
        { id: 'gate', label: 'Gate', color: 'red', wipLimit: 'lots' },
      ],
    }],
    items: [],
  })

  function option(data: KanbanData, optionId: string) {
    return data.columns.find((column) => column.id === 'status')?.options?.find((o) => o.id === optionId)
  }

  it('keeps the limit the fence authored', () => {
    const result = parseKanbanBody(authored)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(option(result.data, 'doing')?.wipLimit).toBe(3)
  })

  it('writes the limit back out, so the next parse draws the same rule', () => {
    const parsed = parseKanbanBody(authored)
    if (!parsed.ok) throw new Error('the fixture should parse')
    const again = parseKanbanBody(serializeKanban(parsed.data, 'json'))
    if (!again.ok) throw new Error('the written fence should parse back')
    expect(option(again.data, 'doing')?.wipLimit).toBe(3)
    expect(option(again.data, 'gate')?.wipLimit).toBe('lots' as unknown as number)
  })
})

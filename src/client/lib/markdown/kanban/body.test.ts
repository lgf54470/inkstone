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

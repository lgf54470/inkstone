/**
 * The outline body cannot carry subtasks, files, icons, descriptions, custom
 * properties, views or even the board title — every one of those is editable in
 * the UI, so persisting an outline fence back as outline silently drops the
 * edit. The first UI write therefore promotes the fence to full-fidelity JSON.
 */
import { describe, expect, it, vi } from 'vitest'
import type { KanbanBlockEntry } from './entry'
import { parseKanbanBody } from './body'
import { flushKanbanEntry } from './write'

const OUTLINE_BODY = '## To Do\n- [ ] First Task'

function outlineEntry(): { entry: KanbanBlockEntry; write: ReturnType<typeof vi.fn> } {
  const parsed = parseKanbanBody(OUTLINE_BODY)
  if (!parsed.ok) throw new Error('the outline fence should parse')
  parsed.data.items[0]!.subtasks = [{ id: 'sub-1', title: 'Draft schema', completed: false }]
  const write = vi.fn(() => 'written' as const)
  return {
    write,
    entry: {
      key: 'write-test#0',
      scope: 'write-test',
      noteId: 'note-1',
      index: 0,
      host: document.createElement('div'),
      source: OUTLINE_BODY,
      data: parsed.data,
      mode: 'outline',
      editable: true,
      owner: 'inline',
      dark: false,
      locale: 'en-US',
      container: null,
      root: null,
      ref: { line: 3, body: OUTLINE_BODY },
      write,
      dirty: true,
      timer: null,
    },
  }
}

describe('flushKanbanEntry format promotion', () => {
  it('writes an outline fence back as JSON carrying the fields outline cannot hold', () => {
    const { entry, write } = outlineEntry()
    flushKanbanEntry(entry)

    expect(entry.mode).toBe('json')
    const written = write.mock.calls[0][1] as string
    const body = JSON.parse(written)
    expect(body.items[0].subtasks).toEqual([{ id: 'sub-1', title: 'Draft schema', completed: false }])
    expect(entry.source).toBe(written)
  })

  it('keeps a JSON fence writing JSON', () => {
    const { entry, write } = outlineEntry()
    entry.mode = 'json'
    entry.source = JSON.stringify({ ...entry.data, title: 'Other' })

    flushKanbanEntry(entry)

    expect(entry.mode).toBe('json')
    const written = write.mock.calls[0][1] as string
    expect(written.startsWith('{')).toBe(true)
    expect(JSON.parse(written).items[0].subtasks).toBeDefined()
  })
})

import { describe, expect, it } from 'vitest'
import { safeKanbanUrl } from './url'

describe('safeKanbanUrl protocol whitelist', () => {
  it('keeps same-site relative, http(s) and blob urls', () => {
    expect(safeKanbanUrl('/api/kanban/file/default/1-note.png')).toBe('/api/kanban/file/default/1-note.png')
    expect(safeKanbanUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(safeKanbanUrl('http://example.com/a.png')).toBe('http://example.com/a.png')
    expect(safeKanbanUrl('blob:https://localhost/8f14e45f')).toBe('blob:https://localhost/8f14e45f')
  })

  it('keeps image data urls only', () => {
    expect(safeKanbanUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR')
    expect(safeKanbanUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects executable, local and protocol-relative urls', () => {
    expect(safeKanbanUrl('javascript:alert(1)')).toBeNull()
    expect(safeKanbanUrl('java\nscript:alert(1)')).toBeNull()
    expect(safeKanbanUrl('file:///etc/passwd')).toBeNull()
    expect(safeKanbanUrl('//evil.example.com/track.png')).toBeNull()
  })

  it('rejects empty, missing and unparsable values', () => {
    expect(safeKanbanUrl('')).toBeNull()
    expect(safeKanbanUrl('   ')).toBeNull()
    expect(safeKanbanUrl(undefined)).toBeNull()
    expect(safeKanbanUrl('mailto:someone@example.com')).toBeNull()
    expect(safeKanbanUrl('not a relative path')).toBeNull()
  })
})

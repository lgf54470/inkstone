import { describe, expect, it } from 'vitest'
import { kanbanFileLocation, safeKanbanCoverUrl, safeKanbanUrl } from './url'

describe('safeKanbanUrl protocol whitelist', () => {
  it('keeps same-site relative, http(s) and blob urls (blob: is the demo backend\'s upload answer)', () => {
    expect(safeKanbanUrl('/api/kanban/file/default/1-note.png')).toBe('/api/kanban/file/default/1-note.png')
    expect(safeKanbanUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
    expect(safeKanbanUrl('http://example.com/a.png')).toBe('http://example.com/a.png')
    expect(safeKanbanUrl('blob:https://localhost/8f14e45f')).toBe('blob:https://localhost/8f14e45f')
  })

  it('keeps no data urls: a file is a link the reader presses and a body the panel fetches', () => {
    expect(safeKanbanUrl('data:image/png;base64,iVBOR')).toBeNull()
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

describe('safeKanbanCoverUrl, the cover\'s own whitelist', () => {
  it('accepts everything a file url accepts', () => {
    expect(safeKanbanCoverUrl('/api/kanban/file/default/1-note.png')).toBe('/api/kanban/file/default/1-note.png')
    expect(safeKanbanCoverUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })

  it('is the one field that may be an inline image, and only an image', () => {
    expect(safeKanbanCoverUrl('data:image/png;base64,iVBOR')).toBe('data:image/png;base64,iVBOR')
    expect(safeKanbanCoverUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe('data:image/svg+xml;base64,PHN2Zz4=')
    expect(safeKanbanCoverUrl('data:text/html,<script>alert(1)</script>')).toBeNull()
    expect(safeKanbanCoverUrl('data:application/pdf;base64,JVBE')).toBeNull()
  })
})

describe('kanbanFileLocation', () => {
  it('splits a same-site file url into its delete parameters', () => {
    expect(kanbanFileLocation({ url: '/api/kanban/file/default/7-report.pdf' }))
      .toEqual({ kanbanName: 'default', filename: '7-report.pdf' })
    expect(kanbanFileLocation({ url: '/api/kanban/file/note-9/1-photo.png' }))
      .toEqual({ kanbanName: 'note-9', filename: '1-photo.png' })
  })

  it('falls back to the stored r2 key when the url is not the api route', () => {
    expect(kanbanFileLocation({ url: 'https://old.example/f.png', r2Key: 'kanban/default/3-x.png' }))
      .toEqual({ kanbanName: 'default', filename: '3-x.png' })
  })

  it('returns null for locations this app cannot delete', () => {
    expect(kanbanFileLocation({ url: 'https://cdn.example.com/a.png' })).toBeNull()
    expect(kanbanFileLocation({ url: 'blob:https://localhost/abc' })).toBeNull()
    expect(kanbanFileLocation({ url: 'data:image/png;base64,AA' })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { buildMcpNoteContent } from '../src/worker/mcp/writes'

describe('buildMcpNoteContent', () => {
  it('keeps explicit content untouched', () => {
    expect(buildMcpNoteContent('# hello', 'Hello', '---\ntitle: {{title}}\n---\n')).toBe('# hello')
  })

  it('interpolates the template for blank notes without mangling placeholders', () => {
    const template = '---\ntitle: {{title}}\ncreatedAt: {{createdAt}}\n---\n\n'
    const content = buildMcpNoteContent(undefined, 'My note', template)
    expect(content).toMatch(/createdAt: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
    expect(content).not.toContain('{{createdAt}}')
    expect(content).not.toContain('{ ? {')
  })

  it('fills the title placeholder', () => {
    expect(buildMcpNoteContent(undefined, 'Daily', 'title: {{title}}')).toBe('title: Daily')
  })
})

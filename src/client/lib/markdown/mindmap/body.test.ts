import { describe, expect, it } from 'vitest'
import { applyBodyAtFence, detectMindmapMode, normalizeEol } from './body'

function fence(language: string, body: string): string {
  return ['```' + language, body, '```'].join('\n')
}

describe('detectMindmapMode', () => {
  it('reads JSON bodies and everything else as an outline', () => {
    expect(detectMindmapMode('{"nodeData":{"id":"a","topic":"Root"}}')).toBe('json')
    expect(detectMindmapMode('\n  {"nodeData":{}}')).toBe('json')
    expect(detectMindmapMode('- Root\n  - Child')).toBe('outline')
    expect(detectMindmapMode('')).toBe('outline')
  })
})

describe('applyBodyAtFence', () => {
  it('replaces only the body and keeps every other line intact', () => {
    const content = ['# Title', '', fence('mindmap', '- Root\n  - A'), '', 'tail'].join('\n')
    const next = applyBodyAtFence(content, { line: 2, body: '- Root\n  - A' }, '- Root\n  - A\n  - B')
    expect(next).toBe(['# Title', '', fence('mindmap', '- Root\n  - A\n  - B'), '', 'tail'].join('\n'))
  })

  it('keeps the fence info string and the indentation of the block', () => {
    const content = ['  ```mindmap title="Plan"', '  - Root', '  ```'].join('\n')
    const next = applyBodyAtFence(content, { line: 0, body: '  - Root' }, '  - Root\n  - Child')
    expect(next).toBe(['  ```mindmap title="Plan"', '  - Root', '  - Child', '  ```'].join('\n'))
  })

  it('accepts the mind-elixir alias and tilde fences', () => {
    const content = ['~~~mind-elixir', '- Root', '~~~'].join('\n')
    expect(applyBodyAtFence(content, { line: 0, body: '- Root' }, '- Root\n- Two')).toBe('~~~mind-elixir\n- Root\n- Two\n~~~')
  })

  it('keeps CRLF notes in CRLF and matches the CRLF body markdown-it reports', () => {
    const content = 'before\r\n```mindmap\r\n- Root\r\n  - A\r\n```\r\nafter'
    const next = applyBodyAtFence(content, { line: 1, body: '- Root\r\n  - A' }, '- Root\n  - A\n  - B')
    expect(next).toBe('before\r\n```mindmap\r\n- Root\r\n  - A\r\n  - B\r\n```\r\nafter')
  })

})

describe('applyBodyAtFence fence resolution', () => {
  it('follows the fence when lines above it moved', () => {
    const content = ['# New line at the top', '', fence('mindmap', '- Root\n  - A')].join('\n')
    const next = applyBodyAtFence(content, { line: 2, body: '- Root\n  - A' }, '- Root')
    expect(next).toBe(['# New line at the top', '', fence('mindmap', '- Root')].join('\n'))
  })

  it('refuses to write when the recorded body is gone and no other fence matches', () => {
    const content = ['# Edited by hand', '', fence('mindmap', '- Root\n  - typed'), ''].join('\n')
    expect(applyBodyAtFence(content, { line: 2, body: '- Root\n  - A' }, '- Root')).toBeNull()
  })

  it('refuses to write when two fences hold the same body and the recorded line does not', () => {
    const same = '- Root\n  - A'
    const content = ['# Top', fence('mindmap', '- Other'), fence('mindmap', same), fence('mindmap', same)].join('\n')
    expect(applyBodyAtFence(content, { line: 1, body: same }, '- Root')).toBeNull()
  })

  it('widens the fence when the new body would close it early', () => {
    const content = fence('mindmap', '- Root')
    const next = applyBodyAtFence(content, { line: 0, body: '- Root' }, '- Root\n```')
    expect(next).toBe('````mindmap\n- Root\n```\n````')
  })

  it('closes a fence that ran to the end of the note', () => {
    const content = '# Title\n```mindmap\n- Root'
    expect(applyBodyAtFence(content, { line: 1, body: '- Root' }, '- Root\n- Two')).toBe('# Title\n```mindmap\n- Root\n- Two\n```')
  })

  it('ignores a fence of another language at the recorded line', () => {
    const content = ['```ts', 'const a = 1', '```', fence('mindmap', '- Root')].join('\n')
    expect(applyBodyAtFence(content, { line: 0, body: '- Root' }, '- Root\n- Two')).toBe(['```ts', 'const a = 1', '```', fence('mindmap', '- Root\n- Two')].join('\n'))
  })

  it('returns content unchanged when the body already matches', () => {
    const content = fence('mindmap', '- Root')
    expect(applyBodyAtFence(content, { line: 0, body: '- Root' }, '- Root')).toBe(content)
  })

  it('drops a trailing newline from the note-level split when the fence has an empty body', () => {
    const content = '```mindmap\n\n```\n'
    expect(applyBodyAtFence(content, { line: 0, body: '' }, '- Root')).toBe('```mindmap\n- Root\n```\n')
  })
})

describe('normalizeEol', () => {
  it('collapses CRLF and CR so both sides of a comparison agree', () => {
    expect(normalizeEol('a\r\nb')).toBe('a\nb')
  })
})

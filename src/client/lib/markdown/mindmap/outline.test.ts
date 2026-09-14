import { describe, expect, it } from 'vitest'
import { markdownToMindmapOutline, mindmapOutlineToMarkdown } from './outline'

describe('markdownToMindmapOutline', () => {
  it('turns heading levels into tree depth', () => {
    const markdown = ['# Root', '## Product', '### Pricing', '## Team'].join('\n')
    expect(markdownToMindmapOutline(markdown)).toBe(['- Root', '  - Product', '    - Pricing', '  - Team'].join('\n'))
  })

  it('nests list items one level under the heading above them', () => {
    const markdown = ['## Plan', '- First', '  - Nested', '- Second'].join('\n')
    expect(markdownToMindmapOutline(markdown)).toBe(['- Plan', '  - First', '    - Nested', '  - Second'].join('\n'))
  })

  it('starts a bare list at the root and shifts a selection that starts deeper', () => {
    expect(markdownToMindmapOutline('- A\n- B')).toBe('- A\n- B')
    expect(markdownToMindmapOutline('### Deep\n#### Deeper')).toBe('- Deep\n  - Deeper')
  })

  it('drops the task checkbox and the ordered marker from a topic', () => {
    expect(markdownToMindmapOutline('- [ ] Todo\n1. First')).toBe('- Todo\n- First')
  })

  it('keeps a wiki link in the topic so the node can carry it', () => {
    expect(markdownToMindmapOutline('- [[Other note]]')).toBe('- [[Other note]]')
  })

  it('ignores fenced code blocks and closing heading hashes', () => {
    const markdown = ['# Title', '```ts', '# not a heading', '- not a list', '```', '## Real ##'].join('\n')
    expect(markdownToMindmapOutline(markdown)).toBe('- Title\n  - Real')
  })

  it('returns null when there is nothing to draw', () => {
    expect(markdownToMindmapOutline('')).toBeNull()
    expect(markdownToMindmapOutline('Just a paragraph.')).toBeNull()
  })
})

describe('mindmapOutlineToMarkdown', () => {
  it('writes the first six levels as headings', () => {
    const outline = ['- Root', '  - A', '    - B', '      - C', '        - D', '          - E', '            - F'].join('\n')
    expect(mindmapOutlineToMarkdown(outline)).toBe(['# Root', '## A', '### B', '#### C', '##### D', '###### E', '- F'].join('\n'))
  })

  it('keeps nesting past the sixth level', () => {
    const outline = ['- Root', '  - A', '    - B', '      - C', '        - D', '          - E', '            - F', '              - G'].join('\n')
    expect(mindmapOutlineToMarkdown(outline)).toBe(['# Root', '## A', '### B', '#### C', '##### D', '###### E', '- F', '  - G'].join('\n'))
  })

  it('drops what the serializer adds after a topic and skips annotations', () => {
    const outline = ['- Root [^abc]', '  - Styled {"color":"#fff"}', '  - > [^abc] >-link-> [^def]', '  - }summary'].join('\n')
    expect(mindmapOutlineToMarkdown(outline)).toBe('# Root\n## Styled')
  })

  it('returns null for an empty tree', () => {
    expect(mindmapOutlineToMarkdown('')).toBeNull()
  })
})

describe('outline round trip', () => {
  it('returns a heading outline to the tree it came from', () => {
    const markdown = ['# Root', '## Product', '### Pricing', '## Team'].join('\n')
    const outline = markdownToMindmapOutline(markdown)
    expect(outline).not.toBeNull()
    expect(mindmapOutlineToMarkdown(outline!)).toBe(markdown)
  })
})

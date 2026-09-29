import { describe, expect, it } from 'vitest'
import { commentsIn } from '../scripts/lib/comment-scan.mjs'

function textsOf(source: string): string[] {
  return commentsIn('probe.ts', source).map((comment) => comment.text)
}

describe('comment scanner', () => {
  it('reads line, trailing and block comments in source order', () => {
    const source = [
      '// first',
      'const value = 1 // second',
      '/**',
      ' * third',
      ' */',
      'const other = 2',
    ].join('\n')
    expect(textsOf(source)).toEqual(['// first', '// second', '/**\n * third\n */'])
  })

  it('ignores comment glyphs inside strings, templates and regexes', () => {
    const source = [
      "const url = 'https://example.com/path'",
      "const glob = '/api/blog/*'",
      'const template = `a // b /* c */`',
      'const pattern = /\\/\\//',
    ].join('\n')
    expect(textsOf(source)).toEqual([])
  })

  // The regression this scanner exists for: the comment glyphs inside '/api/blog/*' used to pair up
  // with the next closing `*/` and swallow every real comment between them, so the checker never
  // saw the notes after it and had nothing to require an approval for.
  it('still reaches the comments that follow a glob string and a block comment', () => {
    const source = [
      "app.use('/api/blog/*', handler)",
      '/**',
      ' * A note the checker has to see.',
      ' */',
      '// And this one too.',
      'const done = true',
    ].join('\n')
    expect(textsOf(source)).toEqual(['/**\n * A note the checker has to see.\n */', '// And this one too.'])
  })

  it('reads a comment that stands after the last token', () => {
    expect(textsOf('const value = 1\n// tail note\n')).toEqual(['// tail note'])
  })

  it('reads a comment inside a template substitution', () => {
    const source = 'const label = `${/* inner */ 1}`'
    expect(textsOf(source)).toEqual(['/* inner */'])
  })

  it('orders two block comments separately rather than as one run', () => {
    const source = ['/* one */', 'const value = 1', '/* two */', 'const other = 2'].join('\n')
    expect(textsOf(source)).toEqual(['/* one */', '/* two */'])
  })
})

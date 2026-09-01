import { describe, expect, it } from 'vitest'
import { addTagToFrontMatter, extractTags, interpolateNewNoteTemplate, mergeTagsIntoFrontMatter, parseFrontMatter, renderNewNoteTemplate, setFrontMatterProperty } from './markdown-utils'

describe('extractTags', () => {
  it('handles an unterminated inline-code marker with a mismatched trailing marker', () => {
    expect(extractTags('` #visible ``')).toEqual(['visible'])
  })

  it('does not treat tags in complete inline code or fenced blocks as tags', () => {
    expect(extractTags('`#inline`\n```\n#fenced\n```\n#visible')).toEqual(['visible'])
  })
})

describe('setFrontMatterProperty', () => {
  it('updates an existing property and keeps the body intact', () => {
    const content = `---\ntitle: Old\ncreatedAt: 2026-09-01 10:30:00\ntags: []\n---\n\n# Body\n`
    const next = setFrontMatterProperty(content, 'title', 'New title')
    expect(next).toContain('title: New title')
    expect(next).not.toContain('title: Old')
    expect(next).toContain('createdAt: 2026-09-01 10:30:00')
    expect(next!.split('\n---\n\n')[1]).toBe('# Body\n')
    expect(setFrontMatterProperty(next!, 'title', 'New title')).toBeNull()
  })

  it('returns null when the property is absent', () => {
    const content = `---\ncreatedAt: 2026-09-01 10:30:00\n---\n\nBody`
    expect(setFrontMatterProperty(content, 'title', 'Something')).toBeNull()
  })

  it('returns null when there is no parseable front matter', () => {
    expect(setFrontMatterProperty('# Heading\n\nBody', 'title', 'X')).toBeNull()
    expect(setFrontMatterProperty('\n---\ntitle: A\n---\n', 'title', 'X')).toBeNull()
  })

  it('deletes the property when the value is null', () => {
    const content = `---\ntitle: Old\ntags: []\n---\n\nBody`
    const next = setFrontMatterProperty(content, 'title', null)
    expect(next).not.toContain('title')
    expect(next).toContain('tags: []')
  })

  it('quotes values that would break YAML plain scalars', () => {
    const content = '---\ntitle: Old\n---\n'
    const next = setFrontMatterProperty(content, 'title', 'rating: 5')
    expect(next).toContain('title: "rating: 5"')
    expect(next).toMatch(/^---\n/)
  })
})

describe('interpolateNewNoteTemplate', () => {
  const now = new Date(2026, 8, 1, 9, 5, 7)

  it('replaces the title and createdAt placeholders', () => {
    const template = `---\ntitle: {{title}}\ncreatedAt: {{createdAt}}\ntags: []\n---\n`
    expect(interpolateNewNoteTemplate(template, 'My note', now)).toBe(
      `---\ntitle: My note\ncreatedAt: 2026-09-01 09:05:07\ntags: []\n---\n`,
    )
  })

  it('supports date and time placeholders', () => {
    expect(interpolateNewNoteTemplate('{{date}} {{time}}', 'X', now)).toBe('2026-09-01 09:05:07')
  })

  it('quotes titles that would break YAML plain scalars', () => {
    expect(interpolateNewNoteTemplate('title: {{title}}', 'a: b', now)).toBe('title: "a: b"')
  })

  it('renders an empty template unchanged', () => {
    expect(interpolateNewNoteTemplate('', 'My note', now)).toBe('')
  })

  it('fills contextual folder and tags placeholders', () => {
    const template = 'folder: {{folder}}\ntags: [{{tags}}]\n'
    expect(interpolateNewNoteTemplate(template, 'X', now, { folder: 'Reading', tags: 'book' })).toBe(
      'folder: Reading\ntags: [book]\n',
    )
  })

  it('renders contextual placeholders empty without context', () => {
    expect(interpolateNewNoteTemplate('{{folder}}/{{tags}}', 'X', now)).toBe('/')
  })

  it('inserts contextual values verbatim', () => {
    expect(interpolateNewNoteTemplate('folder: {{folder}}', 'X', now, { folder: 'a: b' })).toBe('folder: a: b')
  })

  it('fills today, tomorrow, and yesterday placeholders', () => {
    const template = '{{today}}|{{tomorrow}}|{{yesterday}}'
    expect(interpolateNewNoteTemplate(template, 'X', now)).toBe('2026-09-01|2026-09-02|2026-08-31')
  })

  it('rolls relative dates across month boundaries', () => {
    const monthEnd = new Date(2026, 7, 31, 23, 59, 59)
    expect(interpolateNewNoteTemplate('{{tomorrow}}', 'X', monthEnd)).toBe('2026-09-01')
  })
})

describe('addTagToFrontMatter', () => {
  it('appends to an existing tags list and keeps the body', () => {
    const content = `---\ntitle: T\ntags: [daily]\n---\n\nBody\n`
    const next = addTagToFrontMatter(content, 'reading')!
    expect(parseFrontMatter(next).data.tags).toEqual(['daily', 'reading'])
    expect(parseFrontMatter(next).body).toBe('\nBody\n')
  })

  it('creates the tags property when it is missing', () => {
    const content = `---\ntitle: T\n---\n\nBody`
    const next = addTagToFrontMatter(content, 'reading')
    expect(next).not.toBeNull()
    expect(parseFrontMatter(next!).data.tags).toEqual(['reading'])
    expect(parseFrontMatter(next!).data.title).toBe('T')
  })

  it('returns null when the tag is already present (case-insensitive)', () => {
    const content = '---\ntags: [Reading]\n---\n'
    expect(addTagToFrontMatter(content, 'reading')).toBeNull()
  })

  it('merges into a string-valued tags property', () => {
    const content = '---\ntags: daily\n---\n'
    const next = addTagToFrontMatter(content, 'reading')
    expect(parseFrontMatter(next!).data.tags).toEqual(['daily', 'reading'])
  })

  it('strips a leading hash from the added tag', () => {
    const content = '---\ntags: []\n---\n'
    expect(parseFrontMatter(addTagToFrontMatter(content, '#reading')!).data.tags).toEqual(['reading'])
  })

  it('returns null without parseable front matter', () => {
    expect(addTagToFrontMatter('# Heading\n\nBody', 'reading')).toBeNull()
    expect(addTagToFrontMatter('', 'reading')).toBeNull()
  })
})

describe('renderNewNoteTemplate', () => {
  const now = new Date(2026, 8, 1, 9, 5, 7)

  it('removes the cursor placeholder and reports its position', () => {
    const template = `---\ntitle: {{title}}\n---\n\n{{cursor}}# Task\n`
    const rendered = renderNewNoteTemplate(template, 'My note', now)
    expect(rendered.content).toBe(`---\ntitle: My note\n---\n\n# Task\n`)
    expect(rendered.cursor).toBe(rendered.content.indexOf('# Task'))
    expect(rendered.content).not.toContain('\uFFFF')
  })

  it('reports no cursor when the placeholder is absent', () => {
    expect(renderNewNoteTemplate('---\n---\n', 'X', now).cursor).toBeNull()
  })

  it('joins multiple tags with commas for the placeholder', () => {
    const rendered = renderNewNoteTemplate('tags: [{{tags}}]', 'X', now, { tags: 'daily, reading' })
    expect(rendered.content).toBe('tags: [daily, reading]')
  })
})

describe('mergeTagsIntoFrontMatter', () => {
  const now = new Date(2026, 8, 1, 9, 5, 7)

  it('merges tags into the front matter and shifts the pending caret', () => {
    const rendered = renderNewNoteTemplate('---\ntags: []\n---\n\n{{cursor}}Body\n', 'X', now)
    const merged = mergeTagsIntoFrontMatter(rendered.content, ['a', 'b'], rendered.cursor)
    expect(parseFrontMatter(merged.content).data.tags).toEqual(['a', 'b'])
    expect(merged.content.slice(merged.cursor!).startsWith('Body')).toBe(true)
  })

  it('leaves content without front matter untouched', () => {
    const result = mergeTagsIntoFrontMatter('# Plain\n', ['a'], 3)
    expect(result.content).toBe('# Plain\n')
    expect(result.cursor).toBe(3)
  })

  it('keeps interpolated placeholders intact after the merge', () => {
    const template = `---\ntitle: {{title}}\ncreatedAt: {{createdAt}}\ntags: []\n---\n\n`
    const rendered = renderNewNoteTemplate(template, 'My note', now)
    const merged = mergeTagsIntoFrontMatter(rendered.content, ['Inkstone'], rendered.cursor)
    expect(merged.content).toContain('2026-09-01 09:05:07')
    expect(merged.content).not.toContain('{{createdAt}}')
    expect(merged.content).not.toContain('{ ? { createdAt } }')
    expect(parseFrontMatter(merged.content).data.tags).toEqual(['Inkstone'])
  })
})

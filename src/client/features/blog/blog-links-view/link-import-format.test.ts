import { describe, expect, it } from 'vitest'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import {
  IMPORT_FILE_MAX_BYTES,
  ImportParseError,
  formatFromFileName,
  generateBookmarkHtml,
  generateCsv,
  importFileRejection,
  parseImportPayload,
} from './link-import-format'

// UI-10: the import/export dialog dropped data in three places — a two-level HTML export that left
// uncategorised and deeper links behind while the summary still counted them, blank entries that
// were sent only for the server to refuse the whole batch, and a `split(',')` CSV reader that could
// not read back the export's own quoted fields. These pin the three answers.

function link(overrides: Partial<BlogLink> = {}): BlogLink {
  return {
    id: 'link-1',
    name: 'A friend',
    url: 'https://friend.example/posts',
    description: null,
    avatar: null,
    categoryId: null,
    status: 'approved',
    isPinned: false,
    pinnedOrder: 0,
    isFavorite: false,
    sortOrder: 0,
    isActive: true,
    clicks: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function category(overrides: Partial<BlogLinkCategory> = {}): BlogLinkCategory {
  return { id: 'cat-1', name: 'Tools', icon: null, parentId: null, sortOrder: 0, createdAt: 1, updatedAt: 1, ...overrides }
}

describe('import payload', () => {
  it('names invalid JSON as a message instead of showing the parser\'s sentence', () => {
    let thrown: unknown
    try {
      parseImportPayload('json', '{ "links": [')
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(ImportParseError)
    expect((thrown as ImportParseError).messageKey).toBe('blog.link_import_invalid_json')
  })

  it('drops entries the server would refuse and counts them', () => {
    const payload = JSON.stringify({
      links: [
        { name: 'Kept', url: 'https://kept.example' },
        { name: 'No address', url: '' },
        { name: '', url: 'https://nameless.example' },
        7,
      ],
    })

    const parsed = parseImportPayload('json', payload)

    expect(parsed.links).toEqual([
      expect.objectContaining({ name: 'Kept', url: 'https://kept.example' }),
    ])
    // Three entries could not be sent: one per missing field and the number that is not an entry.
    // The server validates the batch as a whole, so leaving one in would have failed the import.
    expect(parsed.skipped).toBe(3)
  })
})

describe('reading a CSV', () => {
  it('reads back its own output, commas and quotes included', () => {
    const exported = generateCsv(
      [link({ name: 'Smith, "A" & Co', description: 'one, two', categoryId: 'cat-1' })],
      [category({ name: 'Partners, Ltd' })],
    )

    const parsed = parseImportPayload('csv', exported)

    expect(parsed.links[0]).toEqual(expect.objectContaining({
      name: 'Smith, "A" & Co',
      description: 'one, two',
      url: 'https://friend.example/posts',
    }))
    // The category column carries a comma too: a `split(',')` read it as two fields and lost it.
    expect(parsed.categories[0]?.name).toBe('Partners, Ltd')
    expect(parsed.links[0]?.categoryId).toBe(parsed.categories[0]?.id)
  })

  it('counts a row that is not a link at all, and ignores the blank lines between them', () => {
    const parsed = parseImportPayload('csv', 'Name,URL\nKept,https://kept.example\nOnly a name,\n\n')

    expect(parsed.links).toHaveLength(1)
    expect(parsed.skipped).toBe(1)
  })
})

describe('reading browser bookmarks', () => {
  it('refuses a browser-internal address and says how many it left', () => {
    const html = '<DL><p><DT><A HREF="chrome://settings" ADD_DATE="1">Settings</A><DT><A HREF="https://ok.example" ADD_DATE="1">Ok</A></DL><p>'

    const parsed = parseImportPayload('html', html)

    expect(parsed.links.map((l) => l.name)).toEqual(['Ok'])
    expect(parsed.skipped).toBe(1)
  })
})

describe('bookmark export', () => {
  it('carries every link, at whatever depth it sits or with no folder at all', () => {
    const root = category({ id: 'cat-1', name: 'Root' })
    const child = category({ id: 'cat-2', name: 'Child', parentId: 'cat-1' })
    const grandchild = category({ id: 'cat-3', name: 'Grandchild', parentId: 'cat-2' })
    const links = [
      link({ id: 'l1', name: 'Root link', url: 'https://root.example', categoryId: 'cat-1' }),
      link({ id: 'l2', name: 'Grandchild link', url: 'https://deep.example', categoryId: 'cat-3' }),
      link({ id: 'l3', name: 'No folder', url: 'https://none.example', categoryId: null }),
    ]

    const html = generateBookmarkHtml(links, [root, child, grandchild])

    for (const l of links) expect(html, `“${l.name}” was left out of the export`).toContain(l.url)
    // And the file reads back as what it was: three links and the folder chain that held them.
    const parsed = parseImportPayload('html', html)
    expect(parsed.links.map((l) => l.name).sort()).toEqual(['Grandchild link', 'No folder', 'Root link'])
    expect(parsed.categories.map((c) => c.name)).toEqual(['Root', 'Child', 'Grandchild'])
  })
})

describe('chosen file', () => {
  it('refuses a file it cannot read before the dialog touches it', () => {
    expect(importFileRejection({ name: 'notes.txt', size: 10 })).toBe('blog.link_import_wrong_type')
    expect(importFileRejection({ name: 'backup.json', size: IMPORT_FILE_MAX_BYTES + 1 })).toBe('blog.link_import_file_too_large')
    expect(importFileRejection({ name: 'BACKUP.JSON', size: 10 })).toBeNull()
  })

  it('reads the format off the file name', () => {
    expect(formatFromFileName('bookmarks.HTML')).toBe('html')
    expect(formatFromFileName('export.htm')).toBe('html')
    expect(formatFromFileName('links.csv')).toBe('csv')
    expect(formatFromFileName('backup.json')).toBe('json')
  })
})

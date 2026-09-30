import type { BlogLink, BlogLinkCategory } from '@shared/types'
import type { MessageKey } from '../../../lib/i18n'

/**
 * Everything the import/export dialog does to text: what a chosen file may be, how a payload is
 * read, and what the two written formats look like. The dialog above it holds only the controls —
 * these are the parts a test can drive without a browser.
 */

/** The formats the reader may hand over, by extension: the file input's `accept` is only a hint. */
export const IMPORT_FILE_EXTENSIONS = ['.json', '.csv', '.html', '.htm']

/** A pasted backup is text; a file above this is not something this dialog should hold in memory. */
export const IMPORT_FILE_MAX_BYTES = 2 * 1024 * 1024

/**
 * A payload this dialog refused to read, carrying the message id rather than an English sentence:
 * the parser's own `SyntaxError` used to be what landed in the toast.
 */
export class ImportParseError extends Error {
  constructor(readonly messageKey: MessageKey) {
    super(messageKey)
    this.name = 'ImportParseError'
  }
}

export interface ParsedImport {
  categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>
  links: Array<Partial<BlogLink>>
  /** Entries the reader's file carried that could not be sent: they would be refused one by one. */
  skipped: number
}

/** `null` when the file may be read, otherwise the message id that says why it may not. */
export function importFileRejection(file: { name: string; size: number }): MessageKey | null {
  const name = file.name.toLowerCase()
  if (!IMPORT_FILE_EXTENSIONS.some((extension) => name.endsWith(extension))) return 'blog.link_import_wrong_type'
  if (file.size > IMPORT_FILE_MAX_BYTES) return 'blog.link_import_file_too_large'
  return null
}

/** The chosen tab, by file extension: the input's `accept` list already narrowed the candidates. */
export function formatFromFileName(name: string): 'json' | 'html' | 'csv' {
  const lower = name.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.csv')) return 'csv'
  return 'json'
}

function parseJsonLinks(text: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ImportParseError('blog.link_import_invalid_json')
  }
  const record = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  const rawCats = Array.isArray(record.categories) ? record.categories : []
  const rawLinks = Array.isArray(record.links) ? record.links : Array.isArray(parsed) ? parsed : []
  const categories = rawCats.map((c: Record<string, unknown>) => ({
    id: typeof c.id === 'string' ? c.id : undefined,
    name: String(c.name || c.title || 'Untitled'),
    icon: typeof c.icon === 'string' ? c.icon : null,
    parentId: typeof c.parentId === 'string' ? c.parentId : null,
    sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : 0,
  }))
  const links = rawLinks.map((entry: unknown) => {
    const l = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>
    return {
      name: typeof l.name === 'string' ? l.name : typeof l.title === 'string' ? l.title : '',
      url: typeof l.url === 'string' ? l.url : '',
      description: typeof l.description === 'string' ? l.description : null,
      avatar: typeof l.avatar === 'string' ? l.avatar : typeof l.icon === 'string' ? l.icon : null,
      categoryId: typeof l.categoryId === 'string' && l.categoryId !== 'default' ? l.categoryId : null,
      isPinned: Boolean(l.isPinned ?? l.pinned),
      isFavorite: Boolean(l.isFavorite ?? l.favorite),
      pinnedOrder: typeof l.pinnedOrder === 'number' ? l.pinnedOrder : 0,
      sortOrder: typeof l.sortOrder === 'number' ? l.sortOrder : 0,
    }
  })
  return { categories, links, skipped: 0 }
}

function resolveCsvCategory(
  rootCat: string,
  subCat: string | undefined,
  catMap: Map<string, string>,
  categories: Array<{ id: string; name: string; parentId: string | null }>,
): string | null {
  if (!rootCat) return null
  if (!catMap.has(rootCat)) {
    const id = `cat-${catMap.size + 1}`
    catMap.set(rootCat, id)
    categories.push({ id, name: rootCat, parentId: null })
  }
  const rootId = catMap.get(rootCat)!
  if (!subCat) return rootId

  const subKey = `${rootCat}/${subCat}`
  if (!catMap.has(subKey)) {
    const subId = `cat-${catMap.size + 1}`
    catMap.set(subKey, subId)
    categories.push({ id: subId, name: subCat, parentId: rootId })
  }
  return catMap.get(subKey)!
}

/**
 * RFC 4180-ish field splitting, because the export quotes every field: a `split(',')` reads back its
 * own output wrong the moment a name, a description or a category carries a comma or a quote.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const endRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
        continue
      }
      if (char === '"') {
        inQuotes = false
        continue
      }
      field += char
      continue
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n' || char === '\r') {
      endRow()
      if (char === '\r' && text[i + 1] === '\n') i += 1
      continue
    }
    field += char
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function parseCsvLinks(text: string) {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim().length > 0))
  if (rows.length === 0) return { categories: [], links: [], skipped: 0 }

  const catMap = new Map<string, string>()
  const categories: Array<{ id: string; name: string; parentId: string | null }> = []
  const links: Array<Partial<BlogLink>> = []
  let skipped = 0

  const startIdx = rows[0]!.join(',').toLowerCase().includes('url') ? 1 : 0
  for (let i = startIdx; i < rows.length; i++) {
    const [name = '', url = '', description, avatar, rootCat, subCat] = rows[i]!.map((cell) => cell.trim())
    // Dropped here rather than in the common pass below, and counted here with it: resolving the
    // row's category first would otherwise leave a folder behind for a row that is not a link.
    if (!name || !url) {
      skipped += 1
      continue
    }
    const catId = resolveCsvCategory(rootCat, subCat, catMap, categories)
    links.push({ name, url, description: description || null, avatar: avatar || null, categoryId: catId })
  }
  return { categories, links, skipped }
}

function processBookmarkNode(
  child: Element,
  parentCatId: string | null,
  getOrCreateCat: (name: string, parentId: string | null) => string,
  traverse: (el: Element, pId: string | null) => void,
  links: Array<Partial<BlogLink>>,
  skippedRef: { skipped: number },
) {
  if (child.tagName.toUpperCase() !== 'DT') return
  const h3 = child.querySelector('h3')
  const dl = child.querySelector('dl')
  const a = child.querySelector('a')
  if (h3 && dl) {
    const catName = h3.textContent?.trim() || 'Folder'
    const currentCatId = getOrCreateCat(catName, parentCatId)
    traverse(dl, currentCatId)
    return
  }
  if (!a) return
  const url = a.getAttribute('href')
  if (!url) return
  if (url.startsWith('chrome://') || url.startsWith('about:')) {
    skippedRef.skipped += 1
    return
  }
  const name = a.textContent?.trim() || url
  const icon = a.getAttribute('icon')
  links.push({ name, url, avatar: icon || null, categoryId: parentCatId })
}

function parseBookmarksHtml(text: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const categories: Array<{ id: string; name: string; parentId: string | null }> = []
  const links: Array<Partial<BlogLink>> = []
  const catMap = new Map<string, string>()
  const skippedRef = { skipped: 0 }

  const getOrCreateCat = (name: string, parentId: string | null = null): string => {
    const key = `${parentId ?? ''}/${name}`
    if (catMap.has(key)) return catMap.get(key)!
    const id = `bm-cat-${catMap.size + 1}`
    catMap.set(key, id)
    categories.push({ id, name, parentId })
    return id
  }

  const traverse = (element: Element, parentCatId: string | null) => {
    for (const child of Array.from(element.children)) {
      processBookmarkNode(child, parentCatId, getOrCreateCat, traverse, links, skippedRef)
    }
  }

  const rootDl = doc.querySelector('dl')
  if (rootDl) traverse(rootDl, null)
  return { categories, links, skipped: skippedRef.skipped }
}

/**
 * One entry the server would refuse sinks the whole import — it validates the payload as a batch — so
 * entries without a name or a URL are dropped here and reported to the reader afterwards.
 */
function collectImportableLinks(entries: Array<Partial<BlogLink>>): { links: Array<Partial<BlogLink>>; skipped: number } {
  const links: Array<Partial<BlogLink>> = []
  let skipped = 0
  for (const entry of entries) {
    const name = entry.name?.trim()
    const url = entry.url?.trim()
    if (!name || !url) {
      skipped += 1
      continue
    }
    links.push({ ...entry, name, url })
  }
  return { links, skipped }
}

/** Reads whatever the reader pasted or chose, into the payload the server accepts. */
export function parseImportPayload(format: 'json' | 'html' | 'csv', text: string): ParsedImport {
  const parsed = format === 'html' ? parseBookmarksHtml(text) : format === 'csv' ? parseCsvLinks(text) : parseJsonLinks(text)
  const { links, skipped } = collectImportableLinks(parsed.links)
  return { categories: parsed.categories, links, skipped: skipped + parsed.skipped }
}

export function generateCfAstroJson(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const catItems = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon || 'Folder',
    parentId: c.parentId || null,
    sortOrder: c.sortOrder || 0,
    createdAt: c.createdAt || Date.now(),
  }))
  const linkItems = links.map((l) => ({
    id: l.id,
    title: l.name,
    name: l.name,
    url: l.url,
    icon: l.avatar || null,
    avatar: l.avatar || null,
    description: l.description || null,
    categoryId: l.categoryId || 'default',
    pinned: Boolean(l.isPinned),
    isPinned: Boolean(l.isPinned),
    favorite: Boolean(l.isFavorite),
    isFavorite: Boolean(l.isFavorite),
    pinnedOrder: l.pinnedOrder || 0,
    sortOrder: l.sortOrder || 0,
    createdAt: l.createdAt || Date.now(),
  }))
  return JSON.stringify({ categories: catItems, links: linkItems }, null, 2)
}

/**
 * Writes every category at whatever depth it sits, plus the links that carry no category at all —
 * the two-level walk it replaces dropped those silently while the summary above the button still
 * counted them, so the file and the number disagreed.
 */
export function generateBookmarkHtml(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const now = Math.floor(Date.now() / 1000)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const lines: string[] = []
  const written = new Set<number>()
  const anchor = (link: BlogLink, indent: string) => `${indent}<DT><A HREF="${escape(link.url)}" ADD_DATE="${now}">${escape(link.name)}</A>`
  const writeLinksOf = (categoryId: string | null, indent: string) => {
    links.forEach((link, index) => {
      if (written.has(index) || (link.categoryId ?? null) !== categoryId) return
      written.add(index)
      lines.push(anchor(link, indent))
    })
  }
  const renderCategory = (category: BlogLinkCategory, depth: number, seen: Set<string>) => {
    if (seen.has(category.id)) return
    seen.add(category.id)
    const indent = '  '.repeat(depth)
    lines.push(`${indent}<DT><H3 ADD_DATE="${now}">${escape(category.name)}</H3>`, `${indent}<DL><p>`)
    writeLinksOf(category.id, `${indent}  `)
    for (const child of categories.filter((c) => c.parentId === category.id)) renderCategory(child, depth + 1, seen)
    lines.push(`${indent}</DL><p>`)
  }
  const seen = new Set<string>()
  for (const root of categories.filter((c) => !c.parentId)) renderCategory(root, 1, seen)
  // Whatever no category claimed — uncategorised, or a category caught in a parent cycle — still
  // leaves inside the file; the count the reader was shown has to be the count they got.
  links.forEach((link, index) => {
    if (!written.has(index)) lines.push(anchor(link, '  '))
  })
  const head = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>'
  return `${head}\n<DL><p>\n${lines.join('\n')}\n</DL><p>`
}

function getCategoryCsvNames(cat: BlogLinkCategory | undefined, categories: BlogLinkCategory[]): { rootName: string; subName: string } {
  if (!cat) return { rootName: '', subName: '' }
  if (!cat.parentId) return { rootName: cat.name, subName: '' }
  const parent = categories.find((c) => c.id === cat.parentId)
  return { rootName: parent ? parent.name : '', subName: cat.name }
}

export function generateCsv(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const rows = ['Name,URL,Description,Avatar,Category,Subcategory']
  for (const l of links) {
    const cat = categories.find((c) => c.id === l.categoryId)
    const { rootName, subName } = getCategoryCsvNames(cat, categories)
    rows.push([
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.url || '').replace(/"/g, '""')}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${(l.avatar || '').replace(/"/g, '""')}"`,
      `"${rootName.replace(/"/g, '""')}"`,
      `"${subName.replace(/"/g, '""')}"`,
    ].join(','))
  }
  return rows.join('\n')
}

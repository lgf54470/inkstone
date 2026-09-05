import { LIMITS } from '@shared/constants'
import { organizerColorOrNull } from '@shared/organizer-colors'
import { deriveTitle, extractAttachmentIds } from '@shared/markdown-utils'
import type { ExportAttachment, ExportBundle, ImportResult, Note } from '@shared/types'
import { createZip } from '@shared/zip'
import { listFolders, listTags, newDemoId, refreshNote } from '../../state'
import type { DemoState } from '../../state'
import { apiError } from './info'
import { browserFileUrl, revokeAttachment } from './files'

export function exportBundle(state: DemoState): ExportBundle {
  return {
    format: 'inkstone-export',
    version: 1,
    exportedAt: Date.now(),
    user: { login: state.user.login, name: state.user.name },
    folders: listFolders(state),
    tags: listTags(state),
    notes: [...state.notes.values()],
    attachments: [],
  }
}

export async function exportResponse(state: DemoState, format: 'json' | 'zip'): Promise<Response> {
  const baseBundle = exportBundle(state)
  const encoder = new TextEncoder()
  if (format === 'json') {
    return new Response(JSON.stringify(baseBundle, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="inkstone-demo.json"',
      },
    })
  }
  const storedAttachments = [...state.attachments.values()]
  const notes = [...state.notes.values()].map((note) => ({
    ...note,
    content: storedAttachments.reduce(
      (content, attachment) => content.replaceAll(attachment.meta.url, `/api/files/${attachment.meta.id}`),
      note.content,
    ),
  }))
  const noteEntries = demoNoteEntries(notes, encoder)
  const expandedBytes = noteEntries.reduce((total, entry) => total + entry.data.byteLength, 0)
    + storedAttachments.reduce((total, attachment) => total + attachment.meta.size, 0)
  if (expandedBytes > LIMITS.importArchiveExpandedMaxBytes) {
    return apiError(413, 'payload_too_large', 'The demo ZIP would exceed the 80 MB expanded archive limit')
  }
  if (noteEntries.length + storedAttachments.length + 1 > LIMITS.importArchiveEntriesMax) {
    return apiError(413, 'payload_too_large', 'The demo ZIP would contain too many files')
  }

  const attachments: ExportAttachment[] = []
  const attachmentEntries: Array<{ path: string, data: Uint8Array }> = []
  for (const attachment of storedAttachments) {
    const data = new Uint8Array(await attachment.file.arrayBuffer())
    const filename = safeAttachmentFilename(attachment.meta.filename)
    const path = `attachments/${attachment.meta.id}/${filename}`
    attachments.push({
      id: attachment.meta.id,
      noteId: attachment.meta.noteId,
      filename,
      mime: attachment.meta.mime,
      size: data.byteLength,
      width: attachment.meta.width,
      height: attachment.meta.height,
      createdAt: attachment.meta.createdAt,
      path,
      sha256: await sha256Hex(data),
    })
    attachmentEntries.push({ path, data })
  }
  const bundle: ExportBundle = { ...baseBundle, notes, attachments }
  const entries = [
    { path: 'inkstone-export.json', data: encoder.encode(JSON.stringify(bundle, null, 2)) },
    ...noteEntries,
    ...attachmentEntries,
  ]
  if (entries.reduce((total, entry) => total + entry.data.byteLength, 0) > LIMITS.importArchiveExpandedMaxBytes) {
    return apiError(413, 'payload_too_large', 'The demo ZIP would exceed the 80 MB expanded archive limit')
  }
  const data = createZip(entries)
  return new Response(data as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="inkstone-demo.zip"',
    },
  })
}

export function demoNoteEntries(notes: Iterable<Note>, encoder: TextEncoder): Array<{ path: string, data: Uint8Array }> {
  const used = new Set<string>()
  return [...notes].map((note) => {
    const base = safeFilename(note.title)
    let name = base
    let suffix = 2
    while (used.has(name.toLocaleLowerCase())) name = `${base} (${suffix++})`
    used.add(name.toLocaleLowerCase())
    return { path: `notes/${name}.md`, data: encoder.encode(note.content) }
  })
}

export function safeFilename(value: string): string {
  return (value || 'Untitled note').replace(/[\\/:*?"<>|]/g, '-').slice(0, 100)
}

export function safeAttachmentFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
  return (cleaned || 'file').slice(0, 180)
}

export async function importBundle(
  state: DemoState,
  value: unknown,
  result: ImportResult,
  archiveEntries?: Map<string, Uint8Array>,
): Promise<void> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid export file')
  const bundle = value as Partial<ExportBundle>
  if (!Array.isArray(bundle.notes)) throw new Error('The export contains no notes')
  const importedAttachments = archiveEntries
    ? await importBundleAttachments(state, Array.isArray(bundle.attachments) ? bundle.attachments : [], archiveEntries, result)
    : { urls: new Map<string, string>(), sourceNotes: new Map<string, string | null>() }
  if (!archiveEntries && Array.isArray(bundle.attachments) && bundle.attachments.length > 0) {
    result.skippedAttachments += bundle.attachments.length
    result.warnings.push('Attachment bytes are unavailable in JSON exports')
  }
  const folderMap = new Map<string, string>()
  for (const raw of Array.isArray(bundle.folders) ? bundle.folders : []) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') continue
    const id = state.folders.has(raw.id) ? newDemoId() : raw.id
    folderMap.set(raw.id, id)
    state.folders.set(id, {
      id,
      parentId: raw.parentId ? folderMap.get(raw.parentId) ?? null : null,
      name: typeof raw.name === 'string' ? raw.name : 'Imported folder',
      icon: typeof raw.icon === 'string' ? raw.icon : null,
      color: organizerColorOrNull(raw.color),
      position: Number.isFinite(raw.position) ? raw.position : state.folders.size + 1,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      updatedAt: Date.now(),
    })
    result.createdFolders++
  }
  const noteMap = new Map<string, string>()
  for (const raw of bundle.notes) {
    if (!raw || typeof raw !== 'object' || typeof raw.content !== 'string') {
      result.skippedNotes++
      continue
    }
    const folderId = typeof raw.folderId === 'string' ? folderMap.get(raw.folderId) ?? null : null
    let content = raw.content
    for (const sourceId of extractAttachmentIds(content)) {
      const url = importedAttachments.urls.get(sourceId)
      if (url) content = content.replaceAll(`/api/files/${sourceId}`, url)
    }
    const id = createImportedNote(state, content, typeof raw.title === 'string' ? raw.title : undefined, folderId)
    if (typeof raw.id === 'string') noteMap.set(raw.id, id)
    result.createdNotes++
  }
  for (const [id, sourceNoteId] of importedAttachments.sourceNotes) {
    const attachment = state.attachments.get(id)
    if (!attachment) continue
    attachment.meta = { ...attachment.meta, noteId: sourceNoteId ? noteMap.get(sourceNoteId) ?? null : null }
  }
}

export function createImportedNote(
  state: DemoState,
  content: string,
  title: string | undefined,
  folderId: string | null,
): string {
  const now = Date.now()
  const id = newDemoId()
  const note = refreshNote({
    id,
    title: title ?? deriveTitle(content),
    excerpt: '',
    content: '',
    folderId,
    tags: [],
    isPinned: false,
    isStarred: false,
    isArchived: false,
    wordCount: 0,
    charCount: 0,
    rev: 1,
    position: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }, content, title)
  state.notes.set(id, note)
  return id
}

export async function importBundleAttachments(
  state: DemoState,
  rawAttachments: ExportAttachment[],
  archiveEntries: Map<string, Uint8Array>,
  result: ImportResult,
): Promise<{ urls: Map<string, string>, sourceNotes: Map<string, string | null> }> {
  const prepared: Array<{
    sourceId: string
    sourceNoteId: string | null
    id: string
    filename: string
    mime: string
    width: number | null
    height: number | null
    createdAt: number
    data: Uint8Array
  }> = []
  let importedBytes = 0
  const sourceIds = new Set<string>()
  const manifestPaths = new Set<string>()
  for (const raw of rawAttachments) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[0-9a-hjkmnp-tv-z]{26}$/.test(raw.id)) {
      throw new Error('The export contains an invalid attachment ID')
    }
    if (sourceIds.has(raw.id)) throw new Error(`The export contains a duplicate attachment ID: ${raw.id}`)
    sourceIds.add(raw.id)
    if (typeof raw.path !== 'string' || !raw.path || typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(raw.sha256)) {
      throw new Error(`The export contains invalid attachment metadata: ${raw.id}`)
    }
    const pathSegments = raw.path.split('/')
    if (
      raw.path.length > 512 ||
      raw.path.includes('\\') ||
      pathSegments.length !== 3 ||
      pathSegments[0] !== 'attachments' ||
      pathSegments[1] !== raw.id ||
      !pathSegments[2] ||
      /[\u0000-\u001f]/.test(pathSegments[2])
    ) throw new Error(`The export contains an invalid attachment path: ${raw.id}`)
    const pathKey = raw.path.toLocaleLowerCase()
    if (manifestPaths.has(pathKey)) throw new Error(`The export contains a duplicate attachment path: ${raw.path}`)
    manifestPaths.add(pathKey)
    const filename = typeof raw.filename === 'string' ? raw.filename : ''
    const mime = typeof raw.mime === 'string' ? raw.mime : ''
    if (!filename || filename.length > 180 || !mime || mime.length > 255) {
      throw new Error(`The export contains invalid attachment metadata: ${raw.id}`)
    }
    const data = archiveEntries.get(pathKey)
    if (!data) {
      result.skippedAttachments++
      result.warnings.push(`${filename}: attachment bytes are missing from the backup and were not restored`)
      continue
    }
    if (!Number.isSafeInteger(raw.size) || raw.size !== data.byteLength || data.byteLength > LIMITS.attachmentMaxBytes) {
      throw new Error(`The ZIP attachment has an invalid size: ${raw.filename || raw.id}`)
    }
    if (await sha256Hex(data) !== raw.sha256.toLocaleLowerCase()) {
      throw new Error(`The ZIP attachment checksum failed: ${raw.filename || raw.id}`)
    }
    importedBytes += data.byteLength
    prepared.push({
      sourceId: raw.id,
      sourceNoteId: typeof raw.noteId === 'string' && /^[0-9a-hjkmnp-tv-z]{26}$/.test(raw.noteId) ? raw.noteId : null,
      id: state.attachments.has(raw.id) ? newDemoId() : raw.id,
      filename,
      mime,
      width: Number.isFinite(raw.width) ? raw.width : null,
      height: Number.isFinite(raw.height) ? raw.height : null,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
      data,
    })
  }
  const usedBytes = [...state.attachments.values()].reduce((total, attachment) => total + attachment.meta.size, 0)
  if (usedBytes + importedBytes > LIMITS.attachmentQuotaBytes) {
    throw new Error('The imported attachments would exceed the account quota')
  }

  const imported = new Map<string, string>()
  const sourceNotes = new Map<string, string | null>()
  const createdIds: string[] = []
  try {
    for (const item of prepared) {
      const file = new File([item.data.slice().buffer as ArrayBuffer], item.filename, {
        type: item.mime,
        lastModified: item.createdAt,
      })
      const url = await browserFileUrl(file)
      state.attachments.set(item.id, {
        file,
        meta: {
          id: item.id,
          noteId: null,
          filename: item.filename,
          mime: item.mime,
          size: file.size,
          width: item.width,
          height: item.height,
          url,
          createdAt: item.createdAt,
        },
      })
      createdIds.push(item.id)
      imported.set(item.sourceId, url)
      sourceNotes.set(item.id, item.sourceNoteId)
      result.createdAttachments++
    }
  } catch (error) {
    for (const id of createdIds) {
      const attachment = state.attachments.get(id)
      if (attachment) revokeAttachment(attachment.meta.url)
      state.attachments.delete(id)
      sourceNotes.delete(id)
      result.createdAttachments--
    }
    throw error
  }
  return { urls: imported, sourceNotes }
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('')
}

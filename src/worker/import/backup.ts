/** Markdown-backup import: manifest parsing, entry verification and batch restore. */
import {
  backupSnapshotDir,
  isSafeBackupPath,
  parseMarkdownBackupManifest,
  type MarkdownBackupAttachmentEntry,
  type MarkdownBackupManifest,
  type MarkdownBackupNoteEntry,
} from '@shared/backup-format'
import { LIMITS } from '@shared/constants'
import type { AppBindings } from '../env'
import { sha256Hex } from '../lib/encoding'
import { ApiError } from '../lib/errors'
import { assertContentSize } from '../lib/request'
import { importBackupAttachment, loadBackupAttachmentTargets } from './attachments'
import { ensureFolderPath } from './folders'
import { insertNote, loadExistingNoteIndex, updateImportedNote } from './notes'
import { addWarning, validTimestamp } from './shared'
import type { ExistingNoteIndex, ImportContext, InsertInput, SelectedImportFile } from './types'

export function parsePostedBackupManifest(value: string | File | null): MarkdownBackupManifest | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > LIMITS.importBundleMaxBytes) {
    throw ApiError.badRequest('The backup manifest is too large')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw ApiError.badRequest('The backup manifest is not valid JSON')
  }
  const manifest = parseMarkdownBackupManifest(parsed)
  if (!manifest) throw ApiError.badRequest('This is not a valid Inkstone Markdown backup manifest')
  return manifest
}

export function parsePostedBackupPaths(value: string | File | null, count: number): string[] | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 1024 * 1024) throw ApiError.badRequest('The backup file list is too large')
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw ApiError.badRequest('The backup file list is not valid JSON')
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== count ||
    parsed.some((path) => !isSafeBackupPath(path))
  ) {
    throw ApiError.badRequest('The backup file list is invalid')
  }
  return parsed as string[]
}

interface PlannedBackupFile {
  file: File
  path: string
  note: MarkdownBackupNoteEntry | undefined
  attachment: MarkdownBackupAttachmentEntry | undefined
}

function planBackupSelection(
  selected: readonly SelectedImportFile[],
  noteByPath: Map<string, MarkdownBackupNoteEntry>,
  attachmentByPath: Map<string, MarkdownBackupAttachmentEntry>,
): PlannedBackupFile[] {
  const seen = new Set<string>()
  const planned: PlannedBackupFile[] = []
  for (const { file, path } of selected) {
    if (!isSafeBackupPath(path)) throw new Error(`Invalid backup path: ${path}`)
    const key = path.toLowerCase()
    if (seen.has(key)) throw new Error(`The selected backup contains a duplicate path: ${path}`)
    seen.add(key)
    const note = noteByPath.get(key)
    const attachment = attachmentByPath.get(key)
    if (!note && !attachment) throw new Error(`The file is not listed in the backup manifest: ${path}`)
    planned.push({ file, path, note, attachment })
  }
  return planned
}

export async function importBackupFileBatch(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: readonly SelectedImportFile[],
  manifest: MarkdownBackupManifest,
  ctx: ImportContext,
): Promise<void> {
  const noteByPath = new Map(manifest.notes.map((entry) => [entry.path.toLowerCase(), entry]))
  const attachmentByPath = new Map(
    manifest.attachments.map((entry) => [entry.path.toLowerCase(), entry]),
  )
  const planned = planBackupSelection(selected, noteByPath, attachmentByPath)
  await verifySelectedBackupFiles(planned)

  for (const item of planned.filter((entry) => entry.attachment)) {
    const entry = item.attachment!
    const bytes = new Uint8Array(await item.file.arrayBuffer())
    await importBackupAttachment(c.env, userId, entry, bytes, ctx)
  }
  for (const item of planned.filter((entry) => entry.note)) {
    const entry = item.note!
    const bytes = new Uint8Array(await item.file.arrayBuffer())
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
    } catch {
      throw new Error(`The Markdown file is not valid UTF-8: ${entry.path}`)
    }
    await importBackupMarkdown(c, userId, entry, text, manifest, ctx)
  }
}

async function verifySelectedBackupFiles(planned: readonly PlannedBackupFile[]): Promise<void> {
  for (const item of planned) {
    const entry = item.note ?? item.attachment!
    const bytes = new Uint8Array(await item.file.arrayBuffer())
    await verifyBackupEntry(
      bytes,
      item.note ? item.note.bytes : item.attachment!.size,
      entry.sha256,
      entry.path,
    )
    if (item.note) assertValidUtf8(bytes, item.note.path)
  }
}

function assertValidUtf8(bytes: Uint8Array, path: string): void {
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    throw new Error(`The Markdown file is not valid UTF-8: ${path}`)
  }
}

async function verifyBackupEntry(
  bytes: Uint8Array,
  expectedBytes: number,
  expectedHash: string,
  path: string,
): Promise<void> {
  if (bytes.byteLength !== expectedBytes) throw new Error(`Backup file length verification failed: ${path}`)
  if ((await sha256Hex(bytes)) !== expectedHash) throw new Error(`Backup file SHA-256 verification failed: ${path}`)
}

const BACKUP_ATTACHMENT_URL_RE =
  /(?:\.\.\/)+attachments\/([0-9a-f]{64})--[^\s<>"')\]#?]+/g

async function importBackupMarkdown(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  entry: MarkdownBackupNoteEntry,
  backupContent: string,
  manifest: MarkdownBackupManifest,
  ctx: ImportContext,
): Promise<void> {
  const attachmentIds = await backupAttachmentTargetsOrThrow(c.env.DB, userId, entry)
  const content = rewriteBackupAttachmentUrls(backupContent, new Set(entry.attachmentHashes), attachmentIds)
  assertContentSize(content)

  const folderId = entry.folder.length
    ? await ensureFolderPath(c.env.DB, userId, entry.folder.join('/'), ctx)
    : null
  const input = buildBackupNoteRestoreInput(entry, manifest, content, folderId)
  const existing = await loadExistingNoteIndex(c.env.DB, userId, entry.id, ctx)
  if (existing) {
    await restoreExistingBackupNote(c, userId, entry, input, existing, ctx)
    return
  }

  const insertedId = await insertNote(c, userId, input, ctx)
  ctx.byId?.set(entry.id, {
    id: insertedId,
    title: entry.title,
    rev: 1,
    updated_at: input.updatedAt!,
  })
  ctx.result.createdNotes++
}

async function backupAttachmentTargetsOrThrow(
  db: D1Database,
  userId: string,
  entry: MarkdownBackupNoteEntry,
): Promise<Map<string, string>> {
  const hashes = entry.attachmentHashes
  const attachmentIds = await loadBackupAttachmentTargets(db, userId, hashes)
  for (const hash of hashes) {
    if (!attachmentIds.has(hash)) throw new Error(`Restore the referenced attachment before this note: ${entry.path}`)
  }
  return attachmentIds
}

function rewriteBackupAttachmentUrls(
  backupContent: string,
  expectedHashes: ReadonlySet<string>,
  attachmentIds: ReadonlyMap<string, string>,
): string {
  return backupContent.replace(
    BACKUP_ATTACHMENT_URL_RE,
    (match, hash: string) => expectedHashes.has(hash)
      ? `/api/files/${attachmentIds.get(hash)}`
      : match,
  )
}

function buildBackupNoteRestoreInput(
  entry: MarkdownBackupNoteEntry,
  manifest: MarkdownBackupManifest,
  content: string,
  folderId: string | null,
): InsertInput {
  const statePrefix = manifest.version === 2
    ? `${backupSnapshotDir(manifest.snapshot)}/${entry.state}/`
    : `${entry.state}/`
  if (!entry.path.startsWith(statePrefix)) throw new Error(`Invalid backup note path: ${entry.path}`)
  const importedUpdatedAt = validTimestamp(entry.updatedAt)
  const importedCreatedAt = validTimestamp(entry.createdAt)
  const deletedAt = entry.state === 'trash'
    ? validTimestamp(entry.deletedAt) || importedUpdatedAt || Date.now()
    : undefined
  const effectiveUpdatedAt = Math.max(importedUpdatedAt || importedCreatedAt, deletedAt ?? 0)
  return {
    id: entry.id,
    content,
    title: entry.title,
    folderId,
    isArchived: entry.archived,
    createdAt: importedCreatedAt,
    updatedAt: effectiveUpdatedAt,
    deletedAt,
  }
}

async function restoreExistingBackupNote(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  entry: MarkdownBackupNoteEntry,
  input: InsertInput,
  existing: ExistingNoteIndex,
  ctx: ImportContext,
): Promise<void> {
  if (ctx.conflict === 'skip') {
    ctx.result.skippedNotes++
    return
  }
  if (ctx.conflict === 'duplicate') {
    await insertNote(c, userId, { ...input, id: undefined, title: `${entry.title} (imported)` }, ctx)
    ctx.result.createdNotes++
    return
  }
  const outcome = await updateImportedNote(c, userId, existing, input, input.updatedAt!, ctx)
  if (outcome === 'updated') ctx.result.updatedNotes++
  else {
    ctx.result.skippedNotes++
    if (outcome === 'conflict') addWarning(ctx.result, `${entry.title}: the current note changed during restore and was kept`)
  }
}

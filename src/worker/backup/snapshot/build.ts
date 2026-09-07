import { backupAttachmentPath, backupCompleteBody, backupCompletePath, backupManifestPath, parseMarkdownBackupManifest, type MarkdownBackupAttachmentEntry, type MarkdownBackupManifest, type MarkdownBackupNoteEntry, type MarkdownBackupNoteState, MARKDOWN_BACKUP_FORMAT, MARKDOWN_BACKUP_VERSION } from '@shared/backup-format';
import { APP_VERSION, LIMITS } from '@shared/constants';
import { extractAttachmentIds } from '@shared/markdown-utils';
import { truncateText } from '@shared/text-utils';
import type { Folder, Note } from '@shared/types';
import { isAttachmentObjectStorage } from '../../attachments/backend';
import { NOTE_COLUMNS_FULL, toFolder, toNote, type FolderRow, type NoteRow } from '../../db/rows';
import type { Env } from '../../env';
import { sha256Hex } from '../../lib/encoding';
import { encoder } from './files';
import { openPlannedNote } from './files';
import { openVerifiedAttachment } from './files';
import { renderNoteBody } from './files';
import { staticFile } from './files';
import { staticFileAsync, type BackupFile, type AttachmentSnapshotRow } from './files';

export type { BackupFile, BackupFileKind, AttachmentSnapshotRow } from './files';

export interface Snapshot {
  payloadFiles: BackupFile[]
  manifestFile: BackupFile
  completeFile: BackupFile
  noteCount: number
  attachmentCount: number
  bytes: number
  stamp: string
  createdAt: Date
}

export const NOTE_PAGE_SIZE = 100

const ATTACHMENT_LOOKUP_BATCH = 200

export async function buildSnapshot(env: Env, userId: string): Promise<Snapshot> {
  const { folderPaths } = await loadBackupFolders(env.DB, userId)
  const attachmentsById = new Map<string, AttachmentSnapshotRow>()
  const attachmentPathByHash = new Map<string, string>()
  const attachmentPathById = new Map<string, string>()
  const selectedAttachmentsByHash = new Map<string, AttachmentSnapshotRow>()

  const now = new Date()
  const stamp = formatStamp(now)
  const noteFiles: BackupFile[] = []
  const noteEntries: MarkdownBackupNoteEntry[] = []
  const usedPaths = new Set<string>()
  let afterId = ''

  while (true) {
    const page = await loadNotesPage(env.DB, userId, afterId)
    if (!page.results.length) break
    await processNotesPage(
      env,
      userId,
      page.results,
      attachmentsById,
      attachmentPathByHash,
      attachmentPathById,
      selectedAttachmentsByHash,
      folderPaths,
      usedPaths,
      noteEntries,
      noteFiles,
    )
    afterId = page.results.at(-1)!.id
    if (page.results.length < NOTE_PAGE_SIZE) break
  }

  return finalizeSnapshot(
    env,
    stamp,
    now,
    noteFiles,
    noteEntries,
    selectedAttachmentsByHash,
    attachmentPathByHash,
  )
}

async function finalizeSnapshot(
  env: Env,
  stamp: string,
  now: Date,
  noteFiles: BackupFile[],
  noteEntries: MarkdownBackupNoteEntry[],
  selectedAttachmentsByHash: Map<string, AttachmentSnapshotRow>,
  attachmentPathByHash: Map<string, string>,
): Promise<Snapshot> {
  const { attachmentEntries, attachmentFiles } = buildAttachmentBackupFiles(env, selectedAttachmentsByHash, attachmentPathByHash)
  const { payloadFiles, manifestFile, completeFile, bytes } = await assembleBackupFiles(
    stamp,
    now,
    noteFiles,
    attachmentFiles,
    noteEntries,
    attachmentEntries,
  )
  return {
    payloadFiles,
    manifestFile,
    completeFile,
    noteCount: noteEntries.length,
    attachmentCount: attachmentEntries.length,
    bytes,
    stamp,
    createdAt: now,
  }
}

async function processNotesPage(
  env: Env,
  userId: string,
  rows: NoteRow[],
  attachmentsById: Map<string, AttachmentSnapshotRow>,
  attachmentPathByHash: Map<string, string>,
  attachmentPathById: Map<string, string>,
  selectedAttachmentsByHash: Map<string, AttachmentSnapshotRow>,
  folderPaths: Map<string, BackupFolderPath>,
  usedPaths: Set<string>,
  noteEntries: MarkdownBackupNoteEntry[],
  noteFiles: BackupFile[],
): Promise<void> {
  const missingAttachmentIds = collectMissingAttachmentIds(rows, attachmentsById)
  await loadReferencedAttachments(env.DB, userId, missingAttachmentIds, attachmentsById)

  for (const row of rows) {
    const note = toNote(row)
    const noteAttachmentIds = new Set(extractAttachmentIds(note.content))
    selectNoteAttachments(
      attachmentsById,
      noteAttachmentIds,
      selectedAttachmentsByHash,
      attachmentPathByHash,
      attachmentPathById,
    )
    const built = await buildNoteBackupFile(
      env,
      userId,
      row,
      note,
      folderPaths,
      usedPaths,
      attachmentsById,
      attachmentPathById,
      noteAttachmentIds,
    )
    noteEntries.push(built.entry)
    noteFiles.push(built.file)
  }
}

export async function loadNotesPage(
  db: D1Database,
  userId: string,
  afterId: string,
): Promise<{ results: NoteRow[] }> {
  return db.prepare(
    `SELECT ${NOTE_COLUMNS_FULL} FROM notes n
      WHERE n.user_id = ?1 AND n.id > ?2 ORDER BY n.id ASC LIMIT ?3`,
  ).bind(userId, afterId, NOTE_PAGE_SIZE).all<NoteRow>()
}

async function loadBackupFolders(
  db: D1Database,
  userId: string,
): Promise<{ folders: Folder[]; folderPaths: Map<string, BackupFolderPath> }> {
  const folderResult = await db.prepare(
    `SELECT f.id, f.parent_id, f.name, f.icon, f.color, f.position, f.created_at, f.updated_at
       FROM folders f WHERE f.user_id = ?1 ORDER BY f.position ASC, f.id ASC`,
  ).bind(userId).all<FolderRow>()
  const folders = folderResult.results.map(toFolder)
  return { folders, folderPaths: buildFolderPaths(folders) }
}

function collectMissingAttachmentIds(
  rows: readonly NoteRow[],
  attachmentsById: Map<string, AttachmentSnapshotRow>,
): Set<string> {
  const missing = new Set<string>()
  for (const row of rows) {
    for (const id of extractAttachmentIds(row.content)) {
      if (!attachmentsById.has(id)) missing.add(id)
    }
  }
  return missing
}

function selectNoteAttachments(
  attachmentsById: Map<string, AttachmentSnapshotRow>,
  noteAttachmentIds: Set<string>,
  selectedByHash: Map<string, AttachmentSnapshotRow>,
  pathByHash: Map<string, string>,
  pathById: Map<string, string>,
): void {
  for (const id of noteAttachmentIds) {
    const attachment = attachmentsById.get(id)
    if (!attachment) {
      throw new Error(`A referenced attachment is missing from the database: ${id}`)
    }
    validateAttachmentRow(attachment)
    if (!selectedByHash.has(attachment.sha256)) {
      selectedByHash.set(attachment.sha256, attachment)
      pathByHash.set(
        attachment.sha256,
        backupAttachmentPath(attachment.sha256, safeSegment(attachment.filename)),
      )
    }
    pathById.set(id, pathByHash.get(attachment.sha256)!)
  }
}

async function buildNoteBackupFile(
  env: Env,
  userId: string,
  row: NoteRow,
  note: Note,
  folderPaths: Map<string, BackupFolderPath>,
  usedPaths: Set<string>,
  attachmentsById: Map<string, AttachmentSnapshotRow>,
  attachmentPathById: Map<string, string>,
  noteAttachmentIds: Set<string>,
): Promise<{ entry: MarkdownBackupNoteEntry; file: BackupFile }> {
  const { path, folder } = resolveNoteBackupPath(note, folderPaths, usedPaths)
  const rendered = renderNoteBody(note.content, path, attachmentPathById, noteAttachmentIds)
  const bytes = encoder.encode(rendered)
  const sha256 = await sha256Hex(bytes)
  const entry: MarkdownBackupNoteEntry = {
    id: note.id,
    path,
    title: note.title,
    folder,
    attachmentHashes: noteAttachmentHashes(attachmentsById, noteAttachmentIds),
    state: noteStateOf(note),
    archived: note.isArchived,
    bytes: bytes.byteLength,
    sha256,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
  }
  const file: BackupFile = {
    path,
    byteLength: bytes.byteLength,
    sha256,
    contentType: 'text/markdown; charset=utf-8',
    kind: 'note',
    open: () => openPlannedNote(
      env,
      userId,
      row.id,
      row.rev,
      path,
      sha256,
      attachmentPathById,
      noteAttachmentIds,
    ),
  }
  return { entry, file }
}

function noteStateOf(note: Note): MarkdownBackupNoteState {
  return note.deletedAt ? 'trash' : note.isArchived ? 'archived' : 'notes'
}

function resolveNoteBackupPath(
  note: Note,
  folderPaths: Map<string, BackupFolderPath>,
  usedPaths: Set<string>,
): { path: string; folder: string[] } {
  const folderInfo = note.folderId ? folderPaths.get(note.folderId) : undefined
  const folder = folderInfo?.path ?? ''
  const base = `${safeSegment(note.title || 'Untitled note')}--${note.id.slice(-8)}`
  let path = `${noteStateOf(note)}/${folder ? `${folder}/` : ''}${base}.md`
  let suffix = 2
  while (usedPaths.has(path.toLowerCase())) {
    path = `${noteStateOf(note)}/${folder ? `${folder}/` : ''}${base}-${suffix++}.md`
  }
  usedPaths.add(path.toLowerCase())
  return { path, folder: folderInfo?.names ?? [] }
}

function noteAttachmentHashes(
  attachmentsById: Map<string, AttachmentSnapshotRow>,
  noteAttachmentIds: Set<string>,
): string[] {
  return [...new Set(
    [...noteAttachmentIds].map((id) => attachmentsById.get(id)!.sha256),
  )].sort()
}

function buildAttachmentBackupFiles(
  env: Env,
  selectedByHash: Map<string, AttachmentSnapshotRow>,
  pathByHash: Map<string, string>,
): { attachmentEntries: MarkdownBackupAttachmentEntry[]; attachmentFiles: BackupFile[] } {
  const selectedAttachmentRows = [...selectedByHash.values()]
    .sort((a, b) => a.sha256.localeCompare(b.sha256))
  return {
    attachmentEntries: selectedAttachmentRows.map((row) => ({
      path: pathByHash.get(row.sha256)!,
      filename: row.filename,
      mime: row.mime,
      size: row.size,
      sha256: row.sha256,
      createdAt: row.created_at,
    })),
    attachmentFiles: selectedAttachmentRows.map((row) => ({
      path: pathByHash.get(row.sha256)!,
      byteLength: row.size,
      sha256: row.sha256,
      contentType: row.mime,
      kind: 'attachment',
      open: () => openVerifiedAttachment(env, row),
    })),
  }
}

async function assembleBackupFiles(
  stamp: string,
  now: Date,
  noteFiles: BackupFile[],
  attachmentFiles: BackupFile[],
  noteEntries: MarkdownBackupNoteEntry[],
  attachmentEntries: MarkdownBackupAttachmentEntry[],
): Promise<{ payloadFiles: BackupFile[]; manifestFile: BackupFile; completeFile: BackupFile; bytes: number }> {
  const readmeFile = await staticFile(
    'README.txt',
    readme(stamp, noteEntries, attachmentEntries.length),
    'text/plain; charset=utf-8',
    'readme',
  )
  const manifest: MarkdownBackupManifest = {
    format: MARKDOWN_BACKUP_FORMAT,
    version: MARKDOWN_BACKUP_VERSION,
    appVersion: APP_VERSION,
    createdAt: now.toISOString(),
    snapshot: stamp,
    notes: noteEntries,
    attachments: attachmentEntries,
  }
  if (!parseMarkdownBackupManifest(manifest)) {
    throw new Error('The backup contains metadata that cannot be restored safely')
  }
  const manifestFile = await staticFileAsync(
    backupManifestPath(stamp),
    encoder.encode(JSON.stringify(manifest, null, 2)),
    'application/json; charset=utf-8',
    'manifest',
  )
  if (manifestFile.byteLength > LIMITS.importUploadMaxBytes) {
    throw new Error(`The backup manifest exceeds ${formatBytes(LIMITS.importUploadMaxBytes)}`)
  }
  const completeFile = await staticFile(
    backupCompletePath(stamp),
    backupCompleteBody(manifestFile.sha256),
    'text/plain; charset=utf-8',
    'complete',
  )
  const payloadFiles = [...noteFiles, ...attachmentFiles, readmeFile]
  const allFiles = [...payloadFiles, manifestFile, completeFile]
  return {
    payloadFiles,
    manifestFile,
    completeFile,
    bytes: allFiles.reduce((sum, file) => sum + file.byteLength, 0),
  }
}

async function loadReferencedAttachments(
  db: D1Database,
  userId: string,
  ids: ReadonlySet<string>,
  target: Map<string, AttachmentSnapshotRow>,
): Promise<void> {
  const values = [...ids]
  for (let offset = 0; offset < values.length; offset += ATTACHMENT_LOOKUP_BATCH) {
    const chunk = values.slice(offset, offset + ATTACHMENT_LOOKUP_BATCH)
    const { results } = await db.prepare(
      `SELECT id, user_id, filename, mime, size, sha256, storage, created_at
         FROM attachments
        WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
    ).bind(userId, JSON.stringify(chunk)).all<AttachmentSnapshotRow>()
    for (const row of results) target.set(row.id, row)
  }
}

function validateAttachmentRow(row: AttachmentSnapshotRow): void {
  if (!/^[0-9a-hjkmnp-tv-z]{26}$/.test(row.id)) throw new Error('Attachment metadata contains an invalid ID')
  if (!row.filename || row.filename.length > 180) throw new Error(`Invalid attachment filename: ${row.id}`)
  if (!Number.isSafeInteger(row.size) || row.size < 0 || row.size > LIMITS.attachmentMaxBytes) {
    throw new Error(`Invalid attachment size: ${row.filename}`)
  }
  if (!/^[0-9a-f]{64}$/.test(row.sha256)) throw new Error(`Invalid attachment checksum: ${row.filename}`)
  if (!isAttachmentObjectStorage(row.storage)) throw new Error(`Invalid attachment storage type: ${row.filename}`)
}

interface BackupFolderPath {
  path: string
  names: string[]
}

function buildFolderPaths(folders: { id: string; parentId: string | null; name: string }[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const cache = new Map<string, BackupFolderPath>()
  const resolve = (id: string, visiting = new Set<string>()): BackupFolderPath => {
    if (cache.has(id)) return cache.get(id)!
    const folder = byId.get(id)
    if (!folder || visiting.has(id) || visiting.size >= LIMITS.folderDepthMax) {
      return { path: '', names: [] }
    }
    const next = new Set(visiting).add(id)
    const parent = folder.parentId
      ? resolve(folder.parentId, next)
      : { path: '', names: [] }
    const segment = safeSegment(folder.name)
    const value = {
      path: parent.path ? `${parent.path}/${segment}` : segment,
      names: [...parent.names, folder.name],
    }
    cache.set(id, value)
    return value
  }
  for (const folder of folders) resolve(folder.id)
  return cache
}

export function safeSegment(name: string): string {
  const normalized = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
  const cleaned = truncateText(normalized, 80).replace(/[\s.]+$/g, '')
  if (!cleaned) return 'Untitled'
  return /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)
    ? `_${cleaned}`
    : cleaned
}

export function formatStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const ms = String(date.getUTCMilliseconds()).padStart(3, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}-${ms}`
}

function readme(
  stamp: string,
  notes: readonly MarkdownBackupNoteEntry[],
  attachments: number,
): string {
  const active = notes.filter((note) => note.state === 'notes').length
  const archived = notes.filter((note) => note.state === 'archived').length
  const trash = notes.filter((note) => note.state === 'trash').length
  return `Inkstone Markdown backup\n\nSnapshot (UTC): ${stamp}\nTotal notes: ${notes.length}\nActive: ${active}\nArchived: ${archived}\nTrash: ${trash}\nAttachments: ${attachments}\n\nnotes/ contains ordinary notes in their folder hierarchy.\narchived/ contains archived notes in their folder hierarchy.\ntrash/ contains trashed notes in their folder hierarchy.\nattachments/ contains referenced files in their original bytes; the checksum in each filename prevents collisions.\nmanifest.json records note state, timestamps, paths, and checksums.\n\nRestore this ZIP directly in Inkstone. For a backup larger than the browser upload limit, extract it and select the extracted folder instead.\nA backup is valid only when its COMPLETE file is present and matches manifest.json.\n`
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.ceil(bytes / (1024 * 1024))} MB`
    : `${Math.ceil(bytes / 1024)} KB`
}

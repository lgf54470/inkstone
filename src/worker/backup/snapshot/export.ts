import { LIMITS } from '@shared/constants'
import type { ExportBundle } from '@shared/types'
import { estimateZipSizeFromSizes } from '@shared/zip'
import { toFolder, toNote, toTag, type FolderRow, type TagRow } from '../../db/rows'
import type { Env } from '../../env'
import { sha256Hex } from '../../lib/encoding'
import { ApiError } from '../../lib/errors'
import type { BackupFile } from './build'
import type { Snapshot } from './build'
import { formatBytes } from './build'
import { loadNotesPage } from './build'
import { NOTE_PAGE_SIZE } from './build'
import { encoder } from './files'

export interface MaterializedBackupFile {
  path: string
  body: Uint8Array
  contentType: string
}

export async function materializeSnapshot(snapshot: Snapshot): Promise<MaterializedBackupFile[]> {
  const files = [...snapshot.payloadFiles, snapshot.manifestFile, snapshot.completeFile]
  assertArchiveSizesCanBeRestored(files)
  const materialized: MaterializedBackupFile[] = []
  for (const file of files) {
    const body = await readBackupFile(file)
    if ((await sha256Hex(body)) !== file.sha256) {
      throw new Error(`Backup file changed while the archive was being created: ${file.path}`)
    }
    materialized.push({ path: file.path, body, contentType: file.contentType })
  }
  return materialized
}

async function readBackupFile(file: BackupFile): Promise<Uint8Array> {
  const reader = (await file.open()).getReader()
  const body = new Uint8Array(file.byteLength)
  let offset = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (offset + value.byteLength > body.byteLength) {
        throw new Error(`Backup source size changed: ${file.path}`)
      }
      body.set(value, offset)
      offset += value.byteLength
    }
  } finally {
    reader.releaseLock()
  }
  if (offset !== body.byteLength) throw new Error(`Backup source size changed: ${file.path}`)
  return body
}

export async function buildJsonExport(env: Env, userId: string): Promise<Uint8Array> {
  const metadata = await loadExportMetadata(env.DB, userId)
  const chunks: Uint8Array[] = []
  let byteLength = 0
  const append = (value: string) => {
    const chunk = encoder.encode(value)
    byteLength += chunk.byteLength
    assertBundleByteLengthCanBeRestored(byteLength)
    chunks.push(chunk)
  }

  append(`${JSON.stringify(metadata).slice(0, -1)},"notes":[`)
  let afterId = ''
  let isFirstNote = true
  while (true) {
    const page = await loadNotesPage(env.DB, userId, afterId)
    if (!page.results.length) break

    for (const row of page.results) {
      append(`${isFirstNote ? '' : ','}${JSON.stringify(toNote(row))}`)
      isFirstNote = false
    }

    afterId = page.results.at(-1)!.id
    if (page.results.length < NOTE_PAGE_SIZE) break
  }
  append('],"attachments":[]}')

  const bytes = concatChunks(chunks, byteLength)
  assertBundleCanBeRestored(bytes)
  return bytes
}

async function loadExportMetadata(
  db: D1Database,
  userId: string,
): Promise<Omit<ExportBundle, 'notes' | 'attachments'>> {
  const [folderRows, tagRows, userRows] = await db.batch([
    db.prepare(
      `SELECT f.id, f.parent_id, f.name, f.icon, f.color, f.position, f.created_at, f.updated_at
         FROM folders f WHERE f.user_id = ?1 AND f.deleted_at IS NULL ORDER BY f.position ASC`,
    ).bind(userId),
    db.prepare(`SELECT t.id, t.name, t.color, t.is_pinned, t.created_at FROM tags t WHERE t.user_id = ?1`).bind(userId),
    db.prepare(`SELECT login, name FROM users WHERE id = ?1`).bind(userId),
  ])
  const user = (userRows.results[0] as { login: string; name: string } | undefined) ?? null
  return {
    format: 'inkstone-export',
    version: 1,
    exportedAt: Date.now(),
    user: { login: user?.login ?? 'unknown', name: user?.name ?? '' },
    folders: (folderRows as D1Result<FolderRow>).results.map(toFolder),
    tags: (tagRows as D1Result<TagRow>).results.map(toTag),
  }
}

function concatChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function assertArchiveCanBeRestored(files: readonly MaterializedBackupFile[]): void {
  assertArchiveSizesCanBeRestored(
    files.map((file) => ({ path: file.path, byteLength: file.body.byteLength })),
  )
}

function assertArchiveSizesCanBeRestored(
  files: readonly { path: string; byteLength: number }[],
): void {
  if (files.length > LIMITS.importArchiveEntriesMax) {
    throw ApiError.tooLarge(
      `The complete backup contains ${files.length} files, exceeding the restore limit of ${LIMITS.importArchiveEntriesMax}`,
    )
  }
  const expandedBytes = files.reduce((sum, file) => sum + file.byteLength, 0)
  if (!Number.isSafeInteger(expandedBytes) || expandedBytes > LIMITS.importArchiveExpandedMaxBytes) {
    throw ApiError.tooLarge(
      `Use folder restore when a backup exceeds ${formatBytes(LIMITS.importArchiveExpandedMaxBytes)}`,
    )
  }
  if (estimateZipSizeFromSizes(files) > LIMITS.importUploadMaxBytes) {
    throw ApiError.tooLarge(
      `Use folder restore when a backup exceeds ${formatBytes(LIMITS.importUploadMaxBytes)}`,
    )
  }
}

export function assertBundleCanBeRestored(bundle: Uint8Array): void {
  assertBundleByteLengthCanBeRestored(bundle.byteLength)
}

function assertBundleByteLengthCanBeRestored(byteLength: number): void {
  if (byteLength > LIMITS.importBundleMaxBytes) {
    throw ApiError.tooLarge(
      `The JSON export exceeds ${formatBytes(LIMITS.importBundleMaxBytes)} restore limit`,
    )
  }
}

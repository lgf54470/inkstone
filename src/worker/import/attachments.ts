/** Attachment handling for the import pipeline: dedupe, persist, map and link. */
import type { MarkdownBackupAttachmentEntry } from '@shared/backup-format'
import { LIMITS } from '@shared/constants'
import { validateAttachmentArchivePath } from './zip'
import {
  hasAttachmentStorage,
  readAttachmentObject,
  selectAttachmentStorage,
} from '../attachments/backend'
import { attachmentObjectKey } from '../attachments/keys'
import {
  persistAttachmentWithinQuota,
  rollbackPersistedAttachments,
} from '../attachments/storage'
import type { AppBindings } from '../env'
import { sha256Hex } from '../lib/encoding'
import { isValidId, newId } from '../lib/id'
import { addWarning, formatBytes, isRecord, upsertImportMappings, validTimestamp } from './shared'
import type {
  CreatedImportedAttachment,
  ExistingAttachmentRow,
  ImportContext,
  PreparedAttachmentCandidate,
  PreparedAttachmentImport,
} from './types'

export async function importBackupAttachment(
  env: AppBindings['Bindings'],
  userId: string,
  entry: MarkdownBackupAttachmentEntry,
  bytes: Uint8Array,
  ctx: ImportContext,
): Promise<void> {
  if (entry.size > LIMITS.attachmentMaxBytes) {
    throw new Error(`${entry.filename}: the attachment exceeds ${formatBytes(LIMITS.attachmentMaxBytes)}`)
  }
  if (!selectAttachmentStorage(env)) {
    throw new Error('This instance has no R2 or Workers KV attachment binding and cannot restore attachments')
  }

  const candidate: PreparedAttachmentCandidate = {
    sourceId: entry.sha256,
    sourceNoteId: null,
    filename: entry.filename,
    reportedMime: entry.mime,
    bytes,
    sha256: entry.sha256,
    createdAt: validTimestamp(entry.createdAt) || Date.now(),
  }
  const existing = (await loadExistingAttachments(env.DB, userId, [entry.sha256])).get(entry.sha256)
  if (existing?.user_id === userId && await existingAttachmentMatches(env, existing, candidate)) {
    ctx.result.skippedAttachments++
    return
  }

  const sameContent = await env.DB.prepare(
    `SELECT id, user_id, filename, mime, size, sha256, storage
       FROM attachments
      WHERE user_id = ?1 AND sha256 = ?2
      ORDER BY created_at ASC, id ASC LIMIT 1`,
  ).bind(userId, entry.sha256).first<ExistingAttachmentRow>()
  if (sameContent && await existingAttachmentMatches(env, sameContent, candidate)) {
    await upsertImportMappings(env.DB, userId, 'attachment', [
      { sourceId: entry.sha256, targetId: sameContent.id },
    ])
    ctx.result.skippedAttachments++
    return
  }

  const persisted = await persistAttachmentWithinQuota(env, {
    id: newId(),
    userId,
    noteId: null,
    filename: entry.filename,
    reportedMime: entry.mime,
    bytes,
    createdAt: candidate.createdAt,
  })
  try {
    await upsertImportMappings(env.DB, userId, 'attachment', [
      { sourceId: entry.sha256, targetId: persisted.id },
    ])
  } catch (error) {
    await rollbackPersistedAttachments(env, [persisted]).catch(() => {})
    throw error
  }
  ctx.result.createdAttachments++
}

export async function loadBackupAttachmentTargets(
  db: D1Database,
  userId: string,
  hashes: readonly string[],
): Promise<Map<string, string>> {
  const targets = new Map<string, string>()
  for (let offset = 0; offset < hashes.length; offset += 80) {
    const chunk = hashes.slice(offset, offset + 80)
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(', ')
    const { results } = await db.prepare(
      `SELECT m.source_id, m.target_id FROM import_mappings m
        JOIN attachments a ON a.id = m.target_id AND a.user_id = m.user_id
       WHERE m.user_id = ?1 AND m.entity = 'attachment'
         AND m.source_id IN (${placeholders})`,
    ).bind(userId, ...chunk).all<{ source_id: string; target_id: string }>()
    for (const row of results) targets.set(row.source_id, row.target_id)
  }
  return targets
}

export async function prepareBundleAttachments(
  env: AppBindings['Bindings'],
  userId: string,
  rawAttachments: unknown[],
  ctx: ImportContext,
): Promise<PreparedAttachmentImport> {
  const candidates: PreparedAttachmentCandidate[] = []
  const sourceIds = new Set<string>()
  const paths = new Set<string>()

  for (const raw of rawAttachments) {
    if (!isRecord(raw)) throw new Error('The attachment manifest contains an invalid entry')
    const sourceId = typeof raw.id === 'string' && isValidId(raw.id) ? raw.id : ''
    if (!sourceId) throw new Error('The attachment manifest contains an invalid ID')
    if (sourceIds.has(sourceId)) throw new Error(`The attachment manifest contains a duplicate ID: ${sourceId}`)
    sourceIds.add(sourceId)

    const path = validateAttachmentArchivePath(raw.path, sourceId)
    const pathKey = path.toLowerCase()
    if (paths.has(pathKey)) throw new Error(`The attachment manifest contains a duplicate path: ${path}`)
    paths.add(pathKey)

    const filename = typeof raw.filename === 'string' ? raw.filename : ''
    const reportedMime = typeof raw.mime === 'string' ? raw.mime : ''
    const size = raw.size
    const expectedHash = typeof raw.sha256 === 'string' ? raw.sha256.toLowerCase() : ''
    if (!filename || filename.length > 180) throw new Error(`Invalid attachment filename: ${sourceId}`)
    if (!reportedMime || reportedMime.length > 255) throw new Error(`Invalid attachment type: ${filename}`)
    if (!Number.isSafeInteger(size) || (size as number) < 0 || (size as number) > LIMITS.attachmentMaxBytes) {
      throw new Error(`Invalid attachment size: ${filename}`)
    }
    if (!/^[0-9a-f]{64}$/.test(expectedHash)) throw new Error(`Invalid attachment checksum: ${filename}`)

    const bytes = ctx.attachmentEntries?.get(pathKey)
    if (!bytes) {
      ctx.result.skippedAttachments++
      addWarning(ctx.result, `${filename}: attachment bytes are missing from the backup and were not restored`)
      continue
    }
    if (bytes.byteLength !== size) throw new Error(`Attachment length verification failed: ${filename}`)
    if ((await sha256Hex(bytes)) !== expectedHash) throw new Error(`Attachment SHA-256 verification failed: ${filename}`)

    candidates.push({
      sourceId,
      sourceNoteId:
        typeof raw.noteId === 'string' && isValidId(raw.noteId) ? raw.noteId : null,
      filename,
      reportedMime,
      bytes,
      sha256: expectedHash,
      createdAt: validTimestamp(raw.createdAt) || Date.now(),
    })
  }

  if (!candidates.length) return { idMap: new Map(), created: [] }
  if (!selectAttachmentStorage(env)) {
    throw new Error('This instance has no R2 or Workers KV attachment binding and cannot restore attachments')
  }

  const existingAttachments = await loadExistingAttachments(
    env.DB,
    userId,
    candidates.map((candidate) => candidate.sourceId),
  )
  const pendingCleanupIds = await loadPendingAttachmentCleanupIds(
    env.DB,
    userId,
    candidates.map((candidate) => candidate.sourceId),
  )
  const idMap = new Map<string, string>()
  const created: CreatedImportedAttachment[] = []
  const reservedIds = new Set([...existingAttachments.values()].map((attachment) => attachment.id))

  try {
    for (const candidate of candidates) {
      const existing = existingAttachments.get(candidate.sourceId)
      if (existing?.user_id === userId) {
        const matches = await existingAttachmentMatches(env, existing, candidate)
        if (matches) {
          idMap.set(candidate.sourceId, existing.id)
          ctx.result.skippedAttachments++
          continue
        }
        addWarning(ctx.result, `${candidate.filename}: an existing attachment with this ID has different content, so a new attachment was restored`)
      }

      const pendingOldObject = pendingCleanupIds.has(candidate.sourceId)
      let destinationId = existing || pendingOldObject ? newId() : candidate.sourceId
      if (!existing && pendingOldObject) {
        addWarning(ctx.result, `${candidate.filename}: restored with a new internal ID while old attachment bytes await cleanup`)
      }
      while (
        reservedIds.has(destinationId) ||
        (destinationId !== candidate.sourceId && sourceIds.has(destinationId))
      ) {
        destinationId = newId()
      }
      reservedIds.add(destinationId)
      idMap.set(candidate.sourceId, destinationId)

      const persisted = await persistAttachmentWithinQuota(env, {
        id: destinationId,
        userId,
        noteId: null,
        filename: candidate.filename,
        reportedMime: candidate.reportedMime,
        bytes: candidate.bytes,
        createdAt: candidate.createdAt,
      })
      created.push({
        sourceId: candidate.sourceId,
        sourceNoteId: candidate.sourceNoteId,
        persisted,
      })
    }
    await upsertImportMappings(
      env.DB,
      userId,
      'attachment',
      created.map((entry) => ({ sourceId: entry.sourceId, targetId: entry.persisted.id })),
    )
  } catch (error) {
    await rollbackPersistedAttachments(
      env,
      created.map((entry) => entry.persisted),
    ).catch((rollbackError) => {
      console.warn('[inkstone] Attachment import rollback was incomplete; the cleanup queue will continue:', rollbackError)
    })
    throw error
  }

  ctx.result.createdAttachments += created.length
  return { idMap, created }
}

async function loadExistingAttachments(
  db: D1Database,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, ExistingAttachmentRow>> {
  const attachments = new Map<string, ExistingAttachmentRow>()
  for (let offset = 0; offset < ids.length; offset += 80) {
    const chunk = ids.slice(offset, offset + 80)
    const placeholders = chunk.map((_, index) => `?${index + 2}`).join(', ')
    const { results: mappedRows } = await db.prepare(
      `SELECT m.source_id, a.id, a.user_id, a.filename, a.mime, a.size, a.sha256, a.storage
         FROM import_mappings m
         JOIN attachments a ON a.id = m.target_id AND a.user_id = m.user_id
        WHERE m.user_id = ?1 AND m.entity = 'attachment'
          AND m.source_id IN (${placeholders})`,
    )
      .bind(userId, ...chunk)
      .all<ExistingAttachmentRow & { source_id: string }>()
    const mapped = new Map(mappedRows.map((row) => [row.source_id, row]))

    const directPlaceholders = chunk.map((_, index) => `?${index + 1}`).join(', ')
    const { results: directRows } = await db.prepare(
      `SELECT id, user_id, filename, mime, size, sha256, storage
         FROM attachments WHERE id IN (${directPlaceholders})`,
    )
      .bind(...chunk)
      .all<ExistingAttachmentRow>()
    const direct = new Map(directRows.map((row) => [row.id, row]))

    for (const sourceId of chunk) {
      const row = mapped.get(sourceId) ?? direct.get(sourceId)
      if (row) attachments.set(sourceId, row)
    }
  }
  return attachments
}

async function loadPendingAttachmentCleanupIds(
  db: D1Database,
  userId: string,
  sourceIds: readonly string[],
): Promise<Set<string>> {
  const prefixes = [`r2:${userId}/`, `kv:${userId}/`]
  const ids = new Set<string>()
  if (!sourceIds.length) return ids
  const { results } = await db.prepare(
    `SELECT object_key FROM attachment_cleanup
      WHERE user_id = ?1
        AND substr(object_key, 4, length(?1) + 1) = ?1 || '/'
        AND substr(object_key, length(?1) + 5, 26) IN (
          SELECT value FROM json_each(?2)
        )
        AND substr(object_key, length(?1) + 31, 1) = '.'`,
  ).bind(userId, JSON.stringify(sourceIds)).all<{ object_key: string }>()
  for (const row of results) {
    const prefix = prefixes.find((candidate) => row.object_key.startsWith(candidate))
    if (!prefix) continue
    const filename = row.object_key.slice(prefix.length)
    const separator = filename.indexOf('.')
    const id = separator > 0 ? filename.slice(0, separator) : ''
    if (isValidId(id)) ids.add(id)
  }
  return ids
}

export async function existingAttachmentMatches(
  env: AppBindings['Bindings'],
  row: ExistingAttachmentRow,
  candidate: PreparedAttachmentCandidate,
): Promise<boolean> {
  if (row.size !== candidate.bytes.byteLength || row.sha256 !== candidate.sha256) return false
  if (!hasAttachmentStorage(env, row.storage)) return false
  const bytes = await readAttachmentObject(env, row.storage, attachmentObjectKey(row))
  if (!bytes) return false
  return bytes.byteLength === candidate.bytes.byteLength &&
    (await sha256Hex(bytes)) === candidate.sha256
}

export async function linkImportedAttachments(
  db: D1Database,
  userId: string,
  created: readonly CreatedImportedAttachment[],
  noteIdMap: ReadonlyMap<string, string>,
): Promise<void> {
  for (let offset = 0; offset < created.length; offset += 100) {
    await db.batch(
      created.slice(offset, offset + 100).map((entry) =>
        db.prepare(
          `UPDATE attachments SET note_id = ?1 WHERE id = ?2 AND user_id = ?3`,
        ).bind(
          entry.sourceNoteId ? noteIdMap.get(entry.sourceNoteId) ?? null : null,
          entry.persisted.id,
          userId,
        ),
      ),
    )
  }
}

export function rewriteAttachmentReferences(content: string, idMap: ReadonlyMap<string, string>): string {
  if (!idMap.size) return content
  return content.replace(
    /(\/api\/files\/)([0-9a-hjkmnp-tv-z]{26})(?=$|[?#)\]>'"\s])/g,
    (match, prefix: string, sourceId: string) => {
      const destinationId = idMap.get(sourceId)
      return destinationId ? `${prefix}${destinationId}` : match
    },
  )}

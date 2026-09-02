/** Inkstone export-bundle import: folders, notes, tags and attachments restored from an export JSON. */
import { LIMITS } from '@shared/constants'
import { organizerColorOrNull } from '@shared/organizer-colors'
import { truncateText } from '@shared/text-utils'
import type { ExportBundle } from '@shared/types'
import type { AppBindings } from '../env'
import { isValidId, newId } from '../lib/id'
import { assertContentSize } from '../lib/request'
import {
  linkImportedAttachments,
  prepareBundleAttachments,
  rewriteAttachmentReferences,
} from './attachments'
import { ensureFolderPath } from './folders'
import { insertNote, loadExistingNoteIndex, updateImportedNote } from './notes'
import { addWarning, finiteNumber, importedBundleTitle, isRecord, normalizeFolderSegment, sourceKey, validTimestamp } from './shared'
import type { ImportContext, InsertInput, SourceFolder } from './types'

const EXPORT_FORMAT = 'inkstone-export'

export async function importBundle(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  raw: unknown,
  ctx: ImportContext,
): Promise<void> {
  const bundle = raw as ExportBundle
  if (
    bundle?.format !== EXPORT_FORMAT ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.notes)
  ) {
    throw new Error('This is not a valid Inkstone export')
  }
  if (bundle.notes.length > LIMITS.importArchiveEntriesMax * 4) {
    throw new Error(`A single import supports at most ${LIMITS.importArchiveEntriesMax * 4} notes`)
  }

  const rawFolders = Array.isArray(bundle.folders) ? bundle.folders : []
  if (rawFolders.length > LIMITS.importArchiveEntriesMax) {
    throw new Error(`A single import supports at most ${LIMITS.importArchiveEntriesMax} folders`)
  }
  const rawTags = Array.isArray(bundle.tags) ? bundle.tags : []
  if (rawTags.length > LIMITS.importArchiveEntriesMax * 2) {
    throw new Error(`A single import supports at most ${LIMITS.importArchiveEntriesMax * 2} tags`)
  }
  const rawAttachments = Array.isArray(bundle.attachments) ? bundle.attachments : []
  if (rawAttachments.length > LIMITS.importArchiveEntriesMax) {
    throw new Error(`A single import supports at most ${LIMITS.importArchiveEntriesMax} attachments`)
  }
  const folders: SourceFolder[] = []
  const sourceFolderIds = new Set<string>()
  for (const rawFolder of rawFolders) {
    if (!isRecord(rawFolder)) continue
    const id = sourceKey(rawFolder.id)
    const name = typeof rawFolder.name === 'string' ? normalizeFolderSegment(rawFolder.name) : ''
    if (!id || !name) continue
    if (sourceFolderIds.has(id)) {
      addWarning(ctx.result, `The export contains a duplicate folder ID: ${id}`)
      continue
    }
    sourceFolderIds.add(id)
    folders.push({
      id,
      name,
      parentId: sourceKey(rawFolder.parentId) ?? null,
      icon: typeof rawFolder.icon === 'string' ? truncateText(rawFolder.icon, 8) || null : null,
      color: organizerColorOrNull(rawFolder.color),
      position: finiteNumber(rawFolder.position),
      createdAt: validTimestamp(rawFolder.createdAt),
      updatedAt: validTimestamp(rawFolder.updatedAt),
    })
  }

  const folderIdMap = new Map<string, string>()
  const sourceFolders = new Map(folders.map((folder) => [folder.id, folder]))
  const pathCache = new Map<string, { path: string; depth: number } | null>()
  const visiting = new Set<string>()
  const pathOf = (id: string): { path: string; depth: number } | null => {
    if (pathCache.has(id)) return pathCache.get(id) ?? null
    const folder = sourceFolders.get(id)
    if (!folder) return null
    if (visiting.has(id)) {
      addWarning(ctx.result, `Skipped folder with a cyclic hierarchy: ${folder.name}`)
      pathCache.set(id, null)
      return null
    }

    visiting.add(id)
    let parent: { path: string; depth: number } | null = null
    if (folder.parentId) {
      if (sourceFolders.has(folder.parentId)) {
        parent = pathOf(folder.parentId)
        if (!parent) {
          visiting.delete(id)
          pathCache.set(id, null)
          return null
        }
      } else {
        addWarning(ctx.result, `Folder ${folder.name} has a missing parent and was moved to the root`)
      }
    }
    const depth = (parent?.depth ?? 0) + 1
    if (depth > LIMITS.folderDepthMax) {
      addWarning(ctx.result, `Skipped folder deeper than ${LIMITS.folderDepthMax} levels: ${folder.name}`)
      visiting.delete(id)
      pathCache.set(id, null)
      return null
    }
    const resolved = {
      path: parent ? `${parent.path}/${folder.name}` : folder.name,
      depth,
    }
    visiting.delete(id)
    pathCache.set(id, resolved)
    return resolved
  }
  const resolvedFolders = folders
    .map((folder) => ({ folder, resolved: pathOf(folder.id) }))
    .filter((entry): entry is { folder: SourceFolder; resolved: { path: string; depth: number } } =>
      entry.resolved !== null)
    .sort((a, b) => a.resolved.depth - b.resolved.depth)

  const importedAttachments = await prepareBundleAttachments(
    c.env,
    userId,
    rawAttachments,
    ctx,
  )

  for (const { folder, resolved } of resolvedFolders) {
    const created = await ensureFolderPath(c.env.DB, userId, resolved.path, ctx, folder)
    if (created) folderIdMap.set(folder.id, created)
  }

  const noteIdMap = new Map<string, string>()

  try {
    for (const note of bundle.notes) {
      if (typeof note?.content !== 'string') continue
      const content = rewriteAttachmentReferences(note.content, importedAttachments.idMap)
      try {
        assertContentSize(content)
      } catch (err) {
        ctx.result.skippedNotes++
        addWarning(
          ctx.result,
          `${typeof note.title === 'string' ? note.title : "Untitled note"}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        continue
      }

      const noteTitle = importedBundleTitle(note.title, content)
      const sourceId = isValidId(note.id) ? note.id : undefined
      const importedCreatedAt = validTimestamp(note.createdAt)
      const importedUpdatedAt = validTimestamp(note.updatedAt)
      const importedDeletedAt = validTimestamp(note.deletedAt)
      const effectiveUpdatedAt = Math.max(
        importedUpdatedAt || importedCreatedAt,
        importedDeletedAt,
      )
      const existing = sourceId
        ? await loadExistingNoteIndex(c.env.DB, userId, sourceId, ctx)
        : null
      const sourceFolderId = sourceKey(note.folderId)
      const input: InsertInput = {
        id: sourceId,
        content,
        title: noteTitle,
        folderId: sourceFolderId ? (folderIdMap.get(sourceFolderId) ?? null) : null,
        isStarred: note.isStarred,
        isPinned: note.isPinned,
        isArchived: note.isArchived,
        position: finiteNumber(note.position),
        createdAt: importedCreatedAt,
        updatedAt: effectiveUpdatedAt,
        deletedAt: importedDeletedAt || undefined,
      }

      if (existing) {
        if (ctx.conflict === 'skip') {
          if (sourceId) noteIdMap.set(sourceId, existing.id)
          ctx.result.skippedNotes++
          continue
        }
        if (ctx.conflict === 'duplicate') {
          const duplicatedId = await insertNote(
            c,
            userId,
            { ...input, id: undefined, title: `${noteTitle} (imported)` },
            ctx,
          )
          if (sourceId) noteIdMap.set(sourceId, duplicatedId)
          ctx.result.createdNotes++
          continue
        }

        const outcome = await updateImportedNote(
          c,
          userId,
          existing,
          input,
          effectiveUpdatedAt,
          ctx,
        )
        if (outcome === 'updated') {
          if (sourceId) noteIdMap.set(sourceId, existing.id)
          ctx.result.updatedNotes++
          continue
        }
        if (outcome === 'skipped' || outcome === 'conflict') {
          if (sourceId) noteIdMap.set(sourceId, existing.id)
          ctx.result.skippedNotes++
          if (outcome === 'conflict') {
            addWarning(ctx.result, `${noteTitle}: the note changed during import, so the current version was kept`)
          }
          continue
        }
      }

      const insertedId = await insertNote(c, userId, input, ctx)
      if (sourceId) noteIdMap.set(sourceId, insertedId)
      if (sourceId) {
        ctx.byId?.set(sourceId, {
          id: insertedId,
          title: noteTitle,
          rev: 1,
          updated_at: effectiveUpdatedAt,
        })
      }
      ctx.result.createdNotes++
    }
  } finally {
    await linkImportedAttachments(c.env.DB, userId, importedAttachments.created, noteIdMap)
  }

  await restoreTagMetadata(c.env.DB, userId, rawTags)
}

async function restoreTagMetadata(
  db: D1Database,
  userId: string,
  rawTags: unknown[],
): Promise<void> {
  const byName = new Map<string, { id: string; name: string; color: string | null }>()
  for (const raw of rawTags) {
    if (!isRecord(raw) || typeof raw.name !== 'string') continue
    const name = raw.name.trim().replace(/^#+/, '')
    if (!name || name.length > LIMITS.tagNameMaxLength || /[\s#]/.test(name)) continue
    byName.set(name.toLocaleLowerCase(), {
      id: newId(),
      name,
      color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color.trim())
        ? raw.color.trim()
        : null,
    })
  }
  if (!byName.size) return

  const rows = JSON.stringify([...byName.values()])
  const now = Date.now()
  await db.batch([
    db.prepare(
      `INSERT INTO tags (id, user_id, name, color, is_manual, created_at)
       SELECT json_extract(j.value, '$.id'), ?2,
              json_extract(j.value, '$.name'), json_extract(j.value, '$.color'), 1, ?3
         FROM json_each(?1) AS j
        WHERE NOT EXISTS (
          SELECT 1 FROM tags existing
           WHERE existing.user_id = ?2
             AND existing.name = json_extract(j.value, '$.name') COLLATE NOCASE
        )`,
    ).bind(rows, userId, now),
    db.prepare(
      `UPDATE tags SET
         color = COALESCE(color, (
           SELECT json_extract(j.value, '$.color') FROM json_each(?1) AS j
            WHERE json_extract(j.value, '$.name') = tags.name COLLATE NOCASE LIMIT 1
         )),
         is_manual = 1
       WHERE user_id = ?2 AND EXISTS (
         SELECT 1 FROM json_each(?1) AS j
          WHERE json_extract(j.value, '$.name') = tags.name COLLATE NOCASE
       )`,
    ).bind(rows, userId),
    db.prepare(
      `INSERT INTO changes (user_id, entity, entity_id, op, at)
       SELECT ?1, 'tag', t.id, 'upsert', ?2
         FROM tags t JOIN json_each(?3) AS j
           ON json_extract(j.value, '$.name') = t.name COLLATE NOCASE
        WHERE t.user_id = ?1`,
    ).bind(userId, now, rows),
  ])
}
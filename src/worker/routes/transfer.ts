import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { MarkdownBackupManifest } from '@shared/backup-format'
import { readZip, type ReadZipOptions, type UnzippedEntry } from '@shared/zip'
import { pruneOrphanTags } from '../db/writes'
import { createBackupArchive } from '../backup/archive'
import {
  assertBundleCanBeRestored,
  buildJsonExport,
  buildSnapshot,
  formatStamp,
} from '../backup/snapshot'
import type { AppBindings } from '../env'
import { ApiError } from '../lib/errors'
import { acquireLease } from '../lib/lease'
import { broadcastCursor, scheduleFtsDrain } from '../lib/notify'
import { buildObsidianAssetIndex } from '../lib/obsidian-import'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../lib/request'
import { requireAuth } from '../middleware/auth'
import { importBackupFileBatch, parsePostedBackupManifest, parsePostedBackupPaths } from '../import/backup'
import { importBundle } from '../import/bundle'
import { primeFolderCache } from '../import/folders'
import { importMarkdown } from '../import/markdown'
import type { ImportContext, SelectedImportFile } from '../import/types'
import {
  addWarning,
  formatBytes,
  parseImportConflict,
} from '../import/shared'
import {
  collectAttachmentArchivePaths,
  isBackupControlPath,
  isExportBundlePath,
  isImportableEntryPath,
  isInkstoneBackupManifest,
  isMarkdownBackupControlPath,
  isMarkdownPath,
  mapBundleAttachmentEntries,
  selectCompleteZipBackup,
} from '../import/zip'

export const transferRoutes = new Hono<AppBindings>()

transferRoutes.use('/export', requireAuth)
transferRoutes.use('/import', requireAuth)
transferRoutes.use('/import', async (c, next) => {
  const release = await acquireLease(
    c.env.DB,
    `import_lock:${c.get('userId')}`,
    15 * 60 * 1000,
    'An import is already running. Try again later',
  )

  try {
    await next()
  } finally {
    await release()
  }
})


transferRoutes.get('/export', async (c) => {
  const userId = c.get('userId')
  const release = await acquireLease(
    c.env.DB,
    `snapshot_lock:${userId}`,
    15 * 60 * 1000,
    'A backup or export is already running. Try again later',
  )
  try {
    const format = c.req.query('format') === 'json' ? 'json' : 'zip'

    if (format === 'json') {
      const bundle = await buildJsonExport(c.env, userId)
      assertBundleCanBeRestored(bundle)
      return new Response(bundle as BodyInit, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="inkstone-export-${formatStamp(new Date())}.json"`,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const snapshot = await buildSnapshot(c.env, userId)
    const archive = createBackupArchive(snapshot)
    const fixed = new FixedLengthStream(archive.byteLength)
    void archive.stream.pipeTo(fixed.writable).catch((error) => {
      console.error('[inkstone] Streaming ZIP export failed:', error)
    })
    return new Response(fixed.readable as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } finally {
    await release()
  }
})


transferRoutes.post('/import', async (c) => {
  const userId = c.get('userId')
  const { ftsEnabled } = c.get('database')
  const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.import)
  const conflict = parseImportConflict(form.get('conflict'))
  const files = collectPostedImportFiles(form)
  const backupManifest = parsePostedBackupManifest(form.get('backupManifest'))
  const selectedFiles = mapPostedImportFiles(files, form)

  const ctx: ImportContext = {
    conflict,
    byId: new Map(),
    folderCache: new Map(),
    result: {
      createdNotes: 0,
      updatedNotes: 0,
      skippedNotes: 0,
      createdFolders: 0,
      createdAttachments: 0,
      skippedAttachments: 0,
      warnings: [],
    },
    ftsEnabled,
  }
  if (!backupManifest || backupManifest.notes.length) {
    await primeFolderCache(c.env.DB, userId, ctx.folderCache)
  }

  if (backupManifest) {
    await restorePostedBackup(c, userId, selectedFiles, backupManifest, ctx)
    if (backupManifest.notes.length) {
      await pruneOrphanTags(c.env.DB, userId)
      await broadcastCursor(c)
      scheduleFtsDrain(c, 20)
    }
    return c.json(ctx.result)
  }

  for (const selected of selectedFiles) {
    await importSelectedFile(c, userId, selected, ctx)
  }
  await pruneOrphanTags(c.env.DB, userId)
  await broadcastCursor(c)
  scheduleFtsDrain(c, 20)
  return c.json(ctx.result)
})
function collectPostedImportFiles(form: FormData): File[] {
  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (!files.length) throw ApiError.badRequest('No files were selected')
  if (files.length > LIMITS.importFilesMax) {
    throw ApiError.badRequest(`Import at most ${LIMITS.importFilesMax} files`)
  }
  const uploadBytes = files.reduce((sum, file) => sum + file.size, 0)
  if (
    !Number.isSafeInteger(uploadBytes) ||
    uploadBytes > LIMITS.importUploadMaxBytes ||
    files.some((file) => file.size > LIMITS.importUploadMaxBytes)
  ) {
    throw ApiError.tooLarge(`A single import cannot exceed ${formatBytes(LIMITS.importUploadMaxBytes)}`)
  }
  return files
}

function mapPostedImportFiles(files: readonly File[], form: FormData): SelectedImportFile[] {
  const backupPaths = parsePostedBackupPaths(form.get('backupPaths'), files.length)
  return files.map((file, index) => ({
    file,
    path: backupPaths?.[index] ?? file.name,
  }))
}

async function restorePostedBackup(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: readonly SelectedImportFile[],
  manifest: MarkdownBackupManifest,
  ctx: ImportContext,
): Promise<void> {
  try {
    await importBackupFileBatch(c, userId, selected, manifest, ctx)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw ApiError.badRequest(error instanceof Error ? error.message : String(error))
  }
}

async function importSelectedFile(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: SelectedImportFile,
  ctx: ImportContext,
): Promise<void> {
  const name = selected.path.toLowerCase()
  if (name.endsWith('.zip')) {
    await importZipArchive(c, userId, selected, ctx)
    return
  }
  try {
    if (name.endsWith('.json')) {
      await importBundleFile(c, userId, selected, ctx)
    } else if (/\.(md|markdown|txt)$/i.test(name)) {
      await importTextNoteFile(c, userId, selected, ctx)
    } else {
      addWarning(ctx.result, `Skipped unsupported file: ${selected.path}`)
    }
  } catch (err) {
    addWarning(ctx.result, `${selected.path}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function importBundleFile(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: SelectedImportFile,
  ctx: ImportContext,
): Promise<void> {
  if (selected.file.size > LIMITS.importBundleMaxBytes) {
    throw new Error(`The export file cannot exceed ${formatBytes(LIMITS.importBundleMaxBytes)}`)
  }
  await importBundle(c, userId, JSON.parse(await selected.file.text()), ctx)
}

async function importTextNoteFile(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: SelectedImportFile,
  ctx: ImportContext,
): Promise<void> {
  if (selected.file.size > LIMITS.contentMaxBytes) {
    throw new Error(`Note content cannot exceed ${formatBytes(LIMITS.contentMaxBytes)}`)
  }
  await importMarkdown(c, userId, selected.path, await selected.file.text(), ctx)
}

async function importZipArchive(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  selected: SelectedImportFile,
  ctx: ImportContext,
): Promise<void> {
  let isStrictBackup = false
  try {
    const bytes = new Uint8Array(await selected.file.arrayBuffer())
    const zipOptions = {
      maxEntries: LIMITS.importArchiveEntriesMax,
      maxEntryBytes: LIMITS.importArchiveExpandedMaxBytes,
      maxTotalBytes: LIMITS.importArchiveExpandedMaxBytes,
    }
    const controls = await readZip(bytes, {
      ...zipOptions,
      maxEntryBytes: LIMITS.importUploadMaxBytes,
      maxTotalBytes: LIMITS.importUploadMaxBytes + 1024,
      include: isBackupControlPath,
    })
    isStrictBackup = controls.some((entry) =>
      isMarkdownBackupControlPath(entry.path) || isInkstoneBackupManifest(entry),
    )
    const backup = await selectCompleteZipBackup(controls)
    if (isStrictBackup && !backup) {
      throw new Error('The Inkstone backup ZIP is missing a valid manifest or COMPLETE marker')
    }
    if (backup) {
      await restoreZipBackup(c, userId, bytes, backup, zipOptions, ctx)
      return
    }

    const bundles = controls.filter((entry) => isExportBundlePath(entry.path))
    const bundleEntry = bundles[0]
    if (bundles.length > 1) {
      throw new Error('The ZIP contains multiple inkstone-export.json files and is ambiguous')
    }
    if (bundleEntry) {
      await restoreZipBundleExport(c, userId, bytes, bundleEntry, zipOptions, ctx)
      return
    }
    await restoreZipMarkdownNotes(c, userId, bytes, zipOptions, ctx)
  } catch (err) {
    if (!isStrictBackup) {
      addWarning(ctx.result, `${selected.path}: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (err instanceof ApiError) throw err
    throw ApiError.badRequest(
      `${selected.path}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

async function restoreZipBackup(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  bytes: Uint8Array,
  backup: NonNullable<Awaited<ReturnType<typeof selectCompleteZipBackup>>>,
  zipOptions: ReadZipOptions,
  ctx: ImportContext,
): Promise<void> {
  if (backup.warning) addWarning(ctx.result, backup.warning)
  const expected = new Set(
    [...backup.manifest.notes, ...backup.manifest.attachments]
      .map((entry) => `${backup.rootPrefix}${entry.path}`.toLowerCase()),
  )
  const entries = await readZip(bytes, {
    ...zipOptions,
    maxEntryBytes: LIMITS.importUploadMaxBytes,
    include: (path) => expected.has(path.toLowerCase()),
  })
  if (entries.length !== expected.size) throw new Error('The backup ZIP is missing one or more files')
  await importBackupFileBatch(
    c,
    userId,
    entries.map((entry) => ({
      file: new File([entry.data], entry.path.split('/').at(-1) ?? 'file'),
      path: entry.path.slice(backup.rootPrefix.length),
    })),
    backup.manifest,
    ctx,
  )
}

async function restoreZipBundleExport(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  bytes: Uint8Array,
  bundleEntry: UnzippedEntry,
  zipOptions: ReadZipOptions,
  ctx: ImportContext,
): Promise<void> {
  const rawBundle = JSON.parse(new TextDecoder().decode(bundleEntry.data)) as unknown
  const expectedAttachmentPaths = collectAttachmentArchivePaths(rawBundle, bundleEntry.path)
  const attachmentEntries = expectedAttachmentPaths.size
    ? await readZip(bytes, {
        ...zipOptions,
        maxEntryBytes: LIMITS.attachmentMaxBytes,
        include: (path) => expectedAttachmentPaths.has(path.toLowerCase()),
      })
    : []
  await importBundle(c, userId, rawBundle, {
    ...ctx,
    attachmentEntries: mapBundleAttachmentEntries(
      attachmentEntries,
      bundleEntry.path,
    ),
  })
}

async function restoreZipMarkdownNotes(
  c: { env: AppBindings['Bindings'] },
  userId: string,
  bytes: Uint8Array,
  zipOptions: ReadZipOptions,
  ctx: ImportContext,
): Promise<void> {
  const entries = await readZip(bytes, {
    ...zipOptions,
    maxEntryBytes: LIMITS.attachmentMaxBytes,
    include: isImportableEntryPath,
  })
  const assets = buildObsidianAssetIndex(entries.filter((entry) => !isMarkdownPath(entry.path)))
  for (const entry of entries) {
    if (!isMarkdownPath(entry.path)) continue
    await importMarkdown(c, userId, entry.path, new TextDecoder().decode(entry.data), {
      ...ctx,
      assets,
    })
  }
}

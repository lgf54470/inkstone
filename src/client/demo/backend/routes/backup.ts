import { Hono } from 'hono'
import type { DemoState } from '../../state'
import { LIMITS } from '@shared/constants'
import { deriveTitle } from '@shared/markdown-utils'
import type { BackupRun, BackupTarget, BackupTargetConfig, BackupTargetInput, BackupTargetPatchInput, ImportResult } from '@shared/types'
import { readZip } from '@shared/zip'
import { errorMessage } from '../../../lib/errors'
import { newDemoId } from '../../state'
import { jsonBody, apiError } from '../helpers/info'
import { createBackupTarget, demoBackupConfig, demoBackupTargetError, hasDemoBackupSecret } from '../helpers/backup'
import { exportResponse, importBundle, createImportedNote } from '../helpers/transfer'

export function registerBackupRoutes(app: Hono, state: DemoState): void {
  app.get('/api/backup/targets', (c) => c.json({ targets: [...state.backupTargets.values()] }))
  app.post('/api/backup/targets', async (c) => {
    if (state.backupTargets.size >= LIMITS.backupTargetsMax) {
      return apiError(409, 'conflict', `Each account can configure at most ${LIMITS.backupTargetsMax} backup targets`)
    }
    const input = await jsonBody(c.req.raw) as unknown as BackupTargetInput
    const invalid = demoBackupTargetError(input, true)
    if (invalid) return apiError(400, 'bad_request', invalid)
    const target = createBackupTarget(input)
    state.backupTargets.set(target.id, target)
    return c.json(target, 201)
  })
  app.patch('/api/backup/targets/:id', async (c) => {
    const current = state.backupTargets.get(c.req.param('id'))
    if (!current) return apiError(404, 'not_found', 'Backup target not found')
    const input = await jsonBody(c.req.raw) as unknown as BackupTargetPatchInput
    if (
      input.expectedUpdatedAt !== undefined &&
      (!Number.isSafeInteger(input.expectedUpdatedAt) || input.expectedUpdatedAt < 0)
    ) {
      return apiError(400, 'bad_request', 'expectedUpdatedAt must be a non-negative integer')
    }
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== current.updatedAt) {
      return apiError(409, 'conflict', 'The backup target changed elsewhere. Refresh and try again')
    }
    const changedType = input.type !== undefined && input.type !== current.type
    const mergedInput: BackupTargetInput = {
      type: input.type ?? current.type,
      name: input.name ?? current.name,
      enabled: input.enabled ?? current.enabled,
      config: input.config
        ? ({ ...current.config, ...input.config } as BackupTargetConfig)
        : current.config,
      secret: input.secret,
    }
    const invalid = demoBackupTargetError(mergedInput, changedType)
    if (invalid) return apiError(400, 'bad_request', invalid)
    const updated: BackupTarget = {
      ...current,
      type: mergedInput.type,
      name: mergedInput.name.trim(),
      enabled: mergedInput.enabled ?? true,
      config: demoBackupConfig(mergedInput),
      hasSecret: current.hasSecret || hasDemoBackupSecret(mergedInput.type, input.secret),
      updatedAt: Math.max(Date.now(), current.updatedAt + 1),
    }
    state.backupTargets.set(updated.id, updated)
    return c.json(updated)
  })
  app.delete('/api/backup/targets/:id', (c) => {
    if (!state.backupTargets.delete(c.req.param('id'))) {
      return apiError(404, 'not_found', 'Backup target not found')
    }
    return c.json({ ok: true as const })
  })
  app.post('/api/backup/test', async (c) => {
    const input = await jsonBody(c.req.raw) as unknown as BackupTargetInput
    const invalid = demoBackupTargetError(input, true)
    return invalid
      ? apiError(400, 'bad_request', invalid)
      : c.json({ ok: true, message: 'Demo connection succeeded', latencyMs: 24 })
  })
  app.post('/api/backup/targets/:id/test', async (c) => {
    const current = state.backupTargets.get(c.req.param('id'))
    if (!current) return apiError(404, 'not_found', 'Backup target not found')
    const input = await jsonBody(c.req.raw) as unknown as BackupTargetPatchInput
    const changedType = input.type !== undefined && input.type !== current.type
    const mergedInput: BackupTargetInput = {
      type: input.type ?? current.type,
      name: input.name ?? current.name,
      enabled: input.enabled ?? current.enabled,
      config: input.config
        ? ({ ...current.config, ...input.config } as BackupTargetConfig)
        : current.config,
      secret: input.secret,
    }
    const invalid = demoBackupTargetError(mergedInput, changedType || !current.hasSecret)
    return invalid
      ? apiError(400, 'bad_request', invalid)
      : c.json({ ok: true, message: 'Demo connection succeeded', latencyMs: 18 })
  })
  app.post('/api/backup/run', async (c) => {
    const body = await jsonBody(c.req.raw)
    if (
      body.targetIds !== undefined &&
      (!Array.isArray(body.targetIds) ||
        body.targetIds.some((id) => typeof id !== 'string' || !/^[0-9a-hjkmnp-tv-z]{26}$/.test(id)))
    ) {
      return apiError(400, 'bad_request', 'targetIds must be an array of valid backup target IDs')
    }
    const selected = Array.isArray(body.targetIds)
      ? body.targetIds as string[]
      : [...state.backupTargets.keys()]
    const targets = [...new Set(selected)]
      .map((id) => state.backupTargets.get(id))
      .filter((item): item is BackupTarget => Boolean(item?.enabled))
    const startedAt = Date.now()
    const results = targets.map((target) => ({
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
      ok: true,
      files: state.notes.size + state.attachments.size,
      bytes: [...state.notes.values()].reduce((total, note) => total + note.content.length, 0),
      ms: 40,
      error: null,
    }))
    const run: BackupRun = {
      id: newDemoId(),
      trigger: 'manual' as const,
      status: targets.length ? 'success' : 'failed',
      startedAt,
      finishedAt: Date.now(),
      noteCount: targets.length ? state.notes.size : 0,
      fileCount: results.reduce((total, result) => total + result.files, 0),
      bytes: results.reduce((total, result) => total + result.bytes, 0),
      results,
    }
    state.backupRuns.unshift(run)
    state.backupRuns.splice(LIMITS.backupRunsKept)
    return c.json(run)
  })
  app.get('/api/backup/runs', (c) => c.json({ runs: state.backupRuns }))

  app.get('/api/export', (c) => exportResponse(state, c.req.query('format') === 'json' ? 'json' : 'zip'))
  app.post('/api/import', async (c) => {
    const form = await c.req.raw.formData()
    const files = form.getAll('file').filter((value): value is File => value instanceof File)
    if (files.length > LIMITS.importFilesMax) {
      return apiError(413, 'payload_too_large', `The import cannot contain more than ${LIMITS.importFilesMax} files`)
    }
    if (files.reduce((total, file) => total + file.size, 0) > LIMITS.importUploadMaxBytes) {
      return apiError(413, 'payload_too_large', 'The import upload cannot exceed 64 MB')
    }
    const result: ImportResult = {
      createdNotes: 0,
      updatedNotes: 0,
      skippedNotes: 0,
      createdFolders: 0,
      createdAttachments: 0,
      skippedAttachments: 0,
      warnings: [],
    }
    for (const value of files) {
      try {
        if (value.name.toLowerCase().endsWith('.zip')) {
          const entries = await readZip(new Uint8Array(await value.arrayBuffer()), {
            maxEntries: LIMITS.importArchiveEntriesMax,
            maxEntryBytes: LIMITS.importArchiveExpandedMaxBytes,
            maxTotalBytes: LIMITS.importArchiveExpandedMaxBytes,
          })
          const bundleEntry = entries.find((entry) => entry.path.endsWith('inkstone-export.json'))
          if (!bundleEntry) throw new Error('The ZIP does not contain an Inkstone export')
          await importBundle(
            state,
            JSON.parse(new TextDecoder().decode(bundleEntry.data)),
            result,
            new Map(entries.map((entry) => [entry.path.toLocaleLowerCase(), entry.data])),
          )
        } else if (value.name.toLowerCase().endsWith('.json')) {
          if (value.size > LIMITS.importBundleMaxBytes) {
            throw new Error('The export file cannot exceed 32 MB')
          }
          await importBundle(state, JSON.parse(await value.text()), result)
        } else {
          if (value.size > LIMITS.contentMaxBytes) {
            throw new Error('A note file cannot exceed 2 MB')
          }
          const content = await value.text()
          createImportedNote(state, content, deriveTitle(content), null)
          result.createdNotes++
        }
      } catch (error) {
        result.warnings.push(`${value.name}: ${errorMessage(error)}`)
      }
    }
    state.cursor++
    return c.json(result)
  })
}

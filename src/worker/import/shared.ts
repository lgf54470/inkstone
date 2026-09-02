/** Pure helpers shared across the import pipeline. */
import { LIMITS } from '@shared/constants'
import { deriveTitle } from '@shared/markdown-utils'
import { truncateText } from '@shared/text-utils'
import type { ImportResult } from '@shared/types'
import { runBatched } from '../db/writes'
import { ApiError } from '../lib/errors'
import type { ImportConflict } from './types'

const IMPORT_CONFLICTS = new Set<ImportConflict>(['skip', 'newer', 'duplicate'])
const MAX_IMPORT_WARNINGS = 100

export function parseImportConflict(value: unknown): ImportConflict {
  if (value === null || value === undefined) return 'newer'
  if (isImportConflict(value)) return value
  throw ApiError.badRequest('conflict must be skip, newer, or duplicate')
}

function isImportConflict(value: unknown): value is ImportConflict {
  return typeof value === 'string' && IMPORT_CONFLICTS.has(value as ImportConflict)
}

export function importedBundleTitle(title: unknown, content: string): string {
  return typeof title === 'string'
    ? truncateText(title.trim(), LIMITS.titleMaxLength)
    : deriveTitle(content)
}

export function importedMarkdownTitle(
  meta: Record<string, string>,
  content: string,
  filenameFallback: string,
): string {
  return Object.prototype.hasOwnProperty.call(meta, 'title')
    ? truncateText(meta.title!.trim(), LIMITS.titleMaxLength)
    : deriveTitle(content, filenameFallback)
}

function addWarning(result: ImportResult, message: string): void {
  if (result.warnings.length < MAX_IMPORT_WARNINGS - 1) {
    result.warnings.push(truncateText(message, 600))
  } else if (result.warnings.length === MAX_IMPORT_WARNINGS - 1) {
    result.warnings.push('Additional import warnings were omitted')
  }
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${Math.ceil(bytes / (1024 * 1024))} MB`
    : `${Math.ceil(bytes / 1024)} KB`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sourceKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim()
  return key && key.length <= 128 ? key : undefined
}

function parseDate(value: string | undefined): number {
  if (!value) return 0
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function validTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(Math.trunc(value), Date.now() + 5 * 60 * 1000)
    : 0
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000
    ? value
    : undefined
}

function normalizeFolderSegment(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f/\\]/g, '-')
    .trim()
  return truncateText(normalized, LIMITS.folderNameMaxLength).trim()
}

function shiftSqlPlaceholders(sql: string, offset: number): string {
  return sql.replace(/\?(\d+)/g, (_match, value: string) => `?${Number(value) + offset}`)
}

export async function upsertImportMappings(
  db: D1Database,
  userId: string,
  entity: 'note' | 'attachment',
  mappings: readonly { sourceId: string; targetId: string }[],
): Promise<void> {
  const now = Date.now()
  await runBatched(
    db,
    mappings.map(({ sourceId, targetId }) =>
      db.prepare(
        `INSERT INTO import_mappings (user_id, entity, source_id, target_id, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(user_id, entity, source_id) DO UPDATE SET
           target_id = excluded.target_id,
           updated_at = excluded.updated_at`,
      ).bind(userId, entity, sourceId, targetId, now),
    ),
  )
}

export {
  addWarning,
  finiteNumber,
  formatBytes,
  isRecord,
  normalizeFolderSegment,
  parseDate,
  sourceKey,
  shiftSqlPlaceholders,
  validTimestamp,
}
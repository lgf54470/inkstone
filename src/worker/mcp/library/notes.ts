import { requireOwnedNote } from './helpers';
import type { LibraryContext } from './types';
import { ApiError } from '../../lib/errors';
import { createMcpNote, editMcpNote } from '.././writes';
import { LIMITS } from '@shared/constants';
import { parseFrontMatter } from '@shared/markdown-utils';
import { stringify as stringifyYaml } from 'yaml';

export async function duplicateMcpNote(
  context: LibraryContext,
  input: { operationId: string; noteId: string },
) {
  const source = await context.env.DB.prepare(
    `SELECT title, content, folder_id FROM notes
      WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  ).bind(input.noteId, context.userId).first<{
    title: string
    content: string
    folder_id: string | null
  }>()
  if (!source) throw ApiError.notFound('Note not found')
  return createMcpNote(context, {
    operationId: input.operationId,
    title: duplicateTitle(source.title),
    content: source.content,
    folderId: source.folder_id,
  })
}

export async function listMcpNoteVersions(
  db: D1Database,
  userId: string,
  noteId: string,
  limit = 20,
) {
  await requireOwnedNote(db, userId, noteId)
  const { results } = await db.prepare(
    `SELECT id, title, size, created_at FROM note_versions
      WHERE note_id = ?1 AND user_id = ?2
      ORDER BY created_at DESC, id DESC LIMIT ?3`,
  ).bind(noteId, userId, Math.max(1, Math.min(50, limit))).all<{
    id: string
    title: string
    size: number
    created_at: number
  }>()
  return {
    versions: results.map((row) => ({
      id: row.id,
      note_id: noteId,
      title: row.title,
      size: row.size,
      created_at: new Date(row.created_at).toISOString(),
    })),
  }
}

export async function readMcpNoteVersion(
  db: D1Database,
  userId: string,
  noteId: string,
  versionId: string,
) {
  const row = await db.prepare(
    `SELECT v.id, v.title, v.content, v.size, v.created_at
       FROM note_versions v JOIN notes n ON n.id = v.note_id
      WHERE v.id = ?1 AND v.note_id = ?2 AND v.user_id = ?3 AND n.user_id = ?3`,
  ).bind(versionId, noteId, userId).first<{
    id: string
    title: string
    content: string
    size: number
    created_at: number
  }>()
  if (!row) throw ApiError.notFound('Note version not found')
  return {
    id: row.id,
    note_id: noteId,
    title: row.title,
    content: row.content,
    size: row.size,
    created_at: new Date(row.created_at).toISOString(),
  }
}

export async function restoreMcpNoteVersion(
  context: LibraryContext,
  input: { operationId: string; noteId: string; versionId: string; expectedRev: number },
) {
  const version = await readMcpNoteVersion(
    context.env.DB,
    context.userId,
    input.noteId,
    input.versionId,
  )
  return editMcpNote(context, {
    operationId: input.operationId,
    noteId: input.noteId,
    expectedRev: input.expectedRev,
    operation: 'replace_all',
    text: version.content,
    title: version.title,
  })
}

export async function getMcpNoteProperties(db: D1Database, userId: string, noteId: string) {
  const row = await db.prepare(
    `SELECT title, content, rev FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  ).bind(noteId, userId).first<{ title: string; content: string; rev: number }>()
  if (!row) throw ApiError.notFound('Note not found')
  const parsed = parseFrontMatter(row.content)
  if (parsed.errors.length) throw ApiError.conflict('The note has invalid Front Matter', { errors: parsed.errors })
  return { note_id: noteId, title: row.title, rev: row.rev, properties: parsed.data }
}

export async function updateMcpNoteProperties(
  context: LibraryContext,
  input: {
    operationId: string
    noteId: string
    expectedRev: number
    properties: Record<string, unknown>
    mode: 'merge' | 'replace'
  },
) {
  const row = await context.env.DB.prepare(
    `SELECT content FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL`,
  ).bind(input.noteId, context.userId).first<{ content: string }>()
  if (!row) throw ApiError.notFound('Note not found')
  const parsed = parseFrontMatter(row.content)
  if (parsed.errors.length) throw ApiError.conflict('The note has invalid Front Matter', { errors: parsed.errors })
  const properties = input.mode === 'replace' ? input.properties : { ...parsed.data, ...input.properties }
  for (const [key, value] of Object.entries(properties)) {
    if (!key.trim() || key.length > 120) throw ApiError.badRequest('Property names must be 1-120 characters')
    assertPropertyValue(value, 0)
  }
  const yaml = stringifyYaml(properties, { lineWidth: 0 }).trimEnd()
  if (new TextEncoder().encode(yaml).byteLength > 64 * 1024) {
    throw ApiError.tooLarge('Front Matter exceeds the 64 KiB limit')
  }
  const content = Object.keys(properties).length
    ? `---\n${yaml}\n---\n${parsed.body.replace(/^\n/, '')}`
    : parsed.body.replace(/^\n/, '')
  return editMcpNote(context, {
    operationId: input.operationId,
    noteId: input.noteId,
    expectedRev: input.expectedRev,
    operation: 'replace_all',
    text: content,
  })
}

export async function queryMcpNoteProperties(
  db: D1Database,
  userId: string,
  input: {
    conditions: Array<{ key: string; operator: 'exists' | 'equals' | 'contains'; value?: unknown }>
    limit?: number
  },
) {
  const { results } = await db.prepare(
    `SELECT id, title, content, rev, updated_at FROM notes
      WHERE user_id = ?1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500`,
  ).bind(userId).all<{ id: string; title: string; content: string; rev: number; updated_at: number }>()
  const limit = Math.max(1, Math.min(50, input.limit ?? 20))
  const matches = []
  for (const note of results) {
    const parsed = parseFrontMatter(note.content)
    if (parsed.errors.length) continue
    const accepted = input.conditions.every((condition) => propertyMatches(parsed.data, condition))
    if (!accepted) continue
    matches.push({
      id: note.id,
      title: note.title,
      rev: note.rev,
      updated_at: new Date(note.updated_at).toISOString(),
      properties: parsed.data,
    })
    if (matches.length >= limit) break
  }
  return { results: matches, scanned: results.length, scan_limit: 500 }
}

function duplicateTitle(title: string): string {
  const suffix = ' copy'
  const base = title.trim() || 'Untitled note'
  return `${base.slice(0, Math.max(0, LIMITS.titleMaxLength - suffix.length))}${suffix}`
}

export function parseArray(raw: string): unknown[] {
  try {
    const value = JSON.parse(raw) as unknown
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function assertPropertyValue(value: unknown, depth: number): void {
  if (depth > 4) throw ApiError.badRequest('Property values cannot exceed four nested levels')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    if (value.length > 100) throw ApiError.badRequest('Property arrays cannot exceed 100 items')
    for (const item of value) assertPropertyValue(item, depth + 1)
    return
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > 100) throw ApiError.badRequest('Property objects cannot exceed 100 fields')
    for (const [key, item] of entries) {
      if (!key || key.length > 120) throw ApiError.badRequest('Nested property names are invalid')
      assertPropertyValue(item, depth + 1)
    }
    return
  }
  throw ApiError.badRequest('Property values must be JSON-compatible')
}

function propertyMatches(
  properties: Record<string, unknown>,
  condition: { key: string; operator: 'exists' | 'equals' | 'contains'; value?: unknown },
): boolean {
  const exists = Object.prototype.hasOwnProperty.call(properties, condition.key)
  if (condition.operator === 'exists') return exists
  if (!exists) return false
  const actual = properties[condition.key]
  if (condition.operator === 'equals') return JSON.stringify(actual) === JSON.stringify(condition.value)
  if (Array.isArray(actual)) {
    return actual.some((item) => JSON.stringify(item) === JSON.stringify(condition.value))
  }
  return String(actual).toLocaleLowerCase().includes(String(condition.value ?? '').toLocaleLowerCase())
}

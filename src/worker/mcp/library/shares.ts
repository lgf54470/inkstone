import { requireOwnedNote } from './helpers';
import type { LibraryContext } from './types';
import { ApiError } from '../../lib/errors';
import { newSlug } from '../../lib/id';
import { hashPassword } from '../../lib/password';
import { runIdempotent } from '.././operations';
import { LIMITS } from '@shared/constants';

export async function getMcpShare(db: D1Database, userId: string, origin: string, noteId: string) {
  await requireOwnedNote(db, userId, noteId)
  const row = await loadShare(db, userId, noteId)
  return { share: row ? shareResult(row, origin) : null }
}

export async function createMcpShare(
  context: LibraryContext,
  input: {
    operationId: string
    noteId: string
    password?: string | null
    expiresIn?: number | null
  },
) {
  await requireOwnedNote(context.env.DB, context.userId, input.noteId)
  if (typeof input.password === 'string' && input.password.length > LIMITS.passwordMaxLength) {
    throw ApiError.badRequest(`The access password must not exceed ${LIMITS.passwordMaxLength} characters`)
  }
  if (typeof input.password === 'string' && input.password.length > 0 && input.password.length < 4) {
    throw ApiError.badRequest('The access password must be at least 4 characters')
  }
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'create_note_share',
    request: input,
    execute: async () => {
      const expiresAt = typeof input.expiresIn === 'number' && input.expiresIn > 0
        ? Date.now() + Math.min(input.expiresIn, 365 * 24 * 60 * 60 * 1000)
        : null
      const replacePassword = input.password === null || typeof input.password === 'string'
      const passwordHash = typeof input.password === 'string' && input.password
        ? await hashPassword(input.password)
        : null
      const written = await context.env.DB.prepare(
        `INSERT INTO shares (slug, note_id, user_id, password_hash, expires_at, views, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)
         ON CONFLICT(note_id) DO UPDATE SET
           password_hash = CASE WHEN ?7 = 1 THEN excluded.password_hash ELSE shares.password_hash END,
           expires_at = CASE WHEN ?8 = 1 THEN excluded.expires_at ELSE shares.expires_at END
         WHERE shares.user_id = excluded.user_id`,
      ).bind(
        newSlug(),
        input.noteId,
        context.userId,
        passwordHash,
        expiresAt,
        Date.now(),
        replacePassword ? 1 : 0,
        input.expiresIn !== undefined ? 1 : 0,
      ).run()
      if (!written.meta.changes) throw ApiError.conflict('Share state changed')
      return { share: shareResult((await loadShare(context.env.DB, context.userId, input.noteId))!, context.origin) }
    },
  })
}

export async function revokeMcpShare(
  context: LibraryContext,
  input: { operationId: string; noteId: string },
) {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId: input.operationId,
    tool: 'revoke_note_share',
    request: input,
    recover: async () => {
      const row = await loadShare(context.env.DB, context.userId, input.noteId)
      return row ? null : { ok: true, note_id: input.noteId }
    },
    execute: async () => {
      await context.env.DB.prepare(`DELETE FROM shares WHERE note_id = ?1 AND user_id = ?2`)
        .bind(input.noteId, context.userId).run()
      return { ok: true, note_id: input.noteId }
    },
  })
}

interface ShareRow {
  slug: string
  note_id: string
  password_hash: string | null
  expires_at: number | null
  views: number
  created_at: number
}

function loadShare(db: D1Database, userId: string, noteId: string) {
  return db.prepare(
    `SELECT slug, note_id, password_hash, expires_at, views, created_at
       FROM shares WHERE note_id = ?1 AND user_id = ?2`,
  ).bind(noteId, userId).first<ShareRow>()
}

function shareResult(row: ShareRow, origin: string) {
  return {
    slug: row.slug,
    note_id: row.note_id,
    url: `${origin.replace(/\/$/, '')}/s/${row.slug}`,
    has_password: Boolean(row.password_hash),
    expires_at: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    views: row.views,
    created_at: new Date(row.created_at).toISOString(),
  }
}

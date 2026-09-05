import { parseArray } from './notes';
import type { LibraryContext } from './types';
import { runBackup } from '../../backup/engine';
import { runIdempotent } from '.././operations';
import type { BackupRun } from '@shared/types';

export async function listMcpBackupRuns(db: D1Database, userId: string, limit = 10) {
  const { results } = await db.prepare(
    `SELECT id, trigger, status, started_at, finished_at, note_count, file_count, bytes, detail
       FROM backup_runs WHERE user_id = ?1 ORDER BY started_at DESC LIMIT ?2`,
  ).bind(userId, Math.max(1, Math.min(20, limit))).all<{
    id: string
    trigger: 'manual' | 'cron'
    status: BackupRun['status']
    started_at: number
    finished_at: number | null
    note_count: number
    file_count: number
    bytes: number
    detail: string
  }>()
  return {
    runs: results.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      started_at: new Date(row.started_at).toISOString(),
      finished_at: row.finished_at ? new Date(row.finished_at).toISOString() : null,
      note_count: row.note_count,
      file_count: row.file_count,
      bytes: row.bytes,
      results: parseArray(row.detail),
    })),
  }
}

export function runMcpBackup(
  context: LibraryContext,
  operationId: string,
  targetIds?: string[],
) {
  return runIdempotent({
    db: context.env.DB,
    userId: context.userId,
    operationId,
    tool: 'run_backup',
    request: { targetIds },
    execute: () => runBackup(context.env, context.userId, { trigger: 'manual', targetIds }),
  })
}

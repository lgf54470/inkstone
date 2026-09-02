import { Hono } from 'hono'
import { countText, deriveExcerpt } from '@shared/markdown-utils'
import type { AppBindings } from '../env'
import { sha256Hex } from '../lib/encoding'
import { ApiError } from '../lib/errors'
import { newId } from '../lib/id'
import { clampInt } from '../lib/request'
import { requireAuth } from '../middleware/auth'

// Dev-only seeding for local perf benchmarking (dev:kv). Outside a dev
// instance the DEV_SEED variable is absent, so these routes 404. The public
// API always stamps created_at/updated_at with the current time, which turns
// every seed vault into a degenerate single-calendar-day layout; writing D1
// directly with spread timestamps is what makes client-side perf A/B (shell
// cache, calendar heatmap, virtual trees) run against a realistic multi-year
// vault instead.
export const devRoutes = new Hono<AppBindings>()

const INSERT_NOTE_SQL = `INSERT OR IGNORE INTO notes
  (id, user_id, folder_id, title, content, excerpt, rev, word_count, char_count,
   is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
  VALUES (?1, ?2, NULL, ?3, ?4, ?5, 1, ?6, ?7, 0, 0, 0, 0, ?8, ?9, ?9)`

/** Idempotently replace the `seed-*` vault with `count` notes spread day-by-day over `years` years, several notes per day with intra-day hour offsets. */
devRoutes.get('/seed', requireAuth, async (c) => {
  if (c.env.DEV_SEED !== '1')
    throw new ApiError(404, 'not_found', 'Not found')
  const userId = c.get('userId')
  const count = clampInt(c.req.query('count'), 1, 100_000, 19_800)
  const years = clampInt(c.req.query('years'), 1, 10, 2)

  await c.env.DB.prepare(`DELETE FROM notes WHERE user_id = ?1 AND title LIKE 'seed-%'`).bind(userId).run()

  const days = years * 365
  const notesPerDay = Math.max(1, Math.ceil(count / days))
  const dayMs = 86_400_000
  const now = new Date()
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * dayMs

  const statements: ReturnType<D1Database['prepare']>[] = []
  let inserted = 0
  for (let i = 0; i < count; i++) {
    const dayOffset = Math.floor(i / notesPerDay)
    const slot = i % notesPerDay
    const ts = startDay + dayOffset * dayMs + Math.floor((slot * dayMs) / notesPerDay)
    const title = `seed-${String(i).padStart(5, '0')}`
    const content = `seed note ${i}`
    const { words, chars } = countText(content)
    const hash = await sha256Hex(content)
    statements.push(
      c.env.DB.prepare(INSERT_NOTE_SQL).bind(newId(), userId, title, content, deriveExcerpt(content), words, chars, hash, ts),
    )
    inserted++
    if (statements.length >= 100) {
      await c.env.DB.batch(statements)
      statements.length = 0
    }
  }
  if (statements.length > 0)
    await c.env.DB.batch(statements)

  return c.json({ dev: true, inserted, years, days, notesPerDay, firstDay: startDay, lastDay: startDay + (days - 1) * dayMs })
})
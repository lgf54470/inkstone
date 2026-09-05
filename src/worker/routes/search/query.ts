import { Hono } from "hono";
import { LIMITS } from "@shared/constants";
import { truncateText } from "@shared/text-utils";
import type { SearchResponse } from "@shared/types";
import type { AppBindings } from "../../env";
import { scheduleFtsDrain } from "../../lib/notify";
import { clampInt } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { searchUserNotes } from './helpers';

export function registerSearchQueryRoutes(searchRoutes: Hono<AppBindings>): void {
searchRoutes.get('/search', requireAuth, async (c) => {
  const started = Date.now()
  const userId = c.get('userId')
  const raw = truncateText((c.req.query('q') ?? '').trim(), 512)
  const limit = clampInt(c.req.query('limit'), 1, 200, LIMITS.searchLimit)

  if (!raw) {
    const empty: SearchResponse = {
      results: [],
      mode: 'fts',
      took: 0,
      query: { text: '', tags: [], folder: null, starred: null, archived: null },
    }
    return c.json(empty)
  }

  const { ftsEnabled } = c.get('database')
  scheduleFtsDrain(c, 50)
  // Drain synchronously (up to the read-path cap) before querying: a search
  // that follows note edits within the FTS drain delay should still hit the
  // index instead of silently falling back to LIKE. The background drain
  // keeps handling the remainder and deletes.
  const result = await searchUserNotes(c.env.DB, userId, raw, limit, ftsEnabled, true)
  const q = result.query

  const body: SearchResponse = {
    results: result.results,
    mode: result.mode,
    took: Date.now() - started,
    query: {
      text: q.text,
      tags: q.tags,
      folder: q.folder,
      starred: q.starred,
      archived: q.archived,
    },
  }
  return c.json(body)
})
}


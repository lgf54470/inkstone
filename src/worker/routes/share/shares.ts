import { Hono } from "hono";
import { ShareInfo, ShareListResponse } from "@shared/types";
import type { AppBindings } from "../../env";
import { ApiError } from "../../lib/errors";
import { buildVisitFilterSql, type ShareFilterOptions } from "../../lib/share-analytics";

export interface ShareRow {
  slug: string
  note_id: string
  user_id: string
  folder_id?: string | null
  tags?: string
  password_hash: string | null
  expires_at: number | null
  views: number
  is_enabled: number
  last_viewed_at: number | null
  created_at: number
}

export function toShareInfo(
  row: ShareRow,
  origin: string,
  extras?: {
    noteTitle?: string
    noteExcerpt?: string
    folderId?: string | null
    tags?: string[]
    uniqueVisitors?: number
    isPinned?: boolean
    isStarred?: boolean
  },
): ShareInfo {
  let parsedTags: string[] = []
  if (extras?.tags) {
    parsedTags = extras.tags
  } else if (row.tags) {
    try {
      parsedTags = JSON.parse(row.tags)
    } catch { /* Malformed legacy tags degrade to "no tags" instead of failing the share render. */ }
  }
  const shareFolderId = extras?.folderId !== undefined ? extras.folderId : (row.folder_id ?? null)

  return {
    slug: row.slug,
    noteId: row.note_id,
    url: `${origin}/s/${row.slug}`,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at,
    views: row.views,
    createdAt: row.created_at,
    isEnabled: row.is_enabled !== 0,
    lastViewedAt: row.last_viewed_at ?? null,
    uniqueVisitors: extras?.uniqueVisitors,
    noteTitle: extras?.noteTitle,
    noteExcerpt: extras?.noteExcerpt,
    shareFolderId,
    folderId: shareFolderId,
    shareTags: parsedTags,
    tags: parsedTags,
    isPinned: extras?.isPinned,
    isStarred: extras?.isStarred,
  }
}

export function registerShareSharingRoutes(shareManageRoutes: Hono<AppBindings>): void {
shareManageRoutes.get('/note-share/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
  const origin = new URL(c.req.url).origin
  const row = await c.env.DB.prepare(
    `SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt, n.is_pinned, n.is_starred,
            s.slug, s.folder_id, s.tags as share_tags_json, s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
       FROM notes n
       LEFT JOIN shares s ON s.note_id = n.id AND s.user_id = n.user_id
      WHERE n.id = ?1 AND n.user_id = ?2 AND n.deleted_at IS NULL`,
  ).bind(noteId, userId).first<{
    note_id: string
    note_title: string
    note_excerpt: string
    is_pinned: number
    is_starred: number
    slug: string | null
    folder_id: string | null
    share_tags_json: string | null
    password_hash: string | null
    expires_at: number | null
    views: number | null
    is_enabled: number | null
    last_viewed_at: number | null
    created_at: number | null
  }>()

  if (!row) throw ApiError.notFound('Note not found')
  if (!row.slug) {
    return c.json({
      share: null,
      noteTitle: row.note_title,
      isPinned: row.is_pinned === 1,
      isStarred: row.is_starred === 1,
    })
  }

  let shareTags: string[] = []
  try {
    shareTags = JSON.parse(row.share_tags_json || '[]')
  } catch (error) {
    console.warn('[share] failed to parse share tags, falling back to empty list', error)
  }

  return c.json({
    share: {
      slug: row.slug,
      noteId: row.note_id,
      url: `${origin}/s/${row.slug}`,
      hasPassword: Boolean(row.password_hash),
      expiresAt: row.expires_at,
      views: row.views ?? 0,
      createdAt: row.created_at ?? 0,
      isEnabled: row.is_enabled !== 0,
      lastViewedAt: row.last_viewed_at ?? null,
      noteTitle: row.note_title,
      noteExcerpt: row.note_excerpt,
      shareFolderId: row.folder_id,
      folderId: row.folder_id,
      shareTags,
      tags: shareTags,
      isPinned: row.is_pinned === 1,
      isStarred: row.is_starred === 1,
    },
    noteTitle: row.note_title,
    isPinned: row.is_pinned === 1,
    isStarred: row.is_starred === 1,
  })
})

shareManageRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const origin = new URL(c.req.url).origin
  const rawFolderId = c.req.query('folderId')
  const folderId = rawFolderId && rawFolderId !== 'null' && rawFolderId !== 'undefined' ? rawFolderId : null
  const rawTag = c.req.query('tag')
  const tag = rawTag && rawTag !== 'null' && rawTag !== 'undefined' ? rawTag : null
  const status = c.req.query('status') || 'all'
  const search = (c.req.query('search') || '').trim()
  const sort = c.req.query('sort') || 'views_desc'
  const excludeBots = c.req.query('excludeBots') !== 'false'
  const excludeSelf = c.req.query('excludeSelf') === 'true'
  const excludeOwner = c.req.query('excludeOwner') === 'true'
  const filters: ShareFilterOptions = {
    excludeBots,
    excludeSelfReferrers: excludeSelf,
    excludeOwner,
  }
  const visitFilterClause = buildVisitFilterSql(filters)
  const now = Date.now()

  const folderCountRows = await c.env.DB.prepare(
    `SELECT sf.id as folder_id,
            COUNT(s.slug) as total_shares,
            COUNT(CASE WHEN s.slug IS NOT NULL AND (s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?2) THEN 1 END) as shared_notes
       FROM share_folders sf
       LEFT JOIN shares s ON s.folder_id = sf.id AND s.user_id = sf.user_id
      WHERE sf.user_id = ?1
      GROUP BY sf.id`,
  )
    .bind(userId, now)
    .all<{ folder_id: string; total_shares: number; shared_notes: number }>()

  const folderCounts: Record<string, { total: number; shared: number }> = {}
  for (const r of folderCountRows.results ?? []) {
    folderCounts[r.folder_id] = { total: r.total_shares, shared: Math.min(r.shared_notes, r.total_shares) }
  }

  const allShareTags = await c.env.DB.prepare(
    `SELECT name FROM share_tags WHERE user_id = ?1`,
  ).bind(userId).all<{ name: string }>()

  const tagCounts: Record<string, { total: number; shared: number }> = {}
  for (const t of allShareTags.results ?? []) {
    const tRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as total,
              COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?3) THEN 1 END) as shared
         FROM shares
        WHERE user_id = ?1 AND tags LIKE ?2`,
    ).bind(userId, `%"${t.name}"%`, now).first<{ total: number; shared: number }>()
    tagCounts[t.name] = { total: tRow?.total ?? 0, shared: Math.min(tRow?.shared ?? 0, tRow?.total ?? 0) }
  }

  const globalSummary = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_shares,
            COUNT(CASE WHEN (is_enabled = 1 OR is_enabled IS NULL) AND (expires_at IS NULL OR expires_at > ?2) THEN 1 END) as active_shares,
            COUNT(CASE WHEN is_enabled = 0 THEN 1 END) as paused_shares,
            COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ?2 THEN 1 END) as expired_shares,
            COALESCE(SUM(views), 0) as total_views
       FROM shares
      WHERE user_id = ?1`,
  )
    .bind(userId, now)
    .first<{ total_shares: number; active_shares: number; paused_shares: number; expired_shares: number; total_views: number }>()

  const filteredGlobalStats = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_views, COUNT(DISTINCT visitor_fp) as total_uv
       FROM share_visits
      WHERE user_id = ?1 ${visitFilterClause}`,
  )
    .bind(userId)
    .first<{ total_views: number; total_uv: number }>()

  const pinStarRow = await c.env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN n.is_pinned = 1 THEN 1 END) as pinned_shares,
       COUNT(CASE WHEN n.is_starred = 1 THEN 1 END) as starred_shares
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE s.user_id = ?1 AND n.deleted_at IS NULL`,
  ).bind(userId).first<{ pinned_shares: number; starred_shares: number }>()

  const globalStats = {
    totalShares: globalSummary?.total_shares ?? 0,
    activeShares: globalSummary?.active_shares ?? 0,
    pinnedShares: pinStarRow?.pinned_shares ?? 0,
    starredShares: pinStarRow?.starred_shares ?? 0,
    pausedShares: globalSummary?.paused_shares ?? 0,
    expiredShares: globalSummary?.expired_shares ?? 0,
    totalViews: filteredGlobalStats?.total_views ?? (globalSummary?.total_views ?? 0),
    totalVisitors: filteredGlobalStats?.total_uv ?? 0,
    folderCounts,
    tagCounts,
  }

  const conditions: string[] = [`s.user_id = ?1`, `n.deleted_at IS NULL`]
  const binds: Array<string | number> = [userId]
  let bindIndex = 2

  if (folderId) {
    conditions.push(`s.folder_id = ?${bindIndex}`)
    binds.push(folderId)
    bindIndex++
  }

  if (tag) {
    conditions.push(`s.tags LIKE ?${bindIndex}`)
    binds.push(`%"${tag}"%`)
    bindIndex++
  }

  if (status === 'active') {
    conditions.push(`(s.is_enabled = 1 OR s.is_enabled IS NULL) AND (s.expires_at IS NULL OR s.expires_at > ?${bindIndex})`)
    binds.push(now)
    bindIndex++
  } else if (status === 'paused') {
    conditions.push(`s.is_enabled = 0`)
  } else if (status === 'starred') {
    conditions.push(`n.is_starred = 1`)
  } else if (status === 'pinned') {
    conditions.push(`n.is_pinned = 1`)
  } else if (status === 'password') {
    conditions.push(`s.password_hash IS NOT NULL`)
  } else if (status === 'expiring') {
    conditions.push(`s.expires_at IS NOT NULL`)
  } else if (status === 'permanent') {
    conditions.push(`s.expires_at IS NULL`)
  } else if (status === 'expired') {
    conditions.push(`s.expires_at IS NOT NULL AND s.expires_at <= ?${bindIndex}`)
    binds.push(now)
    bindIndex++
  }

  if (search) {
    conditions.push(`(n.title LIKE ?${bindIndex} OR n.excerpt LIKE ?${bindIndex} OR s.slug LIKE ?${bindIndex} OR s.tags LIKE ?${bindIndex})`)
    binds.push(`%${search}%`)
    bindIndex++
  }

  let orderClause = `ORDER BY n.is_pinned DESC, s.views DESC, n.updated_at DESC`
  if (sort === 'views_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.views ASC, n.updated_at DESC`
  } else if (sort === 'recent_visit') {
    orderClause = `ORDER BY n.is_pinned DESC, s.last_viewed_at IS NOT NULL DESC, s.last_viewed_at DESC, n.updated_at DESC`
  } else if (sort === 'created_desc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.created_at IS NOT NULL DESC, s.created_at DESC, n.created_at DESC`
  } else if (sort === 'title_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, n.title ASC`
  } else if (sort === 'pinned_first') {
    orderClause = `ORDER BY n.is_pinned DESC, s.views DESC, n.updated_at DESC`
  } else if (sort === 'expires_asc') {
    orderClause = `ORDER BY n.is_pinned DESC, s.expires_at IS NULL, s.expires_at ASC, n.updated_at DESC`
  }

  const query = `
    SELECT n.id as note_id, n.title as note_title, n.excerpt as note_excerpt,
           n.is_pinned, n.is_starred,
           s.slug, s.folder_id, s.tags as share_tags_json,
           s.password_hash, s.expires_at, s.views, s.is_enabled, s.last_viewed_at, s.created_at
      FROM shares s
      JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
     WHERE ${conditions.join(' AND ')}
     ${orderClause}
     LIMIT 500
  `

  const rows = await c.env.DB.prepare(query)
    .bind(...binds)
    .all<{
      note_id: string
      note_title: string
      note_excerpt: string
      is_pinned: number
      is_starred: number
      slug: string
      folder_id: string | null
      share_tags_json: string | null
      password_hash: string | null
      expires_at: number | null
      views: number | null
      is_enabled: number | null
      last_viewed_at: number | null
      created_at: number | null
    }>()

  const noteIds = (rows.results ?? []).map((r) => r.note_id)
  const noteStatsMap = new Map<string, { pvs: number; uvs: number }>()
  if (noteIds.length > 0) {
    const placeholders = noteIds.map(() => '?').join(',')
    const statsRows = await c.env.DB.prepare(
      `SELECT note_id, COUNT(*) as pvs, COUNT(DISTINCT visitor_fp) as uvs
         FROM share_visits
        WHERE note_id IN (${placeholders}) ${visitFilterClause}
        GROUP BY note_id`,
    )
      .bind(...noteIds)
      .all<{ note_id: string; pvs: number; uvs: number }>()

    for (const sr of statsRows.results ?? []) {
      noteStatsMap.set(sr.note_id, { pvs: sr.pvs, uvs: sr.uvs })
    }
  }

  const shares: ShareInfo[] = (rows.results ?? []).map((r) => {
    const stats = noteStatsMap.get(r.note_id)
    const noteViews = stats ? stats.pvs : (r.views ?? 0)
    const noteVisitors = stats ? stats.uvs : 0
    let parsedTags: string[] = []
    try {
      parsedTags = JSON.parse(r.share_tags_json || '[]')
    } catch (error) {
      console.warn('[share] failed to parse share tags, falling back to empty list', error)
    }
    return {
      slug: r.slug,
      noteId: r.note_id,
      url: `${origin}/s/${r.slug}`,
      hasPassword: Boolean(r.password_hash),
      expiresAt: r.expires_at ?? null,
      views: noteViews,
      createdAt: r.created_at ?? 0,
      isEnabled: r.is_enabled !== 0,
      lastViewedAt: r.last_viewed_at ?? null,
      uniqueVisitors: noteVisitors,
      noteTitle: r.note_title,
      noteExcerpt: r.note_excerpt,
      shareFolderId: r.folder_id,
      folderId: r.folder_id,
      shareTags: parsedTags,
      tags: parsedTags,
      isPinned: r.is_pinned === 1,
      isStarred: r.is_starred === 1,
    }
  })

  const response: ShareListResponse = {
    shares,
    total: shares.length,
    globalStats,
  }

  return c.json(response)
})
}


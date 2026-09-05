import { Hono } from 'hono'
import type { DemoState } from '../../state'
import type { ShareGlobalAnalytics, ShareInfo, ShareListResponse, ShareNoteAnalytics, ShareTimelinePoint, ShareTimelineRange, ShareVisitLog, ShareVisitsResponse } from '@shared/types'
import { jsonBody } from '../helpers/info'

export function registerShareRoutes(app: Hono, state: DemoState): void {
  app.get('/api/share/check-slug', (c) => {
    return c.json({ available: true })
  })

  app.get('/api/share/analytics/global', (c) => {
    const range = (c.req.query('range') || '7d') as ShareTimelineRange
    const now = Date.now()
    const points: ShareTimelinePoint[] = [
      { label: 'Day 1', timestamp: now - 86400000 * 6, views: 24, visitors: 18 },
      { label: 'Day 2', timestamp: now - 86400000 * 5, views: 35, visitors: 26 },
      { label: 'Day 3', timestamp: now - 86400000 * 4, views: 42, visitors: 31 },
      { label: 'Day 4', timestamp: now - 86400000 * 3, views: 58, visitors: 44 },
      { label: 'Day 5', timestamp: now - 86400000 * 2, views: 63, visitors: 49 },
      { label: 'Day 6', timestamp: now - 86400000, views: 80, visitors: 58 },
      { label: 'Today', timestamp: now, views: 95, visitors: 72 },
    ]
    const res: ShareGlobalAnalytics = {
      range,
      totalShares: state.shares.size,
      activeShares: [...state.shares.values()].filter((s) => s.info.isEnabled).length,
      totalViews: 397,
      totalVisitors: 298,
      viewsDelta: 24,
      visitorsDelta: 18,
      viewsPerDay: 56,
      sparklineViews: points.map((p) => p.views),
      sparklineVisitors: points.map((p) => p.visitors),
      timeline: points,
      topNotes: [...state.shares.values()].map((s) => ({
        noteId: s.info.noteId,
        noteTitle: state.notes.get(s.info.noteId)?.title || 'Untitled',
        slug: s.info.slug,
        views: s.info.views,
        visitors: Math.round(s.info.views * 0.75),
      })),
      topCountries: [
        { name: 'US', count: 120, percentage: 30 },
        { name: 'CN', count: 95, percentage: 24 },
        { name: 'JP', count: 60, percentage: 15 },
        { name: 'DE', count: 40, percentage: 10 },
        { name: 'GB', count: 32, percentage: 8 },
      ],
      topReferrers: [
        { name: 'Direct', count: 180, percentage: 45 },
        { name: 'x.com', count: 95, percentage: 24 },
        { name: 'github.com', count: 62, percentage: 16 },
        { name: 'google.com', count: 40, percentage: 10 },
      ],
      devices: [
        { name: 'Desktop', count: 240, percentage: 60 },
        { name: 'Mobile', count: 140, percentage: 35 },
        { name: 'Tablet', count: 17, percentage: 5 },
      ],
      osList: [
        { name: 'macOS', count: 160, percentage: 40 },
        { name: 'Windows', count: 120, percentage: 30 },
        { name: 'iOS', count: 80, percentage: 20 },
        { name: 'Android', count: 37, percentage: 10 },
      ],
      browsers: [
        { name: 'Chrome', count: 210, percentage: 53 },
        { name: 'Safari', count: 110, percentage: 28 },
        { name: 'Firefox', count: 45, percentage: 11 },
        { name: 'Edge', count: 32, percentage: 8 },
      ],
      recentVisits: [],
      filterStats: {
        bots: 38,
        selfReferrals: 12,
        owner: 6,
      },
    }
    return c.json(res)
  })

  app.get('/api/share/analytics/note/:noteId', (c) => {
    const noteId = c.req.param('noteId')
    const range = (c.req.query('range') || '7d') as ShareTimelineRange
    const share = state.shares.get(noteId)
    const note = state.notes.get(noteId)
    const now = Date.now()
    const points: ShareTimelinePoint[] = [
      { label: 'Day 1', timestamp: now - 86400000 * 6, views: 4, visitors: 3 },
      { label: 'Day 2', timestamp: now - 86400000 * 5, views: 6, visitors: 5 },
      { label: 'Day 3', timestamp: now - 86400000 * 4, views: 8, visitors: 6 },
      { label: 'Day 4', timestamp: now - 86400000 * 3, views: 12, visitors: 9 },
      { label: 'Day 5', timestamp: now - 86400000 * 2, views: 15, visitors: 11 },
      { label: 'Day 6', timestamp: now - 86400000, views: 18, visitors: 14 },
      { label: 'Today', timestamp: now, views: 22, visitors: 17 },
    ]
    const res: ShareNoteAnalytics = {
      range,
      noteId,
      noteTitle: note?.title || 'Untitled',
      slug: share?.info.slug || `demo-${noteId}`,
      url: `${new URL(c.req.url).origin}/s/${share?.info.slug || `demo-${noteId}`}`,
      createdAt: share?.info.createdAt ?? now,
      expiresAt: share?.info.expiresAt ?? null,
      hasPassword: Boolean(share?.password),
      isEnabled: share?.info.isEnabled ?? true,
      totalViews: share?.info.views ?? 85,
      totalVisitors: 65,
      timeline: points,
      topCountries: [
        { name: 'US', count: 35, percentage: 41 },
        { name: 'CN', count: 25, percentage: 29 },
        { name: 'JP', count: 15, percentage: 18 },
      ],
      topReferrers: [
        { name: 'Direct', count: 45, percentage: 53 },
        { name: 'x.com', count: 25, percentage: 29 },
      ],
      devices: [
        { name: 'Desktop', count: 55, percentage: 65 },
        { name: 'Mobile', count: 30, percentage: 35 },
      ],
      osList: [
        { name: 'macOS', count: 45, percentage: 53 },
        { name: 'Windows', count: 40, percentage: 47 },
      ],
      browsers: [
        { name: 'Chrome', count: 50, percentage: 59 },
        { name: 'Safari', count: 35, percentage: 41 },
      ],
      recentVisits: [],
    }
    return c.json(res)
  })

  app.get('/api/share', (c) => {
    const origin = new URL(c.req.url).origin
    const folderId = c.req.query('folderId')
    const tag = c.req.query('tag')
    const status = c.req.query('status')
    const search = c.req.query('search')?.toLowerCase()

    const allShares: ShareInfo[] = []
    const folderCounts: Record<string, { total: number; shared: number }> = {}
    const tagCounts: Record<string, { total: number; shared: number }> = {}

    for (const f of state.shareFolders.values()) {
      folderCounts[f.id] = { total: 0, shared: 0 }
    }
    for (const t of state.shareTags.values()) {
      tagCounts[t.name] = { total: 0, shared: 0 }
    }

    for (const [noteId, note] of state.notes.entries()) {
      if (note.deletedAt !== null) continue
      const share = state.shares.get(noteId)
      if (share) {
        const item: ShareInfo = {
          ...share.info,
          url: `${origin}/s/${share.info.slug}`,
          noteTitle: note.title,
          noteExcerpt: note.content.slice(0, 100),
          folderId: share.info.shareFolderId ?? null,
          tags: share.info.shareTags ?? [],
          shareFolderId: share.info.shareFolderId ?? null,
          shareTags: share.info.shareTags ?? [],
          isPinned: note.isPinned,
          isStarred: note.isStarred,
          uniqueVisitors: Math.round(share.info.views * 0.75),
        }
        allShares.push(item)

        if (item.shareFolderId && folderCounts[item.shareFolderId]) {
          folderCounts[item.shareFolderId].total++
          if (item.isEnabled) folderCounts[item.shareFolderId].shared++
        }
        if (item.shareTags) {
          for (const tagName of item.shareTags) {
            if (!tagCounts[tagName]) tagCounts[tagName] = { total: 0, shared: 0 }
            tagCounts[tagName].total++
            if (item.isEnabled) tagCounts[tagName].shared++
          }
        }
      }
    }

    let filtered = allShares
    if (folderId && folderId !== 'null') {
      filtered = filtered.filter((s) => s.shareFolderId === folderId)
    }
    if (tag && tag !== 'null') {
      filtered = filtered.filter((s) => s.shareTags?.includes(tag))
    }
    if (status === 'active') {
      filtered = filtered.filter((s) => s.isEnabled)
    } else if (status === 'paused') {
      filtered = filtered.filter((s) => !s.isEnabled)
    } else if (status === 'password') {
      filtered = filtered.filter((s) => s.hasPassword)
    } else if (status === 'pinned') {
      filtered = filtered.filter((s) => s.isPinned)
    } else if (status === 'starred') {
      filtered = filtered.filter((s) => s.isStarred)
    }
    if (search) {
      filtered = filtered.filter(
        (s) =>
          s.slug.toLowerCase().includes(search) ||
          (s.noteTitle && s.noteTitle.toLowerCase().includes(search)),
      )
    }

    const res: ShareListResponse = {
      shares: filtered,
      total: filtered.length,
      globalStats: {
        totalShares: allShares.length,
        activeShares: allShares.filter((s) => s.isEnabled).length,
        pinnedShares: allShares.filter((s) => s.isPinned).length,
        starredShares: allShares.filter((s) => s.isStarred).length,
        pausedShares: allShares.filter((s) => !s.isEnabled).length,
        expiredShares: allShares.filter((s) => Boolean(s.expiresAt && s.expiresAt <= Date.now())).length,
        totalViews: allShares.reduce((acc, s) => acc + s.views, 0),
        totalVisitors: allShares.reduce((acc, s) => acc + (s.uniqueVisitors ?? 0), 0),
        folderCounts,
        tagCounts,
      },
    }
    return c.json(res)
  })

  app.get('/api/share/visits', (c) => {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(100, Math.max(10, parseInt(c.req.query('limit') || '50', 10)))
    const filter = c.req.query('filter') || 'all'
    const now = Date.now()

    const mockVisits: ShareVisitLog[] = [
      {
        id: 1,
        noteId: 'demo-note-1',
        noteTitle: 'Getting Started with Inkstone',
        slug: 'welcome-guide',
        visitedAt: now - 1000 * 60 * 5,
        country: 'US',
        region: 'California',
        city: 'San Francisco',
        referrer: 'https://x.com',
        referrerHost: 'x.com',
        deviceType: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        isBot: false,
        visitorFp: 'a1b2c3d4',
      },
      {
        id: 2,
        noteId: 'demo-note-1',
        noteTitle: 'Getting Started with Inkstone',
        slug: 'welcome-guide',
        visitedAt: now - 1000 * 60 * 25,
        country: 'CN',
        region: 'Beijing',
        city: 'Beijing',
        referrer: null,
        referrerHost: null,
        deviceType: 'mobile',
        os: 'iOS',
        browser: 'Safari',
        isBot: false,
        visitorFp: 'e5f6g7h8',
      },
      {
        id: 3,
        noteId: 'demo-note-2',
        noteTitle: 'Architecture Overview',
        slug: 'arch-overview',
        visitedAt: now - 1000 * 60 * 60,
        country: 'US',
        region: null,
        city: null,
        referrer: 'https://google.com',
        referrerHost: 'google.com',
        deviceType: 'desktop',
        os: 'Linux',
        browser: 'Googlebot',
        isBot: true,
        botName: 'Googlebot',
        visitorFp: 'bot-google-1',
      },
      {
        id: 4,
        noteId: 'demo-note-2',
        noteTitle: 'Architecture Overview',
        slug: 'arch-overview',
        visitedAt: now - 1000 * 60 * 120,
        country: 'CN',
        region: 'Shanghai',
        city: 'Shanghai',
        referrer: 'https://inkstone.app/editor',
        referrerHost: 'inkstone.app',
        deviceType: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        isBot: false,
        isOwner: true,
        isSelfReferrer: true,
        visitorFp: 'owner-fp-1',
      },
    ]

    const filtered = mockVisits.filter((v) => {
      if (filter === 'real') return !v.isBot && !v.isOwner && !v.isSelfReferrer
      if (filter === 'bot') return v.isBot
      if (filter === 'owner') return v.isOwner
      if (filter === 'self') return v.isSelfReferrer
      return true
    })

    const visitsRes: ShareVisitsResponse = {
      visits: filtered,
      total: filtered.length,
      page,
      limit,
      totalPages: 1,
    }
    return c.json(visitsRes)
  })

  app.delete('/api/share/visits', (c) => {
    return c.json({ ok: true as const, deleted: 10 })
  })

  app.post('/api/share/batch', async (c) => {
    const body = await jsonBody(c.req.raw)
    const { action, noteIds, folderId } = body as { action: string; noteIds: string[]; folderId?: string | null }
    let count = 0
    for (const id of noteIds || []) {
      const share = state.shares.get(id)
      if (share) {
        if (action === 'enable') share.info.isEnabled = true
        if (action === 'disable') share.info.isEnabled = false
        if (action === 'revoke') state.shares.delete(id)
        if (action === 'move') {
          share.info.shareFolderId = folderId ?? null
          share.info.folderId = folderId ?? null
        }
        count++
      }
    }
    return c.json({ ok: true as const, count })
  })
}

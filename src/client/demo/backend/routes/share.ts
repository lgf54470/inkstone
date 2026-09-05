import { Hono, type Context } from 'hono'
import type { DemoState } from '../../state'
import type { ShareGlobalAnalytics, ShareInfo, ShareListResponse, ShareNoteAnalytics, ShareTimelinePoint, ShareTimelineRange, ShareVisitLog, ShareVisitsResponse } from '@shared/types'
import { jsonBody } from '../helpers/info'

const SHARE_TOP_COUNTRIES = [
  { name: 'US', count: 120, percentage: 30 },
  { name: 'CN', count: 95, percentage: 24 },
  { name: 'JP', count: 60, percentage: 15 },
  { name: 'DE', count: 40, percentage: 10 },
  { name: 'GB', count: 32, percentage: 8 },
]

const SHARE_TOP_REFERRERS = [
  { name: 'Direct', count: 180, percentage: 45 },
  { name: 'x.com', count: 95, percentage: 24 },
  { name: 'github.com', count: 62, percentage: 16 },
  { name: 'google.com', count: 40, percentage: 10 },
]

const SHARE_DEVICES = [
  { name: 'Desktop', count: 240, percentage: 60 },
  { name: 'Mobile', count: 140, percentage: 35 },
  { name: 'Tablet', count: 17, percentage: 5 },
]

const SHARE_OS_LIST = [
  { name: 'macOS', count: 160, percentage: 40 },
  { name: 'Windows', count: 120, percentage: 30 },
  { name: 'iOS', count: 80, percentage: 20 },
  { name: 'Android', count: 37, percentage: 10 },
]

const SHARE_BROWSERS = [
  { name: 'Chrome', count: 210, percentage: 53 },
  { name: 'Safari', count: 110, percentage: 28 },
  { name: 'Firefox', count: 45, percentage: 11 },
  { name: 'Edge', count: 32, percentage: 8 },
]

type ShareVisitSample = Omit<ShareVisitLog, 'visitedAt'> & { offsetMs: number }

const SHARE_VISIT_SAMPLES: ShareVisitSample[] = [
  {
    id: 1,
    noteId: 'demo-note-1',
    noteTitle: 'Getting Started with Inkstone',
    slug: 'welcome-guide',
    offsetMs: 1000 * 60 * 5,
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
    offsetMs: 1000 * 60 * 25,
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
    offsetMs: 1000 * 60 * 60,
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
    offsetMs: 1000 * 60 * 120,
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

function shareTimeline(now: number, counts: [number, number][]): ShareTimelinePoint[] {
  return counts.map(([views, visitors], index) => ({
    label: index === counts.length - 1 ? 'Today' : `Day ${index + 1}`,
    timestamp: now - 86400000 * (counts.length - 1 - index),
    views,
    visitors,
  }))
}

function shareCheckSlug(c: Context): Response {
  return c.json({ available: true })
}

function shareGlobalAnalytics(c: Context, state: DemoState): Response {
  const range = (c.req.query('range') || '7d') as ShareTimelineRange
  const now = Date.now()
  const points = shareTimeline(now, [[24, 18], [35, 26], [42, 31], [58, 44], [63, 49], [80, 58], [95, 72]])
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
    topCountries: SHARE_TOP_COUNTRIES,
    topReferrers: SHARE_TOP_REFERRERS,
    devices: SHARE_DEVICES,
    osList: SHARE_OS_LIST,
    browsers: SHARE_BROWSERS,
    recentVisits: [],
    filterStats: {
      bots: 38,
      selfReferrals: 12,
      owner: 6,
    },
  }
  return c.json(res)
}

function shareNoteAnalytics(c: Context, state: DemoState): Response {
  const noteId = c.req.param('noteId') ?? ''
  const range = (c.req.query('range') || '7d') as ShareTimelineRange
  const share = state.shares.get(noteId)
  const note = state.notes.get(noteId)
  const now = Date.now()
  const points = shareTimeline(now, [[4, 3], [6, 5], [8, 6], [12, 9], [15, 11], [18, 14], [22, 17]])
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
}

function buildShareListItem(share: NonNullable<ReturnType<DemoState['shares']['get']>>, note: NonNullable<ReturnType<DemoState['notes']['get']>>, origin: string): ShareInfo {
  return {
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
}

function bumpShareCounts(
  item: ShareInfo,
  folderCounts: Record<string, { total: number; shared: number }>,
  tagCounts: Record<string, { total: number; shared: number }>,
): void {
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

function listShares(c: Context, state: DemoState): Response {
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
    if (!share) continue
    const item = buildShareListItem(share, note, origin)
    allShares.push(item)
    bumpShareCounts(item, folderCounts, tagCounts)
  }

  const filtered = filterShares(allShares, folderId, tag, status, search)

  const res: ShareListResponse = {
    shares: filtered,
    total: filtered.length,
    globalStats: buildShareListStats(allShares, folderCounts, tagCounts),
  }
  return c.json(res)
}

function filterShares(
  allShares: ShareInfo[],
  folderId: string | undefined,
  tag: string | undefined,
  status: string | undefined,
  search: string | undefined,
): ShareInfo[] {
  let filtered = allShares
  if (folderId && folderId !== 'null') {
    filtered = filtered.filter((s) => s.shareFolderId === folderId)
  }
  if (tag && tag !== 'null') {
    filtered = filtered.filter((s) => s.shareTags?.includes(tag))
  }
  if (status && SHARE_STATUS_FILTERS[status]) {
    filtered = filtered.filter(SHARE_STATUS_FILTERS[status])
  }
  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.slug.toLowerCase().includes(search) ||
        (s.noteTitle && s.noteTitle.toLowerCase().includes(search)),
    )
  }
  return filtered
}

const SHARE_STATUS_FILTERS: Record<string, (s: ShareInfo) => boolean | undefined> = {
  active: (s) => s.isEnabled,
  paused: (s) => !s.isEnabled,
  password: (s) => s.hasPassword,
  pinned: (s) => s.isPinned,
  starred: (s) => s.isStarred,
}

function buildShareListStats(
  allShares: ShareInfo[],
  folderCounts: Record<string, { total: number; shared: number }>,
  tagCounts: Record<string, { total: number; shared: number }>,
): ShareListResponse['globalStats'] {
  return {
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
  }
}

function listShareVisits(c: Context): Response {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(c.req.query('limit') || '50', 10)))
  const filter = c.req.query('filter') || 'all'
  const now = Date.now()

  const mockVisits = SHARE_VISIT_SAMPLES.map(({ offsetMs, ...visit }) => ({
    ...visit,
    visitedAt: now - offsetMs,
  }))

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
}

function clearShareVisits(c: Context): Response {
  return c.json({ ok: true as const, deleted: 10 })
}

async function batchShareAction(c: Context, state: DemoState): Promise<Response> {
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
}

export function registerShareRoutes(app: Hono, state: DemoState): void {
  app.get('/api/share/check-slug', shareCheckSlug)
  app.get('/api/share/analytics/global', (c) => shareGlobalAnalytics(c, state))
  app.get('/api/share/analytics/note/:noteId', (c) => shareNoteAnalytics(c, state))
  app.get('/api/share', (c) => listShares(c, state))
  app.get('/api/share/visits', listShareVisits)
  app.delete('/api/share/visits', clearShareVisits)
  app.post('/api/share/batch', (c) => batchShareAction(c, state))
}
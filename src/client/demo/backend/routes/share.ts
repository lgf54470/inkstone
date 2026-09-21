import { Hono, type Context } from 'hono'
import type { DemoState } from '../../state'
import type { ShareGlobalAnalytics, ShareInfo, ShareListResponse, ShareNoteAnalytics, ShareSession, ShareSessionsResponse, ShareStaleLinks, ShareTimelinePoint, ShareTimelineRange, ShareVisitsResponse } from '@shared/types'
import { SESSION_GAP_MS } from '@shared/visitor-session'
import { apiError, jsonBody } from '../helpers/info'
import { STALE_LINK_DEFAULT_DAYS } from '@shared/user-settings'
import {
  isShareStatusFilter,
  isVisitLogFilter,
  shareMatchesSelection,
  shareMatchesStatus,
  visitMatchesLogFilter,
  type ShareStatusFilter,
  type VisitLogFilter,
} from '@shared/share-selection'
import { SHARE_BROWSERS, SHARE_CHANNELS, SHARE_DEMO_COLLECTION_CHANNEL, SHARE_DEMO_COLLECTION_SLUG, SHARE_DEVICES, SHARE_OS_LIST, SHARE_TOP_COUNTRIES, SHARE_TOP_REFERRERS, SHARE_VISIT_SAMPLES } from './share-fixtures'

/**
 * The channel split with the demo's published directory named after its own title — the same
 * `label` the worker attaches, so the demo never shows a raw `collection-…` token as a channel name.
 */
function demoChannels(state: DemoState): ShareGlobalAnalytics['channels'] {
  const collection = [...state.shareCollections.values()].find((item) => item.slug === SHARE_DEMO_COLLECTION_SLUG)
  const title = collection && (collection.targetType === 'folder'
    ? state.shareFolders.get(collection.targetValue)?.name
    : state.shareTags.get(collection.targetValue)?.name)
  return SHARE_CHANNELS.map((row) => (row.name === SHARE_DEMO_COLLECTION_CHANNEL && title ? { ...row, label: title } : row))
}

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
    channels: demoChannels(state),
    recentVisits: [],
    staleLinks: demoStaleLinks(state, now),
    filterStats: {
      bots: 38,
      selfReferrals: 12,
      owner: 6,
    },
  }
  return c.json(res)
}

/**
 * The hygiene card on the demo dashboard, from the demo's own share rows: the links whose last
 * visit is older than the shipped threshold, plus every link nobody has opened yet.
 */
function demoStaleLinks(state: DemoState, now: number): ShareStaleLinks {
  const cutoff = now - STALE_LINK_DEFAULT_DAYS * 86400000
  const quiet = [...state.shares.values()]
    .filter((share) => share.info.isEnabled)
    .filter((share) => share.info.lastViewedAt === null || share.info.lastViewedAt < cutoff)
    .sort((a, b) => (a.info.lastViewedAt ?? 0) - (b.info.lastViewedAt ?? 0))
  return {
    thresholdDays: STALE_LINK_DEFAULT_DAYS,
    total: quiet.length,
    neverViewed: quiet.filter((share) => share.info.lastViewedAt === null).length,
    items: quiet.slice(0, 5).map((share) => ({
      noteId: share.info.noteId,
      noteTitle: state.notes.get(share.info.noteId)?.title ?? null,
      slug: share.info.slug,
      lastViewedAt: share.info.lastViewedAt,
      views: share.info.views,
    })),
  }
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
    channels: demoChannels(state),
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
    truncated: false,
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
  // The same selection the worker's query builds, evaluated in JS: a demo that answered a filter
  // differently from the real build would be a bug report about the demo, which is worse than none.
  // `?tag=` carries the value a share stores (a tag name) — see `@shared/share-selection`.
  const target = folderId && folderId !== 'null'
    ? { type: 'folder' as const, value: folderId }
    : tag && tag !== 'null' ? { type: 'tag' as const, value: tag } : null
  const requested = status && isShareStatusFilter(status) ? status : 'all'
  const now = Date.now()
  let filtered = allShares.filter((share) => shareMatchesSelection(share, { status: requested, target }, now))
  if (search) {
    filtered = filtered.filter(
      (s) =>
        s.slug.toLowerCase().includes(search) ||
        (s.noteTitle && s.noteTitle.toLowerCase().includes(search)),
    )
  }
  return filtered
}

function buildShareListStats(
  allShares: ShareInfo[],
  folderCounts: Record<string, { total: number; shared: number }>,
  tagCounts: Record<string, { total: number; shared: number }>,
): ShareListResponse['globalStats'] {
  // Every count is the status rule itself, so the badge beside a category cannot disagree with the
  // list that category shows — in the demo no less than in the worker.
  const now = Date.now()
  const countOf = (status: Exclude<ShareStatusFilter, 'all'>) =>
    allShares.filter((share) => shareMatchesStatus(share, status, now)).length
  return {
    totalShares: allShares.length,
    activeShares: countOf('active'),
    pinnedShares: countOf('pinned'),
    starredShares: countOf('starred'),
    pausedShares: countOf('paused'),
    passwordShares: countOf('password'),
    expiringShares: countOf('expiring'),
    expiringSoonShares: countOf('expiring_soon'),
    permanentShares: countOf('permanent'),
    expiredShares: countOf('expired'),
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

  // The same single-choice filter the worker applies, asked of the shared predicate. `real` is the
  // three traffic toggles at once, which is also what a reading's default excludes.
  const logFilter: VisitLogFilter = isVisitLogFilter(filter) ? filter : 'all'
  const filtered = mockVisits.filter((visit) => visitMatchesLogFilter(visit, logFilter))

  const visitsRes: ShareVisitsResponse = {
    visits: filtered,
    total: filtered.length,
    page,
    limit,
    totalPages: 1,
  }
  return c.json(visitsRes)
}

/**
 * The demo's session view: the same sample rows the log lists, folded the way the worker folds
 * them (same fingerprint, within the gap, same UTC day), so the panel's empty, single-session and
 * multi-session states can all be seen without a spent history.
 */
function listShareSessions(c: Context): Response {
  const now = Date.now()
  const sessions: ShareSession[] = []
  for (const sample of SHARE_VISIT_SAMPLES) {
    const visitedAt = now - sample.offsetMs
    const fingerprint = sample.visitorFp ?? ''
    const last = sessions[sessions.length - 1]
    const sameSitting = last
      && last.fingerprint === fingerprint
      && visitedAt - last.lastSeenAt <= SESSION_GAP_MS
    if (!sameSitting) sessions.push({ fingerprint, startedAt: visitedAt, lastSeenAt: visitedAt, visits: 1, notes: [] })
    const session = sessions[sessions.length - 1]
    session.lastSeenAt = Math.max(session.lastSeenAt, visitedAt)
    const note = session.notes.find((candidate) => candidate.noteId === sample.noteId)
    if (note) {
      note.visits += 1
    } else {
      session.notes.push({ noteId: sample.noteId, noteTitle: sample.noteTitle ?? null, slug: sample.slug, visits: 1 })
    }
  }
  const res: ShareSessionsResponse = { sessions, nextCursor: null, limit: 25 }
  return c.json(res)
}

async function clearShareVisits(c: Context, state: DemoState): Promise<Response> {
  if ((c.req.query('type') || 'all') === 'all') {
    const body = await jsonBody(c.req.raw)
    if (body.password !== state.password) {
      return apiError(401, 'wrong_password', 'The current password is incorrect')
    }
  }
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
  app.get('/api/share/summary', (c) => c.json({
    totalShares: state.shares.size,
    sharedNoteIds: [...state.shares.keys()],
  }))
  app.get('/api/share', (c) => listShares(c, state))
  app.get('/api/share/visits', listShareVisits)
  app.get('/api/share/sessions', (c) => listShareSessions(c))
  app.delete('/api/share/visits', (c) => clearShareVisits(c, state))
  app.post('/api/share/batch', (c) => batchShareAction(c, state))
}
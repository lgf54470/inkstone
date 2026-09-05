export interface ShareFolder {
  id: string
  userId?: string
  parentId: string | null
  name: string
  icon?: string | null
  color?: string | null
  position?: number
  createdAt: number
  updatedAt: number
}

export interface ShareTag {
  id: string
  userId?: string
  name: string
  color?: string | null
  isPinned?: boolean
  createdAt: number
}

export interface ShareInfo {
  slug: string
  noteId: string
  url: string
  hasPassword: boolean
  expiresAt: number | null
  views: number
  createdAt: number
  isEnabled: boolean
  lastViewedAt: number | null
  uniqueVisitors?: number
  noteTitle?: string
  noteExcerpt?: string
  folderId?: string | null
  tags?: string[]
  shareFolderId?: string | null
  shareTags?: string[]
  isPinned?: boolean
  isStarred?: boolean
}

export type ShareCategory =
  | 'dashboard'
  | 'all'
  | 'active'
  | 'paused'
  | 'pinned'
  | 'starred'
  | 'password'
  | 'expiring'
  | 'permanent'
  | 'expired'

export type ShareTimelineRange = '24h' | '7d' | '30d' | 'all'

export interface ShareBreakdownItem {
  name: string
  count: number
  percentage?: number
}

export interface ShareTimelinePoint {
  label: string
  timestamp: number
  views: number
  visitors: number
}

export interface ShareAnalyticsFilters {
  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
}

export interface ShareVisitLog {
  id: number
  noteId: string
  noteTitle: string
  slug: string
  visitedAt: number
  country: string | null
  region: string | null
  city: string | null
  referrer: string | null
  referrerHost: string | null
  deviceType: string | null
  os: string | null
  browser: string | null
  isBot: boolean
  isSelfReferrer?: boolean
  isOwner?: boolean
  botName?: string | null
  visitorFp?: string | null
}

export interface ShareGlobalAnalytics {
  range: ShareTimelineRange
  totalShares: number
  activeShares: number
  totalViews: number
  totalVisitors: number
  viewsDelta?: number
  visitorsDelta?: number
  viewsPerDay: number
  sparklineViews: number[]
  sparklineVisitors: number[]
  timeline: ShareTimelinePoint[]
  topNotes: Array<{
    noteId: string
    noteTitle: string
    slug: string
    views: number
    visitors: number
  }>
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
  recentVisits: ShareVisitLog[]
  filterStats?: {
    bots: number
    selfReferrals: number
    owner: number
  }
}

export interface ShareNoteAnalytics {
  range: ShareTimelineRange
  noteId: string
  noteTitle: string
  slug: string
  url: string
  createdAt: number
  expiresAt: number | null
  hasPassword: boolean
  isEnabled: boolean
  totalViews: number
  totalVisitors: number
  timeline: ShareTimelinePoint[]
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
  recentVisits: ShareVisitLog[]
}

export interface ShareListResponse {
  shares: ShareInfo[]
  total: number
  globalStats: {
    totalShares: number
    activeShares: number
    pinnedShares?: number
    starredShares?: number
    pausedShares?: number
    expiredShares?: number
    totalViews: number
    totalVisitors: number
    folderCounts: Record<string, { total: number; shared: number }>
    tagCounts: Record<string, { total: number; shared: number }>
  }
}

export interface ShareVisitsResponse {
  visits: ShareVisitLog[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PublicNote {
  title: string
  content: string
  updatedAt: number
  createdAt: number
  author: { name: string; avatarUrl: string }
  site: { name: string }
  share: { slug: string }
}

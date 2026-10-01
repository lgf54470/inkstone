import type { ShareBreakdownItem, ShareTimelinePoint, ShareTimelineRange } from './share'

/**
 * The account a public blog request is for. The address travels as `?owner=<username>` until the
 * host-based routes land; a request that carries none is answered by the instance default blog, and
 * every public answer names the blog it answered for in `X-Inkstone-Blog-Owner`.
 */
export interface BlogOwner {
  userId: string
  username: string
}

export interface BlogPost {
  id: string
  slug: string
  noteId: string
  userId: string
  title: string
  excerpt: string
  content: string
  coverUrl: string
  categoryId: string | null
  folderId?: string | null
  tags: string[]
  isPublished: boolean
  allowComments: boolean
  isPinned: boolean
  views: number
  commentsCount?: number
  publishedAt: number
  createdAt: number
  updatedAt: number
  /**
   * The post's own search and social preview values. Empty means "use what the post says" — the
   * title, the excerpt and the cover — so an untouched post behaves exactly as it did before these
   * existed, and `seoNoindex` is the one flag that has to be read (false = indexable).
   */
  seoTitle: string
  seoDescription: string
  seoImageUrl: string
  seoCanonicalUrl: string
  seoNoindex: boolean
}

/**
 * One page of the management list: every column the table and grid draw, and never the body. The
 * body is the one field measured in kilobytes, and the list asked for it only to drop it again.
 */
export type BlogPostSummary = Omit<BlogPost, 'content'>

/**
 * A post in the recycle bin (FEA-04): the list row plus the moment it was deleted. The entry is the
 * same shape the management list draws, so the bin shows what is waiting to come back.
 */
export interface BlogTrashEntry extends BlogPostSummary {
  deletedAt: number
}

/**
 * The complete body-free view of an account's posts, keyed by the note each was published from. The
 * note list both badges a note with the post it owns and pre-fills the publish dialog from it, and a
 * paginated row list cannot answer for a note that sits on another page.
 */
export type BlogPostIndexEntry = Omit<
  BlogPostSummary,
  'userId' | 'views' | 'commentsCount' | 'createdAt' | 'updatedAt'
>

export interface BlogFolder {
  id: string
  userId?: string
  parentId: string | null
  name: string
  icon?: string | null
  color?: string | null
  position: number
  createdAt: number
  updatedAt: number
}

export interface BlogCategory {
  id: string
  userId?: string
  name: string
  slug: string
  description?: string
  color?: string | null
  icon?: string | null
  position: number
  postsCount?: number
  createdAt: number
  updatedAt: number
}

export interface BlogTag {
  id: string
  userId?: string
  name: string
  color?: string | null
  isPinned?: boolean
  postsCount?: number
  createdAt?: number
}

export type BlogCommentStatus = 'pending' | 'approved' | 'rejected' | 'spam'

export type BlogLinkStatus = 'pending' | 'approved' | 'rejected'

export interface BlogLink {
  id: string
  userId?: string
  name: string
  url: string
  description?: string | null
  avatar?: string | null
  email?: string | null
  categoryId: string | null
  status: BlogLinkStatus
  isPinned: boolean
  pinnedOrder: number
  isFavorite: boolean
  sortOrder: number
  isActive: boolean
  clicks: number
  createdAt: number
  updatedAt: number
}

export interface BlogLinkCategory {
  id: string
  userId?: string
  name: string
  icon?: string | null
  parentId: string | null
  sortOrder: number
  linksCount?: number
  createdAt: number
  updatedAt: number
}

export interface BlogLinkStats {
  total: number
  pending: number
  approved: number
  rejected: number
  /** The two flag tabs; the admin list filters on them exactly like a status. */
  pinned: number
  favorite: number
}

export interface BlogComment {
  id: string
  postId: string
  postTitle?: string
  postSlug?: string
  parentId: string | null
  authorName: string
  authorEmail: string
  authorUrl?: string | null
  authorAvatar?: string | null
  content: string
  status: BlogCommentStatus
  ip?: string | null
  userAgent?: string | null
  createdAt: number
  replies?: BlogComment[]
}

/** The moderation list's tab sizes, counted without the status filter so every tab is real. */
export interface BlogCommentsCounts {
  all: number
  pending: number
  approved: number
  rejected: number
  spam: number
}

export interface BlogStats {
  totalPosts: number
  publishedPosts: number
  draftPosts: number
  /** How many posts wait in the recycle bin; the sidebar badges the trash tab with it. */
  trashedPosts: number
  pinnedPosts?: number
  totalViews: number
  totalComments: number
  pendingComments: number
  categoriesCount: number
  tagsCount: number
  folderCounts?: Record<string, { total: number; published: number }>
  tagCounts?: Record<string, { total: number; published: number }>
}

export interface BlogSettings {
  siteName: string
  subtitle: string
  bio: string
  authorName: string
  authorAvatar: string
  socialLinks: {
    github?: string
    twitter?: string
    email?: string
    website?: string
  }
  requireCommentApproval: boolean
  postsPerPage: number
  frontendUrl: string
  appearance: {
    theme: 'light' | 'dark' | 'system'
    accent: string
    background: 'paper' | 'white'
    density: 'comfortable' | 'compact'
    language: 'zh-CN' | 'en-US'
  }
}

export interface BlogVisitLog {
  id: number
  postId: string
  postTitle: string
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

export interface BlogGlobalAnalytics {
  range: ShareTimelineRange
  totalPosts: number
  publishedPosts: number
  draftPosts: number
  totalViews: number
  totalVisitors: number
  /** The posts' own cumulative counter, which is not the range's visits. */
  storedViews: number
  viewsDelta?: number
  visitorsDelta?: number
  viewsPerDay: number
  sparklineViews: number[]
  sparklineVisitors: number[]
  timeline: ShareTimelinePoint[]
  topPosts: Array<{
    postId: string
    title: string
    slug: string
    views: number
    visitors: number
  }>
  topCountries: ShareBreakdownItem[]
  topReferrers: ShareBreakdownItem[]
  devices: ShareBreakdownItem[]
  osList: ShareBreakdownItem[]
  browsers: ShareBreakdownItem[]
  recentVisits: BlogVisitLog[]
  filterStats?: {
    bots: number
    selfReferrals: number
    owner: number
  }
}

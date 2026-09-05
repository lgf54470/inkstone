import type { ShareBreakdownItem, ShareTimelinePoint, ShareTimelineRange } from './share';

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
}

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

export interface BlogStats {
  totalPosts: number
  publishedPosts: number
  draftPosts: number
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

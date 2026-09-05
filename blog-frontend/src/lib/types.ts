export interface BlogPost {
  id: string
  noteId: string
  title: string
  slug: string
  excerpt: string
  content: string
  coverUrl: string | null
  categoryId: string | null
  tags: string[]
  isPublished: boolean
  publishedAt: number
  allowComments: boolean
  isPinned: boolean
  views: number
  commentsCount?: number
  createdAt: number
  updatedAt: number
}

export interface BlogCategory {
  id: string
  name: string
  slug: string
  description?: string
  color?: string
  icon?: string
  sortOrder?: number
  postsCount?: number
  createdAt: number
  updatedAt: number
}

export interface BlogTag {
  name: string
  postsCount: number
}

export interface BlogComment {
  id: string
  postId: string
  parentId: string | null
  postTitle?: string
  postSlug?: string
  authorName: string
  authorEmail?: string
  authorUrl?: string
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'spam'
  ip?: string
  userAgent?: string
  createdAt: number
  updatedAt: number
}

export interface BlogSiteInfo {
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
  postsPerPage: number
  requireCommentApproval: boolean
}

export interface TimelineGroup {
  year: number
  months: {
    month: number
    posts: {
      id: string
      title: string
      slug: string
      publishedAt: number
      coverUrl?: string | null
      views: number
    }[]
  }[]
}

export interface CalendarDayPost {
  date: string // YYYY-MM-DD
  count: number
  posts: {
    title: string
    slug: string
  }[]
}

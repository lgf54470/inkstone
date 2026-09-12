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

export interface BlogPublicLink {
  id: string
  name: string
  url: string
  description: string | null
  avatar: string | null
  categoryId: string | null
  isPinned: boolean
  isFavorite: boolean
  pinnedOrder?: number
  sortOrder?: number
  clicks?: number
}

export interface BlogPublicLinkCategory {
  id: string
  name: string
  icon: string | null
  parentId: string | null
  sortOrder: number
}

export interface BlogMusicTag {
  id: string
  name: string
  color: string | null
  parentId: string | null
}

/** 音乐库只读投影：仅播放与搜索所需字段，不含存储键、体积与个人标记 */
export interface BlogMusicTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
  lyric: string | null
  coverUrl: string | null
  streamUrl: string
  tagIds: string[]
  createdAt: number
}

export interface BlogMusicLibrary {
  enabled: boolean
  tracks: BlogMusicTrack[]
  tags: BlogMusicTag[]
}

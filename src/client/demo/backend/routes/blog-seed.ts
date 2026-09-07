import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type {
  BlogCategory,
  BlogComment,
  BlogCommentStatus,
  BlogFolder,
  BlogGlobalAnalytics,
  BlogPost,
  BlogSettings,
  BlogStats,
  BlogTag,
  BlogVisitLog,
  ShareBreakdownItem,
  ShareTimelinePoint,
  ShareTimelineRange,
} from '@shared/types'

export const DAY = 24 * 60 * 60 * 1000
const SEED_NOW = Date.now()
const POST_IDS = ['demo-post-1', 'demo-post-2', 'demo-post-3', 'demo-post-4']
const CATEGORY_IDS = ['demo-cat-guide', 'demo-cat-tech', 'demo-cat-essay']
const FOLDER_IDS = ['demo-folder-tech', 'demo-folder-essay']

export interface BlogDemoData {
  userId: string
  posts: BlogPost[]
  folders: BlogFolder[]
  categories: BlogCategory[]
  tags: BlogTag[]
  comments: BlogComment[]
  settings: BlogSettings
  visits: BlogVisitLog[]
  groupEnabled: Record<string, boolean>
  seq: { post: number; folder: number; tag: number; category: number; comment: number }
}

const POST_SEEDS: Array<Omit<BlogPost, 'id' | 'userId' | 'views' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'commentsCount'>> = [
  {
    slug: 'welcome-to-inkstone',
    noteId: 'demo-note-welcome',
    title: '欢迎使用 Inkstone',
    excerpt: '这是你的私有 Markdown 笔记本；正文始终是普通文本，备份里的 .md 文件可以被任何文本编辑器打开。',
    content: '欢迎使用 Inkstone……',
    coverUrl: '',
    categoryId: CATEGORY_IDS[0],
    folderId: FOLDER_IDS[0],
    tags: ['入门', 'Inkstone'],
    isPublished: true,
    allowComments: true,
    isPinned: true,
  },
  {
    slug: 'my-first-note',
    noteId: 'demo-note-first',
    title: '我的第一篇笔记',
    excerpt: '创建双链笔记，把想法互相连接起来。',
    content: '我的第一篇笔记……',
    coverUrl: '',
    categoryId: CATEGORY_IDS[2],
    folderId: FOLDER_IDS[1],
    tags: ['笔记'],
    isPublished: true,
    allowComments: true,
    isPinned: false,
  },
  {
    slug: 'self-hosted-backup-strategy',
    noteId: 'demo-note-backup',
    title: '自托管笔记的备份策略',
    excerpt: '多路 WebDAV / S3 备份，定期验证恢复流程。',
    content: '自托管笔记的备份策略……',
    coverUrl: '',
    categoryId: CATEGORY_IDS[1],
    folderId: FOLDER_IDS[0],
    tags: ['备份', '自托管'],
    isPublished: true,
    allowComments: true,
    isPinned: false,
  },
  {
    slug: 'markdown-cheatsheet-draft',
    noteId: 'demo-note-markdown',
    title: 'Markdown 速查草稿',
    excerpt: '整理常用 Markdown 语法，尚未发布。',
    content: 'Markdown 速查草稿……',
    coverUrl: '',
    categoryId: null,
    folderId: null,
    tags: ['Markdown'],
    isPublished: false,
    allowComments: true,
    isPinned: false,
  },
]

const VIEWS_BY_POST: Record<string, number> = {
  'demo-post-1': 1280,
  'demo-post-2': 356,
  'demo-post-3': 892,
  'demo-post-4': 0,
}

function seedPosts(userId: string): BlogPost[] {
  return POST_SEEDS.map((seed, index) => ({
    ...seed,
    id: POST_IDS[index]!,
    userId,
    views: VIEWS_BY_POST[POST_IDS[index]!] ?? 0,
    commentsCount: 0,
    publishedAt: seed.isPublished ? SEED_NOW - (30 - index * 9) * DAY : 0,
    createdAt: SEED_NOW - 45 * DAY,
    updatedAt: SEED_NOW - index * 3 * DAY,
  }))
}

function seedFolders(): BlogFolder[] {
  return [
    { id: FOLDER_IDS[0], parentId: null, name: '技术文章', icon: 'code', color: '#0ea5e9', position: 0, createdAt: SEED_NOW - 40 * DAY, updatedAt: SEED_NOW - 40 * DAY },
    { id: FOLDER_IDS[1], parentId: null, name: '生活随笔', icon: 'pen', color: '#f59e0b', position: 1, createdAt: SEED_NOW - 40 * DAY, updatedAt: SEED_NOW - 40 * DAY },
  ]
}

function seedCategories(): BlogCategory[] {
  return [
    { id: CATEGORY_IDS[0], name: '使用指南', slug: 'guide', description: '产品说明与上手教程', color: '#e0664a', icon: 'book', position: 0, createdAt: SEED_NOW - 40 * DAY, updatedAt: SEED_NOW - 40 * DAY },
    { id: CATEGORY_IDS[1], name: '技术', slug: 'tech', description: '自托管与开发实践', color: '#0ea5e9', icon: 'code', position: 1, createdAt: SEED_NOW - 40 * DAY, updatedAt: SEED_NOW - 40 * DAY },
    { id: CATEGORY_IDS[2], name: '随笔', slug: 'essay', description: '生活记录', color: '#f59e0b', icon: 'feather', position: 2, createdAt: SEED_NOW - 40 * DAY, updatedAt: SEED_NOW - 40 * DAY },
  ]
}

function seedTags(): BlogTag[] {
  return [
    { id: 'demo-tag-1', name: '入门', color: '#e0664a', isPinned: true, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
    { id: 'demo-tag-2', name: 'Inkstone', color: '#e0664a', isPinned: true, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
    { id: 'demo-tag-3', name: '备份', color: '#10b981', isPinned: false, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
    { id: 'demo-tag-4', name: '自托管', color: '#8b5cf6', isPinned: false, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
    { id: 'demo-tag-5', name: 'Markdown', color: '#0ea5e9', isPinned: false, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
    { id: 'demo-tag-6', name: '笔记', color: '#f59e0b', isPinned: false, postsCount: 1, createdAt: SEED_NOW - 40 * DAY },
  ]
}

function seedComments(posts: BlogPost[]): BlogComment[] {
  const byId = new Map(posts.map((post) => [post.id, post]))
  const make = (id: string, postId: string, authorName: string, content: string, status: BlogCommentStatus, daysAgo: number, parentId: string | null = null): BlogComment => {
    const post = byId.get(postId)!
    return {
      id, postId, postTitle: post.title, postSlug: post.slug, parentId,
      authorName, authorEmail: `${id}@example.com`, authorUrl: null, authorAvatar: null,
      content, status, ip: '203.0.113.7', userAgent: 'Mozilla/5.0', createdAt: SEED_NOW - daysAgo * DAY,
    }
  }
  return [
    make('demo-comment-1', 'demo-post-1', '访客小明', '非常清晰的介绍，尤其是备份部分，很有帮助！', 'approved', 12),
    make('demo-comment-2', 'demo-post-1', '访客小红', '请问支持 Obsidian 的双链语法吗？', 'pending', 2),
    make('demo-comment-3', 'demo-post-3', '路人甲', '求一份 S3 备份的详细配置教程。', 'pending', 1),
    make('demo-comment-4', 'demo-post-2', '垃圾评论机器人', '点击这里免费领取 XXX！', 'spam', 5),
    make('demo-comment-5', 'demo-post-3', '访客小明', '同求配置教程 +1', 'approved', 4, 'demo-comment-3'),
  ]
}

const COUNTRIES = ['中国', '美国', '日本', '德国', '新加坡']
const DEVICE_ROWS: Array<['desktop' | 'mobile' | 'tablet', string]> = [
  ['desktop', 'Chrome'], ['mobile', 'Safari'], ['desktop', 'Edge'], ['mobile', 'Chrome'], ['tablet', 'Safari'],
]

function seedVisits(posts: BlogPost[]): BlogVisitLog[] {
  const published = posts.filter((post) => post.isPublished)
  const visits: BlogVisitLog[] = []
  for (let index = 0; index < 36; index++) {
    const post = published[Math.floor(index / 9)] ?? published[0]!
    const device = DEVICE_ROWS[index % DEVICE_ROWS.length]!
    const isBot = index % 7 === 0
    visits.push({
      id: index + 1,
      postId: post.id,
      postTitle: post.title,
      slug: post.slug,
      visitedAt: SEED_NOW - index * 20 * 60 * 60 * 1000,
      country: COUNTRIES[index % COUNTRIES.length] ?? '中国',
      region: null,
      city: null,
      referrer: index % 3 === 0 ? 'https://news.ycombinator.com/' : null,
      referrerHost: index % 3 === 0 ? 'news.ycombinator.com' : null,
      deviceType: device[0],
      os: index % 2 === 0 ? 'macOS' : 'Windows',
      browser: device[1],
      isBot,
      botName: isBot ? 'Googlebot' : null,
    })
  }
  return visits
}

function defaultBlogSettings(): BlogSettings {
  return {
    siteName: 'Inkstone Demo Blog',
    subtitle: '纸墨之间，落笔生辉',
    bio: '一个运行在 Cloudflare Workers 上的自托管 Markdown 笔记本博客。',
    authorName: 'Inkstone Demo',
    authorAvatar: '',
    socialLinks: { github: 'https://github.com/shuaiplus/inkstone', email: 'hello@example.com' },
    requireCommentApproval: true,
    postsPerPage: 10,
    frontendUrl: DEFAULT_BLOG_FRONTEND_URL,
    appearance: { theme: 'system', accent: 'vermilion', background: 'paper', density: 'comfortable', language: 'zh-CN' },
  }
}

export function createBlogDemoData(userId: string): BlogDemoData {
  const posts = seedPosts(userId)
  return {
    userId,
    posts,
    folders: seedFolders(),
    categories: seedCategories(),
    tags: seedTags(),
    comments: seedComments(posts),
    settings: defaultBlogSettings(),
    visits: seedVisits(posts),
    groupEnabled: {},
    seq: { post: 4, folder: 2, tag: 6, category: 3, comment: 5 },
  }
}

interface GroupCounts {
  total: number
  published: number
}

function countGroups(posts: BlogPost[]): { folders: Record<string, GroupCounts>; tags: Record<string, GroupCounts> } {
  const folders: Record<string, GroupCounts> = {}
  const tags: Record<string, GroupCounts> = {}
  for (const post of posts) {
    if (post.folderId) {
      const entry = (folders[post.folderId] ??= { total: 0, published: 0 })
      entry.total += 1
      if (post.isPublished) entry.published += 1
    }
    for (const name of post.tags) {
      const entry = (tags[name] ??= { total: 0, published: 0 })
      entry.total += 1
      if (post.isPublished) entry.published += 1
    }
  }
  return { folders, tags }
}

export function buildStats(posts: BlogPost[], comments: BlogComment[], categories: BlogCategory[], tags: BlogTag[]): BlogStats {
  const published = posts.filter((post) => post.isPublished)
  const { folders, tags: tagCounts } = countGroups(posts)
  return {
    totalPosts: posts.length,
    publishedPosts: published.length,
    draftPosts: posts.length - published.length,
    pinnedPosts: posts.filter((post) => post.isPinned).length,
    totalViews: posts.reduce((total, post) => total + post.views, 0),
    totalComments: comments.length,
    pendingComments: comments.filter((comment) => comment.status === 'pending').length,
    categoriesCount: categories.length,
    tagsCount: tags.length,
    folderCounts: folders,
    tagCounts,
  }
}

function rangeDays(range: ShareTimelineRange): number {
  switch (range) {
    case '24h': return 1
    case '7d': return 7
    default: return 30
  }
}

function buildTimeline(posts: BlogPost[], range: ShareTimelineRange): { points: ShareTimelinePoint[]; sparkViews: number[]; sparkVisitors: number[] } {
  const days = rangeDays(range)
  const totalViews = posts.reduce((total, post) => total + post.views, 0)
  const points: ShareTimelinePoint[] = []
  const sparkViews: number[] = []
  const sparkVisitors: number[] = []
  for (let index = days - 1; index >= 0; index--) {
    const timestamp = SEED_NOW - index * DAY
    const weight = ((index * 7919) % 97) / 100 + 0.35
    const views = Math.round(totalViews * weight / days)
    const visitors = Math.round(views * 0.72)
    sparkViews.push(views)
    sparkVisitors.push(visitors)
    points.push({
      label: new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      timestamp,
      views,
      visitors,
    })
  }
  return { points, sparkViews, sparkVisitors }
}

function breakdown(entries: Array<[string, number]>): ShareBreakdownItem[] {
  const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1
  return entries.map(([name, count]) => ({ name, count, percentage: Math.round(count * 100 / total) }))
}

export function buildAnalytics(posts: BlogPost[], range: ShareTimelineRange, visits: BlogVisitLog[]): BlogGlobalAnalytics {
  const { points, sparkViews, sparkVisitors } = buildTimeline(posts, range)
  const totalViews = posts.reduce((total, post) => total + post.views, 0)
  const totalVisitors = Math.round(totalViews * 0.68)
  const sorted = [...posts].sort((a, b) => b.views - a.views)
  return {
    range,
    totalPosts: posts.length,
    publishedPosts: posts.filter((post) => post.isPublished).length,
    draftPosts: posts.filter((post) => !post.isPublished).length,
    totalViews,
    totalVisitors,
    viewsDelta: Math.round(totalViews * 0.09),
    visitorsDelta: Math.round(totalVisitors * 0.06),
    viewsPerDay: Math.round(totalViews / rangeDays(range)),
    sparklineViews: sparkViews,
    sparklineVisitors: sparkVisitors,
    timeline: points,
    topPosts: sorted.slice(0, 5).map((post) => ({
      postId: post.id,
      title: post.title,
      slug: post.slug,
      views: post.views,
      visitors: Math.round(post.views * 0.72),
    })),
    topCountries: breakdown([['中国', 620], ['美国', 148], ['日本', 62], ['德国', 31], ['新加坡', 27]]),
    topReferrers: breakdown([['直接访问', 431], ['news.ycombinator.com', 198], ['github.com', 87], ['x.com', 54], ['bilibili.com', 38]]),
    devices: breakdown([['desktop', 512], ['mobile', 331], ['tablet', 45]]),
    osList: breakdown([['macOS', 346], ['Windows', 289], ['iOS', 152], ['Android', 79], ['Linux', 22]]),
    browsers: breakdown([['Chrome', 415], ['Safari', 283], ['Edge', 101], ['Firefox', 67], ['其他', 22]]),
    recentVisits: visits.slice(0, 20),
    filterStats: {
      bots: visits.filter((visit) => visit.isBot).length,
      selfReferrals: visits.filter((visit) => visit.isSelfReferrer).length,
      owner: visits.filter((visit) => visit.isOwner).length,
    },
  }
}
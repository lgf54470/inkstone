import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getSitemapXml } from '../src/pages/sitemap.xml.ts'
import { getFeedXml } from '../src/pages/feed.xml.ts'
import { api } from '../src/lib/api'
import type { BlogPost, BlogSiteInfo, TimelineGroup } from '../src/lib/types'

vi.mock('../src/lib/api', () => ({
  api: {
    getSiteInfo: vi.fn(),
    getPosts: vi.fn(),
    getTimeline: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)

const MOCK_SITE: BlogSiteInfo = {
  siteName: '测试博客',
  subtitle: '测试副标题',
  bio: '博主简介',
  authorName: '测试作者',
  authorAvatar: '',
  socialLinks: {},
  postsPerPage: 10,
  requireCommentApproval: false,
}

const MOCK_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    noteId: 'note-1',
    slug: 'hello-world',
    title: 'Hello & Welcome',
    excerpt: '第一篇摘要 <em>带标记</em>',
    content: '内容',
    isPinned: false,
    isPublished: true,
    coverUrl: null,
    categoryId: null,
    tags: [],
    views: 1,
    commentsCount: 0,
    allowComments: true,
    publishedAt: 1725148800000,
    createdAt: 1725148800000,
    updatedAt: 1725148800000,
  },
]

const MOCK_TIMELINE: TimelineGroup[] = [
  {
    year: 2024,
    months: [{ month: 9, posts: [{ id: 'post-1', title: 'Hello & Welcome', slug: 'hello-world', publishedAt: 1725148800000, views: 1 }] }],
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  mockedApi.getSiteInfo.mockResolvedValue(MOCK_SITE)
  mockedApi.getPosts.mockResolvedValue({
    posts: MOCK_POSTS,
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  })
  mockedApi.getTimeline.mockResolvedValue(MOCK_TIMELINE)
})

describe('getSitemapXml', () => {
  it('returns XML urlset with static routes and post urls', async () => {
    const res = await getSitemapXml(new URL('https://blog.example.com/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/xml')
    const body = await res.text()
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(body).toContain('<loc>https://blog.example.com/</loc>')
    expect(body).toContain('<loc>https://blog.example.com/timeline</loc>')
    expect(body).toContain('<loc>https://blog.example.com/posts/hello-world</loc>')
  })

  it('escapes XML special characters in urls', async () => {
    mockedApi.getTimeline.mockResolvedValue([
      {
        year: 2024,
        months: [{ month: 9, posts: [{ id: 'p', title: 't', slug: 'a&b', publishedAt: 1, views: 0 }] }],
      },
    ])
    const body = await (await getSitemapXml(new URL('https://blog.example.com/'))).text()
    expect(body).toContain('a&amp;b')
  })
})

describe('getFeedXml', () => {
  it('returns RSS 2.0 channel with items from latest posts', async () => {
    const res = await getFeedXml(new URL('https://blog.example.com/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/rss+xml')
    const body = await res.text()
    expect(body).toContain('<rss version="2.0"')
    expect(body).toContain('<channel>')
    expect(body).toContain('<title>测试博客</title>')
    expect(body).toContain('<link>https://blog.example.com/</link>')
    expect(body).toContain('<item>')
    expect(body).toContain('<link>https://blog.example.com/posts/hello-world</link>')
    expect(body).toContain('<guid isPermaLink="true">')
    expect(body).toContain('<pubDate>')
    expect(body).toContain('atom:link')
  })

  it('escapes XML special characters in title and excerpt', async () => {
    const body = await (await getFeedXml(new URL('https://blog.example.com/'))).text()
    expect(body).toContain('<title>Hello &amp; Welcome</title>')
    expect(body).toContain('第一篇摘要 &lt;em&gt;带标记&lt;/em&gt;')
  })
})
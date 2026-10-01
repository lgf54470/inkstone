import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getSitemapXml } from '../src/pages/sitemap.xml.ts'
import { getFeedXml } from '../src/pages/feed.xml.ts'
import { api } from '../src/lib/api'
import type { BlogCategory, BlogPost, BlogSiteInfo, BlogTag, TimelineGroup } from '../src/lib/types'

vi.mock('../src/lib/api', () => ({
  api: {
    getSiteInfo: vi.fn(),
    getPosts: vi.fn(),
    getTimeline: vi.fn(),
    getCategories: vi.fn(),
    getTags: vi.fn(),
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
    months: [{
      month: 9,
      posts: [
        { id: 'post-1', title: 'Hello & Welcome', slug: 'hello-world', publishedAt: 1725148800000, updatedAt: 1725235200000, views: 1 },
      ],
    }],
  },
]

const MOCK_CATEGORIES: BlogCategory[] = [
  { id: 'cat-1', name: 'Tech', slug: 'tech', createdAt: 1, updatedAt: 1 },
]

const MOCK_TAGS: BlogTag[] = [
  { name: '前端 笔记', postsCount: 2 },
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
  mockedApi.getCategories.mockResolvedValue(MOCK_CATEGORIES)
  mockedApi.getTags.mockResolvedValue(MOCK_TAGS)
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

  it('answers 503 + no-store when the timeline cannot be read (BF-1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedApi.getTimeline.mockRejectedValue(new Error('down'))
    const res = await getSitemapXml(new URL('https://blog.example.com/'))
    // 一个只含静态路由的 200 sitemap 会被搜索引擎当作「文章都没了」，5xx 才是这次取数失败
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('covers the grouping pages and dates each post with its last edit (FEA-08)', async () => {
    const body = await (await getSitemapXml(new URL('https://blog.example.com/'))).text()
    expect(body).toContain('<loc>https://blog.example.com/links</loc>')
    expect(body).toContain('<loc>https://blog.example.com/categories/tech</loc>')
    expect(body).toContain('<loc>https://blog.example.com/tags/%E5%89%8D%E7%AB%AF%20%E7%AC%94%E8%AE%B0</loc>')
    // The moment the post was last edited, not the moment it was first published.
    expect(body).toContain('<loc>https://blog.example.com/posts/hello-world</loc><lastmod>2024-09-02T00:00:00.000Z</lastmod>')
  })

  it('leaves a noindex post out of the index (FEA-08)', async () => {
    mockedApi.getTimeline.mockResolvedValue([
      {
        year: 2024,
        months: [{
          month: 9,
          posts: [
            { id: 'p-plain', title: 'Plain', slug: 'plain-post', publishedAt: 1725148800000, views: 0 },
            { id: 'p-hidden', title: 'Hidden', slug: 'hidden-post', publishedAt: 1725148800000, noindex: true, views: 0 },
          ],
        }],
      },
    ])
    const body = await (await getSitemapXml(new URL('https://blog.example.com/'))).text()
    expect(body).toContain('/posts/plain-post')
    expect(body).not.toContain('/posts/hidden-post')
  })

  it('answers 503 + no-store when a category or tag list cannot be read (FEA-08/BF-1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedApi.getTags.mockRejectedValue(new Error('down'))
    const res = await getSitemapXml(new URL('https://blog.example.com/'))
    // 空列表在这里等于「标签页都不存在」；取数失败必须答 503 并让收录稍后重试。
    expect(mockedApi.getTags).toHaveBeenCalledWith({ strict: true })
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
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

  it('answers 503 + no-store when the posts cannot be read (BF-1)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedApi.getPosts.mockRejectedValue(new Error('down'))
    const res = await getFeedXml(new URL('https://blog.example.com/'))
    // 空 feed 会被阅读器当成「博客清空了」；5xx 让它们稍后重试
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('declares the WebSub hub only when the settings name one (FEA-08)', async () => {
    const withoutHub = await (await getFeedXml(new URL('https://blog.example.com/'))).text()
    expect(withoutHub).not.toContain('rel="hub"')

    mockedApi.getSiteInfo.mockResolvedValue({ ...MOCK_SITE, websubHubUrl: 'https://hub.example.com/' })
    const withHub = await (await getFeedXml(new URL('https://blog.example.com/'))).text()
    expect(withHub).toContain('<atom:link href="https://hub.example.com/" rel="hub" />')
  })
})
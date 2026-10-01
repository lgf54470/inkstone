// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, extractCoverUrl, isApiDegraded, subscribeApiHealth, clearApiMemoryCache } from './api'
import { API_TIMEOUT_MS } from './constants'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, ok ? 200 : status)))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  clearApiMemoryCache()
})

const SNAKE_CASE_POST = {
  id: 'p1',
  note_id: 'n1',
  title: 'T',
  slug: 't',
  excerpt: 'E',
  content: 'C',
  cover_url: '![cover](https://x/y.png)',
  category_id: 'c1',
  tags: ['a', 'b'],
  is_published: false,
  published_at: '2026-01-02T00:00:00Z',
  views: '12',
  comments_count: 3,
  created_at: 1700000000000,
  updated_at: 1700000000001,
}

describe('extractCoverUrl', () => {
  it('returns trimmed raw value', () => {
    expect(extractCoverUrl('  https://a/b.png  ')).toBe('https://a/b.png')
  })

  it('extracts markdown image url', () => {
    expect(extractCoverUrl('![alt](https://a/b.png "title")')).toBe('https://a/b.png')
  })

  it('extracts parenthesized url', () => {
    expect(extractCoverUrl('(https://a/b.png)')).toBe('https://a/b.png')
  })

  it('returns empty for empty input', () => {
    expect(extractCoverUrl()).toBe('')
    expect(extractCoverUrl(null)).toBe('')
  })
})

describe('api.getPosts payload mapping', () => {
  it('maps snake_case payloads and normalizes types', async () => {
    stubFetch({ posts: [SNAKE_CASE_POST], pagination: { total: 1, page: 1, limit: 10, totalPages: 1 } })
    const result = await api.getPosts({ page: 1 })
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0]).toMatchObject({
      id: 'p1',
      noteId: 'n1',
      title: 'T',
      categoryId: 'c1',
      tags: ['a', 'b'],
      isPublished: false,
      views: 12,
      commentsCount: 3,
      coverUrl: 'https://x/y.png',
    })
    expect(result.posts[0]!.publishedAt).toBe(Date.parse('2026-01-02T00:00:00Z'))
  })

  it('carries the search match snippet and leaves it absent when the answer has none', async () => {
    stubFetch({
      posts: [{ ...SNAKE_CASE_POST, snippet: '…the needle lives here…' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    })
    const searched = await api.getPosts({ search: 'needle' })
    expect(searched.posts[0]?.snippet).toBe('…the needle lives here…')

    stubFetch({ posts: [SNAKE_CASE_POST], pagination: { total: 1, page: 1, limit: 10, totalPages: 1 } })
    const unranked = await api.getPosts({ search: 'needle' })
    expect(unranked.posts[0]?.snippet).toBeUndefined()
  })

  it('rejects when fetch fails instead of fabricating posts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await expect(api.getPosts({})).rejects.toThrow('network down')
  })
})

// FEA-08: the sitemap reads the timeline through this normalization, so the moment a post was last
// edited and whether it asked to be left out of the index have to survive it.
describe('api.getTimeline mapping', () => {
  it('carries the last edit moment and the noindex flag', async () => {
    stubFetch({
      timeline: {
        2024: {
          9: [{ id: 'p1', title: 'T', slug: 't', publishedAt: 1725148800000, updatedAt: 1725235200000, noindex: true, views: 3 }],
        },
      },
    })
    const groups = await api.getTimeline()
    const post = groups.flatMap((group) => group.months).flatMap((month) => month.posts)[0]
    expect(post).toMatchObject({ updatedAt: 1725235200000, noindex: true })
  })
})

// FEA-12: the post page asks for what else to read; the answer is a post list like any other.
// FEA-12: the nesting the public list already carries (parent_id) and the author flag it added in
// FEA-06 have to survive normalization, or the section has nothing to indent.
describe('api.getComments', () => {
  it('carries parent and author flags', async () => {
    stubFetch({ comments: [
      { id: 'c1', author_name: 'Reader', content: 'hi' },
      { id: 'c2', parent_id: 'c1', author_name: 'Writer', content: 'thanks', is_owner: true },
    ] })
    const comments = await api.getComments('post-1')
    expect(comments[0]).toMatchObject({ id: 'c1', parentId: null, isOwner: false })
    expect(comments[1]).toMatchObject({ id: 'c2', parentId: 'c1', isOwner: true })
  })
})

describe('api.getRelatedPosts', () => {
  it('reads the related answer of one post and normalizes it', async () => {
    stubFetch({ posts: [{ id: 'p2', slug: 'next-read', title: 'Next', excerpt: 'E' }] })
    const posts = await api.getRelatedPosts('hello world')
    expect(vi.mocked(fetch).mock.calls[0]![0] as string).toContain('/api/blog/public/posts/hello%20world/related')
    expect(posts[0]).toMatchObject({ slug: 'next-read', title: 'Next', excerpt: 'E' })
  })

  it('rejects when the answer cannot be read, so the page can skip the section', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    await expect(api.getRelatedPosts('hello')).rejects.toThrow('down')
  })
})

describe('api failure propagation', () => {
  beforeEach(() => {
    clearApiMemoryCache()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
  })

  it('leaves null meaning "the server says this post does not exist"', async () => {
    stubFetch({ post: null })
    await expect(api.getPostBySlug('gone')).resolves.toBeNull()
  })

  it('rejects getPostBySlug rather than returning a demo post', async () => {
    await expect(api.getPostBySlug('welcome-to-inkstone-blog')).rejects.toThrow('down')
  })

  it('rejects getTimeline rather than returning a fabricated month', async () => {
    await expect(api.getTimeline()).rejects.toThrow('down')
  })

  it('rejects getCalendar rather than returning a fabricated day', async () => {
    await expect(api.getCalendar()).rejects.toThrow('down')
  })
})

// FEA-08: the sitemap cannot tell "server has no categories" from "the read failed" if the fallback
// swallows the difference, so list reads take a strict mode that answers with the error instead.
describe('api list reads with strict mode', () => {
  beforeEach(() => {
    clearApiMemoryCache()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
  })

  it('keeps the empty-list fallback by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(api.getCategories()).resolves.toEqual([])
    await expect(api.getTags()).resolves.toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('rejects in strict mode so a crawler gets 503 rather than an empty index', async () => {
    await expect(api.getCategories({ strict: true })).rejects.toThrow('down')
    await expect(api.getTags({ strict: true })).rejects.toThrow('down')
  })
})

describe('api.getPosts request behavior', () => {
  it('sends the search param to the API', async () => {
    stubFetch({ posts: [], pagination: { total: 0, page: 1, limit: 8, totalPages: 0 } })
    await api.getPosts({ search: 'hello', limit: 8 })
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('search=hello'),
      expect.anything()
    )
  })

  it('aborts via caller signal without marking degraded', async () => {
    stubFetch({ settings: { siteName: 'Back' } })
    await api.getSiteInfo() // 回到健康状态，保证与执行顺序无关
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          })
      )
    )
    const promise = api.getPosts({ search: 'inkstone', signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow() // 中止向上抛给调用方，不再被吞成离线 fallback
    expect(isApiDegraded()).toBe(false) // 用户主动中止不计入降级
  })
})

describe('blog owner passthrough', () => {
  function requestedUrl(): string {
    return vi.mocked(fetch).mock.calls[0]![0] as string
  }

  afterEach(() => {
    delete window.__INKSTONE_BLOG_OWNER__
    for (const meta of document.querySelectorAll('meta[name="inkstone-blog-owner"]')) meta.remove()
    vi.unstubAllEnvs()
  })

  it('addresses the configured blog on a public request', async () => {
    window.__INKSTONE_BLOG_OWNER__ = '  Inkstone  '
    stubFetch({ posts: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await api.getPosts({ page: 1 })
    expect(requestedUrl()).toContain('owner=inkstone')
  })

  it('keeps the existing query string and appends owner to it', async () => {
    document.head.insertAdjacentHTML('beforeend', '<meta name="inkstone-blog-owner" content="writer">')
    stubFetch({ posts: [], pagination: { total: 0, page: 1, limit: 8, totalPages: 0 } })
    await api.getPosts({ search: 'hello' })
    expect(requestedUrl()).toContain('search=hello')
    expect(requestedUrl()).toContain('owner=writer')
  })

  it('sends no owner when the deployment names none', async () => {
    vi.stubEnv('PUBLIC_BLOG_OWNER', '')
    stubFetch({ posts: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } })
    await api.getPosts({ page: 1 })
    expect(requestedUrl()).not.toContain('owner=')
  })
})

describe('api.getSiteInfo', () => {
  it('merges payload with fallback defaults', async () => {
    stubFetch({ settings: { siteName: 'My Blog', socialLinks: { github: 'https://g' } } })
    const info = await api.getSiteInfo()
    expect(info.siteName).toBe('My Blog')
    expect(info.subtitle).toBeTruthy()
    expect(info.socialLinks.github).toBe('https://g')
    expect(info.postsPerPage).toBe(10)
  })

  it('falls back when request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('boom') }))
    const info = await api.getSiteInfo()
    expect(info.siteName).toBe('Inkstone Blog')
  })
})

describe('api.submitComment', () => {
  it('throws with server error message', async () => {
    stubFetch({ error: 'bad email' }, false, 400)
    await expect(
      api.submitComment({ postId: 'p1', authorName: 'A', authorEmail: 'a@b.c', content: 'hi' })
    ).rejects.toThrow('bad email')
  })

  it('returns normalized comment', async () => {
    stubFetch({
      ok: true,
      message: 'ok',
      comment: { id: 'c1', author_name: 'A', content: 'hi', status: 'pending' },
    })
    const res = await api.submitComment({
      postId: 'p1',
      authorName: 'A',
      authorEmail: 'a@b.c',
      content: 'hi',
    })
    expect(res.ok).toBe(true)
    expect(res.comment?.status).toBe('pending')
    expect(res.comment?.authorName).toBe('A')
  })
})

describe('api health state', () => {
  it('marks degraded on failure and recovers on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    await api.getSiteInfo()
    expect(isApiDegraded()).toBe(true)

    stubFetch({ settings: { siteName: 'Back' } })
    await api.getSiteInfo()
    expect(isApiDegraded()).toBe(false)
  })

  it('aborts stalled requests after the timeout and falls back', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted by timeout')))
          })
      )
    )
    const promise = api.getSiteInfo()
    vi.advanceTimersByTime(API_TIMEOUT_MS)
    const info = await promise
    expect(info.siteName).toBe('Inkstone Blog')
    expect(isApiDegraded()).toBe(true)
  })
})

describe('api health subscriber', () => {
  it('notifies subscribers on change and stops after unsubscribe', async () => {
    stubFetch({ settings: { siteName: 'Back' } })
    clearApiMemoryCache()
    await api.getSiteInfo() // 先回到健康状态，保证测试与执行顺序无关
    const seen: boolean[] = []
    const unsubscribe = subscribeApiHealth((value) => seen.push(value))
    expect(seen).toEqual([false])

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down') }))
    clearApiMemoryCache()
    await api.getSiteInfo()
    expect(seen).toEqual([false, true])

    stubFetch({ settings: { siteName: 'Back' } })
    clearApiMemoryCache()
    await api.getSiteInfo()
    expect(seen).toEqual([false, true, false])

    unsubscribe()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down again') }))
    clearApiMemoryCache()
    await api.getSiteInfo()
    expect(seen).toEqual([false, true, false])
  })
})

describe('api in-memory caching', () => {
  it('serves repeated requests from memory cache without invoking fetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ categories: [{ id: 'c1', name: 'Cat' }] }))
    vi.stubGlobal('fetch', fetchMock)
    clearApiMemoryCache()

    const first = await api.getCategories()
    expect(first).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const second = await api.getCategories()
    expect(second).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1) // Still 1: served from memory cache!

    clearApiMemoryCache()
    const third = await api.getCategories()
    expect(third).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // Refetched after cache cleared
  })

  it('bypasses memory cache when running in SSR environment', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ categories: [{ id: 'c1', name: 'Cat' }] }))
    vi.stubGlobal('fetch', fetchMock)
    clearApiMemoryCache()

    vi.stubGlobal('window', undefined)
    await api.getCategories()
    await api.getCategories()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
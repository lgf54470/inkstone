import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, extractCoverUrl } from './api'

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
})

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

describe('api.getPosts', () => {
  it('maps snake_case payloads and normalizes types', async () => {
    stubFetch({
      posts: [
        {
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
        },
      ],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    })
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

  it('falls back to FALLBACK_POSTS when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    const result = await api.getPosts({})
    expect(result.posts.length).toBeGreaterThan(0)
    expect(result.total).toBe(result.posts.length)
    expect(result.posts[0]!.slug).toBe('welcome-to-inkstone-blog')
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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { loadSearchPage, parseSearchPage, parseSearchQuery, searchPageHref } from './search-page'
import type { BlogPost } from './types'

vi.mock('./api', () => ({ api: { getPosts: vi.fn() } }))

const mockedApi = vi.mocked(api)

function post(slug: string): BlogPost {
  return {
    id: slug,
    noteId: `note-${slug}`,
    title: slug,
    slug,
    excerpt: '',
    content: '',
    coverUrl: null,
    categoryId: null,
    tags: [],
    isPublished: true,
    publishedAt: 1_725_148_800_000,
    allowComments: true,
    isPinned: false,
    views: 0,
    createdAt: 1_725_148_800_000,
    updatedAt: 1_725_148_800_000,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('search page url handling (FEA-12)', () => {
  it('reads q and page from the url, with safe fallbacks', () => {
    expect(parseSearchQuery(new URL('https://blog.example.com/search?q=%20astro%20'))).toBe('astro')
    expect(parseSearchQuery(new URL('https://blog.example.com/search'))).toBe('')
    expect(parseSearchPage(new URL('https://blog.example.com/search?page=3'))).toBe(3)
    expect(parseSearchPage(new URL('https://blog.example.com/search?page=0'))).toBe(1)
    expect(parseSearchPage(new URL('https://blog.example.com/search?page=abc'))).toBe(1)
  })

  it('builds a shareable address, encoding the query and omitting page one', () => {
    expect(searchPageHref('前端 & 笔记', 1)).toBe('/search?q=%E5%89%8D%E7%AB%AF+%26+%E7%AC%94%E8%AE%B0')
    expect(searchPageHref('前端 & 笔记', 2)).toContain('page=2')
  })
})

describe('loadSearchPage (FEA-12)', () => {
  it('does not ask the server for an empty query', async () => {
    const data = await loadSearchPage('', 1, 10)
    expect(mockedApi.getPosts).not.toHaveBeenCalled()
    expect(data).toMatchObject({ posts: [], total: 0, page: 1, totalPages: 0 })
  })

  it('passes the query, page and page size through', async () => {
    mockedApi.getPosts.mockResolvedValue({ posts: [post('hit')], total: 1, page: 2, limit: 10, totalPages: 3 })
    const data = await loadSearchPage('astro', 2, 10)
    expect(mockedApi.getPosts).toHaveBeenCalledWith({ search: 'astro', page: 2, limit: 10 })
    expect(data).toMatchObject({ query: 'astro', page: 2, total: 1, totalPages: 3 })
    expect(data.posts.map((p) => p.slug)).toEqual(['hit'])
  })

  it('lets a failed read throw so the page can answer 503', async () => {
    mockedApi.getPosts.mockRejectedValue(new Error('down'))
    await expect(loadSearchPage('astro', 1, 10)).rejects.toThrow('down')
  })
})

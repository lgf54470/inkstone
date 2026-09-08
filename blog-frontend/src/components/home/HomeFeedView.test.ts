// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import HomeFeedView from './HomeFeedView'
import { api } from '../../lib/api'
import type { BlogPost, BlogCategory, BlogTag, BlogSiteInfo } from '../../lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MOCK_SITE: BlogSiteInfo = {
  siteName: '测试博客',
  subtitle: '测试副标题',
  authorName: '测试作者',
  bio: '作者简介',
  authorAvatar: '',
  socialLinks: {},
  postsPerPage: 10,
  requireCommentApproval: false,
}

const MOCK_POSTS: BlogPost[] = [
  {
    id: 'post-1',
    noteId: 'note-1',
    slug: 'post-one',
    title: '第一篇文章',
    excerpt: '这是第一篇摘要',
    content: '内容一',
    isPinned: false,
    isPublished: true,
    coverUrl: null,
    categoryId: 'cat-1',
    tags: ['tag-a'],
    views: 10,
    commentsCount: 0,
    allowComments: true,
    publishedAt: 1725148800000,
    createdAt: 1725148800000,
    updatedAt: 1725148800000,
  },
  {
    id: 'post-2',
    noteId: 'note-2',
    slug: 'post-two',
    title: '第二篇文章',
    excerpt: '这是第二篇摘要',
    content: '内容二',
    isPinned: true,
    isPublished: true,
    coverUrl: null,
    categoryId: 'cat-1',
    tags: ['tag-b'],
    views: 20,
    commentsCount: 2,
    allowComments: true,
    publishedAt: 1725235200000,
    createdAt: 1725235200000,
    updatedAt: 1725235200000,
  },
]

const MOCK_CATEGORIES: BlogCategory[] = [
  {
    id: 'cat-1',
    name: '技术',
    slug: 'tech',
    color: '#ff0000',
    postsCount: 2,
    createdAt: 1725148800000,
    updatedAt: 1725148800000,
  },
]

const MOCK_TAGS: BlogTag[] = [
  { name: 'tag-a', postsCount: 1 },
  { name: 'tag-b', postsCount: 1 },
]

describe('HomeFeedView initial rendering', () => {
  it('renders posts, pagination toolbar, author profile and tags', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(HomeFeedView, {
          initialPosts: MOCK_POSTS,
          initialTotal: 2,
          initialPage: 1,
          initialLimit: 10,
          initialTotalPages: 1,
          categories: MOCK_CATEGORIES,
          tags: MOCK_TAGS,
          calendarDays: [],
          siteInfo: MOCK_SITE,
          locale: 'zh-CN',
        })
      )
    })

    expect(container.textContent).toContain('第一篇文章')
    expect(container.textContent).toContain('第二篇文章')
    expect(container.textContent).toContain('测试作者')
    expect(container.textContent).toContain('tag-a')
    expect(container.textContent).toContain('tag-b')
    expect(container.textContent).toContain('共 2 篇')
  })
})

type PostsResponse = {
  posts: BlogPost[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function renderFeed(): { container: HTMLDivElement; root: ReturnType<typeof createRoot> } {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => {
    root.render(
      createElement(HomeFeedView, {
        initialPosts: MOCK_POSTS,
        initialTotal: 2,
        initialPage: 1,
        initialLimit: 10,
        initialTotalPages: 1,
        categories: MOCK_CATEGORIES,
        tags: MOCK_TAGS,
        calendarDays: [],
        siteInfo: MOCK_SITE,
        locale: 'zh-CN',
      })
    )
  })
  return { container, root }
}

async function clickTag(container: HTMLDivElement, label: string): Promise<void> {
  const tagButtons = container.querySelectorAll<HTMLButtonElement>('button')
  const target = Array.from(tagButtons).find((b) => b.textContent?.includes(label))
  await act(async () => {
    target?.click()
  })
}

function findTagButton(container: HTMLDivElement, label: string): HTMLButtonElement | undefined {
  const tagButtons = container.querySelectorAll<HTMLButtonElement>('button')
  return Array.from(tagButtons).find((b) => b.textContent?.includes(label))
}

describe('HomeFeedView tag filter interaction', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getPosts').mockResolvedValue({
      posts: [MOCK_POSTS[0]],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })
  })

  it('filters posts and displays active tag banner on tag click', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        createElement(HomeFeedView, {
          initialPosts: MOCK_POSTS,
          initialTotal: 2,
          initialPage: 1,
          initialLimit: 10,
          initialTotalPages: 1,
          categories: MOCK_CATEGORIES,
          tags: MOCK_TAGS,
          calendarDays: [],
          siteInfo: MOCK_SITE,
          locale: 'zh-CN',
        })
      )
    })

    const tagAButton = findTagButton(container, '#tag-a')

    await act(async () => {
      tagAButton?.click()
    })

    expect(api.getPosts).toHaveBeenCalledWith({
      tag: 'tag-a',
      page: 1,
      limit: 10,
      signal: expect.any(AbortSignal),
    })

    expect(container.textContent).toContain('当前标签:')
    expect(container.textContent).toContain('#tag-a')
  })
})

describe('HomeFeedView tag filter race handling', () => {
  it('discards stale responses when requests race', async () => {
    const { container } = renderFeed()
    const getPostsMock = vi.spyOn(api, 'getPosts')
    let resolveSlow!: (value: PostsResponse) => void
    let resolveFast!: (value: PostsResponse) => void
    getPostsMock
      .mockImplementationOnce(() => new Promise<PostsResponse>((resolve) => {
        resolveSlow = resolve
      }))
      .mockImplementationOnce(() => new Promise<PostsResponse>((resolve) => {
        resolveFast = resolve
      }))

    // 连续点击两个标签：第一次请求慢、第二次请求快
    await clickTag(container, '#tag-a')
    await clickTag(container, '#tag-b')

    // 快请求先返回
    await act(async () => {
      resolveFast({ posts: [MOCK_POSTS[1]], total: 1, page: 1, limit: 10, totalPages: 1 })
    })
    // 慢请求后返回（过期响应，应被 seq 守卫丢弃）
    await act(async () => {
      resolveSlow({ posts: [MOCK_POSTS[0]], total: 1, page: 1, limit: 10, totalPages: 1 })
    })

    expect(container.textContent).toContain('第二篇文章')
    expect(container.textContent).not.toContain('第一篇文章')
  })

})

describe('HomeFeedView tag filter client cache', () => {
  it('serves repeated tag filters from the client cache without refetching', async () => {
    vi.restoreAllMocks()
    const { container } = renderFeed()
    const getPostsMock = vi.spyOn(api, 'getPosts').mockResolvedValue({
      posts: [MOCK_POSTS[0]],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })

    await clickTag(container, '#tag-a')
    await clickTag(container, '#tag-b')
    // 再次点回 tag-a：命中客户端缓存，不再发起网络请求
    await clickTag(container, '#tag-a')

    expect(getPostsMock).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('第一篇文章')
  })
})

describe('HomeFeedView initial page cache seed', () => {
  it('serves browser back to the initial page from the seeded cache without refetching', async () => {
    vi.restoreAllMocks()
    const { container } = renderFeed()
    const getPostsMock = vi.spyOn(api, 'getPosts').mockResolvedValue({
      posts: [MOCK_POSTS[0]],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })

    // 点击标签后 URL 变为 ?tag=tag-a（已请求一次 API）
    await clickTag(container, '#tag-a')
    expect(getPostsMock).toHaveBeenCalledTimes(1)

    // 浏览器后退回到初始页：初始 SSR 数据已种入缓存，不应重新请求
    await act(async () => {
      window.history.pushState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(getPostsMock).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('第一篇文章')
    expect(container.textContent).toContain('第二篇文章')
    expect(container.textContent).not.toContain('当前标签:')
  })
})

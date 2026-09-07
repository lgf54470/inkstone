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

    const tagButtons = container.querySelectorAll<HTMLButtonElement>('button')
    const tagAButton = Array.from(tagButtons).find((b) => b.textContent?.includes('#tag-a'))

    await act(async () => {
      tagAButton?.click()
    })

    expect(api.getPosts).toHaveBeenCalledWith({
      tag: 'tag-a',
      page: 1,
      limit: 10,
    })

    expect(container.textContent).toContain('当前标签:')
    expect(container.textContent).toContain('#tag-a')
  })
})

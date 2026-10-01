import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import RelatedPosts from './RelatedPosts'
import type { BlogPost } from '../lib/types'

function post(overrides: Partial<BlogPost>): BlogPost {
  return {
    id: 'p1',
    noteId: 'n1',
    title: 'Fallback title',
    slug: 'fallback',
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
    ...overrides,
  }
}

describe('RelatedPosts', () => {
  it('links each related post and names the section for screen readers', () => {
    const html = renderToString(
      createElement(RelatedPosts, {
        locale: 'zh-CN',
        posts: [
          post({ id: 'p1', slug: 'first', title: '第一篇', excerpt: '摘要一' }),
          post({ id: 'p2', slug: 'second', title: '第二篇' }),
        ],
      }),
    )
    expect(html).toContain('相关文章')
    expect(html).toContain('aria-labelledby="related-posts-title"')
    expect(html).toContain('id="related-posts-title"')
    expect(html).toContain('href="/posts/first"')
    expect(html).toContain('href="/posts/second"')
    expect(html).toContain('第一篇')
    expect(html).toContain('摘要一')
  })

  it('renders nothing when there is no relation to show', () => {
    const html = renderToString(createElement(RelatedPosts, { locale: 'en-US', posts: [] }))
    expect(html).toBe('')
  })
})

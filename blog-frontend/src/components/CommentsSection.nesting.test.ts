import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { CommentList } from './CommentsSection'
import type { BlogComment } from '../lib/types'

function comment(id: string, parentId: string | null = null, overrides: Partial<BlogComment> = {}): BlogComment {
  return {
    id,
    postId: 'post-1',
    parentId,
    authorName: `作者 ${id}`,
    content: `正文 ${id}`,
    status: 'approved',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function render(comments: BlogComment[], locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
  return renderToString(createElement(CommentList, { comments, loading: false, locale }))
}

describe('CommentList nesting (FEA-12)', () => {
  it('draws replies indented under their root comment', () => {
    const html = render([
      comment('root'),
      comment('reply-1', 'root'),
      comment('reply-2', 'reply-1', { isOwner: true }),
    ])
    expect(html).toContain('正文 root')
    expect(html).toContain('正文 reply-1')
    expect(html).toContain('正文 reply-2')
    // 两条回复都在根评论之后的缩进列表里（深度只保留一层：回复的回复也挂在这里）。
    expect(html.indexOf('<ul')).toBeGreaterThan(html.indexOf('正文 root'))
    expect(html.indexOf('正文 reply-1')).toBeGreaterThan(html.indexOf('<ul'))
    expect(html.indexOf('正文 reply-2')).toBeGreaterThan(html.indexOf('<ul'))
  })

  it('marks the blog author and a reply', () => {
    const html = render([comment('root'), comment('reply', 'root', { isOwner: true })], 'en-US')
    expect(html).toContain('Author')
    expect(html).toContain('Reply')
  })

  it('keeps a reply whose parent is missing as a top-level comment', () => {
    const html = render([comment('orphan', 'gone')])
    expect(html).toContain('正文 orphan')
    expect(html).not.toContain('<ul')
  })
})

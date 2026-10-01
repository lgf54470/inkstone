import { describe, expect, it } from 'vitest'
import { buildCommentThreads } from './comment-threads'
import type { BlogComment } from './types'

function comment(id: string, parentId: string | null = null, overrides: Partial<BlogComment> = {}): BlogComment {
  return {
    id,
    postId: 'post-1',
    parentId,
    authorName: id,
    content: `body ${id}`,
    status: 'approved',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('buildCommentThreads (FEA-12)', () => {
  it('attaches replies under their root comment and keeps the discussion order', () => {
    const threads = buildCommentThreads([
      comment('root-a'),
      comment('root-b'),
      comment('reply-a1', 'root-a'),
      comment('reply-b1', 'root-b'),
      comment('reply-a2', 'root-a'),
    ])
    expect(threads.map((thread) => thread.comment.id)).toEqual(['root-a', 'root-b'])
    expect(threads[0].replies.map((reply) => reply.id)).toEqual(['reply-a1', 'reply-a2'])
    expect(threads[1].replies.map((reply) => reply.id)).toEqual(['reply-b1'])
  })

  it('flattens a reply to a reply under the same root, keeping two display levels', () => {
    const threads = buildCommentThreads([
      comment('root'),
      comment('reply-1', 'root'),
      comment('reply-2', 'reply-1'),
      comment('reply-3', 'reply-2'),
    ])
    expect(threads).toHaveLength(1)
    expect(threads[0].replies.map((reply) => reply.id)).toEqual(['reply-1', 'reply-2', 'reply-3'])
  })

  it('keeps a reply whose parent is missing, and survives a parent cycle', () => {
    const orphan = buildCommentThreads([comment('orphan', 'gone'), comment('other')])
    expect(orphan.map((thread) => thread.comment.id)).toEqual(['orphan', 'other'])

    const cyclic = buildCommentThreads([comment('a', 'b'), comment('b', 'a')])
    expect(cyclic.map((thread) => thread.comment.id).sort()).toEqual(['a', 'b'])
  })

  it('answers a reply that arrives before its root', () => {
    const threads = buildCommentThreads([comment('reply', 'root'), comment('root')])
    expect(threads).toHaveLength(1)
    expect(threads[0].comment.id).toBe('root')
    expect(threads[0].replies.map((reply) => reply.id)).toEqual(['reply'])
  })
})

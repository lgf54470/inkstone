import { describe, expect, it } from 'vitest'
import type { BlogStats, Tag } from '@shared/types'
import { buildTagTree } from '../../../lib/tag-tree'
import { buildTagNodeCounts } from './use-blog-hub-sidebar'

function tag(name: string, count: number): Tag {
  return { id: name, name, color: null, count, isPinned: false, createdAt: 0 }
}

function stats(tagCounts: Record<string, { total: number; published: number }>): BlogStats {
  return {
    totalPosts: 0, publishedPosts: 0, draftPosts: 0, totalViews: 0, totalComments: 0,
    pendingComments: 0, categoriesCount: 0, tagsCount: 0, tagCounts,
  }
}

/**
 * The sidebar summed each node's whole subtree during render, so a tag tree of T nodes did O(T²)
 * work per paint. The counts are the same values, computed in one post-order walk.
 */
describe('tag node counts', () => {
  it('sums a subtree once for the parent and answers for the child', () => {
    const tree = buildTagTree([tag('work', 1), tag('work/deep', 1)])
    const counts = buildTagNodeCounts(tree, stats({
      work: { total: 1, published: 1 },
      'work/deep': { total: 2, published: 0 },
    }))

    expect(counts.get('work')).toEqual({ total: 3, published: 1 })
    expect(counts.get('work/deep')).toEqual({ total: 2, published: 0 })
  })

  it("keeps a node's own total as a floor when the split counts do not mention it", () => {
    const tree = buildTagTree([tag('orphan', 4)])
    const counts = buildTagNodeCounts(tree, stats({}))

    expect(counts.get('orphan')).toEqual({ total: 4, published: 0 })
  })
})

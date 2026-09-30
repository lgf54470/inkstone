import { describe, expect, it } from 'vitest'
import { createPostIndexProjection } from './index'

function entry(id: string, isPublished: boolean) {
  return {
    id, slug: id, noteId: `n-${id}`, title: id, excerpt: '', coverUrl: '',
    categoryId: null, folderId: null, tags: [], publishedAt: 1, isPublished, allowComments: true, isPinned: false,
    seoTitle: '', seoDescription: '', seoImageUrl: '', seoCanonicalUrl: '', seoNoindex: false,
  }
}

/**
 * The notes-store projection used to rebuild its Set on every blog-store write (the subscribe fires
 * for each `set`, including every search keystroke and selection toggle), even though only loading
 * the index can change what notes are published.
 */
describe('published note projection', () => {
  it('keeps the same set until the index array is replaced', () => {
    const project = createPostIndexProjection()
    const index = [entry('a', true), entry('b', false), entry('a2', true)]

    const first = project(index)
    expect([...first].sort()).toEqual(['n-a', 'n-a2'])
    expect(project(index)).toBe(first)

    const next = project([...index, entry('c', true)])
    expect(next).not.toBe(first)
    expect([...next].sort()).toEqual(['n-a', 'n-a2', 'n-c'])
  })
})

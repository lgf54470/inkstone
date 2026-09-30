import { describe, expect, it, vi } from 'vitest'
import { postWritePayload, slugSaveNotice, type SavePostCtx } from './use-blog-publish-form'

function ctx(overrides: Partial<SavePostCtx> = {}): SavePostCtx {
  return {
    note: { title: 'Note title' },
    noteId: 'note-1',
    title: 'Post title',
    slug: 'post-slug',
    coverUrl: '',
    folderId: null,
    categoryId: null,
    tags: [],
    excerpt: '',
    allowComments: true,
    isPinned: false,
    publishedAt: '',
    seoTitle: '',
    seoDescription: '',
    seoImageUrl: '',
    seoCanonicalUrl: '',
    seoNoindex: false,
    slugAvailable: true,
    slugReason: '',
    toast: vi.fn(),
    setIsSaving: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

/**
 * The dialog's save guard, read without the note, the store or the network. The locale is not
 * loaded in this harness, so the message ids the function returns are what gets asserted.
 */
describe('publish save guard', () => {
  it('stops a save whose slug the checker already called taken', () => {
    expect(slugSaveNotice('taken-slug', false, 'blog.slug_taken')).toBe('blog.slug_taken')
  })

  it('asks for a slug when the field holds nothing', () => {
    expect(slugSaveNotice('   ', null, '')).toBe('blog.slug_hint')
  })

  it('lets the save through while the answer is unknown or positive', () => {
    expect(slugSaveNotice('fresh-slug', null, '')).toBeNull()
    expect(slugSaveNotice('fresh-slug', true, '')).toBeNull()
  })

  it('falls back to the generic hint when an unavailable slug arrives without a reason', () => {
    expect(slugSaveNotice('taken-slug', false, '')).toBe('blog.slug_hint')
  })
})

/**
 * FEA-02: the dialog's SEO group is only as real as the body it sends. Every field is mapped here,
 * trimmed the way the other text fields are, and an empty field stays empty rather than becoming the
 * literal string "undefined" or the post's own title (the server reads empty as "use the post's own").
 */
describe('publish payload carries the SEO fields', () => {
  const base = { publish: true, finalTitle: 'Post title', finalSlug: 'post-slug', noteContent: '# Body' }

  it('sends what the SEO group holds', () => {
    const payload = postWritePayload({
      ...base,
      ctx: ctx({
        seoTitle: '  Custom title  ',
        seoDescription: '  Custom description  ',
        seoImageUrl: '  https://cdn.test/og.png  ',
        seoCanonicalUrl: '  https://blog.test/original  ',
        seoNoindex: true,
      }),
    })

    expect(payload.seoTitle).toBe('Custom title')
    expect(payload.seoDescription).toBe('Custom description')
    expect(payload.seoImageUrl).toBe('https://cdn.test/og.png')
    expect(payload.seoCanonicalUrl).toBe('https://blog.test/original')
    expect(payload.seoNoindex).toBe(true)
  })

  it('leaves every field empty when nothing was set', () => {
    const payload = postWritePayload({ ...base, ctx: ctx() })

    expect(payload.seoTitle).toBe('')
    expect(payload.seoDescription).toBe('')
    expect(payload.seoImageUrl).toBe('')
    expect(payload.seoCanonicalUrl).toBe('')
    expect(payload.seoNoindex).toBe(false)
  })
})

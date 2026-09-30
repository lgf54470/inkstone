import { describe, expect, it } from 'vitest'
import { resolvePostSeo } from '../src/lib/seo'
import type { BlogPost } from '../src/lib/types'

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'post-1',
    noteId: 'note-1',
    slug: 'hello-world',
    title: '文章标题',
    excerpt: '文章摘要',
    content: '内容',
    coverUrl: 'https://cdn.test/cover.png',
    categoryId: null,
    tags: [],
    isPublished: true,
    allowComments: true,
    isPinned: false,
    views: 0,
    publishedAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  }
}

const PAGE_URL = 'https://blog.test/posts/hello-world'

/** 后台文章设置里的 SEO 字段：留空即用文章自己的值，填了才覆盖（含 canonical 与收录开关）。 */
describe('post SEO resolution', () => {
  it('falls back to the post itself when nothing was filled in', () => {
    const seo = resolvePostSeo(post(), PAGE_URL)

    expect(seo.title).toBe('文章标题')
    expect(seo.description).toBe('文章摘要')
    expect(seo.image).toBe('https://cdn.test/cover.png')
    expect(seo.canonicalUrl).toBe(PAGE_URL)
    expect(seo.noindex).toBe(false)
  })

  it('prefers every value the post carries', () => {
    const seo = resolvePostSeo(
      post({
        seoTitle: '预览标题',
        seoDescription: '预览描述',
        seoImageUrl: 'https://cdn.test/og.png',
        seoCanonicalUrl: 'https://blog.test/original',
        seoNoindex: true,
      }),
      PAGE_URL,
    )

    expect(seo.title).toBe('预览标题')
    expect(seo.description).toBe('预览描述')
    expect(seo.image).toBe('https://cdn.test/og.png')
    expect(seo.canonicalUrl).toBe('https://blog.test/original')
    expect(seo.noindex).toBe(true)
  })

  it('fills each field on its own: an empty override never blanks the fallback', () => {
    const seo = resolvePostSeo(
      post({ seoTitle: '只要标题', seoImageUrl: '' }),
      PAGE_URL,
    )

    expect(seo.title).toBe('只要标题')
    expect(seo.description).toBe('文章摘要')
    expect(seo.image).toBe('https://cdn.test/cover.png')
  })

  it('reports no image as null so the tag is left out rather than drawn empty', () => {
    const seo = resolvePostSeo(post({ coverUrl: null }), PAGE_URL)

    expect(seo.image).toBeNull()
  })
})

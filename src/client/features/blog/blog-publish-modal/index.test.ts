import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogPostIndexEntry } from '@shared/types'
import { t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useNotes } from '../../../store/notes'
import { BlogPublishModal } from './index'

// The dialog loads categories and asks about the slug when it opens; neither is what this test is
// about, and both would otherwise reach for a server that is not there.
vi.mock('../../../lib/api', () => ({
  api: {
    blog: {
      categories: { list: vi.fn().mockResolvedValue({ categories: [] }) },
      checkSlug: vi.fn().mockResolvedValue({ available: true }),
    },
  },
}))

let rendered: RenderedElement | null = null
let logged: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // A content already in memory keeps `peekContent` out of the picture.
  useNotes.setState({ contents: { 'note-wiring': '# Body' } })
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
  logged.mockRestore()
})

/**
 * UI-04: every visible label is associated with the control it names — the modal used to draw bare
 * `<label>`s the browser could not connect to anything, and the slug's error was a sibling sentence
 * no screen reader would read out with the field.
 */
/**
 * FEA-02: the SEO group draws what the post already carries. An unticked box or an empty field for a
 * post that has these values would be saved back as a cleared one, so the prefill is the contract.
 */
const SEO_POST = {
  id: 'post-seo',
  slug: 'hello-seo',
  noteId: 'note-seo',
  title: 'Hello SEO',
  excerpt: '',
  coverUrl: '',
  categoryId: null,
  folderId: null,
  tags: [],
  publishedAt: 1_700_000_000_000,
  isPublished: true,
  allowComments: true,
  isPinned: false,
  seoTitle: 'Meta title from the post',
  seoDescription: 'Meta description from the post',
  seoImageUrl: 'https://cdn.test/og.png',
  seoCanonicalUrl: 'https://blog.test/original',
  seoNoindex: true,
} satisfies BlogPostIndexEntry

function controlFor(label: string): HTMLElement | null {
  const element = [...document.body.querySelectorAll('label')].find((item) => item.textContent === label)
  const id = element?.getAttribute('for')
  return id ? document.getElementById(id) : null
}

describe('blog publish modal field wiring', () => {
  it('points every label at the control it names', () => {
    rendered = renderElement(createElement(BlogPublishModal, {
      open: true,
      onClose: vi.fn(),
      noteId: 'note-wiring',
    }))

    const labels = [...document.body.querySelectorAll('label')]
    expect(labels.length).toBeGreaterThanOrEqual(6)
    for (const label of labels) {
      const target = label.getAttribute('for')
      expect(target, `label ${label.textContent}`).toBeTruthy()
      const control = document.getElementById(target!)
      expect(control, `control for ${label.textContent}`).toBeTruthy()
      expect(control!.getAttribute('aria-labelledby'), `name for ${label.textContent}`).toBeTruthy()
    }
  })

  it('starts the SEO group from the post it is editing', () => {
    useNotes.setState({
      notes: { 'note-seo': { id: 'note-seo', title: 'Hello SEO', excerpt: '', tags: [] } as never },
      contents: { 'note-seo': '# Body' },
    })
    rendered = renderElement(createElement(BlogPublishModal, {
      open: true,
      onClose: vi.fn(),
      noteId: 'note-seo',
      post: SEO_POST,
    }))

    expect((controlFor(t('blog.seo_title_label')) as HTMLInputElement).value).toBe(SEO_POST.seoTitle)
    expect((controlFor(t('blog.seo_description_label')) as HTMLTextAreaElement).value).toBe(SEO_POST.seoDescription)
    expect((controlFor(t('blog.seo_image_label')) as HTMLInputElement).value).toBe(SEO_POST.seoImageUrl)
    expect((controlFor(t('blog.seo_canonical_label')) as HTMLInputElement).value).toBe(SEO_POST.seoCanonicalUrl)

    const noindex = document.body.querySelector(`[role="switch"][aria-label="${t('blog.seo_noindex_label')}"]`)
    expect(noindex, 'the noindex switch has no name of its own').not.toBeNull()
    expect(noindex!.getAttribute('aria-checked')).toBe('true')
  })
})

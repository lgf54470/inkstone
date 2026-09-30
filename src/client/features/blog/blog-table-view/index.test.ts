import { act, createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { BlogPostSummary } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../lib/test-render'
import { useBlogStore } from '../blog-store'
import { BlogTableView } from './index'

// UI-06: the table drew no name for itself and no `scope` on its headings, so a reader walked it as
// nine anonymous cells, and opening a post was a double-click on the row — a gesture neither a
// keyboard nor a touch screen can make. The title is a real button now.

beforeAll(async () => {
  installTestGlobals()
  await initI18n()
})

const POST: BlogPostSummary = {
  id: 'post-1',
  slug: 'hello-world',
  noteId: 'note-1',
  userId: 'user-1',
  title: 'Hello World',
  excerpt: 'An excerpt',
  coverUrl: '',
  categoryId: null,
  folderId: null,
  tags: ['alpha'],
  isPublished: true,
  allowComments: true,
  isPinned: false,
  views: 3,
  commentsCount: 1,
  publishedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

function mount(onOpenEdit = vi.fn()) {
  useBlogStore.setState({
    categories: [],
    folders: [],
    selectedPostIds: new Set<string>(),
    settings: null,
    stats: null,
    tags: [],
  })
  return { ...renderElement(createElement(BlogTableView, { posts: [POST], onOpenEdit })), onOpenEdit }
}

describe('blog table semantics', () => {
  it('names the table and scopes every heading to its column', () => {
    const rendered = mount()
    try {
      const caption = rendered.container.querySelector('table > caption')
      expect(caption, 'the table has no name of its own').not.toBeNull()
      expect(caption!.textContent).toBe(t('blog.posts_table_caption'))
      expect(caption!.className).toContain('sr-only')

      const headings = [...rendered.container.querySelectorAll('th')]
      expect(headings.length).toBeGreaterThan(0)
      for (const heading of headings) {
        expect(heading.getAttribute('scope'), `heading "${heading.textContent}" is unscoped`).toBe('col')
      }
    } finally {
      rendered.unmount()
    }
  })

  it('opens the post from its title button rather than a double-click on the row', () => {
    const rendered = mount()
    try {
      const title = [...rendered.container.querySelectorAll('button')].find(
        (button) => button.textContent === POST.title,
      )
      expect(title, 'the title is not a button').toBeDefined()
      act(() => { title!.click() })
      expect(rendered.onOpenEdit).toHaveBeenCalledWith(POST)
    } finally {
      rendered.unmount()
    }
  })
})

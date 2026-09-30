import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { useNotes } from '../../store/notes'
import { BlogCategoriesModal } from './blog-categories-modal'
import { BlogHubModal } from './blog-hub-modal'
import { BlogPublishModal } from './blog-publish-modal'
import { BlogSettingsModal } from './blog-settings-modal'

// UI-07: all four dialogs draw their own heading and close button, so they never handed `Modal` a
// `title` and a screen reader announced them as the generic "Dialog". Each one now names itself.

// The dialogs open by asking the hub for its data; every answer here is the empty one, shaped the
// way the loaders read it (a list scope receives an array, not `{}`).
vi.mock('../../lib/api', () => ({
  api: {
    blog: {
      posts: { list: () => Promise.resolve({ posts: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } }) },
      postIndex: () => Promise.resolve({ posts: [] }),
      folders: { list: () => Promise.resolve([]) },
      tags: { list: () => Promise.resolve([]) },
      categories: { list: () => Promise.resolve({ categories: [] }) },
      comments: { list: () => Promise.resolve({ comments: [], counts: null }) },
      stats: () => Promise.resolve({ stats: null }),
      settings: { get: () => Promise.resolve({ settings: null }) },
      analytics: () => Promise.resolve({ analytics: null }),
      checkSlug: () => Promise.resolve({ available: true }),
    },
  },
}))

let rendered: RenderedElement | null = null
let logged: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  useNotes.setState({ contents: { 'note-name': '# Body' } })
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
  logged.mockRestore()
})

function dialogName(): string | null {
  return document.body.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null
}

const CASES: Array<{ name: string; label: string; node: () => React.ReactElement }> = [
  {
    name: 'blog hub',
    label: 'blog.hub_title',
    node: () => createElement(BlogHubModal, { open: true, onClose: vi.fn() }),
  },
  {
    name: 'publish',
    label: 'blog.publish_modal_title',
    node: () => createElement(BlogPublishModal, { open: true, onClose: vi.fn(), noteId: 'note-name' }),
  },
  {
    name: 'settings',
    label: 'blog.settings',
    node: () => createElement(BlogSettingsModal, { open: true, onClose: vi.fn() }),
  },
  {
    name: 'categories',
    label: 'blog.categories',
    node: () => createElement(BlogCategoriesModal, { open: true, onClose: vi.fn() }),
  },
]

describe('blog dialog names', () => {
  it.each(CASES)('$name names its dialog instead of leaving it generic', ({ node, label }) => {
    rendered = renderElement(node())
    expect(dialogName()).toBe(label)
  })

  it('names the publish dialog after the action it is doing', () => {
    rendered = renderElement(createElement(BlogPublishModal, {
      open: true,
      onClose: vi.fn(),
      noteId: 'note-name',
      post: {
        id: 'post-1',
        slug: 'hello',
        noteId: 'note-name',
        title: 'Hello',
        excerpt: '',
        coverUrl: '',
        categoryId: null,
        tags: [],
        publishedAt: 1,
        isPublished: true,
        allowComments: true,
        isPinned: false,
        seoTitle: '',
        seoDescription: '',
        seoImageUrl: '',
        seoCanonicalUrl: '',
        seoNoindex: false,
      },
    }))
    expect(dialogName()).toBe('blog.edit_modal_title')
  })
})

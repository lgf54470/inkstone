import { act, createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { BlogPostSummary } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { installTestGlobals, renderElement } from '../../../lib/test-render'
import { BlogGridCard } from './card'

// UI-06/UI-07 on the grid: the card opened on a double-click and its pin control was drawn only on
// hover, so neither was reachable from a keyboard. Both are named controls with a `focus-visible`
// arm now.

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
  tags: [],
  isPublished: true,
  allowComments: true,
  isPinned: false,
  views: 3,
  commentsCount: 0,
  publishedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  seoTitle: '',
  seoDescription: '',
  seoImageUrl: '',
  seoCanonicalUrl: '',
  seoNoindex: false,
}

function mount(onOpenEdit = vi.fn()) {
  return {
    ...renderElement(createElement(BlogGridCard, {
      post: POST,
      isSelected: false,
      cat: null,
      folder: null,
      folders: [],
      frontendBase: 'https://blog.example.com',
      onToggleSelect: vi.fn(),
      onOpenEdit,
      onOpenRevisions: vi.fn(),
    })),
    onOpenEdit,
  }
}

describe('blog grid card', () => {
  it('opens the post from its title button rather than a double-click on the card', () => {
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

  it('keeps the pin control visible to a keyboard user', () => {
    const rendered = mount()
    try {
      const pin = [...rendered.container.querySelectorAll('button')].find(
        (button) => button.getAttribute('title') === t('blog.pin_post'),
      )
      expect(pin, 'the pin control was not found to measure').toBeDefined()
      expect(pin!.className, 'the pin button is hidden from a focused keyboard user').toContain(
        'focus-visible:opacity-100',
      )
    } finally {
      rendered.unmount()
    }
  })
})

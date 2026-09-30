import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { BlogLink } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { LinkCardRow } from './link-card-row'

/**
 * A link's address arrives from a reader. Rows stored before the server learned to refuse an
 * unrenderable one still reach this component, so the row itself must not turn that value into an
 * affordance — the browser runs a `javascript:` href in the admin's own session.
 */
beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  await initI18n()
})

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function link(url: string): BlogLink {
  return {
    id: 'link-1',
    name: 'A friend',
    url,
    description: '',
    avatar: '',
    email: '',
    categoryId: null,
    status: 'approved',
    isPinned: false,
    pinnedOrder: 0,
    isFavorite: false,
    sortOrder: 0,
    isActive: true,
    clicks: 0,
    createdAt: 1,
    updatedAt: 1,
  }
}

function mountUrl(url: string, extra: Partial<Parameters<typeof LinkCardRow>[0]> = {}): void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(createElement(LinkCardRow, {
      link: link(url),
      categories: [],
      isSelected: false,
      onToggleSelect: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
      onTogglePin: vi.fn(),
      onToggleFavorite: vi.fn(),
      ...extra,
    }))
  })
}

describe('link row address', () => {
  it('links an address a link may carry', () => {
    mountUrl('https://friend.example/posts')

    const anchor = document.querySelector('a[href="https://friend.example/posts"]')
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('shows an address it must not act on as plain text', () => {
    mountUrl('javascript:alert(document.cookie)')

    expect(document.querySelector('a')).toBeNull()
    expect(document.body.textContent).toContain('javascript:alert(document.cookie)')
  })
})

describe('link row actions menu button', () => {
  /** UI-09: the panel holding copy, QR and check had no keyboard entry point until this button. */
  it('is a named menu button that reports the panel it opens', () => {
    const onMoreActions = vi.fn()
    mountUrl('https://friend.example', { onMoreActions, isMenuOpen: true })

    const button = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
    expect(button.getAttribute('aria-label')).toBe(t('blog.link_more_actions'))
    expect(button.getAttribute('aria-expanded')).toBe('true')

    act(() => button.click())
    expect(onMoreActions).toHaveBeenCalledTimes(1)
  })

  it('is left out when the row has nowhere to open the panel', () => {
    mountUrl('https://friend.example')

    expect(document.querySelector('button[aria-haspopup="menu"]')).toBeNull()
  })
})

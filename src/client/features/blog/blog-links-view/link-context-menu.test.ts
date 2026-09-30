import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { LinkContextMenu, linkMenuAnchorPoint, type LinkContextMenuState } from './link-context-menu'

// UI-09: copy, QR and check lived only inside the hand-drawn right-click portal, whose rows were
// plain buttons in a `role`-less panel and whose submenu answered to hover alone — a keyboard could
// not open the panel, and a keyboard-opened `contextmenu` put it in the page corner. The panel is
// the shared `Menu` now, reachable from a button every row carries; these pin the reachability.

beforeAll(async () => {
  await initI18n()
})

const LINK: BlogLink = {
  id: 'link-1',
  name: 'A friend',
  url: 'https://friend.example/posts',
  description: null,
  avatar: null,
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

const CATEGORY: BlogLinkCategory = { id: 'cat-1', name: 'Tools', icon: null, parentId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }

let rendered: RenderedElement | null = null

afterEach(() => {
  rendered?.unmount()
  rendered = null
  document.body.replaceChildren()
})

function mountMenu(overrides: Partial<LinkContextMenuState> = {}, handlers: Partial<Parameters<typeof LinkContextMenu>[0]> = {}) {
  const props = {
    state: { isOpen: true, x: 20, y: 30, link: LINK, ...overrides } as LinkContextMenuState,
    categories: [CATEGORY],
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onQRCode: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleFavorite: vi.fn(),
    onMoveCategory: vi.fn(),
    onCheckLink: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...handlers,
  }
  rendered = renderElement(createElement(LinkContextMenu, props))
  return props
}

function menu(): HTMLElement {
  const panel = document.body.querySelector<HTMLElement>('[role="menu"]')
  if (!panel) throw new Error('the menu did not render')
  return panel
}

function rows(): HTMLElement[] {
  return [...menu().querySelectorAll<HTMLElement>('[data-menu-index]')]
}

function rowLabelled(label: string): HTMLElement {
  const row = rows().find((el) => el.textContent?.includes(label))
  if (!row) throw new Error(`no row labelled “${label}”`)
  return row
}

function press(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

describe('link actions menu', () => {
  it('is a labelled menu rather than a bare panel', () => {
    mountMenu()

    expect(menu().getAttribute('aria-label')).toBe(t('blog.link_menu_label', { value0: LINK.name }))
    expect(rows().length).toBeGreaterThan(0)
  })

  it('holds the actions that used to hide behind a right-click', () => {
    mountMenu()

    for (const label of [t('blog.link_menu_copy'), t('blog.link_menu_qrcode'), t('blog.link_menu_check')]) {
      expect(rowLabelled(label)).toBeTruthy()
    }
  })

  it('runs the row the keyboard is on and closes the panel', () => {
    const props = mountMenu()
    const first = rows()[0]!

    act(() => { first.focus() })
    press(first, 'Enter')

    expect(props.onCopy).toHaveBeenCalledWith(LINK)
    expect(props.onClose).toHaveBeenCalled()
  })

  it('does not render the panel while the state says it is closed', () => {
    mountMenu({ isOpen: false })

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })
})

describe('category panel', () => {
  it('opens from its row and closes the menu once a folder is picked', async () => {
    const props = mountMenu()
    const move = rowLabelled(t('blog.link_menu_move_category'))

    // The cursor walks down to the row before the arrow can open what hangs off it.
    act(() => { rows()[0]!.focus() })
    for (let i = 0; i < Number(move.dataset.menuIndex); i++) press(rows()[0]!, 'ArrowDown')
    press(document.activeElement as HTMLElement, 'ArrowRight')
    await act(async () => {})

    const option = [...document.body.querySelectorAll<HTMLElement>('button')].find((el) => el.textContent?.includes(CATEGORY.name))
    expect(option, 'the category panel did not open').toBeTruthy()
    act(() => { option!.click() })

    expect(props.onMoveCategory).toHaveBeenCalledWith(LINK, CATEGORY.id)
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('where the menu opens', () => {
  it('uses the pointer coordinates when the event carries them', () => {
    const target = document.createElement('button')
    expect(linkMenuAnchorPoint({ clientX: 120, clientY: 240, currentTarget: target })).toEqual({ x: 120, y: 240 })
  })

  it('falls back to the trigger box for a keyboard `contextmenu`, which reports 0,0', () => {
    const target = document.createElement('button')
    document.body.appendChild(target)
    target.getBoundingClientRect = () => ({ left: 40, bottom: 90 } as DOMRect)

    expect(linkMenuAnchorPoint({ clientX: 0, clientY: 0, currentTarget: target })).toEqual({ x: 40, y: 90 })
  })
})

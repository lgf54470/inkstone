import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogLink } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { LinkQrModal } from './link-qr-modal'

// UI-13: a refused copy drew nothing at all — the tick simply never appeared, which reads the same as
// a copy that has not been registered yet. Both outcomes are announced now.

const LINK: BlogLink = {
  id: 'link-1',
  name: 'Example',
  url: 'https://example.com',
  description: '',
  avatar: null,
  categoryId: null,
  status: 'approved',
  isPinned: false,
  pinnedOrder: 0,
  isFavorite: false,
  sortOrder: 0,
  isActive: true,
  clicks: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

let rendered: RenderedElement | null = null

beforeAll(async () => {
  await initI18n()
})

beforeEach(() => {
  useUi.setState({ toasts: [] })
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function copyButton(): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(
    (el) => el.textContent?.trim() === t('blog.link_menu_copy') || el.textContent?.trim() === t('common.copied'),
  )
  if (!button) throw new Error('no copy button')
  return button
}

function mount(): void {
  rendered = renderElement(createElement(LinkQrModal, { open: true, onClose: vi.fn(), link: LINK }))
}

describe('link QR modal copy', () => {
  it('reports the refusal instead of only leaving the tick away', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    mount()

    await act(async () => { copyButton().click() })

    expect(useUi.getState().toasts.map((toast) => toast.tone)).toContain('danger')
    expect(copyButton().textContent?.trim()).toBe(t('blog.link_menu_copy'))
  })

  it('copies and shows the tick', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()

    await act(async () => { copyButton().click() })

    expect(writeText).toHaveBeenCalledWith(LINK.url)
    expect(copyButton().textContent?.trim()).toBe(t('common.copied'))
  })
})

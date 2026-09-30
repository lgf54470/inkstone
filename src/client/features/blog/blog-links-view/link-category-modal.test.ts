import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogLinkCategory } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { LinkCategoryModal } from './link-category-modal'

// UI-08: the category CRUD had no success feedback — creating or saving said nothing — and its
// delete question was the *delete-a-link* sentence. These pin the three answers the modal now gives.

const confirmMock = vi.hoisted(() => vi.fn())
vi.mock('../../../components/overlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/overlay')>()
  return { ...actual, confirm: confirmMock }
})

const CATEGORY: BlogLinkCategory = {
  id: 'cat-1',
  name: 'Tools',
  icon: null,
  parentId: null,
  sortOrder: 0,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
}

beforeAll(async () => {
  await initI18n()
})

let rendered: RenderedElement | null = null

beforeEach(() => {
  useUi.setState({ toasts: [] })
  confirmMock.mockReset()
  confirmMock.mockResolvedValue(false)
})

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

function toastTitles(): string[] {
  return useUi.getState().toasts.map((toast) => toast.title)
}

function buttonNamed(container: ParentNode, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (el) => el.textContent?.trim() === name || el.getAttribute('aria-label') === name,
  )
  if (!button) throw new Error(`no button named "${name}"`)
  return button
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function mount(overrides: Partial<Parameters<typeof LinkCategoryModal>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    categories: [CATEGORY],
    onCreateCategory: vi.fn().mockResolvedValue(CATEGORY),
    onUpdateCategory: vi.fn().mockResolvedValue(true),
    onDeleteCategory: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
  rendered = renderElement(createElement(LinkCategoryModal, props))
  // `Modal` portals to the body, so the dialog is not inside the render container.
  return { container: document.body, props }
}

describe('link category modal feedback', () => {
  it('asks the category question rather than the link one', async () => {
    const { container, props } = mount()
    await act(async () => { buttonNamed(container, t('common.delete')).click() })

    const asked = confirmMock.mock.calls[0]![0] as { description: string }
    expect(asked.description).toBe(t('blog.confirm_delete_link_category', { value0: CATEGORY.name }))
    // The old question was the sentence used for a single link, and it named no category.
    expect(asked.description).not.toBe(t('blog.confirm_delete_link'))
    expect(props.onDeleteCategory).not.toHaveBeenCalled()
  })

  it('reports a created category and clears the form', async () => {
    const { container, props } = mount()
    const name = container.querySelector<HTMLInputElement>(`input[placeholder="${t('blog.link_category_name')}"]`)!
    await act(async () => { setInputValue(name, 'Reading') })
    await act(async () => { container.querySelector<HTMLButtonElement>('form button[type="submit"]')!.click() })

    expect(props.onCreateCategory).toHaveBeenCalledWith({ name: 'Reading', icon: null, parentId: null })
    expect(toastTitles()).toContain(t('common.created'))
    expect(name.value).toBe('')
  })

  it('keeps the row busy while a save is in flight and announces it once it lands', async () => {
    let settle: (value: boolean) => void = () => {}
    const pending = new Promise<boolean>((resolve) => { settle = resolve })
    const { container } = mount({ onUpdateCategory: vi.fn().mockReturnValue(pending) })

    await act(async () => { buttonNamed(container, t('common.edit')).click() })
    const save = buttonNamed(container, t('common.save'))
    await act(async () => { save.click() })

    expect(save.disabled, 'the save accepted a second click while the first was in flight').toBe(true)

    await act(async () => {
      settle(true)
      await pending
    })
    expect(toastTitles()).toContain(t('common.saved'))
  })
})

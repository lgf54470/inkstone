import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareHubToolbar } from './share-hub-toolbar'
import { ShareVisitLogsModal } from './share-visit-logs-modal'
import { ShareSlugCard, ShareTagsCard } from './share-edit-modal/sections'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
      visits: vi.fn(async () => ({ visits: [], total: 0, page: 1, limit: 25, totalPages: 0 })),
      cleanVisits: vi.fn(async () => ({ deleted: 0 })),
      noteAnalytics: vi.fn(async () => ({ timeline: [] })),
      globalAnalytics: vi.fn(async () => {
        throw new Error('not used by these tests')
      }),
    },
  },
}))

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function inputByLabel(container: ParentNode, label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('input')].find((input) => input.getAttribute('aria-label') === label)
  expect(found, `input labelled ${label}`).toBeDefined()
  return found!
}

beforeEach(() => {
  vi.clearAllMocks()
  useShareStore.setState({ search: '', category: 'all' })
})

describe('hub toolbar search keeps working through the Input component', () => {
  it('has an accessible name and drives the store search state', () => {
    const rendered = renderElement(createElement(ShareHubToolbar, {}))
    const input = inputByLabel(rendered.container, 'share.search_placeholder')
    typeInto(input, 'hello')
    expect(useShareStore.getState().search).toBe('hello')
    expect(input.value).toBe('hello')
    rendered.unmount()
  })
})

describe('visit logs search box keeps submitting through the Input component', () => {
  it('has an accessible name and echoes typed text', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await settle()
    const input = inputByLabel(document.body, 'share.search_logs_placeholder')
    typeInto(input, 'chrome')
    expect(input.value).toBe('chrome')
    rendered.unmount()
  })
})

describe('share edit modal tag and slug inputs go through the Input component', () => {
  function tagsBundle() {
    return {
      shareTags: [] as string[],
      newTagInput: '',
      setNewTagInput: vi.fn(),
      handleAddTag: vi.fn(),
      handleRemoveTag: vi.fn(),
    }
  }

  function slugBundle() {
    return {
      shouldUseCustomSlug: true,
      setShouldUseCustomSlug: vi.fn(),
      customSlug: '',
      setCustomSlug: vi.fn(),
      isSlugChecking: false,
      slugAvailable: null,
      slugError: null,
    }
  }

  it('the new-tag input is named and adds on Enter', () => {
    const b = tagsBundle()
    const rendered = renderElement(createElement(ShareTagsCard, { b: b as never }))
    const input = inputByLabel(rendered.container, 'tags.new_placeholder')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(b.handleAddTag).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })

  it('the custom slug input is named and the random button generates a slug', () => {
    const b = slugBundle()
    const rendered = renderElement(createElement(ShareSlugCard, { b: b as never }))
    inputByLabel(rendered.container, 'share.custom_slug')
    const dice = [...rendered.container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('share.random_slug_btn'))
    expect(dice).toBeDefined()
    act(() => {
      dice!.click()
    })
    expect(b.setCustomSlug).toHaveBeenCalledTimes(1)
    expect(String(b.setCustomSlug.mock.calls[0][0])).toMatch(/^[a-z0-9]{6}$/)
    rendered.unmount()
  })
})

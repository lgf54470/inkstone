import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useUi } from '../../store/ui'
import { useShareList } from './use-share-list'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

type ListBundle = ReturnType<typeof useShareList>

let bundle: ListBundle | null = null

function ListProbe() {
  bundle = useShareList()
  return null
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  bundle = null
  useUi.setState({ toasts: [] })
})

describe('copying a share link reports failure instead of staying silent', () => {
  it('toasts when the clipboard rejects the write', async () => {
    stubClipboard(async () => {
      throw new Error('permission denied')
    })
    const rendered = renderElement(createElement(ListProbe))
    await settle()
    await act(async () => {
      void bundle!.handleCopy('https://example.test/s/abc', 'abc')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const titles = useUi.getState().toasts.map((toast) => toast.title)
    expect(titles).toContain('preview.could_not_copy')
    expect(bundle!.copiedSlug).toBeNull()
    rendered.unmount()
  })

  it('marks the row as copied when the write succeeds', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const rendered = renderElement(createElement(ListProbe))
    await settle()
    await act(async () => {
      void bundle!.handleCopy('https://example.test/s/abc', 'abc')
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(writeText).toHaveBeenCalledWith('https://example.test/s/abc')
    expect(bundle!.copiedSlug).toBe('abc')
    expect(useUi.getState().toasts.map((toast) => toast.title)).not.toContain('preview.could_not_copy')
    rendered.unmount()
  })
})

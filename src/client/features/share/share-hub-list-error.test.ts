import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { useShareStore } from './share-store'
import { ShareHubModal } from './share-hub-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  useShareStore.setState({
    category: 'all',
    viewMode: 'table',
    shares: [],
    loading: false,
    error: false,
    selectedNoteIds: new Set<string>(),
  })
})

describe('share hub list failure surfacing', () => {
  it('renders an alert with retry instead of the false-empty list when the first screen fails', async () => {
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))
    const rendered = renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
    await flush()

    const alert = document.body.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('share.list_load_failed')
    expect(document.body.textContent).not.toContain('share.no_shares_hint')
    rendered.unmount()
  })

  it('retry from the failed first screen loads the list', async () => {
    vi.mocked(api.share.list).mockRejectedValueOnce(new Error('network down'))
    const rendered = renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
    await flush()

    vi.mocked(api.share.list).mockResolvedValueOnce({ shares: [], globalStats: null } as never)
    const retry = [...document.body.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('common.retry'))
    expect(retry).toBeDefined()
    await act(async () => {
      retry!.click()
    })
    await flush()

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    expect(document.body.textContent).toContain('share.no_shares_found')
    rendered.unmount()
  })
})

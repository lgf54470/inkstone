import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { ShareNoteAnalyticsModal } from './share-note-analytics-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      noteAnalytics: vi.fn(async () => ({ timeline: [], recentVisits: [], topCountries: [], topReferrers: [], channels: [] })),
    },
  },
}))

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function bodyButton(key: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(key))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('note analytics modal links to that note visit logs (SH-33)', () => {
  it('exposes a view-all-logs entry wired to the callback', async () => {
    const onOpenLogs = vi.fn()
    const rendered = renderElement(createElement(ShareNoteAnalyticsModal, {
      open: true,
      onClose: () => {},
      noteId: 'note-7',
      onOpenLogs,
    }))
    await settle()

    const trigger = bodyButton('share.view_all_logs')
    expect(trigger).toBeDefined()
    await act(async () => {
      trigger!.click()
    })
    expect(onOpenLogs).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })

  it('renders no logs entry when the host cannot open them', async () => {
    const rendered = renderElement(createElement(ShareNoteAnalyticsModal, {
      open: true,
      onClose: () => {},
      noteId: 'note-7',
    }))
    await settle()
    expect(bodyButton('share.view_all_logs')).toBeUndefined()
    rendered.unmount()
  })
})

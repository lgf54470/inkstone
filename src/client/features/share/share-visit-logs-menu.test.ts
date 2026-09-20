import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { confirm, prompt } from '../../components/overlay'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(async () => ({ visits: [], total: 0, page: 1, pageSize: 25, totalPages: 0 })),
      cleanVisits: vi.fn(async () => ({ deleted: 3 })),
    },
  },
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../components/overlay')>()
  return {
    ...module,
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'wipe-password-1'),
  }
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function cleanTrigger(): HTMLElement {
  const trigger = [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('share.clean_logs_btn'))
  expect(trigger).toBeDefined()
  return trigger!
}

// Opens the clean menu with a real click and picks the wipe-everything entry.
async function clickCleanAllItem(): Promise<void> {
  await act(async () => {
    cleanTrigger().click()
  })
  const allItem = [...document.body.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
    .find((item) => item.textContent?.includes('share.clean_all_logs'))
  expect(allItem).toBeDefined()
  await act(async () => {
    allItem!.click()
  })
  await flush()
}

beforeEach(() => {
  vi.mocked(api.share.visits).mockClear()
  vi.mocked(api.share.cleanVisits).mockClear()
  vi.mocked(confirm).mockClear()
  vi.mocked(prompt).mockClear()
  vi.mocked(prompt).mockResolvedValue('wipe-password-1')
})

describe('share visit logs clean menu (SH-27)', () => {
  it('exposes the clean menu as an accessible popup that opens on click', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await flush()

    const trigger = cleanTrigger()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      trigger.click()
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    const items = [...document.body.querySelectorAll('[role="menu"] [role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toEqual([
      'share.clean_bots_only',
      'share.clean_older_30d',
      'share.clean_all_logs',
    ])
    rendered.unmount()
  })

  it('runs the destructive clean only after a danger confirmation', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await flush()

    await clickCleanAllItem()

    expect(confirm).toHaveBeenCalled()
    expect(vi.mocked(confirm).mock.calls[0][0]).toMatchObject({ tone: 'danger' })
    expect(prompt).toHaveBeenCalledWith(expect.objectContaining({ type: 'password' }))
    expect(api.share.cleanVisits).toHaveBeenCalledWith('all', 30, 'wipe-password-1')
    rendered.unmount()
  })

  it('aborts the full wipe when the password prompt is dismissed', async () => {
    vi.mocked(prompt).mockResolvedValueOnce(null)
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await flush()

    await clickCleanAllItem()

    expect(prompt).toHaveBeenCalled()
    expect(api.share.cleanVisits).not.toHaveBeenCalled()
    rendered.unmount()
  })
})

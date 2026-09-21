import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ extend: vi.fn(), list: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { share: { extend: H.extend, list: H.list } },
  ApiError: class ApiError extends Error {},
}))

import { renderElement } from '../../lib/test-render'
import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { ShareBatchBar } from './share-batch-bar'
import { useShareStore } from './share-store'

/**
 * SH-62: renewal is the action a person reaches for before a link lapses, and the two ways it
 * can come back with nothing done — a permanent link has no clock to move, and a selection may
 * not be shared at all — have to read differently from "extended 0 links".
 */
async function flush(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
  })
}

function expiryTrigger(): HTMLButtonElement {
  const trigger = [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(t('share.batch_set_expiry')))
  expect(trigger).toBeDefined()
  return trigger as HTMLButtonElement
}

async function openExpiryMenu(): Promise<void> {
  await act(async () => {
    expiryTrigger().click()
  })
  await flush()
}

async function pickRenewal(days: number): Promise<void> {
  await openExpiryMenu()
  const item = [...document.body.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')]
    .find((button) => button.textContent?.includes(t('share.batch_extend_days', { days })))
  expect(item, `renewal row for ${days} days`).toBeDefined()
  await act(async () => {
    item!.click()
  })
  await flush()
}

function lastToast() {
  const { toasts } = useUi.getState()
  return toasts[toasts.length - 1]
}

beforeEach(async () => {
  vi.clearAllMocks()
  // Real messages, so the toast assertions read sentences rather than message ids.
  await initI18n()
  useUi.setState({ toasts: [] })
  H.list.mockResolvedValue({ shares: [], total: 0, truncated: false, globalStats: null })
  useShareStore.setState({
    shares: [],
    folders: [],
    selectedNoteIds: new Set(['note-a', 'note-b']),
    batchBusy: false,
    error: false,
  })
})

describe('batch renewal (SH-62)', () => {
  it('offers renewal alongside the absolute expiry entries', async () => {
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 2, onClearSelection: () => {} }))
    await openExpiryMenu()

    const labels = [...document.body.querySelectorAll('[role="menu"] [role="menuitem"]')]
      .map((item) => item.textContent)
    expect(labels).toEqual([
      t('share.never_expires'),
      t('share.1_day'),
      t('share.7_days'),
      t('share.30_days'),
      t('share.batch_extend_days', { days: 7 }),
      t('share.batch_extend_days', { days: 30 }),
    ])
    rendered.unmount()
  })

  it('sees the expiry menu as a popup that opens on click', async () => {
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 2, onClearSelection: () => {} }))
    expect(expiryTrigger().getAttribute('aria-expanded')).toBe('false')
    await openExpiryMenu()
    expect(expiryTrigger().getAttribute('aria-expanded')).toBe('true')
    rendered.unmount()
  })
})

describe('batch renewal feedback (SH-62)', () => {
  it('asks the server to extend the selected notes and reports what moved', async () => {
    H.extend.mockResolvedValue({ ok: true, count: 2, permanent: 1 })
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 2, onClearSelection: () => {} }))

    await pickRenewal(7)

    expect(H.extend).toHaveBeenCalledWith(['note-a', 'note-b'], 7)
    expect(lastToast()?.title).toBe(t('share.batch_extend_success', { count: 2, days: 7 }))
    expect(lastToast()?.description).toBe(t('share.batch_extend_kept_permanent', { count: 1 }))
    expect(lastToast()?.tone).toBe('success')
    rendered.unmount()
  })

  it('says permanent links were left alone instead of claiming success', async () => {
    H.extend.mockResolvedValue({ ok: true, count: 0, permanent: 2 })
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 2, onClearSelection: () => {} }))

    await pickRenewal(7)

    expect(lastToast()?.title).toBe(t('share.batch_extend_all_permanent', { count: 2 }))
    expect(lastToast()?.title).not.toBe(t('share.batch_extend_success', { count: 0, days: 7 }))
    expect(lastToast()?.tone).toBe('warning')
    rendered.unmount()
  })

  it('says there was no expiry to extend when the selection carries none', async () => {
    H.extend.mockResolvedValue({ ok: true, count: 0, permanent: 0 })
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 2, onClearSelection: () => {} }))

    await pickRenewal(30)

    expect(lastToast()?.title).toBe(t('share.batch_extend_none'))
    expect(lastToast()?.tone).toBe('warning')
    rendered.unmount()
  })
})

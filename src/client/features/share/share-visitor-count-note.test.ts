import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(async () => ({ visits: [], total: 0, page: 1, totalPages: 1 })),
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false })),
    },
  },
  ApiError: class ApiError extends Error {},
}))

/**
 * SH-83: UV is a salted fingerprint count — once per person per UTC day, and one bucket per address
 * however many people sit behind it. Neither the KPI nor the log table could be read that way from
 * the screen alone, so the log view now states it; this pins that the sentence is really there.
 */
describe('share visit logs visitor-count note (SH-83)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  it('explains what a unique visitor counts as', () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain(t('share.visitor_count_note'))
    rendered.unmount()
  })
})

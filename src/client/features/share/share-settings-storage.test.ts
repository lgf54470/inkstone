import { createElement } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { ShareSettingsModal } from './share-settings-modal'

vi.mock('../../lib/api', () => ({
  api: { share: { list: vi.fn(async () => ({ shares: [], total: 0, truncated: false })) } },
  ApiError: class ApiError extends Error {},
}))

/**
 * SH-61: one Save button writes two different places — the three traffic filters go to this browser's
 * store, the retention goes to the account (the server sweep reads it). A person cannot tell that
 * from the switches alone, and the difference decides whether another device sees the setting. The
 * two notes beside their groups are the whole fix, so they are what this asserts.
 */
describe('share settings storage scopes (SH-61)', () => {
  beforeAll(async () => {
    await initI18n()
  })

  // The modal mounts its panel through a portal, so its text lives on the document.
  it('says which group is kept in the browser and which on the account', () => {
    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    expect(document.body.textContent).toContain(t('share.settings_stored_local'))
    expect(document.body.textContent).toContain(t('share.settings_stored_account'))
    rendered.unmount()
  })
})

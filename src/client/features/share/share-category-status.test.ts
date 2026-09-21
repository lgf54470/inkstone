import { describe, expect, it } from 'vitest'
import type { ShareCategory } from '@shared/types'
import { shareCategoryStatus } from '@shared/share-selection'

/**
 * The record is the exhaustiveness check: `Record<ShareCategory, ...>` stops compiling the moment
 * a category joins the union without being mapped here, and the loop below then proves the mapping
 * the list query actually gets. A category that fell through to `all` would look like a filter that
 * silently does nothing — the failure this pins down.
 *
 * The mapping itself lives in `@shared/share-selection`, because the worker refuses a status outside
 * that vocabulary and the demo backend evaluates the same rules; this file is the client-side pin on
 * it, not the definition.
 */
const EXPECTED_STATUS: Record<ShareCategory, string> = {
  dashboard: 'all',
  // Inert by design: this category renders the collections panel, which reads its own endpoint, so
  // the list status it maps to is never sent. It still has to be a value the store accepts.
  collections: 'all',
  all: 'all',
  active: 'active',
  paused: 'paused',
  pinned: 'pinned',
  starred: 'starred',
  password: 'password',
  expiring_soon: 'expiring_soon',
  expiring: 'expiring',
  permanent: 'permanent',
  expired: 'expired',
}

describe('share sidebar categories map to list statuses', () => {
  it('every category reaches the status the worker filters on', () => {
    for (const [category, status] of Object.entries(EXPECTED_STATUS) as Array<[ShareCategory, string]>) {
      expect([category, shareCategoryStatus(category)]).toEqual([category, status])
    }
  })

  it('keeps the two expiry categories apart', () => {
    expect(shareCategoryStatus('expiring_soon')).not.toBe(shareCategoryStatus('expiring'))
  })
})

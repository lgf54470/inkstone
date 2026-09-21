import { describe, expect, it } from 'vitest'
import type { ShareCategory } from '@shared/types'
import { statusForCategory } from './share-store/filters'

/**
 * The record is the exhaustiveness check: `Record<ShareCategory, ...>` stops compiling the moment
 * a category joins the union without being mapped here, and the loop below then proves the mapping
 * the list query actually gets. A category that fell through to `all` would look like a filter that
 * silently does nothing — the failure this pins down.
 */
const EXPECTED_STATUS: Record<ShareCategory, string> = {
  dashboard: 'all',
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
      expect([category, statusForCategory(category)]).toEqual([category, status])
    }
  })

  it('keeps the two expiry categories apart', () => {
    expect(statusForCategory('expiring_soon')).not.toBe(statusForCategory('expiring'))
  })
})

import { describe, expect, it, vi } from 'vitest'
import { useBlogStore } from './index'

// Seeded before the store module above is evaluated, so the cached record cap
// is already in browser storage when the store builds its initial state.
const KEY = vi.hoisted(() => {
  const key = 'inkstone_blog_retention_settings'
  localStorage.setItem(key, JSON.stringify({ logRetentionDays: 7, maxLogRecords: 5000 }))
  return key
})

describe('blog store carries no retention settings (SH-45)', () => {
  it('ignores what a browser cached before the settings went away', () => {
    const state = useBlogStore.getState()
    expect('maxLogRecords' in state).toBe(false)
    expect('logRetentionDays' in state).toBe(false)
    expect('setRetentionSettings' in state).toBe(false)
  })

  it('never writes the retention key while the traffic filters change', () => {
    localStorage.removeItem(KEY)
    useBlogStore.getState().setFilters({ excludeBots: false })
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

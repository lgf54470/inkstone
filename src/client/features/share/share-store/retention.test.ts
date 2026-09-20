import { describe, expect, it, vi } from 'vitest'
import { useShareStore } from './index'

// Seeded before the store module above is evaluated, so the cached cap is
// already in browser storage when the store builds its initial state.
const KEY = vi.hoisted(() => {
  const key = 'inkstone_share_retention'
  localStorage.setItem(key, JSON.stringify({ maxLogRecords: 5000 }))
  return key
})

describe('share store carries no record cap (SH-39)', () => {
  it('ignores the cap a browser cached before the setting went away', () => {
    const state = useShareStore.getState()
    expect('maxLogRecords' in state).toBe(false)
    expect('setRetentionSettings' in state).toBe(false)
  })

  it('never writes the record-cap key while the traffic filters change', () => {
    localStorage.removeItem(KEY)
    useShareStore.getState().setFilters({ excludeBots: false })
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

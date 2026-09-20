import { describe, expect, it, vi } from 'vitest'
import { RETENTION_SETTINGS_KEY } from './state'
import { useBlogStore } from './index'

// Seeded before the store module above is evaluated, so the cached retention
// period is already in browser storage when the store builds its initial state.
const cachedRecordCap = vi.hoisted(() => {
  localStorage.setItem(
    'inkstone_blog_retention_settings',
    JSON.stringify({ logRetentionDays: 7, maxLogRecords: 5000 }),
  )
  return 5000
})

describe('blog store carries no retention period (SH-43)', () => {
  it('reads the period from the account instead of this browser cache', () => {
    const state = useBlogStore.getState()
    expect('logRetentionDays' in state).toBe(false)
    expect(state.maxLogRecords).toBe(cachedRecordCap)
  })

  it('never writes a retention period when the record cap changes', () => {
    useBlogStore.getState().setRetentionSettings({ maxLogRecords: 1000 })
    const stored = JSON.parse(localStorage.getItem(RETENTION_SETTINGS_KEY) ?? '{}') as Record<string, unknown>
    expect('logRetentionDays' in stored).toBe(false)
    expect(stored.maxLogRecords).toBe(1000)
  })
})

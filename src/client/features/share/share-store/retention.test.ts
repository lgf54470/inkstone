import { beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'inkstone_share_retention'

async function freshStore() {
  vi.resetModules()
  const { useShareStore } = await import('./index')
  return useShareStore
}

beforeEach(() => {
  localStorage.clear()
})

describe('share visit log record cap', () => {
  it('reads the cap this browser cached', async () => {
    localStorage.setItem(KEY, JSON.stringify({ maxLogRecords: 5000 }))
    const useShareStore = await freshStore()
    expect(useShareStore.getState().maxLogRecords).toBe(5000)
  })

  it('no longer carries a retention period, which the server owns now', async () => {
    localStorage.setItem(KEY, JSON.stringify({ logRetentionDays: 7, maxLogRecords: 5000 }))
    const useShareStore = await freshStore()
    expect('logRetentionDays' in useShareStore.getState()).toBe(false)
  })

  it('stores only the cap, so a stale retention cannot come back from this browser', async () => {
    const useShareStore = await freshStore()
    useShareStore.getState().setRetentionSettings({ maxLogRecords: 1000 })
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}')).toEqual({ maxLogRecords: 1000 })
  })
})

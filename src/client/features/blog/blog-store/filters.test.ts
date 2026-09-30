import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBlogStore } from './index'
import { TRAFFIC_FILTERS_KEY } from './state'

async function freshStore() {
  vi.resetModules()
  return (await import('./index')).useBlogStore
}

describe('blog traffic filters', () => {
  beforeEach(() => {
    localStorage.clear()
    useBlogStore.setState({
      excludeBots: true,
      excludeSelfReferrers: false,
      excludeOwner: false,
      loadPosts: async () => {},
      loadStats: async () => {},
    })
  })

  // The store module loads with the app; reading `localStorage` there would touch it on every page
  // for a switch only the blog hub shows, so the read belongs to opening the hub.
  it('applies the stored switches when hydrated, not when the module loads', async () => {
    localStorage.setItem(
      TRAFFIC_FILTERS_KEY,
      JSON.stringify({ excludeBots: false, excludeSelfReferrers: true, excludeOwner: true }),
    )
    const store = await freshStore()

    expect(store.getState().excludeBots).toBe(true)
    expect(store.getState().excludeOwner).toBe(false)

    store.getState().hydrateTrafficFilters()
    expect(store.getState().excludeBots).toBe(false)
    expect(store.getState().excludeSelfReferrers).toBe(true)
    expect(store.getState().excludeOwner).toBe(true)
  })

  // The persistence used to run inside the `set` updater, which has to stay pure: StrictMode runs
  // it twice, and each run wrote the storage.
  it('persists one write per change, outside the state updater', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    useBlogStore.getState().setFilters({ excludeBots: false })

    expect(setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(TRAFFIC_FILTERS_KEY) ?? '{}')).toMatchObject({ excludeBots: false })
    setItem.mockRestore()
  })
})

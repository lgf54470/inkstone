import { vi } from 'vitest'
import type { LocalDbLike, ShellBackend } from './db-cache-spec'

// Two "tabs" are two independent evaluations of db.ts's module state. They must
// share one IndexedDB, so the mock disk lives on a hoisted object that survives
// vi.resetModules, while each fresh import of ./db gets its own baseline/timers.
const disk = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  const writes: Array<{ key: string; value: unknown }> = []
  return {
    store,
    writes,
    reset() {
      store.clear()
      writes.length = 0
    },
  }
})

vi.mock('idb-keyval', () => {
  const impl = {
    createStore: () => ({}),
    async clear() { disk.store.clear() },
    async del(key: string) { disk.store.delete(key) },
    async delMany(keys: string[]) { for (const key of keys) disk.store.delete(key) },
    async entries() { return [...disk.store.entries()] },
    async get(key: string) { return disk.store.get(key) },
    async getMany(keys: string[]) { return keys.map((key) => disk.store.get(key)) },
    async set(key: string, value: unknown) { disk.store.set(key, value); disk.writes.push({ key, value }) },
    async setMany(entries: Array<[string, unknown]>) {
      for (const [key, value] of entries) {
        disk.store.set(key, value)
        disk.writes.push({ key, value })
      }
    },
    async update(key: string, updater: (current: unknown) => unknown) {
      const next = updater(disk.store.get(key))
      if (next !== undefined) disk.store.set(key, next)
    },
  }
  return impl
})

const { buildFixture, runMultitabSuite } = await import('./db-cache-spec')

async function freshTab(): Promise<LocalDbLike> {
  vi.resetModules()
  const { localDb } = await import('./db')
  await localDb.bindUser('u1')
  return localDb
}

const fixture = buildFixture(2_000)

const backend: ShellBackend = {
  read: async (key: string) => disk.store.get(key),
  seed: async (key: string, value: unknown) => {
    disk.store.set(key, value)
    disk.writes.push({ key, value })
  },
  keys: async () => [...disk.store.keys()],
  writes: disk.writes,
  ops: { getMany: 0, setMany: 0, delMany: 0 },
  reset: async () => disk.reset(),
}

runMultitabSuite({
  label: 'idb-keyval mock',
  backend,
  fixture,
  freshTab,
  flush: { settle: async () => { await vi.advanceTimersByTimeAsync(2_000) } },
})

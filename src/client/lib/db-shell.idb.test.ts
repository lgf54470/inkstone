import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import type { ShellBackend } from './db-cache-spec'
import { CLIENT_DATABASE_NAME } from './runtime'

// This file runs the same shell-cache scenarios as db-shell.test.ts, but with
// the real idb-keyval module on top of fake-indexeddb: values travel through
// actual IDBObjectStore transactions, connection handles, and request events
// instead of a hand-written Map. The wrapper below only records traffic; every
// read and write db.ts performs goes to the genuine IndexedDB implementation.
vi.mock('idb-keyval', async (importOriginal) => {
  const real = await importOriginal<typeof import('idb-keyval')>()
  const mirror = new Map<string, unknown>()
  const writes: Array<{ key: string; value: unknown }> = []
  const ops = { getMany: 0, setMany: 0, delMany: 0 }
  const realStore = real.createStore(CLIENT_DATABASE_NAME, 'kv')
  const record = (key: string, value: unknown) => {
    mirror.set(key, value)
    writes.push({ key, value })
  }
  const drop = (key: string) => {
    mirror.delete(key)
    writes.push({ key, value: undefined })
  }
  return {
    ...real,
    async getMany(keys: IDBValidKey[], store?: unknown) {
      ops.getMany++
      return real.getMany(keys, store as never)
    },
    async setMany(entries: Array<[IDBValidKey, unknown]>, store?: unknown) {
      ops.setMany++
      await real.setMany(entries, store as never)
      for (const [key, value] of entries) record(String(key), value)
    },
    async delMany(keys: IDBValidKey[], store?: unknown) {
      ops.delMany++
      await real.delMany(keys, store as never)
      for (const key of keys) drop(String(key))
    },
    async set(key: IDBValidKey, value: unknown, store?: unknown) {
      await real.set(key, value, store as never)
      record(String(key), value)
    },
    async del(key: IDBValidKey, store?: unknown) {
      await real.del(key, store as never)
      drop(String(key))
    },
    async clear(store?: unknown) {
      await real.clear(store as never)
      mirror.clear()
      writes.length = 0
    },
    async update(key: IDBValidKey, updater: (current: unknown) => unknown, store?: unknown) {
      await real.update(key, updater, store as never)
      const value = await real.get(key, realStore)
      if (value === undefined) drop(String(key))
      else record(String(key), value)
    },
    __mock: {
      store: mirror,
      writes,
      ops,
      realStore,
      async seed(key: string, value: unknown) {
        mirror.set(key, value)
        writes.push({ key, value })
        await real.set(key, value, realStore)
      },
      async read(key: string) {
        return real.get(key, realStore)
      },
      async keys() {
        return (await real.entries(realStore)).map(([key]) => String(key))
      },
      async reset() {
        mirror.clear()
        writes.length = 0
        ops.getMany = 0
        ops.setMany = 0
        ops.delMany = 0
        await real.clear(realStore)
      },
    },
  }
})

const mockedIdb = await import('idb-keyval')
type MockHandle = {
  __mock: {
    store: Map<string, unknown>
    writes: Array<{ key: string; value: unknown }>
    ops: { getMany: number; setMany: number; delMany: number }
    seed(key: string, value: unknown): Promise<void>
    read(key: string): Promise<unknown>
    keys(): Promise<string[]>
    reset(): Promise<void>
  }
}
const handle = (mockedIdb as unknown as MockHandle).__mock

const { buildFixture, runShellCacheSuite } = await import('./db-cache-spec')

const { localDb } = await import('./db')

const fixture = buildFixture(2_000)

const backend: ShellBackend = {
  read: async (key: string) => handle.read(key),
  seed: async (key: string, value: unknown) => handle.seed(key, value),
  keys: async () => handle.keys(),
  writes: handle.writes,
  ops: handle.ops,
  reset: async () => handle.reset(),
}

// fake-indexeddb commits transactions on real macrotasks (setImmediate), which
// the fake-timer advance does not wait for; drain the event loop with real
// timers until the recorded mutations stop growing, then re-enable fake timers.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const flush = {
  settle: async () => {
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()
    let stable = 0
    for (let index = 0; index < 200 && stable < 3; index++) {
      const before = backend.writes.length
      await sleep(10)
      stable = backend.writes.length === before ? stable + 1 : 0
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  },
}

runShellCacheSuite({ label: 'fake-indexeddb', backend, localDb, fixture, flush })

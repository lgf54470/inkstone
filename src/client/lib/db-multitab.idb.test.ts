import 'fake-indexeddb/auto'
import { vi } from 'vitest'
import type { LocalDbLike, ShellBackend } from './db-cache-spec'
import { CLIENT_DATABASE_NAME } from './runtime'

// This file runs the same multi-tab scenarios as db-multitab.test.ts, but every
// freshTab() opens its own real idb-keyval connection to one fake-indexeddb
// database — the same multi-connection shape two browser tabs have — instead of
// sharing one Map. The mirror and recorder live on a hoisted object because
// vi.resetModules re-evaluates db.ts (and the mock factory) per fresh tab.
const disk = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  const writes: Array<{ key: string; value: unknown }> = []
  const ops = { getMany: 0, setMany: 0, delMany: 0 }
  const api: {
    realSet(key: string, value: unknown): Promise<void>
    realGet(key: string): Promise<unknown>
    realKeys(): Promise<string[]>
    realClear(): Promise<void>
  } = {
    realSet: async () => {},
    realGet: async () => undefined,
    realKeys: async () => [],
    realClear: async () => {},
  }
  return { store, writes, ops, api }
})

vi.mock('idb-keyval', async (importOriginal) => {
  const real = await importOriginal<typeof import('idb-keyval')>()
  const realStore = real.createStore(CLIENT_DATABASE_NAME, 'kv')
  disk.api.realSet = (key, value) => real.set(key, value, realStore)
  disk.api.realGet = (key) => real.get(key, realStore)
  disk.api.realKeys = async () => (await real.entries(realStore)).map(([key]) => String(key))
  disk.api.realClear = () => real.clear(realStore)
  const record = (key: string, value: unknown) => {
    disk.store.set(key, value)
    disk.writes.push({ key, value })
  }
  const drop = (key: string) => {
    disk.store.delete(key)
    disk.writes.push({ key, value: undefined })
  }
  return {
    ...real,
    async getMany(keys: IDBValidKey[], store?: unknown) {
      disk.ops.getMany++
      return real.getMany(keys, store as never)
    },
    async setMany(entries: Array<[IDBValidKey, unknown]>, store?: unknown) {
      disk.ops.setMany++
      await real.setMany(entries, store as never)
      for (const [key, value] of entries) record(String(key), value)
    },
    async delMany(keys: IDBValidKey[], store?: unknown) {
      disk.ops.delMany++
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
      disk.store.clear()
      disk.writes.length = 0
    },
    async update(key: IDBValidKey, updater: (current: unknown) => unknown, store?: unknown) {
      await real.update(key, updater, store as never)
      const value = await real.get(key, realStore)
      if (value === undefined) drop(String(key))
      else record(String(key), value)
    },
  }
})

const { buildFixture, runMultitabSuite } = await import('./db-cache-spec')

async function freshTab(): Promise<LocalDbLike> {
  vi.resetModules()
  const { localDb } = await import('./db')
  await localDb.bindUser('u1')
  return localDb
}

const fixture = buildFixture(1_200)

const backend: ShellBackend = {
  read: async (key: string) => disk.api.realGet(key),
  seed: async (key: string, value: unknown) => {
    disk.store.set(key, value)
    disk.writes.push({ key, value })
    await disk.api.realSet(key, value)
  },
  keys: async () => disk.api.realKeys(),
  writes: disk.writes,
  ops: disk.ops,
  reset: async () => {
    disk.store.clear()
    disk.writes.length = 0
    disk.ops.getMany = 0
    disk.ops.setMany = 0
    disk.ops.delMany = 0
    await disk.api.realClear()
  },
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

runMultitabSuite({
  label: 'fake-indexeddb',
  backend,
  fixture,
  freshTab,
  flush,
})

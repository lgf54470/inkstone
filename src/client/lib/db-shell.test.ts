import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellBackend } from './db-cache-spec'

// Hand-written in-memory idb-keyval mock: instantaneous and fully synchronous,
// so the 10k-note flush-traffic benchmark and CI gate stay fast. The behavior
// scenarios it runs are shared verbatim with the fake-indexeddb backend in
// db-shell.idb.test.ts, which exercises the same code against real IndexedDB
// semantics.
vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>()
  const writes: Array<{ key: string; value: unknown }> = []
  const ops = { getMany: 0, setMany: 0, delMany: 0 }
  const impl = {
    createStore: () => ({}),
    async clear() { store.clear(); writes.length = 0 },
    async del(key: string) { store.delete(key); writes.push({ key, value: undefined }) },
    async delMany(keys: string[]) { for (const key of keys) store.delete(key); for (const key of keys) writes.push({ key, value: undefined }); ops.delMany++ },
    async entries() { return [...store.entries()] },
    async get(key: string) { return store.get(key) },
    async getMany(keys: string[]) { ops.getMany++; return keys.map((key) => store.get(key)) },
    async set(key: string, value: unknown) { store.set(key, value); writes.push({ key, value }) },
    async setMany(entries: Array<[string, unknown]>) { ops.setMany++; for (const [key, value] of entries) { store.set(key, value); writes.push({ key, value }) } },
    async update(key: string, updater: (current: unknown) => unknown) { const next = updater(store.get(key)); if (next !== undefined) store.set(key, next) },
    __mock: { store, writes, ops, reset() { store.clear(); writes.length = 0; ops.getMany = 0; ops.setMany = 0; ops.delMany = 0 } },
  }
  return impl
})

const mockedIdb = await import('idb-keyval')
const idb = (mockedIdb as unknown as {
  __mock: {
    store: Map<string, unknown>
    writes: Array<{ key: string; value: unknown }>
    ops: { getMany: number; setMany: number; delMany: number }
    reset(): void
  }
}).__mock

const { buildFixture, runShellCacheSuite } = await import('./db-cache-spec')

// The harness drives the real localDb implementation; only the IndexedDB
// primitive is mocked, so the write traffic it reports is exactly what the
// shipping shell-cache code produces per flush.
const { localDb } = await import('./db')

const fixture = buildFixture(10_000)

const backend: ShellBackend = {
  read: async (key: string) => idb.store.get(key),
  seed: async (key: string, value: unknown) => {
    idb.store.set(key, value)
    idb.writes.push({ key, value })
  },
  keys: async () => [...idb.store.keys()],
  writes: idb.writes,
  ops: idb.ops,
  reset: async () => idb.reset(),
}

runShellCacheSuite({
  label: 'idb-keyval mock',
  backend,
  localDb,
  fixture,
  flush: { settle: async () => { await vi.advanceTimersByTimeAsync(2_000) } },
})

describe('db shell benchmark', () => {
  beforeEach(async () => {
    idb.reset()
    await localDb.clear()
    await localDb.bindUser('u1')
  })

  it('measures per-burst flush traffic and serialization cost for a typing session', async () => {
    const serializeMs = (value: unknown) => {
      const start = performance.now()
      JSON.stringify(value)
      return performance.now() - start
    }
    const bytes = (value: unknown) => JSON.stringify(value).length
    const userKey = (key: string) => `user:u1:${key}`

    // Warm the cache the way boot does (initial pull -> full build flush), then
    // measure typing bursts: one summary commit per typing pause, coalesced
    // into a single shell flush.
    await localDb.saveShell(fixture.shell(fixture.vault, 1))
    idb.writes.length = 0
    const bursts = 3
    const burstKeys = new Array<number>(bursts).fill(0)
    const burstBytes = new Array<number>(bursts).fill(0)
    const bigValues = new Array<number>(bursts).fill(0)
    let smallValueMs = 0

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (let tick = 1; tick <= bursts; tick++) {
      const before = idb.writes.length
      const next = [...fixture.vault]
      next[fixture.typedIndex] = fixture.edited(fixture.vault[fixture.typedIndex]!, tick)
      localDb.scheduleShellSave(fixture.shell(next, 1))
      await vi.advanceTimersByTimeAsync(2_000)

      const flushed = idb.writes.slice(before)
      burstKeys[tick - 1] = flushed.length
      burstBytes[tick - 1] = flushed.reduce((sum, write) => sum + bytes(write.value ?? ''), 0)
      const bigKey = flushed.find((write) => write.key === userKey('notes'))
      if (bigKey) bigValues[tick - 1] = serializeMs(bigKey.value)
      const smallestValue = flushed.map((write) => write.value ?? '').sort((a, b) => bytes(a) - bytes(b))[0]
      if (smallestValue) smallValueMs = Math.max(smallValueMs, serializeMs(smallestValue))
    }
    vi.useRealTimers()

    console.log('')
    console.log(`[db shell benchmark] vault=${fixture.vaultSize.toLocaleString('en-US')} note summaries (~${fixture.oneSummaryBytes} B each), ${bursts} typing bursts, one note edited per burst`)
    console.log(`  key writes per burst: ${burstKeys.join(', ')}`)
    console.log(`  serialized bytes per burst: ${burstBytes.map((value) => value > 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(2)} MiB` : `${(value / 1024).toFixed(1)} KiB`).join(', ')}`)
    const wholeVaultMs = bigValues.find((value) => value > 0)
    console.log(wholeVaultMs
      ? `  JSON.stringify of the whole-vault value: ~${wholeVaultMs.toFixed(1)} ms per burst`
      : '  whole-vault value: not serialized on the flush path')
    console.log(`  JSON.stringify of one changed summary: ~${smallValueMs.toFixed(2)} ms per burst`)

    // Regression guard for the two-level layout: a single-note edit must never
    // re-serialize the whole vault on the flush path.
    const wholeVaultSeen = bigValues.some((value) => value > 0)
    expect(wholeVaultSeen).toBe(false)
    expect(burstKeys.every((count) => count === 1)).toBe(true)
    expect(burstBytes.every((count) => count < fixture.oneSummaryBytes * 4)).toBe(true)
  }, 30_000)
})

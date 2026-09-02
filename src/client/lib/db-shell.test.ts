import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Folder, NoteSummary, Tag } from '@shared/types'

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

// The harness drives the real localDb implementation; only the IndexedDB
// primitive is mocked, so the write traffic it reports is exactly what the
// shipping shell-cache code produces per flush.
const { localDb } = await import('./db')

function makeSummary(index: number): NoteSummary {
  const id = `note-${String(index).padStart(6, '0')}`
  return {
    id,
    title: `Note ${index}`,
    excerpt: `excerpt line for note ${index} `,
    folderId: null,
    tags: index % 5 === 0 ? [] : ['alpha', 'beta'],
    isPinned: false,
    isStarred: false,
    isArchived: false,
    wordCount: 50 + index,
    charCount: 300 + index,
    rev: 1,
    position: index,
    createdAt: 1_000_000 + index,
    updatedAt: 2_000_000 + index,
    deletedAt: null,
  }
}

function shell(notes: NoteSummary[], cursor = 42): {
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  cursor: number
} {
  return { notes, folders: [], tags: [], cursor }
}

const typedVariant = (note: NoteSummary, tick: number): NoteSummary => ({
  ...note,
  excerpt: `excerpt line for note ${note.id} after typing ${tick}`,
  wordCount: note.wordCount + tick,
  updatedAt: 2_000_000 + tick,
})

const vaultSize = 10_000
const vault: NoteSummary[] = Array.from({ length: vaultSize }, (_, index) => makeSummary(index))
const typedIndex = 5_000
const oneSummaryBytes = JSON.stringify(vault[typedIndex]!).length

describe('db shell cache', () => {
  beforeEach(async () => {
    idb.reset()
    vi.useRealTimers()
    await localDb.clear()
    await localDb.bindUser('u1')
  })

  it('round-trips a large vault and reads it back with two batched getMany calls', async () => {
    await localDb.saveShell(shell(vault, 7))
    expect(idb.ops.getMany).toBe(0)

    const loaded = await localDb.loadShell()
    expect(loaded).not.toBeNull()
    expect(loaded!.notes).toHaveLength(vaultSize)
    expect(loaded!.cursor).toBe(7)
    expect(idb.ops.getMany).toBe(2)
    // Per-note layout on disk: every summary has its own key, plus one index key.
    const keys = [...idb.store.keys()].filter((key) => key.includes('note-summary:'))
    expect(keys).toHaveLength(vaultSize)
    expect([...idb.store.keys()].some((key) => key.includes('noteIndex'))).toBe(true)
  })

  it('flushes a single-note edit as one small per-note key, not the whole vault', async () => {
    await localDb.saveShell(shell(vault, 1))
    await localDb.loadShell()
    idb.writes.length = 0

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const next = [...vault]
    next[typedIndex] = typedVariant(vault[typedIndex]!, 1)
    localDb.scheduleShellSave(shell(next, 1))
    await vi.advanceTimersByTimeAsync(2_000)

    const flushWrites = idb.writes
    expect(flushWrites).toHaveLength(1)
    expect(flushWrites[0]!.key).toContain(`note-summary:${vault[typedIndex]!.id}`)
    expect(flushWrites[0]!.value).toMatchObject({ id: vault[typedIndex]!.id, updatedAt: 2_000_001 })
  })

  it('removes the per-note key and shrinks the index when a note disappears', async () => {
    await localDb.saveShell(shell(vault, 1))
    await localDb.loadShell()
    idb.writes.length = 0

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const pruned = vault.filter((note) => note.id !== vault[typedIndex]!.id)
    localDb.scheduleShellSave(shell(pruned, 1))
    await vi.advanceTimersByTimeAsync(2_000)

    const summaryKeys = [...idb.store.keys()].filter((key) => key.includes('note-summary:'))
    expect(summaryKeys).toHaveLength(vaultSize - 1)
    expect(idb.store.has(`note-summary:${vault[typedIndex]!.id}`)).toBe(false)
  })

  it('migrates a legacy single-key notes array into the per-note layout on first load', async () => {
    idb.store.set('user:u1:notes', vault)
    idb.store.set('user:u1:folders', [])
    idb.store.set('user:u1:tags', [])
    idb.store.set('user:u1:cursor', 3)

    const loaded = await localDb.loadShell()
    expect(loaded!.notes).toHaveLength(vaultSize)
    expect(loaded!.cursor).toBe(3)
    expect(idb.store.has('user:u1:notes')).toBe(false)
    expect([...idb.store.keys()].filter((key) => key.includes('note-summary:'))).toHaveLength(vaultSize)

    // Second load goes through the index with two batched reads and no migration writes.
    idb.ops.getMany = 0
    idb.writes.length = 0
    const reloaded = await localDb.loadShell()
    expect(reloaded!.notes).toHaveLength(vaultSize)
    expect(idb.ops.getMany).toBe(2)
    expect(idb.writes).toHaveLength(0)
  })

  it('keeps a migrated legacy cache fully usable offline: edit, flush, reload', async () => {
    const legacyVault = vault.slice(0, 200)
    idb.store.set('user:u1:notes', legacyVault)
    idb.store.set('user:u1:folders', [])
    idb.store.set('user:u1:tags', [])
    idb.store.set('user:u1:cursor', 3)

    const migrated = await localDb.loadShell()
    expect(migrated!.notes).toHaveLength(200)
    const target = migrated!.notes[42]!
    const edited = typedVariant(target, 7)
    const nextNotes = migrated!.notes.map((note) => (note.id === target.id ? edited : note))

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    idb.writes.length = 0
    localDb.scheduleShellSave(shell(nextNotes, 3))
    await vi.advanceTimersByTimeAsync(2_000)
    vi.useRealTimers()

    expect(idb.writes).toHaveLength(1)
    expect(idb.writes[0]!.key).toContain(`note-summary:${target.id}`)
    const reloaded = await localDb.loadShell()
    expect(reloaded!.notes.find((note) => note.id === target.id)?.updatedAt).toBe(edited.updatedAt)
  })
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
    await localDb.saveShell(shell(vault, 1))
    idb.writes.length = 0
    const bursts = 3
    const burstKeys = new Array<number>(bursts).fill(0)
    const burstBytes = new Array<number>(bursts).fill(0)
    const bigValues = new Array<number>(bursts).fill(0)
    let smallValueMs = 0

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (let tick = 1; tick <= bursts; tick++) {
      const before = idb.writes.length
      const next = [...vault]
      next[typedIndex] = typedVariant(vault[typedIndex]!, tick)
      localDb.scheduleShellSave(shell(next, 1))
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
    console.log(`[db shell benchmark] vault=${vaultSize.toLocaleString('en-US')} note summaries (~${oneSummaryBytes} B each), ${bursts} typing bursts, one note edited per burst`)
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
    expect(burstBytes.every((count) => count < oneSummaryBytes * 4)).toBe(true)
  }, 30_000)
})

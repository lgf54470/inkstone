import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Folder, NoteSummary, Tag } from '@shared/types'

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

function makeSummary(index: number): NoteSummary {
  return {
    id: `note-${String(index).padStart(6, '0')}`,
    title: `Note ${index}`,
    excerpt: `excerpt line for note ${index} `,
    folderId: null,
    tags: [],
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

function shell(notes: NoteSummary[], cursor = 1): {
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  cursor: number
} {
  return { notes, folders: [], tags: [], cursor }
}

const vaultSize = 2_000
const vault: NoteSummary[] = Array.from({ length: vaultSize }, (_, index) => makeSummary(index))

const editedVariant = (note: NoteSummary, tick: number): NoteSummary => ({
  ...note,
  excerpt: `excerpt line for note ${note.id} after edit ${tick}`,
  updatedAt: 3_000_000 + tick,
})

async function freshTab(): Promise<typeof import('./db')['localDb']> {
  vi.resetModules()
  const { localDb } = await import('./db')
  await localDb.bindUser('u1')
  return localDb
}

const readSummary = (id: string): NoteSummary | undefined =>
  disk.store.get(`user:u1:note-summary:${id}`) as NoteSummary | undefined
const readIndex = (): string[] | undefined => disk.store.get('user:u1:noteIndex') as string[] | undefined

describe('multi-tab shell cache', () => {
  beforeEach(() => {
    disk.reset()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  it('keeps both per-note edits when two tabs type into different notes without pulling', async () => {
    const tabA = await freshTab()
    await tabA.saveShell(shell(vault, 1))
    await tabA.loadShell()
    const tabB = await freshTab()
    await tabB.loadShell()

    const firstIndex = 100
    const secondIndex = 1_200
    const firstVariant = editedVariant(vault[firstIndex]!, 9_001)
    const secondVariant = editedVariant(vault[secondIndex]!, 9_002)
    disk.writes.length = 0
    const nextA = [...vault]
    nextA[firstIndex] = firstVariant
    const nextB = [...vault]
    nextB[secondIndex] = secondVariant
    tabA.scheduleShellSave(shell(nextA, 1))
    tabB.scheduleShellSave(shell(nextB, 1))
    await vi.advanceTimersByTimeAsync(2_000)

    const summaryWrites = disk.writes.filter((write) => write.key.includes('note-summary:'))
    expect(summaryWrites).toHaveLength(2)
    expect(readSummary(vault[firstIndex]!.id)?.updatedAt).toBe(3_000_000 + 9_001)
    expect(readSummary(vault[secondIndex]!.id)?.updatedAt).toBe(3_000_000 + 9_002)

    const tabC = await freshTab()
    const loaded = await tabC.loadShell()
    expect(loaded!.notes).toHaveLength(vaultSize)
    expect(loaded!.notes.find((note) => note.id === vault[firstIndex]!.id)?.updatedAt).toBe(3_000_000 + 9_001)
    expect(loaded!.notes.find((note) => note.id === vault[secondIndex]!.id)?.updatedAt).toBe(3_000_000 + 9_002)
  })

  it('merges the on-disk index so an offline tab cannot drop another tab\'s new note', async () => {
    const tabA = await freshTab()
    await tabA.saveShell(shell(vault, 1))
    await tabA.loadShell()
    const tabB = await freshTab()
    await tabB.loadShell()

    const noteX = makeSummary(vaultSize + 1)
    const noteY = makeSummary(vaultSize + 2)
    tabA.scheduleShellSave(shell([...vault, noteX], 1))
    await vi.advanceTimersByTimeAsync(2_000)
    tabB.scheduleShellSave(shell([...vault, noteY], 1))
    await vi.advanceTimersByTimeAsync(2_000)

    expect(readIndex()).toHaveLength(vaultSize + 2)
    const tabC = await freshTab()
    const loaded = await tabC.loadShell()
    const ids = new Set(loaded!.notes.map((note) => note.id))
    expect(ids.has(noteX.id)).toBe(true)
    expect(ids.has(noteY.id)).toBe(true)
    expect(loaded!.notes).toHaveLength(vaultSize + 2)
  })

  it('drops a deleted note from the merged index once every tab agrees it is gone', async () => {
    const tabA = await freshTab()
    await tabA.saveShell(shell(vault, 1))
    await tabA.loadShell()
    const tabB = await freshTab()
    await tabB.loadShell()

    const doomed = vault[500]!
    const noteY = makeSummary(vaultSize + 2)
    const withoutDoomed = vault.filter((note) => note.id !== doomed.id)
    tabA.scheduleShellSave(shell(withoutDoomed, 1))
    await vi.advanceTimersByTimeAsync(2_000)
    expect(disk.store.has(`user:u1:note-summary:${doomed.id}`)).toBe(false)

    tabB.scheduleShellSave(shell([...withoutDoomed, noteY], 1))
    await vi.advanceTimersByTimeAsync(2_000)

    const index = readIndex()!
    expect(index).toHaveLength(vaultSize)
    expect(index.includes(doomed.id)).toBe(false)
    expect(index.includes(noteY.id)).toBe(true)
    const tabC = await freshTab()
    expect((await tabC.loadShell())!.notes).toHaveLength(vaultSize)
  })
})

// Shared behavior specs for the two-level shell cache. Each backend test file
// (the hand-written idb-keyval mock and the fake-indexeddb-backed real module)
// runs these identical scenarios, so a change can never pass one backend's
// expectations while silently diverging on the other's.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Folder, NoteSummary, Tag } from '@shared/types'

export interface ShellWrite {
  key: string
  value: unknown
}

export interface ShellOps {
  getMany: number
  setMany: number
  delMany: number
}

// The minimal storage surface the scenarios touch: real reads/writes/seeding
// plus the mutation recorder the flush-traffic assertions inspect. Backends
// implement it against their own storage (map mock vs fake-indexeddb).
export interface ShellBackend {
  read(key: string): Promise<unknown>
  seed(key: string, value: unknown): Promise<void>
  keys(): Promise<string[]>
  writes: ShellWrite[]
  ops: ShellOps
  reset(): Promise<void>
}

export interface ShellData {
  notes: NoteSummary[]
  folders: Folder[]
  tags: Tag[]
  cursor: number
}

export interface LocalDbLike {
  clear(): Promise<void>
  bindUser(userId: string): Promise<void>
  saveShell(data: ShellData, userId?: string): Promise<void>
  loadShell(): Promise<ShellData | null>
  scheduleShellSave(data: ShellData): void
}

export interface CacheFixture {
  vaultSize: number
  vault: NoteSummary[]
  typedIndex: number
  oneSummaryBytes: number
  makeNote(index: number): NoteSummary
  shell(notes: NoteSummary[], cursor?: number): ShellData
  edited(note: NoteSummary, tick: number): NoteSummary
}

export function buildFixture(vaultSize: number): CacheFixture {
  const makeSummary = (index: number): NoteSummary => ({
    id: `note-${String(index).padStart(6, '0')}`,
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
  })
  const vault = Array.from({ length: vaultSize }, (_, index) => makeSummary(index))
  const typedIndex = Math.floor(vaultSize / 2)
  return {
    vaultSize,
    vault,
    typedIndex,
    oneSummaryBytes: JSON.stringify(vault[typedIndex]).length,
    makeNote: makeSummary,
    shell: (notes, cursor = 42) => ({ notes, folders: [], tags: [], cursor }),
    edited: (note, tick) => ({
      ...note,
      excerpt: `excerpt line for note ${note.id} after edit ${tick}`,
      updatedAt: 2_000_000 + tick,
    }),
  }
}

// Backends settle a scheduled flush differently: the in-memory mock finishes on
// pure microtasks inside the fake-timer advance, while fake-indexeddb commits
// transactions on real macrotasks that need an explicit event-loop drain.
export interface FlushSettle {
  settle(): Promise<void>
}

export interface SingleTabSuite {
  label: string
  backend: ShellBackend
  localDb: LocalDbLike
  fixture: CacheFixture
  flush: FlushSettle
}

export function runShellCacheSuite(suite: SingleTabSuite): void {
  const { backend, localDb, fixture } = suite
  describe(`two-level shell cache (${suite.label})`, () => {
    beforeEach(async () => {
      vi.useRealTimers()
      await backend.reset()
      await localDb.clear()
      await localDb.bindUser('u1')
    })

    it('round-trips a large vault and reads it back with two batched getMany calls', async () => {
      await localDb.saveShell(fixture.shell(fixture.vault, 7))
      expect(backend.ops.getMany).toBe(0)

      const loaded = await localDb.loadShell()
      expect(loaded).not.toBeNull()
      expect(loaded!.notes).toHaveLength(fixture.vaultSize)
      expect(loaded!.cursor).toBe(7)
      expect(backend.ops.getMany).toBe(2)
      // Per-note layout on disk: every summary has its own key, plus one index key.
      const keys = (await backend.keys()).filter((key) => key.includes('note-summary:'))
      expect(keys).toHaveLength(fixture.vaultSize)
      expect((await backend.keys()).some((key) => key.includes('noteIndex'))).toBe(true)
    })

    it('flushes a single-note edit as one small per-note key, not the whole vault', async () => {
      await localDb.saveShell(fixture.shell(fixture.vault, 1))
      await localDb.loadShell()
      backend.writes.length = 0

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const next = [...fixture.vault]
      next[fixture.typedIndex] = fixture.edited(fixture.vault[fixture.typedIndex]!, 1)
      localDb.scheduleShellSave(fixture.shell(next, 1))
      await suite.flush.settle()

      const flushWrites = backend.writes
      expect(flushWrites).toHaveLength(1)
      expect(flushWrites[0]!.key).toContain(`note-summary:${fixture.vault[fixture.typedIndex]!.id}`)
      expect(flushWrites[0]!.value).toMatchObject({ id: fixture.vault[fixture.typedIndex]!.id, updatedAt: 2_000_001 })
    })

    it('removes the per-note key and shrinks the index when a note disappears', async () => {
      await localDb.saveShell(fixture.shell(fixture.vault, 1))
      await localDb.loadShell()
      backend.writes.length = 0

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const pruned = fixture.vault.filter((note) => note.id !== fixture.vault[fixture.typedIndex]!.id)
      localDb.scheduleShellSave(fixture.shell(pruned, 1))
      await suite.flush.settle()

      const summaryKeys = (await backend.keys()).filter((key) => key.includes('note-summary:'))
      expect(summaryKeys).toHaveLength(fixture.vaultSize - 1)
      expect((await backend.keys()).includes(`note-summary:${fixture.vault[fixture.typedIndex]!.id}`)).toBe(false)
    })

    it('migrates a legacy single-key notes array into the per-note layout on first load', async () => {
      await backend.seed('user:u1:notes', fixture.vault)
      await backend.seed('user:u1:folders', [])
      await backend.seed('user:u1:tags', [])
      await backend.seed('user:u1:cursor', 3)

      const loaded = await localDb.loadShell()
      expect(loaded!.notes).toHaveLength(fixture.vaultSize)
      expect(loaded!.cursor).toBe(3)
      expect((await backend.keys()).includes('user:u1:notes')).toBe(false)
      expect((await backend.keys()).filter((key) => key.includes('note-summary:'))).toHaveLength(fixture.vaultSize)

      // Second load goes through the index with two batched reads and no migration writes.
      backend.ops.getMany = 0
      backend.writes.length = 0
      const reloaded = await localDb.loadShell()
      expect(reloaded!.notes).toHaveLength(fixture.vaultSize)
      expect(backend.ops.getMany).toBe(2)
      expect(backend.writes).toHaveLength(0)
    })

    it('keeps a migrated legacy cache fully usable offline: edit, flush, reload', async () => {
      const legacyVault = fixture.vault.slice(0, 200)
      await backend.seed('user:u1:notes', legacyVault)
      await backend.seed('user:u1:folders', [])
      await backend.seed('user:u1:tags', [])
      await backend.seed('user:u1:cursor', 3)

      const migrated = await localDb.loadShell()
      expect(migrated!.notes).toHaveLength(200)
      const target = migrated!.notes[42]!
      const edited = fixture.edited(target, 7)
      const nextNotes = migrated!.notes.map((note) => (note.id === target.id ? edited : note))

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      backend.writes.length = 0
      localDb.scheduleShellSave(fixture.shell(nextNotes, 3))
      await suite.flush.settle()
      vi.useRealTimers()

      expect(backend.writes).toHaveLength(1)
      expect(backend.writes[0]!.key).toContain(`note-summary:${target.id}`)
      const reloaded = await localDb.loadShell()
      expect(reloaded!.notes.find((note) => note.id === target.id)?.updatedAt).toBe(edited.updatedAt)
    })
  })
}

export interface MultitabSuite {
  label: string
  backend: ShellBackend
  fixture: CacheFixture
  freshTab(): Promise<LocalDbLike>
  flush: FlushSettle
}

export function runMultitabSuite(suite: MultitabSuite): void {
  const { backend, fixture } = suite
  const summaryKey = (id: string) => `user:u1:note-summary:${id}`
  const indexKey = 'user:u1:noteIndex'

  describe(`multi-tab shell cache (${suite.label})`, () => {
    beforeEach(async () => {
      vi.useRealTimers()
      await backend.reset()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    })

    it('keeps both per-note edits when two tabs type into different notes without pulling', async () => {
      const tabA = await suite.freshTab()
      await tabA.saveShell(fixture.shell(fixture.vault, 1))
      await tabA.loadShell()
      const tabB = await suite.freshTab()
      await tabB.loadShell()

      const firstIndex = 100
      const secondIndex = Math.min(1_200, fixture.vaultSize - 1)
      const firstVariant = fixture.edited(fixture.vault[firstIndex]!, 9_001)
      const secondVariant = fixture.edited(fixture.vault[secondIndex]!, 9_002)
      backend.writes.length = 0
      const nextA = [...fixture.vault]
      nextA[firstIndex] = firstVariant
      const nextB = [...fixture.vault]
      nextB[secondIndex] = secondVariant
      tabA.scheduleShellSave(fixture.shell(nextA, 1))
      tabB.scheduleShellSave(fixture.shell(nextB, 1))
      await suite.flush.settle()

      const summaryWrites = backend.writes.filter((write) => write.key.includes('note-summary:'))
      expect(summaryWrites).toHaveLength(2)
      expect((await backend.read(summaryKey(fixture.vault[firstIndex]!.id)) as NoteSummary)?.updatedAt).toBe(2_009_001)
      expect((await backend.read(summaryKey(fixture.vault[secondIndex]!.id)) as NoteSummary)?.updatedAt).toBe(2_009_002)

      const tabC = await suite.freshTab()
      const loaded = await tabC.loadShell()
      expect(loaded!.notes).toHaveLength(fixture.vaultSize)
      expect(loaded!.notes.find((note) => note.id === fixture.vault[firstIndex]!.id)?.updatedAt).toBe(2_009_001)
      expect(loaded!.notes.find((note) => note.id === fixture.vault[secondIndex]!.id)?.updatedAt).toBe(2_009_002)
    })

    it('serializes index rewrites through a Web Locks critical section', async () => {
      const lockLog: Array<{ name: string }> = []
      let active = 0
      let maxActive = 0
      const waiters: Array<() => Promise<void>> = []
      const pump = () => {
        const run = waiters.shift()
        if (run) void run().finally(pump)
      }
      const locks = {
        request: (name: string, task: () => Promise<boolean>) =>
          new Promise<boolean>((resolve, reject) => {
            const run = async () => {
              active++
              maxActive = Math.max(maxActive, active)
              lockLog.push({ name })
              try {
                resolve(await task())
              }
              catch (error) {
                reject(error)
              }
              finally {
                active--
              }
            }
            waiters.push(run)
            if (active === 0) pump()
          }),
      }
      Object.defineProperty(navigator, 'locks', { configurable: true, value: locks })

      try {
        const tabA = await suite.freshTab()
        await tabA.saveShell(fixture.shell(fixture.vault, 1))
        await tabA.loadShell()
        const tabB = await suite.freshTab()
        await tabB.loadShell()

        const noteX = fixture.makeNote(fixture.vaultSize + 1)
        const noteY = fixture.makeNote(fixture.vaultSize + 2)
        tabA.scheduleShellSave(fixture.shell([...fixture.vault, noteX], 1))
        tabB.scheduleShellSave(fixture.shell([...fixture.vault, noteY], 1))
        await suite.flush.settle()

        expect(maxActive).toBe(1)
        expect(lockLog.length).toBeGreaterThanOrEqual(2)
        expect(lockLog.every((entry) => entry.name === 'inkstone-shell-index:u1')).toBe(true)
        const tabC = await suite.freshTab()
        const loaded = await tabC.loadShell()
        const ids = new Set(loaded!.notes.map((note) => note.id))
        expect(ids.has(noteX.id)).toBe(true)
        expect(ids.has(noteY.id)).toBe(true)
      }
      finally {
        Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
      }
    })

    it('merges the on-disk index so an offline tab cannot drop another tab\'s new note', async () => {
      const tabA = await suite.freshTab()
      await tabA.saveShell(fixture.shell(fixture.vault, 1))
      await tabA.loadShell()
      const tabB = await suite.freshTab()
      await tabB.loadShell()

      const noteX = fixture.makeNote(fixture.vaultSize + 1)
      const noteY = fixture.makeNote(fixture.vaultSize + 2)
      tabA.scheduleShellSave(fixture.shell([...fixture.vault, noteX], 1))
      await suite.flush.settle()
      tabB.scheduleShellSave(fixture.shell([...fixture.vault, noteY], 1))
      await suite.flush.settle()

      const index = (await backend.read(indexKey)) as string[]
      expect(index).toHaveLength(fixture.vaultSize + 2)
      const tabC = await suite.freshTab()
      const loaded = await tabC.loadShell()
      const ids = new Set(loaded!.notes.map((note) => note.id))
      expect(ids.has(noteX.id)).toBe(true)
      expect(ids.has(noteY.id)).toBe(true)
      expect(loaded!.notes).toHaveLength(fixture.vaultSize + 2)
    })

    it('drops a deleted note from the merged index once every tab agrees it is gone', async () => {
      const tabA = await suite.freshTab()
      await tabA.saveShell(fixture.shell(fixture.vault, 1))
      await tabA.loadShell()
      const tabB = await suite.freshTab()
      await tabB.loadShell()

      const doomed = fixture.vault[500]!
      const noteY = fixture.makeNote(fixture.vaultSize + 2)
      const withoutDoomed = fixture.vault.filter((note) => note.id !== doomed.id)
      tabA.scheduleShellSave(fixture.shell(withoutDoomed, 1))
      await suite.flush.settle()
      expect((await backend.keys()).includes(summaryKey(doomed.id))).toBe(false)

      tabB.scheduleShellSave(fixture.shell([...withoutDoomed, noteY], 1))
      await suite.flush.settle()

      const index = (await backend.read(indexKey)) as string[]
      expect(index).toHaveLength(fixture.vaultSize)
      expect(index.includes(doomed.id)).toBe(false)
      expect(index.includes(noteY.id)).toBe(true)
      const tabC = await suite.freshTab()
      expect((await tabC.loadShell())!.notes).toHaveLength(fixture.vaultSize)
    })
  })
}

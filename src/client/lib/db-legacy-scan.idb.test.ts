import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_DATABASE_NAME } from './runtime'

/**
 * A returning user's boot used to read and structured-clone-deserialize every record in the local
 * cache — every cached note body — just to find out whether any of it predated the per-user key
 * namespace. `bindLocalUser` writes the unscoped `userId` key on every call and never clears it, so
 * from the second boot onward the "is this the legacy user?" test is always true and the scan always
 * runs, awaited inside `persistSession` and therefore before the boot splash may lift.
 *
 * The scan is the expensive part, not the migration: deciding whether legacy keys exist needs keys
 * only. These cases keep the fix from degenerating into "skip the work" — the first pins that a
 * cache full of namespaced data is never read value-by-value, the rest pin that data which really is
 * legacy still moves, still wins nothing over an existing copy, and still gets removed.
 */
const mockState = vi.hoisted(() => ({
  entriesCalls: 0,
  keysCalls: 0,
  getManyCalls: 0,
  realStore: null as unknown,
}))

/** Wraps the three reads this test cares about; every other call goes to the real module. */
const traceIdbCalls = vi.hoisted(() => {
  return (real: typeof import('idb-keyval'), realStore: unknown, d: typeof mockState) => ({
    async entries(store?: unknown) {
      d.entriesCalls++
      return real.entries((store ?? realStore) as never)
    },
    async keys(store?: unknown) {
      d.keysCalls++
      return real.keys((store ?? realStore) as never)
    },
    async getMany(keys: IDBValidKey[], store?: unknown) {
      d.getManyCalls++
      return real.getMany(keys, (store ?? realStore) as never)
    },
  })
})

vi.mock('idb-keyval', async (importOriginal) => {
  const real = await importOriginal<typeof import('idb-keyval')>()
  const realStore = real.createStore(CLIENT_DATABASE_NAME, 'kv')
  mockState.realStore = realStore
  return { ...real, ...traceIdbCalls(real, realStore, mockState) }
})

const USER = 'user-abc'

async function idb() {
  return import('idb-keyval')
}

async function seed(key: string, value: unknown): Promise<void> {
  const real = await idb()
  await real.set(key, value, mockState.realStore as never)
}

async function readBack(key: string): Promise<unknown> {
  const real = await idb()
  return real.get(key, mockState.realStore as never)
}

async function allKeys(): Promise<string[]> {
  const real = await idb()
  return (await real.keys(mockState.realStore as never)).map(String)
}

/**
 * `dbState.activeUserId` is module state, and `bindLocalUser` short-circuits when it already equals
 * the user being bound — the migration only runs on a page load's first bind. Cleared here so each
 * case starts at that first bind instead of inheriting the previous case's.
 */
async function freshDb() {
  const keys = await import('./db/keys')
  keys.dbState.activeUserId = null
  const core = await import('./db/core')
  return { core, keys }
}

beforeEach(async () => {
  const real = await idb()
  await real.clear(mockState.realStore as never)
  mockState.entriesCalls = 0
  mockState.keysCalls = 0
  mockState.getManyCalls = 0
})

describe('local cache migration on boot', () => {
  it('does not read every cached value when the user has already been namespaced', async () => {
    const { core, keys } = await freshDb()
    await seed(keys.KEY.userId, USER)
    for (let index = 0; index < 40; index++)
      await seed(`user:${USER}:note:n${index}`, { body: 'x'.repeat(64) })

    await core.bindLocalUser(USER)

    expect(mockState.entriesCalls).toBe(0)
    expect(mockState.getManyCalls).toBe(0)
  })

})

describe('legacy records left by a pre-namespace build', () => {
  it('moves genuine legacy records into the user namespace and drops the old keys', async () => {
    const { core, keys } = await freshDb()
    await seed(keys.KEY.userId, USER)
    await seed(keys.KEY.notes, ['n1', 'n2'])
    await seed('note:n1', { body: 'first' })
    await seed('note-summary:n1', { id: 'n1', title: 'First' })

    await core.bindLocalUser(USER)

    expect(await readBack(`user:${USER}:note:n1`)).toEqual({ body: 'first' })
    expect(await readBack(`user:${USER}:note-summary:n1`)).toEqual({ id: 'n1', title: 'First' })
    expect(await readBack(`user:${USER}:notes`)).toEqual(['n1', 'n2'])
    const remaining = await allKeys()
    expect(remaining).not.toContain('note:n1')
    expect(remaining).not.toContain('note-summary:n1')
    expect(remaining).not.toContain('notes')
  })

  it('keeps the namespaced copy when a legacy key of the same name also exists', async () => {
    const { core, keys } = await freshDb()
    await seed(keys.KEY.userId, USER)
    await seed('note:n1', { body: 'old copy' })
    await seed(`user:${USER}:note:n1`, { body: 'current copy' })

    await core.bindLocalUser(USER)

    expect(await readBack(`user:${USER}:note:n1`)).toEqual({ body: 'current copy' })
    expect(await allKeys()).not.toContain('note:n1')
  })

  it('does nothing for a different user and leaves that other account untouched', async () => {
    const { core, keys } = await freshDb()
    await seed(keys.KEY.userId, 'someone-else')
    await seed('note:n1', { body: 'theirs' })

    await core.bindLocalUser(USER)

    expect(await readBack('note:n1')).toEqual({ body: 'theirs' })
    expect(await readBack(`user:${USER}:note:n1`)).toBeUndefined()
  })
})

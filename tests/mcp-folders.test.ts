import { describe, expect, it, vi } from 'vitest'

const H = vi.hoisted(() => ({ counter: 0, now: 2_000_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { LibraryContext } from '../src/worker/mcp/library/types'
import {
  removeMcpFolderAndPromote,
  updateMcpFolder,
} from '../src/worker/mcp/library/organize/folders'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const EXECUTION_CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

const idOf = (letter: string) => letter.repeat(26)
const FOLDER_1 = idOf('a')
const FOLDER_2 = idOf('b')
const FOLDER_3 = idOf('c')
const PARENT_1 = idOf('d')
const PARENT_2 = idOf('e')
const ROOT_1 = idOf('f')
const NOTE_1 = idOf('n')

function context(): LibraryContext {
  return {
    env: DB_ENV.env,
    userId: USER,
    ftsEnabled: true,
    executionCtx: EXECUTION_CTX,
    origin: 'https://inkstone.invalid',
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

async function seedFolder(
  db: D1Shim,
  fields: { id: string; name: string; parentId?: string | null; position?: number },
): Promise<void> {
  await runSql(
    db,
    `INSERT INTO folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5, ?6, ?6)`,
    fields.id,
    USER,
    fields.parentId ?? null,
    fields.name,
    fields.position ?? 0,
    H.now - 1000,
  )
}

async function seedNoteInFolder(db: D1Shim, noteId: string, folderId: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'Note', '', 'body', '', 1, 1, 4, 0, 0, 0, 0, 'h', ?4, ?4)`,
    noteId,
    USER,
    folderId,
    H.now - 2000,
  )
}

const OPERATION = 'op-folder-1'

describe('updateMcpFolder', () => {
  it('renames a folder and records the change with the bumped timestamp', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: FOLDER_1, name: 'Old name', parentId: null })
    const updated = await updateMcpFolder(context(), {
      operationId: OPERATION,
      folderId: FOLDER_1,
      expectedUpdatedAt: H.now - 1000,
      name: 'New name',
    })
    expect(updated.id).toBe(FOLDER_1)
    expect(updated.name).toBe('New name')
    expect(updated.updated_at).toBe(H.now - 999)

    const row = await firstRow(db, 'SELECT name, updated_at FROM folders WHERE id = ?1', FOLDER_1)
    expect(row!.name).toBe('New name')
    expect(row!.updated_at).toBe(H.now - 999)
    const change = await firstRow(db, "SELECT entity_id, op, at FROM changes WHERE entity = 'folder'")
    expect(change!.entity_id).toBe(FOLDER_1)
    expect(change!.op).toBe('upsert')
    expect(change!.at).toBe(H.now - 999)
  })

  it('rejects a rename that collides with a sibling', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: PARENT_1, name: 'Parent', parentId: null })
    await seedFolder(db, { id: FOLDER_1, name: 'Alpha', parentId: PARENT_1 })
    await seedFolder(db, { id: FOLDER_2, name: 'beta', parentId: PARENT_1 })
    await expect(
      updateMcpFolder(context(), {
        operationId: OPERATION,
        folderId: FOLDER_1,
        expectedUpdatedAt: H.now - 1000,
        name: 'BETA',
      }),
    ).rejects.toThrow('The folder changed or a sibling uses this name')
  })

  it('rejects a stale expectedUpdatedAt', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: FOLDER_1, name: 'Alpha', parentId: null })
    await expect(
      updateMcpFolder(context(), {
        operationId: OPERATION,
        folderId: FOLDER_1,
        expectedUpdatedAt: H.now - 500,
        name: 'Beta',
      }),
    ).rejects.toThrow('The folder changed elsewhere')
  })

  it('moves a folder under a new parent', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: PARENT_1, name: 'Root', parentId: null })
    await seedFolder(db, { id: PARENT_2, name: 'Archive', parentId: null })
    await seedFolder(db, { id: FOLDER_1, name: 'Project', parentId: PARENT_1 })

    const updated = await updateMcpFolder(context(), {
      operationId: OPERATION,
      folderId: FOLDER_1,
      expectedUpdatedAt: H.now - 1000,
      parentId: PARENT_2,
    })
    expect(updated.parent_id).toBe(PARENT_2)
    const row = await firstRow(db, 'SELECT parent_id FROM folders WHERE id = ?1', FOLDER_1)
    expect(row!.parent_id).toBe(PARENT_2)
  })

  it('rejects moving a folder into its own descendant', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: FOLDER_1, name: 'Top', parentId: null })
    await seedFolder(db, { id: FOLDER_2, name: 'Middle', parentId: FOLDER_1 })
    await seedFolder(db, { id: FOLDER_3, name: 'Leaf', parentId: FOLDER_2 })
    await expect(
      updateMcpFolder(context(), {
        operationId: OPERATION,
        folderId: FOLDER_1,
        expectedUpdatedAt: H.now - 1000,
        parentId: FOLDER_3,
      }),
    ).rejects.toThrow('A folder cannot be moved into its own descendant')
  })
})

describe('removeMcpFolderAndPromote', () => {
  it('removes the folder, promotes its children and notes, and records changes', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: ROOT_1, name: 'Root', parentId: null })
    await seedFolder(db, { id: FOLDER_1, name: 'Project', parentId: ROOT_1, position: 1000 })
    await seedFolder(db, { id: FOLDER_2, name: 'Sub', parentId: FOLDER_1, position: 1000 })
    await seedNoteInFolder(db, NOTE_1, FOLDER_1)

    const result = await removeMcpFolderAndPromote(context(), {
      operationId: OPERATION,
      folderId: FOLDER_1,
      expectedUpdatedAt: H.now - 1000,
    })
    expect(result).toEqual({ ok: true, folder_id: FOLDER_1, promoted_to: ROOT_1 })

    expect(await firstRow(db, 'SELECT id FROM folders WHERE id = ?1', FOLDER_1)).toBeNull()
    const sub = await firstRow(db, 'SELECT parent_id, position, deleted_at FROM folders WHERE id = ?1', FOLDER_2)
    expect(sub!.parent_id).toBe(ROOT_1)
    expect(sub!.deleted_at).toBeNull()
    expect(sub!.position).toBe(1000)
    const note = await firstRow(db, 'SELECT folder_id, rev FROM notes WHERE id = ?1', NOTE_1)
    expect(note!.folder_id).toBe(ROOT_1)
    expect(note!.rev).toBe(2)

    const changes = await allRows(db, "SELECT entity, entity_id, op FROM changes ORDER BY entity, entity_id")
    expect(changes).toEqual([
      { entity: 'folder', entity_id: FOLDER_1, op: 'delete' },
      { entity: 'folder', entity_id: FOLDER_2, op: 'upsert' },
      { entity: 'note', entity_id: NOTE_1, op: 'upsert' },
    ])
  })

  it('rejects promotion when a child would duplicate a sibling name', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: ROOT_1, name: 'Root', parentId: null })
    await seedFolder(db, { id: FOLDER_1, name: 'Keep', parentId: ROOT_1 })
    await seedFolder(db, { id: FOLDER_2, name: 'Dup', parentId: ROOT_1 })
    await seedFolder(db, { id: FOLDER_3, name: 'Keep', parentId: FOLDER_2 })
    await expect(
      removeMcpFolderAndPromote(context(), {
        operationId: OPERATION,
        folderId: FOLDER_2,
        expectedUpdatedAt: H.now - 1000,
      }),
    ).rejects.toThrow('A promoted child would duplicate a sibling folder name')
    expect(await firstRow(db, 'SELECT id FROM folders WHERE id = ?1', FOLDER_2)).not.toBeNull()
  })

  it('rejects a stale expectedUpdatedAt', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: FOLDER_1, name: 'Alpha', parentId: null })
    await expect(
      removeMcpFolderAndPromote(context(), {
        operationId: OPERATION,
        folderId: FOLDER_1,
        expectedUpdatedAt: H.now - 500,
      }),
    ).rejects.toThrow('The folder changed elsewhere')
  })
})
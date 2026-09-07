import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const H = vi.hoisted(() => ({ counter: 0, now: 1_750_000_000_000 }))

vi.mock('../src/worker/lib/id', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, newId: () => `id-${++H.counter}` }
})

import type { D1Database, KVNamespace } from '@cloudflare/workers-types'
import { LIMITS } from '../src/shared/constants'
import type { MarkdownBackupManifest } from '../src/shared/backup-format'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import { attachmentObjectKey } from '../src/worker/attachments/keys'
import { persistAttachmentWithinQuota, rollbackPersistedAttachments } from '../src/worker/attachments/storage'
import type { Env } from '../src/worker/env'
import { importBackupFileBatch } from '../src/worker/import/backup'
import type { ImportContext } from '../src/worker/import/types'
import { createD1Database as createDb, queryFirst as firstRow, queryRows as allRows, runSql, type D1Shim } from './d1-harness'

const USER = 'user-1'
const DB_ENV = { env: { DB: null as unknown as D1Database } }
const SRC_NOTE = 'aaaaaaaaaaaaaaaaaaaaaaaaaa'
const STAMP = '20260906-120000-000'
const NOTE_PATH = 'notes/hello.md'
const ENCODER = new TextEncoder()

interface KvShim extends KVNamespace {
  listKeys: () => string[]
}

function createKvShim(): KvShim {
  const store = new Map<string, Uint8Array>()
  return {
    put: async (key: string, value: string | ArrayBuffer | Uint8Array) => {
      const bytes = typeof value === 'string'
        ? ENCODER.encode(value)
        : value instanceof Uint8Array ? value : new Uint8Array(value)
      store.set(key, bytes)
    },
    get: async (key: string) => {
      const bytes = store.get(key)
      return bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : null
    },
    delete: async (key: string) => { store.delete(key) },
    listKeys: () => [...store.keys()],
  } as unknown as KvShim
}

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function shaOfBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function ctx(conflict: ImportContext['conflict'] = 'newer'): ImportContext {
  return {
    conflict,
    byId: new Map(),
    folderCache: new Map(),
    result: {
      createdNotes: 0,
      updatedNotes: 0,
      skippedNotes: 0,
      createdFolders: 0,
      createdAttachments: 0,
      skippedAttachments: 0,
      warnings: [],
    },
    ftsEnabled: true,
  }
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  await runSql(db, "INSERT INTO app_meta (key, value) VALUES ('ai-search-enabled:user-1', '1')")
  DB_ENV.env.DB = db as unknown as D1Database
  return db
}

interface BuildManifestOptions {
  content?: string
  path?: string
  state?: 'notes' | 'archived' | 'trash'
  folder?: string[]
  title?: string
  updatedAt?: number
  createdAt?: number
  deletedAt?: number | null
  attachmentHashes?: string[]
  attachments?: Array<{ path: string; filename: string; mime: string; size: number; sha256: string; createdAt: number }>
  bytes?: number
  sha256?: string
}

function buildManifest(options: BuildManifestOptions = {}): MarkdownBackupManifest {
  const content = options.content ?? 'hello **world**'
  const bytes = new TextEncoder().encode(content)
  return {
    format: 'inkstone-markdown-backup',
    version: 3,
    appVersion: 'test',
    createdAt: new Date(H.now).toISOString(),
    snapshot: STAMP,
    notes: [
      {
        id: SRC_NOTE,
        path: options.path ?? NOTE_PATH,
        title: options.title ?? 'Hello',
        folder: options.folder ?? ['Inbox'],
        attachmentHashes: options.attachmentHashes ?? [],
        state: options.state ?? 'notes',
        archived: options.state === 'archived',
        bytes: options.bytes ?? bytes.byteLength,
        sha256: options.sha256 ?? shaOf(content),
        createdAt: options.createdAt ?? H.now - 2000,
        updatedAt: options.updatedAt ?? H.now - 1000,
        deletedAt: options.deletedAt ?? null,
      },
    ],
    attachments: options.attachments ?? [],
  }
}

function selectedFile(content: string, name = 'hello.md'): { file: File; path: string } {
  return { file: new File([new TextEncoder().encode(content)], name), path: NOTE_PATH }
}

describe('importBackupFileBatch', () => {
  it('restores a fresh markdown note with folder, mapping and derived state', async () => {
    const db = await makeDb()
    const c = ctx()
    await importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], buildManifest(), c)
    expect(c.result.createdNotes).toBe(1)
    expect(c.result.createdFolders).toBe(1)
    expect(c.result.warnings).toEqual([])

    const note = await firstRow(db, 'SELECT id, title, content, rev, folder_id, updated_at FROM notes')
    expect(note!.title).toBe('Hello')
    expect(note!.content).toBe('hello **world**')
    expect(note!.rev).toBe(1)
    expect(note!.updated_at).toBe(H.now - 1000)
    const folder = await firstRow(db, 'SELECT id, name FROM folders')
    expect(folder!.name).toBe('Inbox')
    expect(note!.folder_id).toBe(folder!.id)

    const mapping = await firstRow(db, "SELECT target_id FROM import_mappings WHERE entity = 'note' AND source_id = ?1", SRC_NOTE)
    expect(mapping!.target_id).toBe(note!.id)
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'folder'")).length).toBe(1)
    expect((await allRows(db, "SELECT * FROM changes WHERE entity = 'note'")).length).toBe(1)
    expect((await firstRow(db, 'SELECT kind FROM ai_index_queue WHERE note_id = ?1', note!.id as string))!.kind).toBe('embed')
    expect((await firstRow(db, 'SELECT kind FROM fts_index_queue WHERE note_id = ?1', note!.id as string))!.kind).toBe('upsert')
  })

  it('rejects files that fail length or SHA-256 verification before writing anything', async () => {
    const db = await makeDb()
    const lengthMismatch = buildManifest({ bytes: 999 })
    await expect(
      importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], lengthMismatch, ctx()),
    ).rejects.toThrow('Backup file length verification failed: notes/hello.md')

    const hashMismatch = buildManifest({ sha256: 'a'.repeat(64) })
    await expect(
      importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], hashMismatch, ctx()),
    ).rejects.toThrow('Backup file SHA-256 verification failed: notes/hello.md')
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
    expect((await allRows(db, 'SELECT * FROM folders')).length).toBe(0)
  })

  it('rejects selected files that are not listed in the manifest', async () => {
    const db = await makeDb()
    await expect(
      importBackupFileBatch(DB_ENV, USER, [
        { file: new File([new TextEncoder().encode('x')], 'other.md'), path: 'notes/other.md' },
      ], buildManifest(), ctx()),
    ).rejects.toThrow('The file is not listed in the backup manifest: notes/other.md')
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
  })

  it('rejects duplicate selected paths', async () => {
    const db = await makeDb()
    const file = new File([new TextEncoder().encode('hello **world**')], 'hello.md')
    await expect(
      importBackupFileBatch(DB_ENV, USER, [
        { file, path: NOTE_PATH },
        { file, path: NOTE_PATH },
      ], buildManifest(), ctx()),
    ).rejects.toThrow('The selected backup contains a duplicate path: notes/hello.md')
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
  })

  it('rejects markdown that is not valid UTF-8', async () => {
    const db = await makeDb()
    const invalid = new Uint8Array([0xff, 0xfe, 0x00])
    const manifest = buildManifest({ sha256: shaOfBytes(invalid), bytes: invalid.byteLength })
    await expect(
      importBackupFileBatch(DB_ENV, USER, [
        { file: new File([invalid], 'hello.md'), path: NOTE_PATH },
      ], manifest, ctx()),
    ).rejects.toThrow('The Markdown file is not valid UTF-8: notes/hello.md')
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
  })

  it('updates an existing note when the imported version is newer', async () => {
    const db = await makeDb()
    await importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], buildManifest(), ctx())
    const c = ctx('newer')
    await importBackupFileBatch(
      DB_ENV,
      USER,
      [selectedFile('hello **universe**')],
      buildManifest({ content: 'hello **universe**', updatedAt: H.now - 500 }),
      c,
    )
    expect(c.result.updatedNotes).toBe(1)
    const note = await firstRow(db, 'SELECT content, rev FROM notes')
    expect(note!.content).toBe('hello **universe**')
    expect(note!.rev).toBe(2)
    const snapshot = await firstRow(db, 'SELECT content FROM note_versions')
    expect(snapshot!.content).toBe('hello **world**')
  })

  it('skips and duplicates existing notes under their conflict modes', async () => {
    const db = await makeDb()
    await importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], buildManifest(), ctx())
    const c = ctx('skip')
    await importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], buildManifest(), c)
    expect(c.result.skippedNotes).toBe(1)
    expect((await firstRow(db, 'SELECT title FROM notes'))!.title).toBe('Hello')

    const c2 = ctx('duplicate')
    await importBackupFileBatch(DB_ENV, USER, [selectedFile('hello **world**')], buildManifest(), c2)
    expect(c2.result.createdNotes).toBe(1)
    expect((await allRows(db, 'SELECT title FROM notes')).map((r) => r.title).sort())
      .toEqual(['Hello', 'Hello (imported)'])
  })

  it('rewrites backup attachment URLs to the restored attachment id', async () => {
    const db = await makeDb()
    const attachmentBytes = new TextEncoder().encode('fake png')
    const attachmentSha = shaOfBytes(attachmentBytes)
    await runSql(
      db,
      `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height,
         storage, is_starred, is_pinned, tags, created_at)
       VALUES ('att-1', ?1, NULL, NULL, 'pic.png', 'image/png', ?2, ?3, NULL, NULL, 'kv', 0, 0, '[]', ?4)`,
      USER,
      attachmentBytes.byteLength,
      attachmentSha,
      H.now - 2000,
    )
    await runSql(
      db,
      `INSERT INTO import_mappings (user_id, entity, source_id, target_id, updated_at)
       VALUES (?1, 'attachment', ?2, 'att-1', ?3)`,
      USER,
      attachmentSha,
      H.now - 1000,
    )
    const content = `see ../../attachments/${attachmentSha}--pic.png`
    const manifest = buildManifest({
      content,
      attachmentHashes: [attachmentSha],
      attachments: [{
        path: `attachments/${attachmentSha}--pic.png`,
        filename: 'pic.png',
        mime: 'image/png',
        size: attachmentBytes.byteLength,
        sha256: attachmentSha,
        createdAt: H.now - 2000,
      }],
    })
    const c = ctx()
    await importBackupFileBatch(DB_ENV, USER, [selectedFile(content)], manifest, c)
    expect(c.result.skippedAttachments).toBe(0)
    const note = await firstRow(db, 'SELECT content FROM notes')
    expect(note!.content).toBe('see /api/files/att-1')
  })

  it('restores a trashed note with deleted_at and a delete index entry', async () => {
    const db = await makeDb()
    const c = ctx()
    const manifest = buildManifest({
      path: 'trash/hello.md',
      state: 'trash',
      deletedAt: H.now - 500,
    })
    await importBackupFileBatch(
      DB_ENV,
      USER,
      [{ file: new File([ENCODER.encode('hello **world**')], 'hello.md'), path: 'trash/hello.md' }],
      manifest,
      c,
    )
    expect(c.result.createdNotes).toBe(1)
    const note = await firstRow(db, 'SELECT content, deleted_at FROM notes')
    expect(note!.content).toBe('hello **world**')
    expect(note!.deleted_at).toBe(H.now - 500)
    const fts = await firstRow(db, 'SELECT kind FROM fts_index_queue')
    expect(fts!.kind).toBe('delete')
    expect((await allRows(db, 'SELECT * FROM ai_index_queue')).length).toBe(0)
  })
})

describe('importBackupFileBatch attachments (fake KV storage)', () => {
  const attachmentBytes = () => ENCODER.encode('fake png bytes')
  const attachmentSha = () => shaOfBytes(attachmentBytes())
  const attachmentNoteContent = () => `see ../../attachments/${attachmentSha()}--pic.png`

  function attachmentManifest(): MarkdownBackupManifest {
    const bytes = attachmentBytes()
    const sha = attachmentSha()
    return buildManifest({
      content: attachmentNoteContent(),
      attachmentHashes: [sha],
      attachments: [{
        path: `attachments/${sha}--pic.png`,
        filename: 'pic.png',
        mime: 'image/png',
        size: bytes.byteLength,
        sha256: sha,
        createdAt: H.now - 2000,
      }],
    })
  }

  function attachmentSelection(): Array<{ file: File; path: string }> {
    return [
      { file: new File([attachmentBytes()], 'pic.png'), path: `attachments/${attachmentSha()}--pic.png` },
      { file: new File([ENCODER.encode(attachmentNoteContent())], 'hello.md'), path: NOTE_PATH },
    ]
  }

  it('persists a backup attachment to KV and rewrites the note URL to the new id', async () => {
    const db = await makeDb()
    const kv = createKvShim()
    const env = { env: { DB: db as unknown as D1Database, FILES_KV: kv } as Env }
    const c = ctx()
    await importBackupFileBatch(env, USER, attachmentSelection(), attachmentManifest(), c)
    expect(c.result.createdAttachments).toBe(1)
    expect(c.result.createdNotes).toBe(1)

    const row = await firstRow(db, 'SELECT id, storage, sha256, size FROM attachments')
    expect(row!.storage).toBe('kv')
    expect(row!.sha256).toBe(attachmentSha())
    expect(row!.size).toBe(attachmentBytes().byteLength)
    expect(kv.listKeys()).toHaveLength(1)
    const mapping = await firstRow(db, "SELECT target_id FROM import_mappings WHERE entity = 'attachment' AND source_id = ?1", attachmentSha())
    expect(mapping!.target_id).toBe(row!.id)
    const note = await firstRow(db, 'SELECT content FROM notes')
    expect(note!.content).toBe(`see /api/files/${row!.id}`)
  })

  it('skips an attachment that already exists with matching content', async () => {
    const db = await makeDb()
    const kv = createKvShim()
    const env = { env: { DB: db as unknown as D1Database, FILES_KV: kv } as Env }
    const sha = attachmentSha()
    await runSql(
      db,
      `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height,
         storage, is_starred, is_pinned, tags, created_at)
       VALUES ('att-1', ?1, NULL, NULL, 'pic.png', 'application/octet-stream', ?2, ?3, NULL, NULL, 'kv', 0, 0, '[]', ?4)`,
      USER,
      attachmentBytes().byteLength,
      sha,
      H.now - 2000,
    )
    await runSql(
      db,
      `INSERT INTO import_mappings (user_id, entity, source_id, target_id, updated_at)
       VALUES (?1, 'attachment', ?2, 'att-1', ?3)`,
      USER,
      sha,
      H.now - 1000,
    )
    const key = attachmentObjectKey({
      user_id: USER,
      id: 'att-1',
      mime: 'application/octet-stream',
      filename: 'pic.png',
    })
    await kv.put(key, attachmentBytes())

    const c = ctx()
    await importBackupFileBatch(env, USER, attachmentSelection(), attachmentManifest(), c)
    expect(c.result.skippedAttachments).toBe(1)
    expect(c.result.createdAttachments).toBe(0)
    expect((await allRows(db, 'SELECT * FROM attachments')).length).toBe(1)
    const note = await firstRow(db, 'SELECT content FROM notes')
    expect(note!.content).toBe('see /api/files/att-1')
  })

  it('rejects attachment restore when no storage binding is configured', async () => {
    const db = await makeDb()
    const c = ctx()
    await expect(
      importBackupFileBatch(DB_ENV, USER, attachmentSelection(), attachmentManifest(), c),
    ).rejects.toThrow('This instance has no R2 or Workers KV attachment binding and cannot restore attachments')
    expect((await allRows(db, 'SELECT * FROM attachments')).length).toBe(0)
    expect((await allRows(db, 'SELECT * FROM notes')).length).toBe(0)
  })

  it('rejects an attachment that exceeds the account quota', async () => {
    const db = await makeDb()
    const kv = createKvShim()
    const env = { env: { DB: db as unknown as D1Database, FILES_KV: kv } as Env }
    await runSql(
      db,
      `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height,
         storage, is_starred, is_pinned, tags, created_at)
       VALUES ('quota-1', ?1, NULL, NULL, 'big.bin', 'application/octet-stream', ?2, ?3, NULL, NULL, 'kv', 0, 0, '[]', ?4)`,
      USER,
      LIMITS.attachmentQuotaBytes - 5,
      'b'.repeat(64),
      H.now - 2000,
    )
    await expect(
      importBackupFileBatch(env, USER, attachmentSelection(), attachmentManifest(), ctx()),
    ).rejects.toThrow('The account attachment quota has been reached')
    expect(kv.listKeys()).toHaveLength(0)
  })

  it('rolls a persisted attachment back by deleting the object and row', async () => {
    const db = await makeDb()
    const kv = createKvShim()
    const env = { env: { DB: db as unknown as D1Database, FILES_KV: kv } as Env }
    const persisted = await persistAttachmentWithinQuota(env.env, {
      id: 'att-2',
      userId: USER,
      noteId: null,
      filename: 'pic.png',
      reportedMime: 'image/png',
      bytes: attachmentBytes(),
      createdAt: H.now - 2000,
    })
    expect((await allRows(db, 'SELECT * FROM attachments')).length).toBe(1)
    expect(kv.listKeys()).toHaveLength(1)

    await rollbackPersistedAttachments(env.env, [persisted])
    expect((await allRows(db, 'SELECT * FROM attachments')).length).toBe(0)
    expect((await allRows(db, 'SELECT * FROM attachment_cleanup')).length).toBe(0)
    expect(kv.listKeys()).toHaveLength(0)
  })
})
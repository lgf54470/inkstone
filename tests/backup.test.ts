import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { Env } from '../src/worker/env'
import { buildSnapshot } from '../src/worker/backup/snapshot/build'
import { buildJsonExport } from '../src/worker/backup/snapshot/export'
import type { BackupFile } from '../src/worker/backup/snapshot/build'
import { isChangeLogTrimDue, isScheduledBackupDue } from '../src/worker/backup/scheduler'
import { toBackupTarget } from '../src/worker/backup/engine'
import { createD1Database as createDb, runSql, type D1Shim } from './d1-harness'

const H = { counter: 0, now: 2_000_000_000_000 }
const USER = 'user-1'
const ENV = { DB: null as unknown as D1Database } as Env

function shaOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function validId(seed: string): string {
  return `a${seed.padStart(25, 'c')}`
}

async function readFileBody(open: BackupFile['open']): Promise<Uint8Array> {
  const reader = (await open()).getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  reader.releaseLock()
  const body = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  ENV.DB = db as unknown as D1Database
  return db
}

async function seedUser(db: D1Shim, id = USER): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?2, 'x', 'login', 'Author', '', ?3, ?3)`,
    id, `user-${id}`, H.now,
  )
}

async function seedFolder(db: D1Shim, id: string, name: string, parentId: string | null = null): Promise<void> {
  await runSql(
    db,
    `INSERT INTO folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, NULL, NULL, 0, ?5, ?5)`,
    id, USER, parentId, name, H.now,
  )
}

async function seedNote(db: D1Shim, fields: Record<string, unknown>): Promise<string> {
  const id = (fields.id ?? `n-${++H.counter}`) as string
  const content = (fields.content ?? '') as string
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, '', ?5, '', 1, 1, 1, 0, 0, ?6, 0, ?7, ?8, ?8, ?9)`,
    id, USER, fields.folder_id ?? null, fields.title ?? 'Note', content,
    fields.is_archived ? 1 : 0,
    shaOf(content), H.now,
    fields.deleted_at ?? null,
  )
  return id
}

async function seedAttachment(
  db: D1Shim,
  fields: Record<string, unknown>,
): Promise<string> {
  const id = (fields.id ?? validId(String(++H.counter))) as string
  const content = (fields.content ?? 'x') as string
  await runSql(
    db,
    `INSERT INTO attachments (id, user_id, note_id, folder_id, filename, mime, size, sha256, width, height,
       storage, is_starred, is_pinned, tags, created_at)
     VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, NULL, NULL, ?8, 0, 0, '[]', ?9)`,
    id, USER, fields.note_id ?? null,
    fields.filename ?? 'photo.png',
    fields.mime ?? 'image/png',
    (fields.size as number) ?? 1024,
    shaOf(content),
    fields.storage ?? 'r2',
    H.now,
  )
  return id
}

describe('backup snapshot (real D1)', () => {
  it('builds a snapshot with folder paths, note states, and referenced attachments', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedFolder(db, validId('f1'), 'Projects')
    await seedFolder(db, validId('f2'), 'Deep', validId('f1'))
    const attachmentId = await seedAttachment(db, { filename: 'pic.png', size: 512 })
    const n1 = validId('n1')
    const n2 = validId('n2')
    const n3 = validId('n3')
    await seedNote(db, { id: n1, title: 'Active note', folder_id: validId('f2'), content: `![pic](/api/files/${attachmentId})` })
    await seedNote(db, { id: n2, title: 'Archived note', is_archived: true, content: '' })
    await seedNote(db, { id: n3, title: 'Trashed note', deleted_at: H.now - 1000, content: '' })

    const snapshot = await buildSnapshot(ENV, USER)
    expect(snapshot.noteCount).toBe(3)
    expect(snapshot.attachmentCount).toBe(1)
    expect(snapshot.stamp).toMatch(/^\d{8}-\d{6}-\d{3}$/)
    expect(snapshot.bytes).toBeGreaterThan(0)

    const paths = snapshot.payloadFiles.map((f) => f.path)
    expect(paths).toContain(`notes/Projects/Deep/Active note--${n1.slice(-8)}.md`)
    expect(paths).toContain(`archived/Archived note--${n2.slice(-8)}.md`)
    expect(paths).toContain(`trash/Trashed note--${n3.slice(-8)}.md`)
    expect(paths).toContain('README.txt')
    expect(paths.some((p) => p.startsWith('attachments/') && p.endsWith('--pic.png'))).toBe(true)

    const manifest = JSON.parse(new TextDecoder().decode(await readFileBody(snapshot.manifestFile.open)))
    expect(manifest.format).toBe('inkstone-markdown-backup')
    expect(manifest.notes).toHaveLength(3)
    expect(manifest.attachments[0].sha256).toBe(shaOf('x'))
    expect(manifest.attachments[0].path).toMatch(/^attachments\/[0-9a-f]{64}--pic\.png$/)
  })

  it('deduplicates note paths and rejects missing referenced attachments', async () => {
    const db = await makeDb()
    await seedUser(db)
    const n1 = validId('n1')
    const n2 = validId('n2')
    await seedNote(db, { id: n1, title: 'Same title' })
    await seedNote(db, { id: n2, title: 'same title' })

    const snapshot = await buildSnapshot(ENV, USER)
    const paths = snapshot.payloadFiles.map((f) => f.path)
    expect(paths).toContain(`notes/Same title--${n1.slice(-8)}.md`)
    expect(paths).toContain(`notes/same title--${n2.slice(-8)}.md`)
    expect(new Set(paths.map((p) => p.toLowerCase()))).toHaveLength(paths.length)

    await seedNote(db, { id: validId('n3'), title: 'Broken', content: `![x](/api/files/${validId('m1')})` })
    await expect(buildSnapshot(ENV, USER)).rejects.toThrow(
      'A referenced attachment is missing from the database',
    )
  })
})

describe('backup JSON export (real D1)', () => {
  it('streams notes and metadata into a valid bundle', async () => {
    const db = await makeDb()
    await seedUser(db)
    await seedFolder(db, validId('f1'), 'Docs')
    await runSql(
      db,
      `INSERT INTO tags (id, user_id, name, color, is_pinned, created_at)
       VALUES (?1, ?2, 'essay', NULL, 0, ?3)`,
      validId('t1'), USER, H.now,
    )
    await seedNote(db, { id: validId('n1'), title: 'First', folder_id: validId('f1') })
    await seedNote(db, { id: validId('n2'), title: 'Second' })

    const bytes = await buildJsonExport(ENV, USER)
    const bundle = JSON.parse(new TextDecoder().decode(bytes))
    expect(bundle.format).toBe('inkstone-export')
    expect(bundle.user.login).toBe('login')
    expect(bundle.folders).toHaveLength(1)
    expect(bundle.tags[0].name).toBe('essay')
    expect(bundle.notes).toHaveLength(2)
    expect(bundle.notes[0].id).toBe(validId('n1'))
    expect(bundle.attachments).toEqual([])
  })
})

describe('backup scheduler logic', () => {
  it('decides when a scheduled backup is due', () => {
    const now = H.now
    const interval = 24 * 60 * 60 * 1000
    expect(isScheduledBackupDue(0, null, null, now)).toBe(false)
    expect(isScheduledBackupDue(interval, null, null, now)).toBe(true)
    expect(isScheduledBackupDue(interval, now - 1000, null, now)).toBe(false)
    expect(isScheduledBackupDue(interval, now - interval, now - 1000, now)).toBe(false)
    expect(isScheduledBackupDue(interval, now - interval, now - 2 * 60 * 60 * 1000, now)).toBe(true)
    expect(isScheduledBackupDue(interval, null, now - 2 * 60 * 60 * 1000, now)).toBe(true)
    expect(isScheduledBackupDue(interval, null, now - 10 * 60 * 1000, now)).toBe(false)
  })

  it('decides when the change log needs trimming', () => {
    const now = H.now
    expect(isChangeLogTrimDue(null, now)).toBe(true)
    expect(isChangeLogTrimDue('garbage', now)).toBe(true)
    expect(isChangeLogTrimDue(String(now - 1000), now)).toBe(false)
    expect(isChangeLogTrimDue(String(now - 25 * 60 * 60 * 1000), now)).toBe(true)
  })
})

describe('backup target row mapping', () => {
  it('maps a target row to its public shape', () => {
    const target = toBackupTarget({
      id: validId('t'),
      user_id: USER,
      type: 's3',
      name: 'My bucket',
      enabled: 1,
      config: '{"bucket":"b"}',
      secret: 'encrypted',
      last_run_at: 123,
      last_status: 'success',
      last_error: null,
      created_at: 1,
      updated_at: 2,
    })
    expect(target.type).toBe('s3')
    expect(target.enabled).toBe(true)
    expect(target.hasSecret).toBe(true)
    expect(target.lastStatus).toBe('success')
    expect(target.config).toEqual({ bucket: 'b' })
  })
})
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { collectionPageRoutes, shareManageRoutes, shareRoutes } from '../src/worker/routes/share'
import { createD1Database as createDb, queryFirst as firstRow, runSql, type D1Shim } from './d1-harness'

/**
 * Folder and tag ids are 26-character ids (`newId`), and the publish route validates them as such —
 * the same check the organizer applies — so the fixtures use real ids rather than readable ones.
 */
function folderId(index: string | number): string {
  return `f${'0'.repeat(23)}${String(index).padStart(2, '0')}`
}

function tagId(index: string | number): string {
  return `t${'0'.repeat(23)}${String(index).padStart(2, '0')}`
}

const USER = 'user-1'
const OTHER_USER = 'user-2'
const NOW = 2_000_000_000_000
const INDEX_HTML = '<html><head><title>Inkstone</title></head><body></body></html>'

const DB_ENV = {
  env: {
    DB: null as unknown as D1Database,
    VISIT_FP_SECRET: undefined as string | undefined,
    APP_NAME: 'Inkstone',
    ASSETS: { fetch: async () => new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html' } }) },
  },
}

const EXECUTION_CTX = { waitUntil: () => {} } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  await seedUser(db, USER, 'author')
  await seedUser(db, OTHER_USER, 'other')
  return db
}

async function seedUser(db: D1Shim, id: string, name: string): Promise<void> {
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?1, 'x', 'login', ?2, '', ?3, ?3)`,
    id, name, NOW,
  )
}

let noteCounter = 0

async function seedNote(db: D1Shim, fields: Record<string, unknown> = {}): Promise<string> {
  const content = (fields.content ?? 'body') as string
  const id = (fields.id ?? `n-${++noteCounter}`) as string
  await runSql(
    db,
    `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
       is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at, deleted_at)
     VALUES (?1, ?2, ?3, ?4, '', ?5, ?6, 1, 1, 1, ?7, 0, 0, 0, ?8, ?9, ?10, ?11)`,
    id, fields.user_id ?? USER, fields.folder_id ?? null, fields.title ?? 'Note', content,
    fields.excerpt ?? 'excerpt', fields.is_pinned ? 1 : 0,
    createHash('sha256').update(content).digest('hex'), NOW, fields.updated_at ?? NOW, fields.deleted_at ?? null,
  )
  return id
}

async function seedShare(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO shares (slug, note_id, user_id, folder_id, tags, password_hash, expires_at, views, is_enabled, created_at, last_viewed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, NULL)`,
    fields.slug, fields.note_id, fields.user_id ?? USER, fields.folder_id ?? null, fields.tags ?? '[]',
    fields.password_hash ?? null, fields.expires_at ?? null, fields.is_enabled ?? 1, fields.created_at ?? NOW,
  )
}

async function seedFolder(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO share_folders (id, user_id, parent_id, name, icon, color, position, created_at, updated_at)
     VALUES (?1, ?2, NULL, ?3, NULL, NULL, 0, ?4, ?4)`,
    fields.id, fields.user_id ?? USER, fields.name ?? 'Folder', NOW,
  )
}

async function seedTag(db: D1Shim, fields: Record<string, unknown>): Promise<void> {
  await runSql(
    db,
    `INSERT INTO share_tags (id, user_id, name, color, is_pinned, created_at) VALUES (?1, ?2, ?3, NULL, 0, ?4)`,
    fields.id, fields.user_id ?? USER, fields.name ?? 'Tag', NOW,
  )
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>()
  const asUser = async (c: Parameters<Parameters<Hono<AppBindings>['use']>[1]>[0], next: () => Promise<void>) => {
    c.set('database', { ftsEnabled: false })
    c.set('userId', USER)
    await next()
  }
  app.use('/api/share', asUser)
  app.use('/api/share/*', asUser)
  app.onError((err, c) => errorResponse(c, err))
  app.route('/api/share', shareManageRoutes)
  app.route('/api/public', shareRoutes)
  app.route('/c', collectionPageRoutes)
  return app
}

function request(app: Hono<AppBindings>, path: string, init?: RequestInit): Promise<Response> {
  return app.request(path, init, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

function postJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patchJson(app: Hono<AppBindings>, path: string, body: unknown): Promise<Response> {
  return request(app, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

interface CollectionBody {
  title: string
  count: number
  notes: Array<{ slug: string; title: string; excerpt: string; hasPassword: boolean }>
  nextCursor: string | null
}

async function readCollection(app: Hono<AppBindings>, slug: string, body: unknown = {}, query = ''): Promise<Response> {
  return postJson(app, `/api/public/collection/${slug}${query}`, body)
}

async function publishFolder(app: Hono<AppBindings>, folderId: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await postJson(app, '/api/share/collections', { targetType: 'folder', targetValue: folderId, ...extra })
  expect(res.status).toBe(200)
  return ((await res.json()) as { slug: string }).slug
}

describe('collection membership derivation (ADR-0005)', () => {
  it('lists a folder collection from the shares themselves, not from a snapshot', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const first = await seedNote(db, { title: 'First' })
    const second = await seedNote(db, { title: 'Second' })
    await seedShare(db, { slug: 's-first', note_id: first, folder_id: folderId(1) })
    await seedShare(db, { slug: 's-second', note_id: second, folder_id: folderId(1) })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))

    const body = await (await readCollection(app, slug)).json() as CollectionBody
    expect(body.title).toBe('Field notes')
    expect(body.count).toBe(2)
    expect(body.notes.map((note) => note.slug).sort()).toEqual(['s-first', 's-second'])

    // The derivation is the point: a share added after publishing appears without republishing.
    const third = await seedNote(db, { title: 'Third' })
    await seedShare(db, { slug: 's-third', note_id: third, folder_id: folderId(1) })
    const grown = await (await readCollection(app, slug)).json() as CollectionBody
    expect(grown.count).toBe(3)
    expect(grown.notes.map((note) => note.slug)).toContain('s-third')
  })

  it('drops a member as soon as it is paused, expired, deleted or moved out', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const inside = await seedNote(db, { title: 'Inside' })
    const moved = await seedNote(db, { title: 'Moved' })
    const paused = await seedNote(db, { title: 'Paused' })
    const expired = await seedNote(db, { title: 'Expired' })
    const deleted = await seedNote(db, { title: 'Deleted' })
    await seedShare(db, { slug: 's-inside', note_id: inside, folder_id: folderId(1) })
    await seedShare(db, { slug: 's-moved', note_id: moved, folder_id: folderId(1) })
    await seedShare(db, { slug: 's-paused', note_id: paused, folder_id: folderId(1), is_enabled: 0 })
    await seedShare(db, { slug: 's-expired', note_id: expired, folder_id: folderId(1), expires_at: Date.now() - 1000 })
    await seedShare(db, { slug: 's-deleted', note_id: deleted, folder_id: folderId(1) })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))

    const slugsOf = async (): Promise<string[]> => {
      const body = await (await readCollection(app, slug)).json() as CollectionBody
      return body.notes.map((note) => note.slug).sort()
    }
    // Paused and expired members were never in it; the rest are, because they are live shares of a
    // live folder — being about to be tested is not a membership rule.
    expect(await slugsOf()).toEqual(['s-deleted', 's-inside', 's-moved'])

    await runSql(db, `UPDATE shares SET folder_id = NULL WHERE slug = 's-moved'`)
    expect(await slugsOf()).toEqual(['s-deleted', 's-inside'])

    await runSql(db, `UPDATE notes SET deleted_at = ?1 WHERE id = ?2`, NOW, deleted)
    expect(await slugsOf()).toEqual(['s-inside'])

    // Pausing the last member empties the directory rather than leaving a stale row behind.
    await runSql(db, `UPDATE shares SET is_enabled = 0 WHERE slug = 's-inside'`)
    const emptied = await (await readCollection(app, slug)).json() as CollectionBody
    expect(emptied.notes).toEqual([])
    expect(emptied.count).toBe(0)
  })

  it('matches a tag collection by the name its shares store, and never across accounts', async () => {
    const db = await makeDb()
    await seedTag(db, { id: tagId(1), name: 'Research' })
    const mine = await seedNote(db, { title: 'Mine' })
    // Two different addresses meet here, and the fixtures have to respect that or the test proves
    // nothing: the collection stores the tag *id* (it is what renames the page), while a share stores
    // the tag *name* — the value the edit modal writes and the list's own `?tag=` matches.
    await seedShare(db, { slug: 's-mine', note_id: mine, tags: JSON.stringify(['Research']) })
    const otherNote = await seedNote(db, { user_id: OTHER_USER, title: 'Theirs' })
    await seedShare(db, { user_id: OTHER_USER, slug: 's-theirs', note_id: otherNote, tags: JSON.stringify(['Research']) })
    // Membership is "the name is a whole element of the array", not "it appears somewhere in it": a
    // name that merely carries the target's characters must stay out of the collection.
    const nearMiss = await seedNote(db, { title: 'Near miss' })
    await seedShare(db, { slug: 's-near', note_id: nearMiss, tags: JSON.stringify(['Research papers']) })
    const app = makeApp()
    const slug = await publishFolder(app, tagId(1), { targetType: 'tag' })

    const body = await (await readCollection(app, slug)).json() as CollectionBody
    expect(body.title).toBe('Research')
    expect(body.count).toBe(1)
    expect(body.notes.map((note) => note.slug)).toEqual(['s-mine'])
    // The directory and the owner's list have to answer this by the same rule: a collection that
    // selected differently from the list it was created from is a bug nobody could see.
    const filtered = await (await request(app, '/api/share?tag=Research')).json() as { shares: Array<{ slug: string }> }
    expect(filtered.shares.map((share) => share.slug)).toEqual(body.notes.map((note) => note.slug))
  })

  it('reads a renamed or deleted tag at request time, and covers nothing when it is gone', async () => {
    const db = await makeDb()
    await seedTag(db, { id: tagId(1), name: 'Research' })
    const note = await seedNote(db, { title: 'Mine' })
    await seedShare(db, { slug: 's-mine', note_id: note, tags: JSON.stringify(['Research']) })
    const app = makeApp()
    const slug = await publishFolder(app, tagId(1), { targetType: 'tag' })

    // Renaming follows the record: the page takes the new name. The shares still carry the name they
    // were written with, so the page stops matching them — the same staleness the list's `?tag=`
    // filter has, registered as a ledger item rather than papered over here.
    await runSql(db, `UPDATE share_tags SET name = 'Review' WHERE id = ?1`, tagId(1))
    const renamed = await (await readCollection(app, slug)).json() as CollectionBody
    expect(renamed.title).toBe('Review')
    expect(renamed.notes).toEqual([])

    // A tag row that is gone leaves neither a name to show nor a name to match.
    await runSql(db, `DELETE FROM share_tags WHERE id = ?1`, tagId(1))
    const gone = await (await readCollection(app, slug)).json() as CollectionBody
    expect(gone.title).toBe('')
    expect(gone.count).toBe(0)
    expect(gone.notes).toEqual([])
  })
})

describe('collection access policy (ADR-0005)', () => {
  it('answers identically to an unknown, a paused and an expired collection', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))
    const row = await firstRow(db, 'SELECT id FROM share_collections WHERE slug = ?1', slug)

    const unknown = await readCollection(app, 'ck3m9wq7zt8x2v4b6n0r5s1d')
    const live = await readCollection(app, slug)
    expect(live.status).toBe(200)

    await runSql(db, `UPDATE share_collections SET is_enabled = 0 WHERE id = ?1`, row!.id)
    const paused = await readCollection(app, slug)
    await runSql(db, `UPDATE share_collections SET is_enabled = 1, expires_at = ?1 WHERE id = ?2`, Date.now() - 1000, row!.id)
    const expired = await readCollection(app, slug)

    const [unknownBody, pausedBody, expiredBody] = [await unknown.text(), await paused.text(), await expired.text()]
    expect(unknown.status).toBe(paused.status)
    expect(paused.status).toBe(expired.status)
    expect(unknownBody).toBe(pausedBody)
    expect(pausedBody).toBe(expiredBody)
    // Not even the code that says "no such collection" may differ between the three.
    expect(unknownBody).toContain('not_found')
  })

  it('tells a wrong password from no password in no way at all', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1), { password: 'correct-horse' })
    const nothing = await readCollection(app, slug)
    const wrong = await readCollection(app, slug, { password: 'wrong-horse' })

    expect(nothing.status).toBe(401)
    expect(wrong.status).toBe(nothing.status)
    const [nothingBody, wrongBody] = [await nothing.text(), await wrong.text()]
    expect(wrongBody).toBe(nothingBody)
    // Nothing about the directory leaks through the refusal, not even how big it is.
    expect(nothingBody).not.toContain('count')

    const opened = await readCollection(app, slug, { password: 'correct-horse' })
    expect(opened.status).toBe(200)
  })

  it('locks the collection gate on repeated guesses, even for the right password', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1), { password: 'correct-horse' })
    const seen: string[] = []

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const guessed = await readCollection(app, slug, { password: `guess-${attempt}` })
      seen.push(String(guessed.status))
    }
    const locked = await readCollection(app, slug, { password: 'correct-horse' })
    expect(seen).toHaveLength(10)
    expect(locked.status).toBe(429)
  })

  it('keeps the shell as quiet as a share page, including its title', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))

    const shell = await request(app, `/c/${slug}`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(shell.headers.get('cache-control')).toBe('no-store')
    const html = await shell.text()
    expect(html).toContain('noindex, nofollow')
    expect(html).toContain('Field notes')

    // Putting a password on it later is a re-statement of the same policy, so the address does not
    // move — and the shell stops naming the folder, exactly as a protected share's shell does.
    const locked = await publishFolder(app, folderId(1), { password: 'correct-horse' })
    const protectedShell = await request(app, `/c/${slug}`)
    const protectedHtml = await protectedShell.text()
    expect(protectedHtml).not.toContain('Field notes')
    expect(locked).toBe(slug)
  })
})

describe('collection pagination (ADR-0005)', () => {
  it('walks 101 members in two pages without repeating or skipping one', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Big' })
    for (let index = 0; index < 101; index += 1) {
      const note = await seedNote(db, { title: `Note ${index}`, updated_at: NOW - index * 1000 })
      await seedShare(db, { slug: `s-${String(index).padStart(3, '0')}`, note_id: note, folder_id: folderId(1) })
    }
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))

    const first = await (await readCollection(app, slug, {}, '?limit=100')).json() as CollectionBody
    expect(first.notes).toHaveLength(100)
    expect(first.count).toBe(101)
    expect(first.nextCursor).toBeTruthy()

    const second = await (await readCollection(app, slug, {}, `?limit=100&cursor=${encodeURIComponent(first.nextCursor!)}`)).json() as CollectionBody
    expect(second.notes).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    const seen = new Set([...first.notes, ...second.notes].map((note) => note.slug))
    expect(seen.size).toBe(101)

    // A cursor the worker did not mint is a client bug, not a first page.
    const bad = await readCollection(app, slug, {}, '?cursor=not-a-cursor')
    expect(bad.status).toBe(400)
  })

  it('leads with the pinned members, the way the share list does', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Ordered' })
    const older = await seedNote(db, { title: 'Older', updated_at: NOW - 10_000 })
    const newer = await seedNote(db, { title: 'Newer', updated_at: NOW })
    const pinned = await seedNote(db, { title: 'Pinned', updated_at: NOW - 20_000, is_pinned: true })
    await seedShare(db, { slug: 's-older', note_id: older, folder_id: folderId(1) })
    await seedShare(db, { slug: 's-newer', note_id: newer, folder_id: folderId(1) })
    await seedShare(db, { slug: 's-pinned', note_id: pinned, folder_id: folderId(1) })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))

    const body = await (await readCollection(app, slug)).json() as CollectionBody
    expect(body.notes.map((note) => note.slug)).toEqual(['s-pinned', 's-newer', 's-older'])
  })
})

describe('collection owner routes (ADR-0005)', () => {
  it('publishes one address per target and re-states the policy instead of adding a second', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))
    const again = await publishFolder(app, folderId(1), { password: 'later-password' })

    expect(again).toBe(slug)
    const rows = await firstRow(db, 'SELECT COUNT(*) AS c FROM share_collections') as { c: number }
    expect(rows.c).toBe(1)
    const stored = await firstRow(db, 'SELECT password_hash FROM share_collections WHERE slug = ?1', slug)
    expect(stored!.password_hash).toBeTruthy()
  })

  it('refuses a target the account does not own', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(9), user_id: OTHER_USER, name: 'Theirs' })
    const app = makeApp()

    const res = await postJson(app, '/api/share/collections', { targetType: 'folder', targetValue: folderId(9) })
    expect(res.status).toBe(404)
    const rows = await firstRow(db, 'SELECT COUNT(*) AS c FROM share_collections') as { c: number }
    expect(rows.c).toBe(0)
  })

  it('reports the live count, then pauses, resumes and revokes without touching the shares', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const inside = await seedNote(db, { title: 'Inside' })
    await seedShare(db, { slug: 's-inside', note_id: inside, folder_id: folderId(1) })
    const app = makeApp()
    const slug = await publishFolder(app, folderId(1))
    const id = (await firstRow(db, 'SELECT id FROM share_collections WHERE slug = ?1', slug))!.id as string

    const listed = await (await request(app, '/api/share/collections')).json() as { collections: Array<{ id: string; count: number; isEnabled: boolean; title: string; hasPassword: boolean }> }
    expect(listed.collections).toHaveLength(1)
    expect(listed.collections[0]).toMatchObject({ id, count: 1, isEnabled: true, title: 'Field notes', hasPassword: false })

    const paused = await patchJson(app, `/api/share/collections/${id}`, { isEnabled: false })
    expect(paused.status).toBe(200)
    // The pause route answers to a pause and nothing else: a patch that tried to change the
    // password would be a second, quietly different way to write the access policy.
    const wrongField = await patchJson(app, `/api/share/collections/${id}`, { password: 'later' })
    expect(wrongField.status).toBe(400)
    const pausedRead = await readCollection(app, slug)
    expect(pausedRead.status).toBe(404)

    const resumed = await patchJson(app, `/api/share/collections/${id}`, { isEnabled: true })
    expect(resumed.status).toBe(200)
    expect((await readCollection(app, slug)).status).toBe(200)

    const revoked = await request(app, `/api/share/collections/${id}`, { method: 'DELETE' })
    expect(revoked.status).toBe(200)
    expect((await readCollection(app, slug)).status).toBe(404)
    // Revoking the collection is not revoking the shares it listed.
    const share = await firstRow(db, 'SELECT is_enabled FROM shares WHERE slug = ?1', 's-inside')
    expect(share!.is_enabled).toBe(1)
    expect(await publishFolder(app, folderId(1))).not.toBe(slug)
  })

  it('refuses to resume a collection whose target was published again while it was paused', async () => {
    const db = await makeDb()
    await seedFolder(db, { id: folderId(1), name: 'Field notes' })
    const app = makeApp()
    const first = await publishFolder(app, folderId(1))
    const firstId = (await firstRow(db, 'SELECT id FROM share_collections WHERE slug = ?1', first))!.id as string
    await patchJson(app, `/api/share/collections/${firstId}`, { isEnabled: false })
    await publishFolder(app, folderId(1))

    const conflict = await patchJson(app, `/api/share/collections/${firstId}`, { isEnabled: true })
    expect(conflict.status).toBe(400)
  })

  it('caps how many collections one account can publish', async () => {
    const db = await makeDb()
    for (let index = 0; index < 21; index += 1) await seedFolder(db, { id: folderId(index), name: `Folder ${index}` })
    const app = makeApp()
    for (let index = 0; index < 20; index += 1) await publishFolder(app, folderId(index))

    const over = await postJson(app, '/api/share/collections', { targetType: 'folder', targetValue: folderId(20) })
    expect(over.status).toBe(400)
  })
})

import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'
import {
  SHARE_STATUS_FILTERS,
  VISIT_LOG_FILTERS,
  shareMatchesSelection,
  shareMatchesStatus,
  shareMatchesTarget,
  visitMatchesLogFilter,
  type ShareSelection,
  type ShareSelectionSubject,
  type ShareTarget,
} from '../src/shared/share-selection'
import { TABLE_STATEMENTS } from '../src/worker/db/schema/tables'
import { INDEX_STATEMENTS } from '../src/worker/db/schema/indexes'
import type { AppBindings } from '../src/worker/env'
import { errorResponse } from '../src/worker/lib/errors'
import { shareSelectionSql, visitLogFilterSql } from '../src/worker/lib/share-selection-sql'
import { shareManageRoutes } from '../src/worker/routes/share'
import { tagCountsStatement, toTagCounts } from '../src/worker/routes/share/global-stats'
import { createD1Database as createDb, queryRows, runSql, type D1Shim } from './d1-harness'

/**
 * The parity harness: one selection, answered twice — once by the SQL fragment, once by the shared
 * predicate — over the same rows. A rule written out on each side can pass both of its own unit tests
 * and still disagree; this is the test that fails when it does. The first version of the tag rule was
 * exactly that: `?tag=` matched a name against the stored array, a tag collection matched an id
 * against it, and both had a passing test.
 */

const USER = 'user-1'
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
// Every boundary row below sits hours away from the moment this run reads the clock, so the few
// milliseconds the route spends inside `Date.now()` cannot move a row across one.
const NOW = Date.now()

interface ShareFixture {
  slug: string
  tags?: string
  folderId?: string | null
  expiresAt?: number | null
  isEnabled?: number | null
  password?: string | null
  isPinned?: boolean
  isStarred?: boolean
}

/**
 * Rows chosen so that each rule has something to be wrong about: both sides of every clock boundary,
 * the legacy `is_enabled IS NULL` arm, a tag whose name is a prefix of another name, a tag name
 * carrying `%` and `_` (which a `LIKE` test matches too much of), and the four JSON shapes a stored
 * tag array can have once an old backup or a hand edit has been through it.
 */
const FIXTURES: ShareFixture[] = [
  { slug: 's-plain' },
  { slug: 's-paused', isEnabled: 0 },
  { slug: 's-both-flags', isPinned: true, isStarred: true },
  { slug: 's-pinned', isPinned: true },
  { slug: 's-starred', isStarred: true },
  { slug: 's-password', password: 'hash' },
  { slug: 's-expired', expiresAt: NOW - 1000 },
  { slug: 's-future', expiresAt: NOW + 30 * DAY },
  { slug: 's-soon', expiresAt: NOW + 3 * DAY },
  { slug: 's-soon-inside', expiresAt: NOW + 7 * DAY - 2 * HOUR },
  { slug: 's-soon-outside', expiresAt: NOW + 7 * DAY + 2 * HOUR },
  { slug: 's-folder-a', folderId: 'f-a' },
  { slug: 's-folder-b', folderId: 'f-b' },
  { slug: 's-folder-a-paused', folderId: 'f-a', isEnabled: 0 },
  { slug: 's-tag-research', tags: JSON.stringify(['Research']) },
  { slug: 's-tag-research-other', tags: JSON.stringify(['Research', 'Other']) },
  { slug: 's-tag-near', tags: JSON.stringify(['Research papers']) },
  { slug: 's-tag-percent', tags: JSON.stringify(['100% done']) },
  { slug: 's-tag-percent-near', tags: JSON.stringify(['100 plus done']) },
  { slug: 's-tag-underscore', tags: JSON.stringify(['a_b']) },
  { slug: 's-tag-underscore-near', tags: JSON.stringify(['axb']) },
  { slug: 's-tag-empty', tags: '[]' },
  // Malformed, and valid JSON that is not an array: none of these carries a tag, and none of them may
  // take a request down while saying so.
  { slug: 's-tag-broken', tags: '[{"' },
  { slug: 's-tag-scalar', tags: '"Research"' },
  { slug: 's-tag-object', tags: '{"x":"Research"}' },
  { slug: 's-tag-null', tags: 'null' },
]

const TAGS = [
  { id: 't-1', name: 'Research' },
  { id: 't-2', name: '100% done' },
  { id: 't-3', name: 'a_b' },
  { id: 't-4', name: 'Unused' },
]

const FOLDER_TARGETS: ShareTarget[] = [
  { type: 'folder', value: 'f-a' },
  { type: 'folder', value: 'f-b' },
  { type: 'folder', value: 'f-missing' },
]

const TAG_TARGETS: ShareTarget[] = [
  { type: 'tag', value: 'Research' },
  { type: 'tag', value: '100% done' },
  { type: 'tag', value: 'a_b' },
  { type: 'tag', value: 'Other' },
  { type: 'tag', value: 'Unused' },
]

const TARGETS = [...FOLDER_TARGETS, ...TAG_TARGETS]

const DB_ENV = {
  env: {
    DB: null as unknown as D1Database,
    VISIT_FP_SECRET: undefined as string | undefined,
    APP_NAME: 'Inkstone',
    ASSETS: { fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }) },
  },
}

const EXECUTION_CTX = { waitUntil: () => {} } as unknown as ExecutionContext

async function makeDb(): Promise<D1Shim> {
  const db = createDb()
  for (const statement of TABLE_STATEMENTS) await runSql(db, statement)
  for (const statement of INDEX_STATEMENTS) await runSql(db, statement)
  DB_ENV.env.DB = db as unknown as D1Database
  await runSql(
    db,
    `INSERT INTO users (id, username, password_hash, login, name, avatar_url, created_at, last_seen_at)
     VALUES (?1, ?1, 'x', 'login', 'author', '', ?2, ?2)`,
    USER, NOW,
  )
  for (const [index, fixture] of FIXTURES.entries()) {
    const noteId = `n-${index}`
    await runSql(
      db,
      `INSERT INTO notes (id, user_id, folder_id, title, title_key, content, excerpt, rev, word_count, char_count,
         is_pinned, is_starred, is_archived, position, content_hash, created_at, updated_at, deleted_at)
       VALUES (?1, ?2, NULL, ?3, '', 'body', 'excerpt', 1, 1, 1, ?4, ?5, 0, 0, ?6, ?7, ?7, NULL)`,
      noteId, USER, fixture.slug, fixture.isPinned ? 1 : 0, fixture.isStarred ? 1 : 0, `hash-${index}`, NOW,
    )
    await runSql(
      db,
      `INSERT INTO shares (slug, note_id, user_id, folder_id, tags, password_hash, expires_at, views, is_enabled, created_at, last_viewed_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, NULL)`,
      fixture.slug, noteId, USER, fixture.folderId ?? null, fixture.tags ?? '[]',
      fixture.password ?? null, fixture.expiresAt ?? null,
      // `?? 1` would have turned the legacy row's deliberate NULL into an enabled row, and every
      // assertion about the NULL arm would then have been passing on a fixture that never had one.
      'isEnabled' in fixture ? fixture.isEnabled : 1, NOW,
    )
  }
  for (const tag of TAGS) {
    await runSql(
      db,
      `INSERT INTO share_tags (id, user_id, name, color, is_pinned, created_at) VALUES (?1, ?2, ?3, NULL, 0, ?4)`,
      tag.id, USER, tag.name, NOW,
    )
  }
  return db
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
  return app
}

function request(app: Hono<AppBindings>, path: string): Promise<Response> {
  return app.request(path, {}, DB_ENV.env as AppBindings['Bindings'], EXECUTION_CTX)
}

/** Every share the account holds, as the payload the client is handed — the subjects the JS
 * predicate reads, rather than a second shape this test invented for it. */
async function allShares(app: Hono<AppBindings>): Promise<ShareSelectionSubject[]> {
  const body = await (await request(app, '/api/share')).json() as { shares: ShareSelectionSubject[] }
  return body.shares
}

async function listSlugs(app: Hono<AppBindings>, query = ''): Promise<string[]> {
  const response = await request(app, `/api/share${query}`)
  const body = await response.json() as { shares: Array<{ slug: string }> }
  return body.shares.map((share) => share.slug).sort()
}

/**
 * The selection as SQL, over the same `FROM`/`WHERE` the list query builds (account, then the row is
 * live, then the fragment), with `now` given explicitly rather than read from the clock.
 */
async function sqlSelected(db: D1Shim, selection: ShareSelection, now: number): Promise<string[]> {
  const fragment = shareSelectionSql(selection, { now, firstBind: 2 })
  const tail = fragment.conditions.length ? ` AND ${fragment.conditions.join(' AND ')}` : ''
  const rows = await queryRows(
    db,
    `SELECT s.slug FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.user_id = ?1 AND n.deleted_at IS NULL${tail}`,
    USER, ...fragment.binds,
  )
  return rows.map((row) => row.slug as string).sort()
}

function jsSelected(all: ShareSelectionSubject[], selection: ShareSelection, now: number): string[] {
  return all
    .filter((share) => shareMatchesSelection(share, selection, now))
    .map((share) => (share as unknown as { slug: string }).slug)
    .sort()
}

describe('status selections: SQL and the shared predicate select the same shares', () => {
  it('agrees on every status, against the statement and against the route', async () => {
    const db = await makeDb()
    const app = makeApp()
    const all = await allShares(app)
    expect(all).toHaveLength(FIXTURES.length)

    for (const status of SHARE_STATUS_FILTERS) {
      const expected = jsSelected(all, { status }, NOW)
      expect([status, await sqlSelected(db, { status }, NOW)]).toEqual([status, expected])
      // The route reads its own clock, a few milliseconds after NOW, which every fixture boundary is
      // hours clear of.
      expect([status, await listSlugs(app, `?status=${status}`)]).toEqual([status, expected])
    }
  })

  it('labels a paused share the way it selects it', async () => {
    // The stored form and the payload's form are the same value here — the column is `NOT NULL DEFAULT
    // 1` and the payload reads `!== 0` — so the two must not be able to disagree about which shares
    // are paused. A fixture cannot carry a NULL for this column, which is the point: there is one
    // "enabled" and one "paused", and the old `IS NULL` arm was guarding a state the schema forbids.
    const app = makeApp()
    const paused = await listSlugs(app, '?status=paused')
    expect(paused).toEqual(['s-folder-a-paused', 's-paused'])
    const labelled = await allShares(app)
    expect(labelled.filter((share) => !share.isEnabled).map((share) => (share as unknown as { slug: string }).slug).sort())
      .toEqual(['s-folder-a-paused', 's-paused'])
  })
})

describe('target selections: SQL and the shared predicate select the same shares', () => {
  it('agrees on every folder and tag target, against the statement and against the route', async () => {
    const db = await makeDb()
    const app = makeApp()
    const all = await allShares(app)

    for (const target of TARGETS) {
      const expected = jsSelected(all, { target }, NOW)
      expect([target, await sqlSelected(db, { target }, NOW)]).toEqual([target, expected])
      const query = target.type === 'folder' ? `?folderId=${target.value}` : `?tag=${encodeURIComponent(target.value)}`
      expect([target, await listSlugs(app, query)]).toEqual([target, expected])
    }
  })

  it('agrees on every status combined with every target', async () => {
    const db = await makeDb()
    const app = makeApp()
    const all = await allShares(app)
    for (const status of SHARE_STATUS_FILTERS) {
      for (const target of FOLDER_TARGETS) {
        const selection: ShareSelection = { status, target }
        expect([selection, await sqlSelected(db, selection, NOW)]).toEqual([selection, jsSelected(all, selection, NOW)])
      }
    }
  })
})

describe('the visit log filter: SQL and the shared predicate drop the same rows', () => {
  it('agrees on all five choices, including that `real` is the three exclusions', async () => {
    const db = await makeDb()
    // One row per combination of the three classifications, so every arm of every filter is exercised.
    for (let index = 0; index < 8; index++) {
      await runSql(
        db,
        `INSERT INTO share_visits (user_id, note_id, slug, visited_at, visitor_fp, country, referrer_host,
           device_type, os, browser, user_agent, is_bot, is_self_referrer, is_owner, channel)
         VALUES (?1, 'n-0', ?2, ?3, ?2, 'US', NULL, 'desktop', 'os', 'browser', NULL, ?4, ?5, ?6, NULL)`,
        USER, `v-${index}`, NOW - index * 1000, index & 1, (index >> 1) & 1, (index >> 2) & 1,
      )
    }
    const subjects = Array.from({ length: 8 }, (_, index) => ({
      slug: `v-${index}`,
      isBot: Boolean(index & 1),
      isSelfReferrer: Boolean((index >> 1) & 1),
      isOwner: Boolean((index >> 2) & 1),
    }))
    for (const filter of VISIT_LOG_FILTERS) {
      const condition = visitLogFilterSql(filter, 'sv')
      const rows = await queryRows(
        db,
        `SELECT sv.slug FROM share_visits sv WHERE sv.user_id = ?1${condition ? ` AND ${condition}` : ''}`,
        USER,
      )
      const expected = subjects.filter((subject) => visitMatchesLogFilter(subject, filter)).map((subject) => subject.slug)
      expect([filter, rows.map((row) => row.slug).sort()]).toEqual([filter, expected.sort()])
    }
  })
})

describe('the tag counts beside the sidebar', () => {
  it('counts a tag by the same element test the list filters by', async () => {
    // The counts join `share_tags` against the stored arrays, so they are the one caller that passes
    // a column instead of a bind. A `LIKE` test here matched `%` and `_` as wildcards: `100% done`
    // counted `100 plus done`, and `a_b` counted `axb`.
    const db = await makeDb()
    const app = makeApp()
    const all = await allShares(app)
    const rows = (await tagCountsStatement(db as unknown as D1Database, USER, NOW).all()).results
    const counted = toTagCounts(rows as Array<{ name: string; total: number; shared: number }>)

    const expected: Record<string, { total: number; shared: number }> = {}
    for (const tag of TAGS) {
      const target: ShareTarget = { type: 'tag', value: tag.name }
      const carrying = all.filter((share) => shareMatchesTarget(share, target))
      expected[tag.name] = {
        total: carrying.length,
        shared: carrying.filter((share) => shareMatchesStatus(share, 'active', NOW)).length,
      }
    }
    expect(counted).toEqual(expected)
  })
})

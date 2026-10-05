import { describe, expect, it } from 'vitest'
import { SCHEMA_MIGRATIONS } from '../src/worker/db/schema/migrations'
import {
  DATABASE_STATE_KEY,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
} from '../src/worker/db/schema/checks'
import { initializeDatabase } from '../src/worker/db/schema/runtime'
import { drainFtsQueue } from '../src/worker/db/fts'
import type { Env } from '../src/worker/env'
import type { D1Database } from '@cloudflare/workers-types'
import { captureSql, createD1Database, queryFirst, queryRows, runSql } from './d1-harness'

function makeEnv(db: unknown): Env {
  return {
    DB: db as D1Database,
  } as unknown as Env
}

/** Rewrites the cached database-state row the way a stale or hand-edited one would look. */
async function tamperState(
  db: ReturnType<typeof createD1Database>,
  edit: (value: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  const row = await queryFirst(db, `SELECT value FROM app_meta WHERE key = ?`, DATABASE_STATE_KEY)
  const stored = JSON.parse((row as { value: string }).value) as Record<string, unknown>
  await runSql(db, `UPDATE app_meta SET value = ? WHERE key = ?`, JSON.stringify(edit(stored)), DATABASE_STATE_KEY)
}

describe('schema migrations and convergence', () => {
  it('has strictly sequential and continuous migration version numbers (1..N)', () => {
    expect(SCHEMA_MIGRATIONS.length).toBeGreaterThan(0)
    for (let index = 0; index < SCHEMA_MIGRATIONS.length; index++) {
      const expectedVersion = index + 1
      const migration = SCHEMA_MIGRATIONS[index]!
      expect(
        migration.version,
        `Migration at index ${index} must have version ${expectedVersion}`,
      ).toBe(expectedVersion)
    }
  })

  it('rebuilds a legacy music schema and carries the library across', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))
    // Simulate a database whose music tables came from an earlier build: different
    // column names, tag links by name, seconds instead of milliseconds.
    for (const table of ['music_tracks', 'music_playlists', 'music_playlist_items', 'music_track_tags']) {
      await runSql(db, `DROP TABLE ${table}`)
    }
    await runSql(db, `CREATE TABLE music_tracks (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '',
      album TEXT NOT NULL DEFAULT '', duration REAL NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
      mime TEXT NOT NULL DEFAULT 'audio/mpeg', source TEXT NOT NULL DEFAULT 'r2', source_path TEXT NOT NULL DEFAULT '',
      webdav_target_id TEXT, lyric TEXT, is_pinned INTEGER NOT NULL DEFAULT 0, is_favorited INTEGER NOT NULL DEFAULT 0,
      is_liked INTEGER NOT NULL DEFAULT 0, play_count INTEGER NOT NULL DEFAULT 0, last_played_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`)
    await runSql(db, `CREATE TABLE music_playlists (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`)
    await runSql(db, `CREATE TABLE music_playlist_items (
      playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, user_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL
    )`)
    await runSql(db, 'CREATE TABLE music_track_tags (track_id TEXT NOT NULL, tag_name TEXT NOT NULL, user_id TEXT NOT NULL)')
    await runSql(db, `INSERT INTO music_tags (id, user_id, name, color, is_pinned, created_at, parent_id, sort_order)
      VALUES ('tag-1', 'u', '曲风/古风', NULL, 0, 1, NULL, 0)`)
    await runSql(db, `INSERT INTO music_tracks (id, user_id, title, artist, album, duration, size, mime, source, source_path, created_at, updated_at)
      VALUES ('t-1', 'u', '缘起', '周深', '', 262.588231, 10716326, 'audio/mpeg', 'webdav', 'target-1:缘起 - 周深.mp3', 10, 10)`)
    await runSql(db, `INSERT INTO music_tracks (id, user_id, title, artist, album, duration, size, mime, source, source_path, is_liked, created_at, updated_at)
      VALUES ('t-2', 'u', '月光', '胡彦斌', '', 0, 1000, 'audio/mpeg', 'r2', 'music/u/t-2.mp3', 1, 10, 10)`)
    await runSql(db, `INSERT INTO music_playlists (id, user_id, name, description, is_pinned, position, created_at, updated_at)
      VALUES ('p-1', 'u', '夜听', '', 0, 0, 10, 10)`)
    await runSql(db, `INSERT INTO music_playlist_items (playlist_id, track_id, user_id, position, added_at)
      VALUES ('p-1', 't-1', 'u', 0, 10)`)
    await runSql(db, `INSERT INTO music_track_tags (track_id, tag_name, user_id) VALUES ('t-1', '曲风/古风', 'u')`)
    await runSql(db, 'DELETE FROM schema_migrations WHERE version >= 29')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    // A new handle and a cleared fingerprint force the migration pass to run again.
    await initializeDatabase(makeEnv({ ...db }))

    const tagColumns = (await queryRows(db, 'PRAGMA table_info(music_tags)')).map((row) => row.name as string)
    expect(tagColumns).toContain('parent_id')
    expect(tagColumns).toContain('sort_order')

    const tracks = await queryRows(db, 'SELECT id, duration_ms, object_key, source, is_favorite FROM music_tracks ORDER BY id')
    expect(tracks).toEqual([
      { id: 't-1', duration_ms: 262588, object_key: '缘起 - 周深.mp3', source: 'webdav', is_favorite: 0 },
      { id: 't-2', duration_ms: 0, object_key: 'music/u/t-2.mp3', source: 'r2', is_favorite: 1 },
    ])
    expect(await queryRows(db, 'SELECT track_id, tag_id FROM music_track_tags')).toEqual([{ track_id: 't-1', tag_id: 'tag-1' }])
    expect(await queryRows(db, 'SELECT playlist_id, track_id, sort_order FROM music_playlist_items')).toEqual([
      { playlist_id: 'p-1', track_id: 't-1', sort_order: 0 },
    ])
    const indexes = (await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'music_tags'"))
      .map((row) => row.name as string)
    expect(indexes).toContain('idx_music_tags_parent_name')
    expect(indexes).not.toContain('idx_music_tags_user')
  })

  it('converges from scratch on a clean database and satisfies all required schema checks', async () => {
    const db = createD1Database()
    const env = makeEnv(db)

    const state = await initializeDatabase(env)
    expect(state).toBeDefined()

    const rows = await queryRows(db, 'SELECT version FROM schema_migrations ORDER BY version ASC')
    const appliedVersions = rows.map((r) => r.version as number)
    expect(appliedVersions).toEqual(SCHEMA_MIGRATIONS.map((m) => m.version))

    const tableRows = await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'table'")
    const existingTables = new Set(tableRows.map((r) => r.name as string))
    for (const table of REQUIRED_TABLES) {
      expect(existingTables.has(table), `Required table "${table}" must exist`).toBe(true)
    }

    for (const [table, requiredCols] of Object.entries(REQUIRED_COLUMNS)) {
      const colRows = await queryRows(db, `PRAGMA table_info(${table})`)
      const existingCols = new Set(colRows.map((r) => r.name as string))
      for (const col of requiredCols) {
        expect(
          existingCols.has(col),
          `Table "${table}" must have column "${col}" after migrations`,
        ).toBe(true)
      }
    }

    const indexRows = await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'index'")
    const existingIndexes = new Set(indexRows.map((r) => r.name as string))
    for (const idx of REQUIRED_INDEXES) {
      expect(existingIndexes.has(idx), `Required index "${idx}" must exist`).toBe(true)
    }

    const metaRow = await queryFirst(
      db,
      'SELECT value FROM app_meta WHERE key = ?',
      DATABASE_STATE_KEY,
    )
    expect(metaRow).not.toBeNull()
    const meta = JSON.parse(metaRow!.value as string)
    expect(meta.schema).toBeDefined()
  })

  it('converges on an existing installation database and applies unapplied migrations', async () => {
    const db = createD1Database()
    const env = makeEnv(db)

    await initializeDatabase(env)

    const cachedState = await initializeDatabase(env)
    expect(cachedState).toBeDefined()

    await runSql(db, 'DELETE FROM app_meta WHERE key = ?', DATABASE_STATE_KEY)
    const reconvergedState = await initializeDatabase(env)
    expect(reconvergedState).toBeDefined()
  })

  it('rebuilds a full text index whose note ids were unindexed and requeues every live note', async () => {
    const db = createD1Database()
    const env = makeEnv(db)

    await initializeDatabase(env)

    // The shipped index marked note_id UNINDEXED, so the deletes that reach a row through
    // MATCH('note_id : …') matched nothing and left the previous body behind.
    await runSql(db, 'DROP TABLE notes_fts')
    await runSql(
      db,
      `CREATE VIRTUAL TABLE notes_fts USING fts5(
         note_id UNINDEXED, user_id UNINDEXED, title, body,
         tokenize = "unicode61 remove_diacritics 2")`,
    )
    await runSql(
      db,
      `INSERT INTO notes (id, user_id, title, content, rev, content_hash, created_at, updated_at)
        VALUES ('n-live', 'u', 'Live', 'keepneedle', 1, 'h', 10, 10)`,
    )
    await runSql(
      db,
      `INSERT INTO notes (id, user_id, title, content, rev, content_hash, created_at, updated_at, deleted_at)
        VALUES ('n-gone', 'u', 'Gone', 'gone body', 1, 'h', 10, 10, 20)`,
    )
    await runSql(db, `INSERT INTO notes_fts (note_id, user_id, title, body) VALUES ('n-live', 'u', 'Live', 'stale body')`)
    await runSql(db, `INSERT INTO fts_index_queue (user_id, note_id, kind, created_at) VALUES ('u', 'n-live', 'delete', 5)`)
    await runSql(db, 'DELETE FROM schema_migrations WHERE version = 40')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    await initializeDatabase(makeEnv({ ...db }))

    expect(await queryRows(db, 'SELECT note_id FROM notes_fts')).toEqual([])
    expect(await queryRows(db, 'SELECT note_id, kind FROM fts_index_queue ORDER BY note_id')).toEqual([
      { note_id: 'n-live', kind: 'upsert' },
    ])

    await drainFtsQueue(db, 'u', 10, true)
    expect(
      await queryRows(db, `SELECT note_id FROM notes_fts WHERE notes_fts MATCH '"keepneedle"'`),
    ).toEqual([{ note_id: 'n-live' }])
    expect(
      await queryRows(db, `SELECT note_id FROM notes_fts WHERE notes_fts MATCH '"stale"'`),
    ).toEqual([])
  })

  it('rebuilds blog_posts so a slug is unique per account and carries the posts across', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))

    // The shipped shape declared slug UNIQUE instance-wide, which SQLite cannot drop in place.
    await runSql(db, 'DROP TABLE blog_posts')
    await runSql(db, `CREATE TABLE blog_posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      note_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      cover_url TEXT NOT NULL DEFAULT '',
      category_id TEXT,
      folder_id TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 1,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`)
    await runSql(db, `CREATE INDEX idx_blog_posts_slug ON blog_posts(slug)`)
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, tags, views, published_at, created_at, updated_at)
        VALUES ('p-alice', 'hello-world', 'n-alice', 'alice', 'Alice post', 'alice body', '["a"]', 7, 10, 10, 10)`,
    )
    await runSql(db, 'DELETE FROM schema_migrations WHERE version >= 52')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    await initializeDatabase(makeEnv({ ...db }))

    expect(await queryRows(db, 'SELECT id, slug, user_id, title, content, views FROM blog_posts')).toEqual([
      { id: 'p-alice', slug: 'hello-world', user_id: 'alice', title: 'Alice post', content: 'alice body', views: 7 },
    ])

    // The other account may now use the same slug; the first account still may not repeat its own.
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
        VALUES ('p-bob', 'hello-world', 'n-bob', 'bob', 'Bob post', 'bob body', 20, 20, 20)`,
    )
    await expect(
      runSql(
        db,
        `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
          VALUES ('p-alice-2', 'hello-world', 'n-alice-2', 'alice', 'Second', 'body', 30, 30, 30)`,
      ),
    ).rejects.toThrow(/UNIQUE/)

    const indexes = (await queryRows(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'blog_posts'"))
      .map((row) => row.name as string)
    expect(indexes).toContain('idx_blog_posts_user_slug')
    expect(indexes).not.toContain('idx_blog_posts_slug')
  })

  it('adds the per-post SEO columns to an installation that predates them', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))

    // The shape every installation that has already run the slug rebuild has: the declared columns
    // minus the SEO fields, which arrived afterwards.
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN seo_noindex')
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN seo_canonical_url')
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN seo_image_url')
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN seo_description')
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN seo_title')
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
        VALUES ('p-legacy', 'legacy-post', 'n-legacy', 'u', 'Legacy post', 'body', 10, 10, 10)`,
    )
    await runSql(db, 'DELETE FROM schema_migrations WHERE version >= 54')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    await initializeDatabase(makeEnv({ ...db }))

    const columns = (await queryRows(db, 'PRAGMA table_info(blog_posts)')).map((row) => row.name as string)
    for (const column of ['seo_title', 'seo_description', 'seo_image_url', 'seo_canonical_url', 'seo_noindex']) {
      expect(columns, `blog_posts must gain ${column}`).toContain(column)
    }
    // The post that was already there keeps its text, and an untouched post previews as itself.
    expect(await queryRows(db, 'SELECT id, title, seo_title, seo_noindex FROM blog_posts')).toEqual([
      { id: 'p-legacy', title: 'Legacy post', seo_title: '', seo_noindex: 0 },
    ])
  })

  it('adds the recycle-bin column to an installation that predates it', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))

    // The shape an installation had before FEA-04: every declared column but `deleted_at`. The
    // column carries the bin's index, so the index has to go before the column it names.
    await runSql(db, 'DROP INDEX IF EXISTS idx_blog_posts_user_deleted')
    await runSql(db, 'ALTER TABLE blog_posts DROP COLUMN deleted_at')
    await runSql(
      db,
      `INSERT INTO blog_posts (id, slug, note_id, user_id, title, content, published_at, created_at, updated_at)
        VALUES ('p-live', 'live-post', 'n-live', 'u', 'Live post', 'body', 10, 10, 10)`,
    )
    await runSql(db, 'DELETE FROM schema_migrations WHERE version >= 56')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    await initializeDatabase(makeEnv({ ...db }))

    const columns = (await queryRows(db, 'PRAGMA table_info(blog_posts)')).map((row) => row.name as string)
    expect(columns).toContain('deleted_at')
    // A post that already existed is live, not in the bin, and keeps its text.
    expect(await queryRows(db, 'SELECT id, title, deleted_at FROM blog_posts')).toEqual([
      { id: 'p-live', title: 'Live post', deleted_at: null },
    ])
    expect(await queryFirst(
      db,
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_blog_posts_user_deleted'",
    )).toBeTruthy()
  })

  it('adds the reply and spam columns to an installation that predates them', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))

    // The shape an installation had before FEA-06: no owner flag on a reply, no stored spam score.
    await runSql(db, 'ALTER TABLE blog_comments DROP COLUMN is_owner')
    await runSql(db, 'ALTER TABLE blog_comments DROP COLUMN spam_score')
    await runSql(
      db,
      `INSERT INTO blog_comments (id, post_id, parent_id, author_name, author_email, author_url,
         author_avatar, content, status, ip, user_agent, created_at)
       VALUES ('c-old', 'p-live', NULL, 'Reader', 'r@example.com', NULL, '', 'Hello', 'approved', NULL, NULL, 10)`,
    )
    await runSql(db, 'DELETE FROM schema_migrations WHERE version >= 57')
    await runSql(db, 'DELETE FROM app_meta WHERE key = ?1', DATABASE_STATE_KEY)

    await initializeDatabase(makeEnv({ ...db }))

    const columns = (await queryRows(db, 'PRAGMA table_info(blog_comments)')).map((row) => row.name as string)
    expect(columns).toContain('is_owner')
    expect(columns).toContain('spam_score')
    // A comment that already existed is a reader's, not the author's, and was never scored.
    expect(await queryRows(db, 'SELECT id, is_owner, spam_score FROM blog_comments')).toEqual([
      { id: 'c-old', is_owner: 0, spam_score: 0 },
    ])
  })

  it('rejects an incompatible schema if a required column is missing', async () => {
    const db = createD1Database()
    const env = makeEnv(db)

    await initializeDatabase(env)

    await runSql(db, 'DELETE FROM app_meta WHERE key = ?', DATABASE_STATE_KEY)
    await runSql(db, 'DROP TABLE blog_links')
    await runSql(
      db,
      `CREATE TABLE blog_links (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL
      )`,
    )

    const freshEnv = makeEnv({ prepare: db.prepare.bind(db), batch: db.batch.bind(db) })

    await expect(initializeDatabase(freshEnv)).rejects.toThrow(
      /(no such column|The database schema is incompatible)/,
    )
  })

  /**
   * The convergence pass is skipped whenever the cached schema fingerprint matches — but that cache
   * used to be written only by a database that got FTS5 running, so an account on a D1 without it
   * re-ran every table, migration, index and `PRAGMA` check on each cold isolate, inside the user's
   * first request. These cases hold the fix from both sides: the pass must not repeat, a cached
   * state must still be one this build wrote, and a missing FTS5 must not be latched off forever.
   */
  function withoutFts5(db: ReturnType<typeof createD1Database>) {
    const ftsStatements = new WeakSet<object>()
    let blocked = true
    const realPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      const statement = realPrepare(sql)
      if (/CREATE VIRTUAL TABLE/i.test(sql)) ftsStatements.add(statement)
      return statement
    }
    const realBatch = db.batch.bind(db)
    db.batch = async (statements) => {
      if (blocked && statements.some((statement) => ftsStatements.has(statement as object)))
        throw new Error('D1_ERROR: no such module: fts5')
      return realBatch(statements)
    }
    return { unblock: () => { blocked = false } }
  }

  /** A distinct binding object is a distinct isolate: `initializeDatabase` memoizes per `env.DB`. */
  function isolate(db: ReturnType<typeof createD1Database>) {
    return makeEnv({ prepare: db.prepare.bind(db), batch: db.batch.bind(db) })
  }

  /** The SQL one `initializeDatabase` call prepared, and nothing before it. */
  async function pass<T>(prepared: string[], run: () => Promise<T>): Promise<{ result: T, sql: string[] }> {
    const before = prepared.length
    const result = await run()
    return { result, sql: prepared.slice(before) }
  }

  const converged = (sql: string[]) => sql.filter((statement) => /FROM schema_migrations|PRAGMA table_info/i.test(statement))

  it('does not re-converge the schema on a cold isolate when the database has no FTS5', async () => {
    const db = createD1Database()
    withoutFts5(db)
    const prepared = captureSql(db)

    const cold = await pass(prepared, () => initializeDatabase(isolate(db)))
    expect(cold.result.ftsEnabled).toBe(false)
    expect(converged(cold.sql).length).toBeGreaterThan(0)

    const warm = await pass(prepared, () => initializeDatabase(isolate(db)))
    expect(warm.result.ftsEnabled).toBe(false)
    expect(converged(warm.sql)).toEqual([])
    expect(warm.sql.some((sql) => /CREATE VIRTUAL TABLE/i.test(sql))).toBe(true)
  })

  it('ignores a cached state written by a different schema', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))
    await tamperState(db, (value) => ({ ...value, schema: 'deadbeef' }))
    const prepared = captureSql(db)

    const warm = await pass(prepared, () => initializeDatabase(isolate(db)))
    expect(warm.result.ftsEnabled).toBe(true)
    expect(converged(warm.sql).length).toBeGreaterThan(0)
  })

  it('ignores a cached state whose ftsEnabled is not a boolean', async () => {
    const db = createD1Database()
    await initializeDatabase(makeEnv(db))
    // A hand-written or half-migrated row must not be read as "FTS is off": that would quietly drop
    // every account onto LIKE search with nothing failing anywhere.
    await tamperState(db, (value) => ({ ...value, ftsEnabled: 'false' }))
    const prepared = captureSql(db)

    const warm = await pass(prepared, () => initializeDatabase(isolate(db)))
    expect(warm.result.ftsEnabled).toBe(true)
    expect(converged(warm.sql).length).toBeGreaterThan(0)
  })

  it('turns FTS5 back on for a later isolate once the database supports it', async () => {
    const db = createD1Database()
    const gate = withoutFts5(db)
    expect((await initializeDatabase(isolate(db))).ftsEnabled).toBe(false)

    gate.unblock()
    expect((await initializeDatabase(isolate(db))).ftsEnabled).toBe(true)
  })
})
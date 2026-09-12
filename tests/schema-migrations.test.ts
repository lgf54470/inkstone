import { describe, expect, it } from 'vitest'
import { SCHEMA_MIGRATIONS } from '../src/worker/db/schema/migrations'
import {
  DATABASE_STATE_KEY,
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_TABLES,
} from '../src/worker/db/schema/checks'
import { initializeDatabase } from '../src/worker/db/schema/runtime'
import type { Env } from '../src/worker/env'
import type { D1Database } from '@cloudflare/workers-types'
import { createD1Database, queryFirst, queryRows, runSql } from './d1-harness'

function makeEnv(db: unknown): Env {
  return {
    DB: db as D1Database,
  } as unknown as Env
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
})
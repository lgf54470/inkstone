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

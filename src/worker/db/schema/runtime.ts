import type { DatabaseState, Env } from '../../env';
import { getMeta, setMeta } from '../metadata';
import { DATABASE_STATE_KEY, INDEX_SCHEMA_STATEMENTS, REQUIRED_COLUMNS, REQUIRED_INDEXES, REQUIRED_TABLES, TABLE_SCHEMA_STATEMENTS } from './checks';
import { SCHEMA_MIGRATIONS } from './migrations';
import { FTS_STATEMENT, SCHEMA_STATEMENTS } from './statements';

const initializationCache = new WeakMap<D1Database, Promise<DatabaseState>>()

export function initializeDatabase(env: Env): Promise<DatabaseState> {
  const existing = initializationCache.get(env.DB)
  if (existing) return existing

  const pending = createSchema(env.DB).catch((error) => {
    initializationCache.delete(env.DB)
    throw error
  })
  initializationCache.set(env.DB, pending)
  return pending
}

async function createSchema(db: D1Database): Promise<DatabaseState> {
  const stored = await readStoredDatabaseState(db)
  if (stored) return stored

  const initialized = await db
    .prepare(`SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .first<{ present: number }>()
  if (!initialized) {
    await db.batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)))
  } else {
    // Existing installations must converge additively. CREATE IF NOT EXISTS
    // never rewrites user data; running table creation before indexes also
    // lets a partially initialized database recover missing feature tables.
    await db.batch(TABLE_SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)))
  }
  await applyMigrations(db)
  if (initialized) {
    await db.batch(INDEX_SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)))
  }
  await assertFinalSchema(db)

  let state: DatabaseState
  try {
    await db.prepare(FTS_STATEMENT).run()
    state = { ftsEnabled: true }
  } catch (error) {
    console.warn(
      '[inkstone] The current database does not support FTS5; search will use LIKE:',
      error instanceof Error ? error.message : error,
    )
    state = { ftsEnabled: false }
  }
  if (state.ftsEnabled) {
    await setMeta(db, DATABASE_STATE_KEY, JSON.stringify({
      schema: schemaFingerprint(),
      ftsEnabled: true,
    }))
  }
  return state
}

async function applyMigrations(db: D1Database): Promise<void> {
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`,
  ).run()
  const { results } = await db.prepare(`SELECT version FROM schema_migrations`).all<{ version: number }>()
  const applied = new Set(results.map((row) => row.version))

  for (const migration of SCHEMA_MIGRATIONS) {
    if (applied.has(migration.version)) continue
    let migrationStatements = migration.statements
    if (migration.skipIfColumnExists) {
      const { table, column } = migration.skipIfColumnExists
      const { results: columns } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
      if (columns.some((entry) => entry.name === column)) migrationStatements = []
    }
    const statements = migrationStatements.map((statement) => db.prepare(statement))
    statements.push(
      db.prepare(`INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)`)
        .bind(migration.version, Date.now()),
    )
    await db.batch(statements)
  }
}

async function readStoredDatabaseState(db: D1Database): Promise<DatabaseState | null> {
  try {
    const raw = await getMeta(db, DATABASE_STATE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as { schema?: unknown; ftsEnabled?: unknown }
    if (value.schema !== schemaFingerprint() || value.ftsEnabled !== true) return null
    return { ftsEnabled: true }
  } catch {
    return null
  }
}

function schemaFingerprint(): string {
  const migrationSource = SCHEMA_MIGRATIONS.map((migration) => JSON.stringify({
    version: migration.version,
    statements: migration.statements,
    skipIfColumnExists: migration.skipIfColumnExists ?? null,
  }))
  const source = [...SCHEMA_STATEMENTS, FTS_STATEMENT, ...migrationSource].join('\n')
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function assertFinalSchema(db: D1Database): Promise<void> {
  const { results: tableRows } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all<{ name: string }>()
  const tables = new Set(tableRows.map((row) => row.name))
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table))
  if (missingTables.length) {
    throw new Error(
      `The database migration did not produce the required tables: ${missingTables.join(', ')}`,
    )
  }

  const { results: indexRows } = await db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`)
    .all<{ name: string }>()
  const indexes = new Set(indexRows.map((row) => row.name))
  const missingIndexes = REQUIRED_INDEXES.filter((index) => !indexes.has(index))
  if (missingIndexes.length) {
    throw new Error(
      `The database migration did not produce the required indexes: ${missingIndexes.join(', ')}`,
    )
  }

  for (const [table, required] of Object.entries(REQUIRED_COLUMNS)) {
    const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
    const columns = new Set(results.map((row) => row.name))
    const missing = required.filter((column) => !columns.has(column))
    if (missing.length) {
      throw new Error(
        `The database schema is incompatible (${table} is missing ${missing.join(', ')})`,
      )
    }
  }
}

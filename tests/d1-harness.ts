import { DatabaseSync } from 'node:sqlite'

export const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    fails INTEGER NOT NULL DEFAULT 0,
    last_fail_at INTEGER NOT NULL,
    locked_until INTEGER
  );
  CREATE TABLE IF NOT EXISTS totp_credentials (
    user_id TEXT PRIMARY KEY,
    secret_ciphertext TEXT NOT NULL,
    enabled_at INTEGER,
    pending_token_hash TEXT,
    pending_session_id TEXT,
    pending_expires_at INTEGER,
    recovery_generation TEXT NOT NULL DEFAULT '',
    last_used_step INTEGER,
    last_used_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS totp_recovery_codes (
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    generation TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by TEXT,
    PRIMARY KEY (user_id, code_hash)
  );
  CREATE TABLE IF NOT EXISTS totp_login_challenges (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    claimed_by TEXT,
    created_at INTEGER NOT NULL
  );
`

export interface D1Prepared {
  bind(...values: unknown[]): D1Prepared
  run(): Promise<{ meta: { changes: number }; results?: Array<Record<string, unknown>> }>
  all(): Promise<{ results: Array<Record<string, unknown>> }>
  first(): Promise<Record<string, unknown> | null>
}

export interface D1Shim {
  prepare(sql: string): D1Prepared
  batch(statements: D1Prepared[]): Promise<Array<{ meta: { changes: number }; results?: Array<Record<string, unknown>> }>>
}

export function createD1Database(extraSchema = ''): D1Shim {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(BASE_SCHEMA + '\n' + extraSchema)
  const prepare = (sql: string) => {
    const makeStatement = (values: unknown[]): D1Prepared => {
      const getStatement = () => sqlite.prepare(sql)
      const returnsRows = /\bRETURNING\b/i.test(sql) || /^\s*(?:SELECT|WITH)\b/i.test(sql)
      return {
        bind: (...bound: unknown[]) => makeStatement(bound),
        run: async () => {
          const statement = getStatement()
          if (returnsRows) {
            return { meta: { changes: 0 }, results: statement.all(...values) as Array<Record<string, unknown>> }
          }
          const info = statement.run(...values)
          return { meta: { changes: Number(info.changes) } }
        },
        all: () => {
          const statement = getStatement()
          return { results: statement.all(...values) as Array<Record<string, unknown>> }
        },
        first: () => {
          const statement = getStatement()
          return (statement.get(...values) as Record<string, unknown> | undefined) ?? null
        },
      }
    }
    return makeStatement([])
  }
  return {
    prepare,
    batch: async (statements) => {
      const out: Array<{ meta: { changes: number }; results?: Array<Record<string, unknown>> }> = []
      if (!statements.length) return out
      // Real D1 batch commits atomically; a savepoint reproduces that here and
      // still works when a test drives nested batches.
      sqlite.exec('SAVEPOINT d1_batch')
      try {
        for (const statement of statements) out.push(await statement.run())
      } catch (error) {
        sqlite.exec('ROLLBACK TO d1_batch')
        sqlite.exec('RELEASE d1_batch')
        throw error
      }
      sqlite.exec('RELEASE d1_batch')
      return out
    },
  }
}

export async function runSql(db: D1Shim, sql: string, ...values: unknown[]): Promise<void> {
  await db.prepare(sql).bind(...values).run()
}

export async function queryRows(
  db: D1Shim,
  sql: string,
  ...values: unknown[]
): Promise<Array<Record<string, unknown>>> {
  return (await db.prepare(sql).bind(...values).all()).results
}

export async function queryFirst(
  db: D1Shim,
  sql: string,
  ...values: unknown[]
): Promise<Record<string, unknown> | null> {
  return db.prepare(sql).bind(...values).first()
}

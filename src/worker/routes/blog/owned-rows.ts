import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'

/**
 * The per-account tables whose rows a client may address by primary key. The name is a literal from
 * this union and never a value a request carries, because it is interpolated into the statement.
 */
export type OwnedRowTable = 'blog_links' | 'blog_link_categories'

/** D1 refuses a statement that binds more than 100 variables. */
const ROW_ID_QUERY_CHUNK = 50

/**
 * Refuses a client-chosen id that another account already holds.
 *
 * `INSERT … ON CONFLICT(id) DO UPDATE` keys on the primary key rather than on the owner, so a save
 * whose id belongs to someone else rewrites their row and then reads it back — an upsert and a
 * response body across tenants. An id nobody holds is an insert, which is what a new row sends.
 */
export async function assertRowIdWritable(
  db: D1Database,
  table: OwnedRowTable,
  id: string,
  userId: string,
): Promise<void> {
  const owners = await rowOwnersOf(db, table, [id])
  const owner = owners.get(id)
  if (owner && owner !== userId) throw ApiError.notFound('Not found')
}

/**
 * The owner of every id that exists, keyed by id. A missing id is absent rather than null: import
 * reads that absence to tell "nobody holds this yet" (keep the file's id) from "another account
 * holds it" (write a fresh one), and the two mean different rows.
 */
export async function rowOwnersOf(
  db: D1Database,
  table: OwnedRowTable,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>()
  const unique = [...new Set(ids)]
  for (let index = 0; index < unique.length; index += ROW_ID_QUERY_CHUNK) {
    const chunk = unique.slice(index, index + ROW_ID_QUERY_CHUNK)
    const placeholders = chunk.map((_, position) => `?${position + 1}`).join(', ')
    const rows = await db
      .prepare(`SELECT id, user_id FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ id: string; user_id: string }>()
    for (const row of rows.results || []) owners.set(row.id, row.user_id)
  }
  return owners
}

/**
 * The id a row from a file is written under: the file's own when this account holds it or nobody
 * does, a fresh one when another account does. Refusing the whole file instead would make a
 * legitimate hand-over (or a restore into a second account) impossible.
 */
export function importRowId(owners: Map<string, string>, id: string, userId: string): string {
  const owner = owners.get(id)
  return owner && owner !== userId ? newId() : id
}

/**
 * Requires every reference a request carries to be a row of the caller's own. A link's category and
 * a category's parent travel as raw ids; one from another account files the caller's row under
 * another blog, which is the same cross-tenant write in a foreign key instead of a primary one.
 */
export async function assertRefsMine(
  db: D1Database,
  table: OwnedRowTable,
  userId: string,
  ids: readonly (string | null | undefined)[],
  label: string,
): Promise<void> {
  const wanted = ids.filter((id): id is string => Boolean(id))
  if (wanted.length === 0) return
  const owners = await rowOwnersOf(db, table, wanted)
  for (const id of wanted) {
    if (owners.get(id) !== userId) throw ApiError.badRequest(`${label} not found`)
  }
}

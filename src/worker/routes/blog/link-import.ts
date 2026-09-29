import type { z } from 'zod'
import { newId } from '../../lib/id'
import { importRowId, rowOwnersOf } from './owned-rows'
import type { blogLinkImportSchema } from './schemas'

type LinkImportBody = z.infer<typeof blogLinkImportSchema>
type ImportedLink = LinkImportBody['links'][number]

/**
 * Applies a links export to the caller's own directory.
 *
 * The file is data rather than instructions: it was written by another account as often as by this
 * one (an export handed over, a restore into a second account), and every id it carries is also a
 * primary key on the receiving instance. Two rules follow. An id another account already holds is
 * replaced with a fresh one, because keeping it would rewrite that account's row; and a reference
 * into a tree this account does not own is dropped, so an import cannot graft rows onto another
 * blog. Both are reported, because a file that had to be renumbered was not this account's.
 */
export async function importLinkCategories(
  db: D1Database,
  userId: string,
  categories: LinkImportBody['categories'],
  now: number,
): Promise<Record<string, string>> {
  const owners = await rowOwnersOf(db, 'blog_link_categories', carriedIds(categories))
  const categoryIdMap: Record<string, string> = {}
  for (const category of categories) {
    if (category.id) categoryIdMap[category.id] = importRowId(owners, category.id, userId)
  }

  // A parent is a file id like any other, and the file may list it after its child, so the whole map
  // has to exist before any statement is built. A parent the file does not carry is kept only when
  // this account already owns it.
  const parentTargets = await resolveParentTargets(db, userId, categories, categoryIdMap)
  const statements = categories.map((category) => {
    const targetId = category.id ? categoryIdMap[category.id] ?? newId() : newId()
    const parentId = category.parentId
      ? categoryIdMap[category.parentId] ?? parentTargets.get(category.parentId) ?? null
      : null
    return db.prepare(`
      INSERT INTO blog_link_categories (id, user_id, name, icon, parent_id, sort_order, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon = excluded.icon,
        parent_id = excluded.parent_id,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `).bind(
      targetId,
      userId,
      category.name.trim(),
      category.icon?.trim() || null,
      parentId,
      category.sortOrder || 0,
      now,
    )
  })

  if (statements.length > 0) await db.batch(statements)
  return categoryIdMap
}

export async function importLinkItems(
  db: D1Database,
  userId: string,
  links: LinkImportBody['links'],
  categoryIdMap: Record<string, string>,
  now: number,
): Promise<number> {
  const owners = await rowOwnersOf(db, 'blog_links', carriedIds(links))
  const categoryTargets = await resolveCategoryTargets(db, userId, links, categoryIdMap)
  const statements = links.map((item) => {
    const id = item.id ? importRowId(owners, item.id, userId) : newId()
    const categoryId = item.categoryId
      ? categoryIdMap[item.categoryId] ?? categoryTargets.get(item.categoryId) ?? null
      : null
    return prepareImportItemStatement(db, userId, id, item, categoryId, now)
  })

  if (statements.length > 0) await db.batch(statements)
  return statements.length
}

function carriedIds(rows: ReadonlyArray<{ id?: string }>): string[] {
  return rows.map((row) => row.id).filter((id): id is string => Boolean(id))
}

function reportDropped(count: number, what: string): void {
  if (count > 0) console.warn(`[blog] link import: dropped ${count} ${what} this account does not own`)
}

/**
 * Where each parent reference lands: the file's own target when the file carries that category, and
 * the reference itself only when this account already owns it. Anyone else's category resolves to
 * nothing, so the imported child surfaces at the top level instead of under another blog.
 */
async function resolveParentTargets(
  db: D1Database,
  userId: string,
  categories: LinkImportBody['categories'],
  categoryIdMap: Record<string, string>,
): Promise<Map<string, string | null>> {
  const referenced = distinctUnmapped(
    categories.map((category) => category.parentId),
    categoryIdMap,
  )
  const owners = await rowOwnersOf(db, 'blog_link_categories', referenced)
  const targets = new Map<string, string | null>()
  for (const id of referenced) targets.set(id, owners.get(id) === userId ? id : null)
  reportDropped([...targets.values()].filter((value) => value === null).length, 'category parent reference(s)')
  return targets
}

async function resolveCategoryTargets(
  db: D1Database,
  userId: string,
  links: LinkImportBody['links'],
  categoryIdMap: Record<string, string>,
): Promise<Map<string, string | null>> {
  const referenced = distinctUnmapped(
    links.map((link) => link.categoryId),
    categoryIdMap,
  )
  const owners = await rowOwnersOf(db, 'blog_link_categories', referenced)
  const targets = new Map<string, string | null>()
  for (const id of referenced) targets.set(id, owners.get(id) === userId ? id : null)
  reportDropped([...targets.values()].filter((value) => value === null).length, 'link category reference(s)')
  return targets
}

function distinctUnmapped(
  ids: ReadonlyArray<string | null | undefined>,
  categoryIdMap: Record<string, string>,
): string[] {
  return [
    ...new Set(
      ids.filter((id): id is string => Boolean(id) && categoryIdMap[id as string] === undefined),
    ),
  ]
}

function prepareImportItemStatement(
  db: D1Database,
  userId: string,
  id: string,
  item: ImportedLink,
  targetCatId: string | null,
  now: number,
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO blog_links (
      id, user_id, name, url, description, avatar, email, category_id,
      status, is_pinned, pinned_order, is_favorite, sort_order, is_active, clicks,
      created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      description = excluded.description,
      avatar = excluded.avatar,
      email = excluded.email,
      category_id = excluded.category_id,
      status = excluded.status,
      is_pinned = excluded.is_pinned,
      pinned_order = excluded.pinned_order,
      is_favorite = excluded.is_favorite,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `).bind(
    id,
    userId,
    item.name.trim(),
    item.url.trim(),
    (item.description || '').trim(),
    (item.avatar || '').trim(),
    (item.email || '').trim(),
    targetCatId,
    item.status || 'approved',
    item.isPinned ? 1 : 0,
    item.pinnedOrder || 0,
    item.isFavorite ? 1 : 0,
    item.sortOrder || 0,
    item.isActive !== false ? 1 : 0,
    now,
  )
}

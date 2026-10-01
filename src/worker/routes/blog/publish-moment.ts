/**
 * When a post goes out. Two rules meet here: a reader sees a post only once its moment has arrived
 * (a future moment is a scheduled post), and publishing a draft stamps that moment — an already
 * published post keeps its own, so editing a live post never reorders the archive.
 */

/**
 * `<alias>.published_at` has arrived, compared inside SQLite rather than by a bind: every
 * reader-facing query can then carry the rule without threading a second parameter through its own
 * numbering. `published_at` is epoch milliseconds while `strftime` reports whole seconds, so the
 * second is added back before comparing: without it a post published right now carries milliseconds
 * past the truncated clock and stays hidden for up to a second.
 */
export function publishReachedSql(alias: string): string {
  return `${alias}.published_at < (CAST(strftime('%s','now') AS INTEGER) + 1) * 1000`
}

/**
 * What a reader-facing query may select: not in the trash, published, and its moment has come. The
 * trash arm lives here rather than in each query for the same reason the scheduled arm does — every
 * reader-facing path already carries this one predicate, so a deleted post cannot stay reachable
 * through a route that forgot it.
 */
export function publicPostVisibleSql(alias: string): string {
  return `${alias}.deleted_at IS NULL AND ${alias}.is_published = 1 AND ${publishReachedSql(alias)}`
}

/** The row a write reads its defaults from. */
export interface PublishedAtCurrent {
  is_published: number
  published_at: number
}

/**
 * The moment a write stores. An explicit `publishedAt` wins — that is what scheduling and backdating
 * are — otherwise a draft being published stamps now, and every other write keeps the row's own
 * moment.
 */
export function resolvedPublishedAt(
  body: { publishedAt?: number; isPublished?: boolean },
  current: PublishedAtCurrent,
  now: number,
): number {
  if (body.publishedAt !== undefined) return body.publishedAt
  if (body.isPublished === true && !current.is_published) return now
  return current.published_at
}

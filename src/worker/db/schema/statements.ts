import { INDEX_STATEMENTS } from './indexes'
import { TABLE_STATEMENTS } from './tables'

export const SCHEMA_STATEMENTS: readonly string[] = [...TABLE_STATEMENTS, ...INDEX_STATEMENTS]

// `note_id` is indexed so a delete can reach the row through MATCH instead of scanning the whole
// table; the search query names the columns it searches ({title body}), so the id is matchable for
// bookkeeping without ever answering a user's term. `user_id` stays unindexed: every read and
// delete filters it as a plain column.
export const FTS_STATEMENT = `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id,
  user_id UNINDEXED,
  title,
  body,
  tokenize = "unicode61 remove_diacritics 2"
)`

// Blog posts get an index of their own rather than a share of the note one: a post's text is the
// post's own (the publish dialog rewrites it, and a post outlives the note it came from), while the
// note index answers a different question with its own queue, guards and fields. Same shape as the
// note index — post_id matchable for bookkeeping, user_id filtered as a plain column, and the
// excerpt indexed on its own because the list search has always matched it.
export const BLOG_FTS_STATEMENT = `CREATE VIRTUAL TABLE IF NOT EXISTS blog_posts_fts USING fts5(
  post_id,
  user_id UNINDEXED,
  title,
  excerpt,
  body,
  tokenize = "unicode61 remove_diacritics 2"
)`

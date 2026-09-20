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

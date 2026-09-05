import { INDEX_STATEMENTS } from './indexes';
import { TABLE_STATEMENTS } from './tables';

export const SCHEMA_STATEMENTS: readonly string[] = [...TABLE_STATEMENTS, ...INDEX_STATEMENTS];

export const FTS_STATEMENT = `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  user_id UNINDEXED,
  title,
  body,
  tokenize = "unicode61 remove_diacritics 2"
)`

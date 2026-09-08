import { createStore } from 'idb-keyval'
import * as idbKeyval from 'idb-keyval'
import type { UseStore } from 'idb-keyval'
import { CLIENT_DATABASE_NAME } from '../runtime'

const optionalIdbExport = (name: string): unknown => Object.prototype.hasOwnProperty.call(idbKeyval, name)
  ? Reflect.get(idbKeyval, name)
  : undefined
export 
const delMany = optionalIdbExport('delMany') as ((keys: IDBValidKey[], store?: UseStore) => Promise<void>) | undefined
export 
const entries = optionalIdbExport('entries') as (<KeyType extends IDBValidKey, ValueType = unknown>(store?: UseStore) => Promise<[KeyType, ValueType][]>) | undefined
export const store = createStore(CLIENT_DATABASE_NAME, 'kv')
export const KEY = {
  notes: 'notes',
  noteIndex: 'noteIndex',
  folders: 'folders',
  tags: 'tags',
  cursor: 'cursor',
  summary: (id: string) => `note-summary:${id}`,
  content: (id: string) => `note:${id}`,
  outbox: 'outbox',
  outboxReplayLease: 'outboxReplayLease',
  userId: 'userId',
  session: 'session',
  templateLibrary: 'templateLibrary',
} as const
export const supportsUserNamespaces = typeof entries === 'function' && typeof delMany === 'function'
// The bound user and the namespace fallback flag live here (not in core.ts)
// because store-io.ts's key scoping reads them, and core.ts imports store-io.ts;
// a leaf module keeps the db layer free of an import cycle. Mutated through the
// object (not let exports) because ESM import bindings are read-only for core.ts.
export const dbState = {
  activeUserId: null as string | null,
  shouldForceUserNamespaces: false,
}

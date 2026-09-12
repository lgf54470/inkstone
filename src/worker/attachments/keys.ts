import { extensionFor } from '../lib/image'


export interface StoredAttachmentKey {
  id: string
  user_id: string
  mime: string
  filename: string
  created_at?: number
  object_key?: string | null
}

export type AttachmentObjectStorage = 'r2' | 'kv'

export function attachmentDateFolder(timestamp?: number): string {
  const date = timestamp ? new Date(timestamp) : new Date()
  return date.toISOString().slice(0, 10)
}

// The key embeds user_id so one account's upload can never collide with
// another account's object; objects written before this format exist under
// the per-day layout without user_id and stay reachable through the
// persisted object_key column.
export function attachmentObjectKey(row: StoredAttachmentKey): string {
  const folder = row.mime.startsWith('image/') ? 'images' : 'files'
  const date = attachmentDateFolder(row.created_at)
  return `${folder}/${date}/${row.user_id}/${row.filename}`
}

export function legacyAttachmentObjectKey(row: StoredAttachmentKey): string {
  return `${row.user_id}/${row.id}.${extensionFor(row.mime, row.filename)}`
}

export function attachmentObjectKeyCandidates(row: StoredAttachmentKey): string[] {
  return [...new Set([
    row.object_key ?? attachmentObjectKey(row),
    legacyAttachmentObjectKey(row),
  ])]
}

export function attachmentCleanupTarget(storage: AttachmentObjectStorage, key: string): string {
  return `${storage}:${key}`
}

export function parseAttachmentCleanupTarget(value: string): {
  storage: AttachmentObjectStorage
  key: string
} | null {
  if (value.startsWith('kv:') && value.length > 3) return { storage: 'kv', key: value.slice(3) }
  if (value.startsWith('r2:') && value.length > 3) return { storage: 'r2', key: value.slice(3) }
  return null
}

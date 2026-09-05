import { get, getMany, set, setMany } from 'idb-keyval';
import { delMany, entries, store, KEY, supportsUserNamespaces } from './keys';
import type { OutboxItem } from './types';
import { shouldForceUserNamespaces, activeUserId } from './core';
export function normalizeOutbox(value: unknown): OutboxItem[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is OutboxItem => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<OutboxItem>
    return typeof candidate.id === 'string' &&
      typeof candidate.clientId === 'string' &&
      typeof candidate.writeId === 'string' &&
      typeof candidate.noteId === 'string' &&
      Boolean(candidate.payload) &&
      typeof candidate.payload === 'object' &&
      !Array.isArray(candidate.payload) &&
      typeof candidate.attempts === 'number' &&
      Number.isInteger(candidate.attempts) &&
      typeof candidate.createdAt === 'number' &&
      Number.isFinite(candidate.createdAt)
  })
}
export async function safeGet<T>(key: string): Promise<T | undefined> {
  try {
    return await get<T>(key, store)
  } catch {
    return undefined
  }
}
export async function safeSet(key: string, value: unknown): Promise<void> {
  try {
    await set(key, value, store)
  } catch {
  }
}
export function userScopedKey(key: string, userId = activeUserId): string {
  return userId && (supportsUserNamespaces || shouldForceUserNamespaces) ? `user:${userId}:${key}` : key
}
export function isLegacyDataKey(key: unknown): key is string {
  return key === KEY.notes || key === KEY.noteIndex || key === KEY.folders || key === KEY.tags ||
    key === KEY.cursor || key === KEY.outbox || key === KEY.outboxReplayLease ||
    (typeof key === 'string' && (key.startsWith('note:') || key.startsWith('note-summary:')))
}
export async function migrateLegacyData(userId: string): Promise<void> {
  if (!supportsUserNamespaces || !entries || !delMany) return
  const legacy = (await entries<string, unknown>(store)).filter(([key]) => isLegacyDataKey(key))
  if (!legacy.length) return
  const scopedKeys = await getMany(legacy.map(([key]) => userScopedKey(key, userId)), store)
  const writes: [string, unknown][] = []
  for (let index = 0; index < legacy.length; index++) {
    if (scopedKeys[index] === undefined) {
      writes.push([userScopedKey(legacy[index]![0], userId), legacy[index]![1]])
    }
  }
  if (writes.length) await setMany(writes, store)
  await delMany(legacy.map(([key]) => key), store)
}
export async function mergedNoteIds(userId: string | null, targetIds: string[], removedIds: Set<string>): Promise<string[]> {
  // An offline tab never sees another tab's brand-new notes; merging with the
  // on-disk index keeps those entries when this tab rewrites the index, while
  // ids this tab deleted are still dropped (stale ids heal on the next pull).
  let diskIds: string[] = []
  try {
    const value = await get<unknown>(userScopedKey(KEY.noteIndex, userId), store)
    if (Array.isArray(value) && value.every((id) => typeof id === 'string')) diskIds = value as string[]
  } catch {
  }
  const seen = new Set<string>()
  const next: string[] = []
  for (const id of [...diskIds, ...targetIds]) {
    if (removedIds.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}
export 

// The index read-merge-write is the one whole-value shell write two tabs can
// race; Web Locks serializes it across tabs so a concurrent merge reads the
// winner's index instead of a stale one. Browsers without Web Locks fall back
// to the plain merge, which stays correct when flushes never overlap.
async function withShellIndexLock(userId: string | null, task: () => Promise<boolean>): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.locks?.request !== 'function') return task()
  try {
    return await navigator.locks.request(`inkstone-shell-index:${userId ?? 'anon'}`, task)
  } catch {
    return false
  }
}

/** Shell cache helpers extracted from core.ts: index loading, legacy migration, and diff-based write collection. */
import type { NoteSummary } from '@shared/types'
import { del, delMany, getMany, set, setMany } from 'idb-keyval'
import { KEY, store } from './keys'
import { mergedNoteIds, userScopedKey, withShellIndexLock } from './store-io'
import { isNoteSummary, summariesEqual } from './validators'
import type { ShellBaseline, ShellData } from './types'

export const SHELL_SET_CHUNK = 400

export async function loadIndexNotes(index: string[], userId: string | null): Promise<NoteSummary[] | null> {
  const summaries = await getMany(index.map((id) => userScopedKey(KEY.summary(id), userId)), store)
  return summaries.every(isNoteSummary) ? (summaries as NoteSummary[]) : null
}

export async function migrateLegacyNotes(legacyNotes: NoteSummary[], userId: string | null): Promise<NoteSummary[]> {
  const writes: [string, unknown][] = legacyNotes.map((note) => [userScopedKey(KEY.summary(note.id), userId), note])
  writes.push([userScopedKey(KEY.noteIndex, userId), legacyNotes.map((note) => note.id)])
  for (let start = 0; start < writes.length; start += SHELL_SET_CHUNK)
    await setMany(writes.slice(start, start + SHELL_SET_CHUNK), store)
  await del(userScopedKey(KEY.notes, userId), store)
  return legacyNotes
}

export async function collectBaselineShellWrites(
  baseline: ShellBaseline,
  data: ShellData,
  userId: string | null,
): Promise<{ writes: [string, unknown][]; indexChanged: boolean; targetNotes: Map<string, NoteSummary> }> {
  const targetNotes = new Map(data.notes.map((note) => [note.id, note] as const))
  const writes: [string, unknown][] = []
  let indexChanged = false
  for (const note of data.notes) {
    const previous = baseline.notes.get(note.id)
    if (previous === undefined || !summariesEqual(previous, note)) {
      writes.push([userScopedKey(KEY.summary(note.id), userId), note])
      if (previous === undefined) indexChanged = true
    }
  }
  const removedIds: string[] = []
  for (const id of baseline.notes.keys()) {
    if (!targetNotes.has(id)) removedIds.push(id)
  }
  if (removedIds.length) {
    indexChanged = true
    await deleteShellKeys(removedIds.map((id) => userScopedKey(KEY.summary(id), userId)))
  }
  if (indexChanged) {
    const indexKey = userScopedKey(KEY.noteIndex, userId)
    const written = await withShellIndexLock(userId, async () => {
      const merged = await mergedNoteIds(userId, [...targetNotes.keys()], new Set(removedIds))
      await set(indexKey, merged, store)
      return true
    })
    if (written !== true) writes.push([indexKey, [...targetNotes.keys()]])
  }
  return { writes, indexChanged, targetNotes }
}

export function collectFullShellWrites(data: ShellData, userId: string | null): [string, unknown][] {
  const writes: [string, unknown][] = data.notes.map((note) => [userScopedKey(KEY.summary(note.id), userId), note])
  writes.push([userScopedKey(KEY.noteIndex, userId), data.notes.map((note) => note.id)])
  return writes
}

async function deleteShellKeys(removedKeys: string[]): Promise<void> {
  if (delMany) await delMany(removedKeys, store)
  else for (const key of removedKeys) await del(key, store)
}
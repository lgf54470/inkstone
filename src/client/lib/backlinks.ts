import type { Backlink } from '@shared/types'
import { api } from './api'

const CACHE_LIMIT = 60
const cache = new Map<string, Backlink[]>()
const inflight = new Map<string, Promise<Backlink[]>>()

export async function getNoteBacklinks(
  noteId: string,
  rev: number,
  cursor: number,
  signal?: AbortSignal,
  options?: { force?: boolean },
): Promise<Backlink[]> {
  const key = `${noteId}:${rev}:${cursor}`
  if (!options?.force) {
    const cached = cache.get(key)
    if (cached) return cached
  }
  const existing = inflight.get(key)
  if (existing) return existing
  const promise = (async () => {
    try {
      const response = await api.notes.backlinks(noteId, signal)
      inflight.delete(key)
      remember(cache, key, response.backlinks, CACHE_LIMIT)
      return response.backlinks
    } catch (error) {
      inflight.delete(key)
      throw error
    }
  })()
  inflight.set(key, promise)
  return promise
}

function remember(cache: Map<string, Backlink[]>, key: string, value: Backlink[], limit: number): void {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}
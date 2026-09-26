import { toastMusic } from '../music-feedback'
import { pausePlayback, stopPlayback } from '../audio-engine'
import { publishMediaSession } from '../media-session'
import { orderAfterInsert, orderAfterQueueSync } from '../music-shuffle'
import { setProgressTime } from './progress'
import { currentTrack, playQueueAt } from './player'
import type { MusicGet, MusicSet } from './types'

export function addToQueue(set: MusicSet, get: MusicGet, id: string, next = false): void {
  const { queue, currentIndex, mode, shuffleOrder } = get()
  if (!queue.length) {
    set({ queue: [id], currentIndex: 0, shuffleOrder: orderAfterQueueSync(mode, shuffleOrder, [id]) })
    toastMusic('music.added_to_queue')
    return
  }
  const deduped = queue.filter((entry) => entry !== id)
  if (next) {
    deduped.splice(Math.min(currentIndex + 1, deduped.length), 0, id)
    // The order places the id after the playing track in play order, which only
    // matches the queue position while the queue is walked sequentially.
    set({ queue: deduped, shuffleOrder: orderAfterInsert(mode, shuffleOrder, deduped, queue[currentIndex] ?? null, id) })
    toastMusic('music.added_to_queue')
    return
  }
  set({ queue: [...deduped, id], shuffleOrder: orderAfterQueueSync(mode, shuffleOrder, [...deduped, id]) })
  toastMusic('music.added_to_queue')
}

/**
 * An import lands as one list: one state write and one notice instead of one of
 * each per row. Returns how many ids were new, so the caller can report what the
 * playlist contained that the library could not answer for.
 */
export function addManyToQueue(set: MusicSet, get: MusicGet, ids: readonly string[]): number {
  const { queue, mode, shuffleOrder } = get()
  const known = new Set(queue)
  const added: string[] = []
  for (const id of ids) {
    if (known.has(id)) continue
    known.add(id)
    added.push(id)
  }
  if (!added.length) return 0
  const merged = [...queue, ...added]
  set({ queue: merged, shuffleOrder: orderAfterQueueSync(mode, shuffleOrder, merged) })
  toastMusic('music.queue_added_count', { value0: added.length })
  return added.length
}

export function removeFromQueue(set: MusicSet, get: MusicGet, index: number): void {
  const { queue, currentIndex, mode, shuffleOrder } = get()
  if (index < 0 || index >= queue.length) return
  const nextQueue = queue.filter((_entry, position) => position !== index)
  const nextOrder = orderAfterQueueSync(mode, shuffleOrder, nextQueue)
  if (index !== currentIndex) {
    const nextIndex = index < currentIndex ? currentIndex - 1 : currentIndex
    set({ queue: nextQueue, currentIndex: Math.max(0, Math.min(nextIndex, nextQueue.length - 1)), shuffleOrder: nextOrder })
    return
  }
  // Removing the playing track: keep the audio and the queue pointing at the same song.
  const nextIndex = Math.max(0, Math.min(index, nextQueue.length - 1))
  set({ queue: nextQueue, currentIndex: nextIndex, shuffleOrder: nextOrder })
  if (get().isPlaying && nextQueue.length) {
    void playQueueAt(set, get, nextIndex)
    return
  }
  stopPlayback()
  set({ isPlaying: false, durationMs: 0 })
  setProgressTime(0)
  publishMediaSession(nextQueue.length ? currentTrack(get()) : null, false)
}

export function clearQueue(set: MusicSet): void {
  pausePlayback()
  set({ queue: [], currentIndex: 0, isPlaying: false, durationMs: 0, shuffleOrder: null })
  setProgressTime(0)
  publishMediaSession(null, false)
}

// The audio keeps playing while rows shuffle, so only the queue array and the
// index pointing at the playing entry change — a new array reference is what
// tells the session sync to persist the reordered queue.
export function moveQueueItem(set: MusicSet, get: MusicGet, from: number, to: number): void {
  const { queue, currentIndex } = get()
  if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return
  const nextQueue = [...queue]
  const [moved] = nextQueue.splice(from, 1)
  nextQueue.splice(to, 0, moved)
  let nextIndex = currentIndex
  if (from === currentIndex) {
    nextIndex = to
  } else if (from < currentIndex && to >= currentIndex) {
    nextIndex = currentIndex - 1
  } else if (from > currentIndex && to <= currentIndex) {
    nextIndex = currentIndex + 1
  }
  set({ queue: nextQueue, currentIndex: nextIndex })
}

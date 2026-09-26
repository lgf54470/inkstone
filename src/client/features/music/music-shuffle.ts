import type { MusicPlayMode } from '@shared/types'

// Shuffle is a walk over a play order, not a coin flip per press: every track
// plays once before the order wraps, and "previous" is the track that actually
// played before. The queue array itself is never reordered, so leaving shuffle
// mode is the restore. The order is a permutation of queue ids kept in step by
// the queue writers (invariant: non-null exactly while the mode is shuffle).
export function createShuffleOrder(queue: readonly string[], currentId: string | null, rng: () => number = Math.random): string[] {
  const order = [...queue]
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  if (currentId) {
    const at = order.indexOf(currentId)
    if (at > 0) {
      order.splice(at, 1)
      order.unshift(currentId)
    }
  }
  return order
}

// Returns the queue index of the next (or previous) id in play order, wrapping at
// the ends. -1 means it cannot step: empty queue, or the playing id is missing
// from a stale order and the caller has to rebuild.
export function shuffleStep(queue: readonly string[], currentId: string | null, order: readonly string[], direction: 1 | -1): number {
  if (!queue.length || !currentId) return -1
  const position = order.indexOf(currentId)
  if (position < 0) return -1
  const next = order[(position + direction + order.length) % order.length]
  return next ? queue.indexOf(next) : -1
}

export function syncShuffleOrder(order: readonly string[], queue: readonly string[]): string[] {
  const queued = new Set(queue)
  const kept = order.filter((id) => queued.has(id))
  const inOrder = new Set(kept)
  return [...kept, ...queue.filter((id) => !inOrder.has(id))]
}

// Queue writers funnel through here so the invariant survives every shape of
// edit. A null order stays null: rebuilding is the playback step's job, which
// puts the current track first instead of guessing the queue's display order.
export function orderAfterQueueSync(mode: MusicPlayMode, existing: readonly string[] | null, queue: readonly string[]): string[] | null {
  if (mode !== 'shuffle') return null
  return existing ? syncShuffleOrder(existing, queue) : null
}

// A play-next insertion must land right after the playing track in play order,
// not wherever the queue display puts it.
export function orderAfterInsert(mode: MusicPlayMode, existing: readonly string[] | null, queue: readonly string[], currentId: string | null, insertId: string): string[] | null {
  const base = orderAfterQueueSync(mode, existing, queue)
  if (!base) return null
  const without = base.filter((id) => id !== insertId)
  const at = currentId ? without.indexOf(currentId) : -1
  without.splice(at >= 0 ? at + 1 : without.length, 0, insertId)
  return without
}

// A fresh queue keeps the invariant (order exists exactly while shuffled) at the
// entry points that replace the queue wholesale.
export function shuffleOrderFor(mode: MusicPlayMode, queue: readonly string[], currentId: string | null): string[] | null {
  return mode === 'shuffle' ? createShuffleOrder(queue, currentId) : null
}

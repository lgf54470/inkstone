/** Outbox replay lease helpers extracted from core.ts (fallback when Web Locks are unavailable). */
import { update } from 'idb-keyval'
import { KEY, store } from './keys'
import { userScopedKey } from './store-io'

const OUTBOX_REPLAY_LEASE_MS = 90_000
const OUTBOX_REPLAY_LEASE_WAIT_MS = 50
const OUTBOX_REPLAY_ACQUIRE_TIMEOUT_MS = 30_000

interface ReplayLease {
  owner: string
  expiresAt: number
}

export async function acquireOutboxReplayLease(owner: string): Promise<boolean> {
  let isAcquired = false
  const deadline = Date.now() + OUTBOX_REPLAY_ACQUIRE_TIMEOUT_MS
  while (!isAcquired && Date.now() < deadline) {
    const now = Date.now()
    await update<ReplayLease | null>(
      userScopedKey(KEY.outboxReplayLease),
      (current) => {
        if (!current || current.expiresAt <= now) {
          isAcquired = true
          return { owner, expiresAt: now + OUTBOX_REPLAY_LEASE_MS }
        }
        return current
      },
      store,
    )
    if (!isAcquired) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, OUTBOX_REPLAY_LEASE_WAIT_MS))
    }
  }
  return isAcquired
}

// Lease refresh/release failures are safe: the lease expires via its TTL, and a
// stale holder simply re-competes on the next replay attempt.
export function refreshOutboxReplayLease(owner: string): Promise<void> {
  return update<ReplayLease | null>(
    userScopedKey(KEY.outboxReplayLease),
    (current) => current?.owner === owner
      ? { owner, expiresAt: Date.now() + OUTBOX_REPLAY_LEASE_MS }
      : current ?? null,
    store,
  ).catch(() => {})
}

export function releaseOutboxReplayLease(owner: string): Promise<void> {
  return update<ReplayLease | null>(
    userScopedKey(KEY.outboxReplayLease),
    (current) => current?.owner === owner ? null : current ?? null,
    store,
  ).catch(() => {})
}
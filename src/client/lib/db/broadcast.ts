import type { Note } from '@shared/types';
import { activeUserId } from './core';


export type BroadcastPayload = (
  | { type: 'local-write'; clientId: string }
  | { type: 'pulled'; cursor: number; clientId: string }
  | { type: 'claim-leader'; clientId: string; at: number }
  | { type: 'settings-changed'; clientId: string }
  | { type: 'profile-changed'; clientId: string }
  | { type: 'site-changed'; clientId: string }
  | {
      type: 'outbox-base-advanced'
      clientId: string
      noteId: string
      writeId: string
      expectedRev: number
      nextRev: number
    }
  | {
      type: 'outbox-result'
      clientId: string
      targetClientId: string
      noteId: string
      writeId: string
      outcome: 'saved' | 'recovered'
      recoveryReason?: 'conflict' | 'deleted'
      rev?: number
      updatedAt?: number
      savedTitle?: string
      savedNote?: Note
      copyId?: string
    }
) & { userId?: string }
export let broadcastPublisher: BroadcastChannel | null = null


export function publishBroadcast(payload: BroadcastPayload): void {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    broadcastPublisher ??= new BroadcastChannel('inkstone')
    broadcastPublisher.postMessage({ ...payload, userId: activeUserId })
  } catch {
  }
}


export function createBroadcast(
  onMessage: (payload: BroadcastPayload) => void,
): { post: (payload: BroadcastPayload) => void; close: () => void } {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} }
  }
  const channel = new BroadcastChannel('inkstone')
  channel.onmessage = (event) => {
    const payload = event.data as BroadcastPayload
    if (!activeUserId || payload?.userId !== activeUserId) return
    onMessage(payload)
  }
  return {
    post: (payload) => {
      try {
        channel.postMessage({ ...payload, userId: activeUserId })
      } catch {
      }
    },
    close: () => channel.close(),
  }
}

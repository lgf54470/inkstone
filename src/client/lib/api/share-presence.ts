import type { PublicSharePresence, SharePresencePosition, SharePresenceSession } from '@shared/share-presence'
import { request } from './transport'

/**
 * The audience-follow channel (N-34 / ADR-0006): start a show, move its position, end it.
 *
 * `start` is the only call that ever returns the capability token — the server keeps a hash, so a
 * refresh cannot recover it and a presenter who wants the link again starts a new show. The caller that
 * holds the token is the presenter's running show, which is why this lives on the presenter's side and
 * the viewer's read is a public call with no session at all (see `presence` reads in the share page).
 */
export const presence = {
  start: (noteId: string) =>
    request<SharePresenceSession>(`/api/share/${noteId}/present/start`, { method: 'POST', body: {} }),
  publish: (noteId: string, position: SharePresencePosition) =>
    request<{ updatedAt: number }>(`/api/share/${noteId}/present`, { method: 'POST', body: position }),
  stop: (noteId: string) =>
    request<{ stopped: true }>(`/api/share/${noteId}/present/stop`, { method: 'POST', body: {} }),
  status: (noteId: string, signal?: AbortSignal) =>
    request<PresenceStatus>(`/api/share/${noteId}/present`, { signal }),
  /**
   * The viewer's heartbeat. `undefined` means "nothing moved since the last beat" (a 304), which is why
   * the caller keeps what it holds rather than treating it as a blank. `cache: 'no-store'` because a
   * stored answer to "where is the talk now" is not a stale answer — it is a different question's.
   */
  read: (slug: string, token: string, ifNoneMatch?: string, onEtag?: (etag: string | null) => void) =>
    request<PublicSharePresence | undefined>(`/api/public/${slug}/present`, { method: 'POST', body: { token }, ifNoneMatch, onEtag, cache: 'no-store' }),
}

/** What the owner's own question answers: nothing, or where the show is and how long it may run. */
export type PresenceStatus = { running: false } | { running: true, expiresAt: number, presence: PublicSharePresence }

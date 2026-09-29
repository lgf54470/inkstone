import type { PublicPlaylistTrack } from '../../../lib/api'

// What "since your last visit" needs is one timestamp and nothing else: the public playlist already
// carries each track's `createdAt`, so the answer is a comparison rather than a subscription record.
// Keeping the stamp in this browser is also why the feature needs no visitor identifier — the share
// link's analytics identity is a fingerprint salted per UTC day (ADR-0003), so it could not carry a
// reminder across days even if it were reused here, and a durable identifier invented for a
// convenience reminder would be exactly the tracking the rest of this module avoids.
//
// One key per share slug: opening one playlist must not rewrite what another one has already seen.
const KEY_PREFIX = 'inkstone.playlist-visit.'

export interface PlaylistVisit {
  /** When this browser last opened the playlist, or null when it has never opened it. */
  lastSeenAt: number | null
}

export function readPlaylistVisit(slug: string, storage: Storage | null = browserStorage()): PlaylistVisit {
  try {
    const raw = storage?.getItem(KEY_PREFIX + slug)
    const at = raw === undefined || raw === null ? Number.NaN : Number(raw)
    return { lastSeenAt: Number.isFinite(at) && at > 0 ? at : null }
  } catch {
    // A storage that refuses reads (private mode, blocked cookies) degrades to a first visit, which
    // only costs the reminder — the playlist itself must still render.
    return { lastSeenAt: null }
  }
}

export function rememberPlaylistVisit(slug: string, at = Date.now(), storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(KEY_PREFIX + slug, String(at))
  } catch {
    // Best effort: losing the stamp costs the next visit its reminder and nothing else.
  }
}

export function forgetPlaylistVisit(slug: string, storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(KEY_PREFIX + slug)
  } catch {
    // Best effort, for the same reason as remembering.
  }
}

// The tracks that appeared after the last visit. A first visit has nothing to compare against and so
// reports none: "everything is new" is not an answer to "what changed", it is the absence of one.
export function tracksSinceVisit(tracks: PublicPlaylistTrack[], lastSeenAt: number | null): string[] {
  if (lastSeenAt === null) return []
  return tracks.filter((track) => track.createdAt > lastSeenAt).map((track) => track.id)
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

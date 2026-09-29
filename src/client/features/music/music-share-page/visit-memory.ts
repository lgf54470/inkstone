import type { PublicPlaylistTrack } from '../../../lib/api'

// What "since your last visit" needs is one timestamp and nothing else: the public playlist already
// carries each item's `addedAt`, so the answer is a comparison rather than a subscription record.
// Keeping the stamp in this browser is also why the feature needs no visitor identifier — the share
// link's analytics identity is a fingerprint salted per UTC day (ADR-0003), so it could not carry a
// reminder across days even if it were reused here, and a durable identifier invented for a
// convenience reminder would be exactly the tracking the rest of this module avoids.
//
// The stamp is what the reader was *shown*, and it is written when the visit ends rather than when it
// begins. Both halves are deliberate: a stamp written as the payload arrives is read back by the next
// claim in the same document (effects run twice, and the pass a reader sees is the last one), and a
// stamp set to "now" would mark a track that appeared during the visit as already seen although no
// page ever drew it.
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

// The items that appeared in this playlist after the last visit — by when they were added to it, not
// by when the track itself was created. A first visit has nothing to compare against and so reports
// none: "everything is new" is not an answer to "what changed", it is the absence of one.
export function tracksSinceVisit(tracks: PublicPlaylistTrack[], lastSeenAt: number | null): string[] {
  if (lastSeenAt === null) return []
  return tracks.filter((track) => track.addedAt > lastSeenAt).map((track) => track.id)
}

// What a visit leaves behind: the newest item it actually displayed. Null for a playlist with nothing
// in it, which has nothing to remember and is not worth a stamp.
export function newestTrackAt(tracks: PublicPlaylistTrack[]): number | null {
  return tracks.reduce<number | null>((newest, track) => (newest === null || track.addedAt > newest ? track.addedAt : newest), null)
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

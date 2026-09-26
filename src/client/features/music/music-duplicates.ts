import type { MusicTrack } from '@shared/types'

// M-53: duplicates are detected from the checksum the worker recorded when the
// upload carried the bytes. Rows imported by WebDAV path and everything stored
// before hashing began have no checksum, so exact matching never sees them.
// For those, a same-title/same-artist/next-duration match forms an approximate
// group instead: it can catch re-uploads of the same rip, and it can also catch
// two genuinely different recordings of the same song, which is why the view
// says "approximate" rather than presenting them as proven copies.
export interface DuplicateGroup {
  kind: 'exact' | 'approximate'
  // Exact groups key on the checksum; approximate groups on the clustered
  // title/artist/duration triple. Only used for ordering and debugging.
  key: string
  // Oldest upload first: that copy has the longest-lived playlists and edits,
  // so it reads as the natural one to keep.
  tracks: MusicTrack[]
  wastedBytes: number
}

// Scanner-derived durations drift by a second or so between sources; anything
// beyond that reads as a different cut.
const APPROX_DURATION_TOLERANCE_MS = 2_000

export function findDuplicateGroups(tracks: MusicTrack[]): DuplicateGroup[] {
  const byHash = new Map<string, MusicTrack[]>()
  const unhashed: MusicTrack[] = []
  for (const track of tracks) {
    if (!track.contentHash) {
      unhashed.push(track)
      continue
    }
    const list = byHash.get(track.contentHash)
    if (list) list.push(track)
    else byHash.set(track.contentHash, [track])
  }
  const groups: DuplicateGroup[] = []
  for (const [hash, members] of byHash) {
    if (members.length >= 2) groups.push({ kind: 'exact', key: hash, tracks: oldestFirst(members), wastedBytes: wastedBy(members) })
  }
  groups.push(...approximateGroups(unhashed))
  // The biggest space savings lead the list; ties fall back to upload order.
  return groups.sort((a, b) =>
    b.wastedBytes - a.wastedBytes || a.tracks[0]!.createdAt - b.tracks[0]!.createdAt)
}

// A row can only be guessed at when it names a song and states a duration.
function approximateKey(track: MusicTrack): string | null {
  const title = track.title.trim().replaceAll(/\s+/g, ' ').toLowerCase()
  if (!title || track.durationMs <= 0) return null
  const artist = track.artist.trim().replaceAll(/\s+/g, ' ').toLowerCase()
  return `${title}|${artist}`
}

function approximateGroups(unhashed: MusicTrack[]): DuplicateGroup[] {
  const byTitleArtist = new Map<string, MusicTrack[]>()
  for (const track of unhashed) {
    const key = approximateKey(track)
    if (!key) continue
    const list = byTitleArtist.get(key)
    if (list) list.push(track)
    else byTitleArtist.set(key, [track])
  }
  const groups: DuplicateGroup[] = []
  for (const [key, members] of byTitleArtist) {
    // Duration-sorted greedy clustering: each cluster anchors on its shortest
    // member, so a chain of near-identical lengths cannot drag in a far one.
    const sorted = [...members].sort((a, b) => a.durationMs - b.durationMs || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    let cluster: MusicTrack[] = []
    const flush = (): void => {
      if (cluster.length >= 2) groups.push({ kind: 'approximate', key: `${key}#${cluster[0]!.durationMs}`, tracks: oldestFirst(cluster), wastedBytes: wastedBy(cluster) })
      cluster = []
    }
    for (const track of sorted) {
      if (cluster.length && track.durationMs - cluster[0]!.durationMs > APPROX_DURATION_TOLERANCE_MS) flush()
      cluster.push(track)
    }
    flush()
  }
  return groups
}

function oldestFirst(members: MusicTrack[]): MusicTrack[] {
  return [...members].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
}

function wastedBy(members: MusicTrack[]): number {
  return members.slice(1).reduce((sum, track) => sum + track.sizeBytes, 0)
}

// Every group member is listed, but only the extras are redundant.
export function duplicateTracks(tracks: MusicTrack[]): MusicTrack[] {
  return findDuplicateGroups(tracks).flatMap((group) => group.tracks)
}

export function redundantTrackCount(tracks: MusicTrack[]): number {
  return findDuplicateGroups(tracks).reduce((sum, group) => sum + group.tracks.length - 1, 0)
}

export function duplicateWastedBytes(tracks: MusicTrack[]): number {
  return findDuplicateGroups(tracks).reduce((sum, group) => sum + group.wastedBytes, 0)
}

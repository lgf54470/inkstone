import type { MusicTrack } from '@shared/types'

// M-53: duplicates are detected from the checksum the worker recorded when the
// upload carried the bytes. Rows imported by WebDAV path and everything stored
// before hashing began have no checksum, so they simply never form a group.
export interface DuplicateGroup {
  hash: string
  // Oldest upload first: that copy has the longest-lived playlists and edits,
  // so it reads as the natural one to keep.
  tracks: MusicTrack[]
  wastedBytes: number
}

export function findDuplicateGroups(tracks: MusicTrack[]): DuplicateGroup[] {
  const byHash = new Map<string, MusicTrack[]>()
  for (const track of tracks) {
    if (!track.contentHash) continue
    const list = byHash.get(track.contentHash)
    if (list) list.push(track)
    else byHash.set(track.contentHash, [track])
  }
  const groups: DuplicateGroup[] = []
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue
    const ordered = [...members].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    groups.push({
      hash,
      tracks: ordered,
      wastedBytes: ordered.slice(1).reduce((sum, track) => sum + track.sizeBytes, 0),
    })
  }
  // The biggest space savings lead the list; ties fall back to upload order.
  return groups.sort((a, b) =>
    b.wastedBytes - a.wastedBytes || a.tracks[0]!.createdAt - b.tracks[0]!.createdAt)
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

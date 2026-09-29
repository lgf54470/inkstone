import { ApiError, api, type MusicPlaylistPatch, type MusicTrackPatch } from '../../../lib/api'
import { localDb, type MusicPendingWrite, type MusicWriteKind } from '../../../lib/db'
import { toastMusicNotice } from '../music-feedback'

// A write the server never saw is not a failure to report, it is work to keep. A request that never
// reached the worker comes back as status 0 (`ApiError.isOffline`), and that is the only failure this
// queue answers: a 4xx is the server's decision about the *value*, so replaying it later would be
// refused again — those keep the rollback-and-tell path they already had.
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isOffline
}

// The queue stores one entry per target, and the payloads of the two kinds do not overlap, so the
// intent a reader expressed offline can be written back with the same call the online path uses.
export type MusicWriteRequest = {
  kind: 'trackFlags'
  targetId: string
  payload: MusicTrackPatch
} | {
  kind: 'playlistFlags'
  targetId: string
  payload: MusicPlaylistPatch
}

// One pending entry per target: the newest intent for a field replaces the older one, which is what
// keeps "pin, unpin, pin" offline from replaying three times towards a state two of them never
// wanted. The queue merges payloads rather than swapping them, so a flag the reader set earlier and
// never touched again survives a later write to the same target.
export function queueMusicWrite(request: MusicWriteRequest): Promise<void> {
  toastMusicNotice('music.saved_offline')
  return localDb.enqueueMusicWrite({
    id: pendingWriteId(request.kind, request.targetId),
    kind: request.kind,
    targetId: request.targetId,
    payload: { ...request.payload },
    attempts: 0,
    createdAt: Date.now(),
  })
}

export function pendingWriteId(kind: MusicWriteKind, targetId: string): string {
  return `${kind}:${targetId}`
}

type ReplayOutcome = 'done' | 'offline' | 'dropped'

// One entry against the endpoint its kind names. A refusal (anything that is not offline) is an
// answer about the value, so the entry is dropped rather than retried forever — and its own failure
// is recorded first, because the drop is exactly the case worth being able to look up afterwards.
async function replayOne(item: MusicPendingWrite): Promise<ReplayOutcome> {
  try {
    if (item.kind === 'trackFlags') await api.music.patchTrack(item.targetId, item.payload as MusicTrackPatch)
    else await api.music.patchPlaylist(item.targetId, item.payload as MusicPlaylistPatch)
    await localDb.completeMusicWrite(item.id)
    return 'done'
  } catch (error) {
    await localDb.markMusicWriteFailure(item.id, error instanceof Error ? error.message : 'error')
    if (isOfflineError(error)) return 'offline'
    await localDb.completeMusicWrite(item.id)
    return 'dropped'
  }
}

let isFlushing = false

// Replays the queue oldest first. Two outcomes are worth distinguishing: still offline stops the walk
// (every later entry would meet the same network, and the queue is not lost), while a refusal drops
// that one entry so a single dead target cannot block every write behind it forever. The number of
// dropped entries comes back so the caller can reconcile the optimistic state it kept on the reader's
// behalf — the one case where the screen is deliberately ahead of the server.
export async function flushMusicWrites(): Promise<number> {
  if (isFlushing) return 0
  isFlushing = true
  try {
    const pending = await localDb.getMusicWrites()
    let dropped = 0
    for (const item of [...pending].sort((a, b) => a.createdAt - b.createdAt)) {
      const outcome = await replayOne(item)
      if (outcome === 'offline') return dropped
      if (outcome === 'dropped') dropped += 1
    }
    return dropped
  } finally {
    isFlushing = false
  }
}

// What the settings row and the offline notices read to say how much is still waiting.
export async function pendingMusicWriteCount(): Promise<number> {
  return (await localDb.getMusicWrites()).length
}

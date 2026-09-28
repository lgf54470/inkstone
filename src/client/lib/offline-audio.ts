import { musicStreamUrl } from './api'

// Bridge to the service worker's offline-audio cache. Every call degrades to
// null/false when no worker controls the page (plain dev mode, unsupported
// browsers) so callers can show a failure toast instead of pretending.

export interface OfflineAudioTrack {
  path: string
  sizeBytes: number
}

// FB3-F4: the two parts of an offline copy that are more than the audio. The reader picks them
// where they save; this layer only fetches what it was told to and rides it on the same message.
export interface OfflineExtras {
  cover: boolean
  lyric: boolean
}

export type OfflineSaveResult = 'saved' | 'quota' | 'failed'

const LIST_TIMEOUT_MS = 10_000
const STORE_TIMEOUT_MS = 5 * 60_000
const REMOVE_TIMEOUT_MS = 30_000

interface WorkerReply {
  requestId?: number
  [key: string]: unknown
}

let requestSequence = 0

export function offlineAudioPath(trackId: string): string {
  return musicStreamUrl(trackId)
}

// The worker serves both from the track's own row, so the paths are derived here rather than
// carried around: they are the same two addresses the player reads them from while online.
export function offlineCoverPath(trackId: string): string {
  return `/api/music/tracks/${encodeURIComponent(trackId)}/cover`
}

export function offlineLyricPath(trackId: string): string {
  return `/api/music/tracks/${encodeURIComponent(trackId)}/lyric`
}

export function trackIdFromOfflinePath(path: string): string | null {
  const match = /^\/api\/music\/tracks\/([^/]+)\/stream$/.exec(path)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    // A path we cannot decode is not any track this page can name; skipping it
    // keeps one corrupt entry from emptying the whole offline list.
    return null
  }
}

export async function listOfflineAudioTracks(): Promise<OfflineAudioTrack[] | null> {
  const reply = await roundTrip({ type: 'LIST_OFFLINE_AUDIO' }, 'OFFLINE_AUDIO_LIST', LIST_TIMEOUT_MS)
  if (!reply) return null
  const tracks = Array.isArray(reply.tracks) ? (reply.tracks as OfflineAudioTrack[]) : []
  return tracks.filter((track) => typeof track?.path === 'string')
}

export async function saveTrackOffline(
  trackId: string,
  mime: string,
  extras?: OfflineExtras,
): Promise<OfflineSaveResult> {
  const path = offlineAudioPath(trackId)
  const response = await fetch(path)
  if (!response.ok) return 'failed'
  const blob = await response.blob()
  if (!blob.size) return 'failed'
  const extra = await fetchOfflineExtras(trackId, extras)
  const reply = await roundTrip({ type: 'STORE_OFFLINE_AUDIO', path, blob, mime, extra }, 'OFFLINE_AUDIO_STORED', STORE_TIMEOUT_MS)
  if (!reply) return 'failed'
  if (reply.ok === true) return 'saved'
  return reply.reason === 'quota' ? 'quota' : 'failed'
}

// A track the account never gave a cover, or a catalogue that never matched a lyric, is the normal
// case rather than a failure — and neither may cost the reader the audio they asked to keep, so a
// medium that will not fetch is simply left out of the copy.
async function fetchOfflineExtras(trackId: string, extras?: OfflineExtras): Promise<{ path: string; blob: Blob; mime: string }[]> {
  if (!extras || (!extras.cover && !extras.lyric)) return []
  const wanted: { path: string; fallbackMime: string }[] = []
  if (extras.cover) wanted.push({ path: offlineCoverPath(trackId), fallbackMime: 'image/jpeg' })
  if (extras.lyric) wanted.push({ path: offlineLyricPath(trackId), fallbackMime: 'application/json' })
  const fetched = await Promise.all(wanted.map(async (entry) => {
    const response = await fetch(entry.path).catch(() => null)
    if (!response?.ok) return null
    const blob = await response.blob().catch(() => null)
    // The worker states the medium it is serving (the cover route reads its extension), so the
    // header is the answer and the fallback only covers a reply that forgot to say.
    const mime = response.headers.get('Content-Type') || entry.fallbackMime
    return blob?.size ? { path: entry.path, blob, mime } : null
  }))
  return fetched.filter((entry): entry is { path: string; blob: Blob; mime: string } => entry !== null)
}

export async function removeTrackOffline(trackId: string): Promise<boolean> {
  const reply = await roundTrip(
    { type: 'REMOVE_OFFLINE_AUDIO', path: offlineAudioPath(trackId) },
    'OFFLINE_AUDIO_REMOVED',
    REMOVE_TIMEOUT_MS,
  )
  return reply?.ok === true
}

export async function clearOfflineAudioTracks(): Promise<boolean> {
  const reply = await roundTrip({ type: 'CLEAR_OFFLINE_AUDIO' }, 'OFFLINE_AUDIO_CLEARED', REMOVE_TIMEOUT_MS)
  return reply?.ok === true
}

function roundTrip(message: Record<string, unknown>, replyType: string, timeoutMs: number): Promise<WorkerReply | null> {
  const worker = typeof navigator === 'undefined' ? null : navigator.serviceWorker?.controller ?? null
  if (!worker) return Promise.resolve(null)
  const requestId = ++requestSequence
  return new Promise((resolve) => {
    const finish = (value: WorkerReply | null): void => {
      window.clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('message', onMessage)
      resolve(value)
    }
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as WorkerReply | null
      if (data?.type !== replyType || data.requestId !== requestId) return
      finish(data)
    }
    const timer = window.setTimeout(() => finish(null), timeoutMs)
    navigator.serviceWorker.addEventListener('message', onMessage)
    worker.postMessage({ ...message, requestId })
  })
}

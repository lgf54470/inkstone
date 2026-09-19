import { musicStreamUrl } from './api'

// Bridge to the service worker's offline-audio cache. Every call degrades to
// null/false when no worker controls the page (plain dev mode, unsupported
// browsers) so callers can show a failure toast instead of pretending.

export interface OfflineAudioTrack {
  path: string
  sizeBytes: number
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

export async function saveTrackOffline(trackId: string, mime: string): Promise<OfflineSaveResult> {
  const path = offlineAudioPath(trackId)
  const response = await fetch(path)
  if (!response.ok) return 'failed'
  const blob = await response.blob()
  if (!blob.size) return 'failed'
  const reply = await roundTrip({ type: 'STORE_OFFLINE_AUDIO', path, blob, mime }, 'OFFLINE_AUDIO_STORED', STORE_TIMEOUT_MS)
  if (!reply) return 'failed'
  if (reply.ok === true) return 'saved'
  return reply.reason === 'quota' ? 'quota' : 'failed'
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

import type { MusicTrack } from '@shared/types'
import { musicStreamUrl } from '../../../lib/api'
import { saveBlob } from '../music-export'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicDownloadTask, MusicGet, MusicSet, MusicTransferTarget } from './types'

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000
const CONTENT_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

// Downloads buffer the whole file so the browser can report real byte progress before saving.
export async function downloadTracks(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  const tracks = ids
    .map((id) => get().tracks.find((track) => track.id === id))
    .filter((track): track is MusicTrack => Boolean(track))
  if (!tracks.length) return
  const tasks = tracks.map((track, index) => makeDownloadTask(track, index))
  set((state) => ({ downloads: [...state.downloads, ...tasks], transfersOpen: true }))
  for (let index = 0; index < tracks.length; index += 1) await downloadOne(set, tracks[index]!, tasks[index]!)
  set((state) => ({ downloads: state.downloads.filter((task) => task.status !== 'done') }))
}

async function downloadOne(set: MusicSet, track: MusicTrack, task: MusicDownloadTask): Promise<void> {
  try {
    const bytes = await fetchTrackBytes(track, (percent) => updateDownload(set, task.id, { percent }))
    saveBlob(new Blob([toArrayBuffer(bytes)], { type: track.mime || 'application/octet-stream' }), downloadFileName(track))
    updateDownload(set, task.id, { percent: 100, status: 'done' })
    toastMusic('music.download_done', { value0: track.title })
  } catch (error) {
    updateDownload(set, task.id, { status: 'failed' })
    toastMusicError(error, 'music.download_failed')
  }
}

async function fetchTrackBytes(track: MusicTrack, onProgress: (percent: number) => void): Promise<Uint8Array> {
  const response = await fetch(musicStreamUrl(track.id), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error('Download failed with status ' + response.status)
  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  const bytes = await collectStream(response.body, totalBytes, onProgress)
  if (!bytes.byteLength) throw new Error('The downloaded file is empty')
  return bytes
}

// Read chunk by chunk so the progress bar moves instead of waiting for the whole file.
export async function collectStream(
  body: ReadableStream<Uint8Array> | null,
  totalBytes: number,
  onProgress: (percent: number) => void,
): Promise<Uint8Array> {
  const reader = body?.getReader()
  if (!reader) return new Uint8Array(0)
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.byteLength) continue
    chunks.push(value)
    received += value.byteLength
    if (totalBytes > 0) onProgress(Math.min(99, Math.round((received / totalBytes) * 100)))
  }
  return concatChunks(chunks, received)
}

export function downloadFileName(track: MusicTrack): string {
  const base = [track.artist.trim(), track.title.trim()].filter(Boolean).join(' - ')
  const safe = base.replace(/[\\/:*?"<>|]/g, '_').trim() || 'track'
  return safe + extensionFor(track)
}

function extensionFor(track: MusicTrack): string {
  const fromKey = /\.[a-z0-9]{1,5}$/i.exec(track.objectKey)?.[0]
  if (fromKey) return fromKey.toLowerCase()
  return '.' + (CONTENT_EXTENSIONS[track.mime] ?? 'mp3')
}

// A downloaded view can sit on a shared buffer, which the Blob constructor refuses.
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function concatChunks(chunks: Uint8Array[], size: number): Uint8Array {
  const merged = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

function makeDownloadTask(track: MusicTrack, index: number): MusicDownloadTask {
  return { id: 'download-' + index + '-' + track.id, name: downloadFileName(track), percent: 0, status: 'downloading' }
}

function updateDownload(set: MusicSet, id: string, patch: Partial<MusicDownloadTask>): void {
  set((state) => ({ downloads: state.downloads.map((task) => (task.id === id ? { ...task, ...patch } : task)) }))
}

export function dismissDownload(set: MusicSet, id: string): void {
  set((state) => ({ downloads: state.downloads.filter((task) => task.id !== id) }))
}

export function setTransfersOpen(set: MusicSet, open: boolean): void {
  set({ transfersOpen: open })
}

export function setUploadTarget(set: MusicSet, target: MusicTransferTarget): void {
  set({ uploadTarget: target })
}

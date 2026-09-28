import type { MusicProviderQuality } from '@shared/constants'
import type { MusicTrack } from '@shared/types'
import { musicStreamUrl } from '../../../lib/api'
import { mapWithConcurrency, throttledProgress } from '../../../lib/async'
import { saveBlob } from '../music-export'
import { downloadFileName, providerStreamQuality, TRACK_IO_CONCURRENCY } from '../music-utils'
import { toastMusic, toastMusicError } from '../music-feedback'
import { persist } from './persist'
import type { MusicDownloadTask, MusicGet, MusicLibraryJobKind, MusicSet, MusicTransferTarget } from './types'

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000

// Downloads report real byte progress per chunk and save the assembled Blob at the end.
export async function downloadTracks(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  const tracks = ids
    .map((id) => get().tracks.find((track) => track.id === id))
    .filter((track): track is MusicTrack => Boolean(track))
  if (!tracks.length) return
  // FB3-F4: the tier a file is kept at is its own preference — a reader auditioning at 128 may
  // still want the copy on their disk at 740, and before this they could not say so.
  const quality = get().downloadQuality
  const tasks = tracks.map((track, index) => makeDownloadTask(track, index))
  set((state) => ({ downloads: [...state.downloads, ...tasks], transfersOpen: true }))
  await mapWithConcurrency(tracks, TRACK_IO_CONCURRENCY, (track, index) => downloadOne(set, get, track, tasks[index]!, quality))
  dropFinishedDownloads(set)
}

// FB-F11: one retry of a failed row, in place — the row keeps its position in the list so
// the reader can see which one they asked for, and the file is saved again on success.
export async function retryDownload(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  const task = get().downloads.find((entry) => entry.id === id)
  const track = task ? get().tracks.find((entry) => entry.id === task.trackId) : undefined
  if (!task || !track || task.status === 'downloading') return
  const retried: MusicDownloadTask = { ...task, percent: 0, status: 'downloading', controller: new AbortController() }
  set((state) => ({ downloads: state.downloads.map((entry) => (entry.id === id ? retried : entry)) }))
  await downloadOne(set, get, track, retried, get().downloadQuality)
  dropFinishedDownloads(set)
}

// FB3-F4: a download tier is set once and outlives the transfer dialog that showed it.
export function setDownloadQuality(set: MusicSet, get: MusicGet, quality: MusicProviderQuality): void {
  set({ downloadQuality: quality })
  persist(get)
}

export async function retryFailedDownloads(set: MusicSet, get: MusicGet): Promise<void> {
  for (const task of [...get().downloads.filter((entry) => entry.status === 'failed')]) await retryDownload(set, get, task.id)
}

// The batch stop: abort every transfer still waiting or running, and leave the rows that
// already answered (a failed row keeps offering its retry).
export function cancelDownloads(set: MusicSet, get: MusicGet): void {
  for (const task of get().downloads) {
    if (task.status === 'downloading') task.controller.abort()
  }
  set((state) => ({ downloads: state.downloads.filter((task) => task.status !== 'downloading') }))
}

async function downloadOne(
  set: MusicSet,
  get: MusicGet,
  track: MusicTrack,
  task: MusicDownloadTask,
  quality: MusicProviderQuality,
): Promise<void> {
  const releaseTimeout = guardDownloadTimeout(task.controller, DOWNLOAD_TIMEOUT_MS)
  try {
    const report = throttledProgress((percent) => updateDownload(set, task.id, { percent }))
    const blob = await fetchTrackBlob(track, providerStreamQuality(track, quality), report, task.controller.signal)
    if (!blob.size) throw new Error('The downloaded file is empty')
    saveBlob(blob, downloadFileName(track))
    updateDownload(set, task.id, { percent: 100, status: 'done' })
    toastMusic('music.download_done', { value0: track.title })
  } catch (error) {
    // The reader can take a row away (dismiss, batch stop) or replace it (retry) while its
    // request is in flight; both leave the row holding a different controller — or none at
    // all — which means this failure belongs to a run that is no longer on screen.
    if (get().downloads.find((entry) => entry.id === task.id)?.controller !== task.controller) return
    updateDownload(set, task.id, { status: 'failed' })
    toastMusicError(error, 'music.download_failed')
  } finally {
    releaseTimeout()
  }
}

// A download runs under two clocks at once: the task's own controller (the cancel button)
// and a guard against an upstream that accepts the request and then stops talking. The
// guard borrows that same controller so the fetch needs only one signal; the caller
// releases the timer in a finally.
export function guardDownloadTimeout(controller: AbortController, timeoutMs: number): () => void {
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return () => clearTimeout(timer)
}

async function fetchTrackBlob(
  track: MusicTrack,
  quality: MusicProviderQuality | undefined,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await fetch(musicStreamUrl(track.id, quality), { signal })
  if (!response.ok) throw new Error('Download failed with status ' + response.status)
  const totalBytes = Number(response.headers.get('content-length') ?? 0)
  return streamToBlob({ body: response.body, totalBytes, mime: track.mime || 'application/octet-stream', onProgress })
}

interface DownloadStreamOptions {
  body: ReadableStream<Uint8Array<ArrayBuffer>> | null
  totalBytes: number
  mime: string
  onProgress: (percent: number) => void
}

// Chunks go straight into the Blob instead of a Uint8Array detour: the browser may back
// a Blob with disk, while concatenating first held three full copies of the file at once.
export async function streamToBlob({ body, totalBytes, mime, onProgress }: DownloadStreamOptions): Promise<Blob> {
  const reader = body?.getReader()
  const parts: BlobPart[] = []
  let received = 0
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      parts.push(value)
      received += value.byteLength
      if (totalBytes > 0) onProgress(Math.min(99, Math.round((received / totalBytes) * 100)))
    }
  }
  return new Blob(parts, { type: mime })
}

function makeDownloadTask(track: MusicTrack, index: number): MusicDownloadTask {
  return {
    id: 'download-' + index + '-' + track.id,
    trackId: track.id,
    name: downloadFileName(track),
    percent: 0,
    status: 'downloading',
    controller: new AbortController(),
  }
}

function updateDownload(set: MusicSet, id: string, patch: Partial<MusicDownloadTask>): void {
  set((state) => ({ downloads: state.downloads.map((task) => (task.id === id ? { ...task, ...patch } : task)) }))
}

function dropFinishedDownloads(set: MusicSet): void {
  set((state) => ({ downloads: state.downloads.filter((task) => task.status !== 'done') }))
}

// The row's X is the reader's cancel, not just a redraw: the same rule uploads follow.
export function dismissDownload(set: MusicSet, get: MusicGet, id: string): void {
  get().downloads.find((task) => task.id === id)?.controller.abort()
  set((state) => ({ downloads: state.downloads.filter((task) => task.id !== id) }))
}

// Batch library work (tag scans, cover matching) reuses the transfers model so a
// long pass shows progress where uploads and downloads already do, and only one
// pass per kind can run at a time: a second call returns without stacking.
export async function runLibraryJob(
  set: MusicSet,
  get: MusicGet,
  kind: MusicLibraryJobKind,
  total: number,
  body: (advance: () => void) => Promise<void>,
): Promise<boolean> {
  if (get().libraryJobs.some((job) => job.kind === kind && job.status === 'running')) return false
  set((state) => ({
    transfersOpen: true,
    libraryJobs: [...state.libraryJobs.filter((job) => job.kind !== kind), { kind, done: 0, total, status: 'running' as const }],
  }))
  const advance = (): void => set((state) => ({
    libraryJobs: state.libraryJobs.map((job) => (job.kind === kind ? { ...job, done: Math.min(job.total, job.done + 1) } : job)),
  }))
  try {
    await body(advance)
  } catch (error) {
    set((state) => ({ libraryJobs: state.libraryJobs.map((job) => (job.kind === kind ? { ...job, status: 'failed' as const } : job)) }))
    toastMusicError(error, 'music.action_failed')
    return true
  }
  set((state) => ({ libraryJobs: state.libraryJobs.filter((job) => job.kind !== kind) }))
  return true
}

export function dismissLibraryJob(set: MusicSet, kind: MusicLibraryJobKind): void {
  set((state) => ({ libraryJobs: state.libraryJobs.filter((job) => job.kind !== kind) }))
}

export function setTransfersOpen(set: MusicSet, open: boolean): void {
  set({ transfersOpen: open })
}

export function setUploadTarget(set: MusicSet, target: MusicTransferTarget): void {
  set({ uploadTarget: target })
}

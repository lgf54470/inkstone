import type { MusicTrack } from '@shared/types'
import { musicStreamUrl } from '../../../lib/api'
import { mapWithConcurrency } from '../../../lib/async'
import { saveBlob } from '../music-export'
import { downloadFileName, TRACK_IO_CONCURRENCY } from '../music-utils'
import { toastMusic, toastMusicError } from '../music-feedback'
import type { MusicDownloadTask, MusicGet, MusicLibraryJobKind, MusicSet, MusicTransferTarget } from './types'

const DOWNLOAD_TIMEOUT_MS = 10 * 60_000
const PROGRESS_THROTTLE_MS = 200

// Downloads report real byte progress per chunk and save the assembled Blob at the end.
export async function downloadTracks(set: MusicSet, get: MusicGet, ids: string[]): Promise<void> {
  const tracks = ids
    .map((id) => get().tracks.find((track) => track.id === id))
    .filter((track): track is MusicTrack => Boolean(track))
  if (!tracks.length) return
  const tasks = tracks.map((track, index) => makeDownloadTask(track, index))
  set((state) => ({ downloads: [...state.downloads, ...tasks], transfersOpen: true }))
  await mapWithConcurrency(tracks, TRACK_IO_CONCURRENCY, (track, index) => downloadOne(set, track, tasks[index]!))
  set((state) => ({ downloads: state.downloads.filter((task) => task.status !== 'done') }))
}

async function downloadOne(set: MusicSet, track: MusicTrack, task: MusicDownloadTask): Promise<void> {
  try {
    const report = throttledProgress((percent) => updateDownload(set, task.id, { percent }))
    const blob = await fetchTrackBlob(track, report)
    if (!blob.size) throw new Error('The downloaded file is empty')
    saveBlob(blob, downloadFileName(track))
    updateDownload(set, task.id, { percent: 100, status: 'done' })
    toastMusic('music.download_done', { value0: track.title })
  } catch (error) {
    updateDownload(set, task.id, { status: 'failed' })
    toastMusicError(error, 'music.download_failed')
  }
}

async function fetchTrackBlob(track: MusicTrack, onProgress: (percent: number) => void): Promise<Blob> {
  const response = await fetch(musicStreamUrl(track.id), { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
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

// Chunk callbacks land far faster than anyone reads a progress bar, and each one rewrote
// the whole downloads array; the terminal 100 percent is written outside this wrapper.
function throttledProgress(report: (percent: number) => void): (percent: number) => void {
  let lastAt = 0
  return (percent) => {
    const now = Date.now()
    if (now - lastAt < PROGRESS_THROTTLE_MS) return
    lastAt = now
    report(percent)
  }
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

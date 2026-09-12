import type { MusicTrack } from '@shared/types'

export function downloadM3u(tracks: MusicTrack[], filename: string): void {
  const lines = ['#EXTM3U']
  for (const track of tracks) {
    lines.push('#EXTINF:' + Math.round(track.durationMs / 1000) + ',' + (track.artist ? track.artist + ' - ' : '') + track.title)
    lines.push(track.objectKey)
  }
  saveBlob(new Blob([lines.join('\n')], { type: 'audio/x-mpegurl' }), filename + '.m3u8')
}

// Shared by playlist export and track downloads: the browser saves what we hand it.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

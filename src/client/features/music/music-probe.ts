import { isVideoMime } from '@shared/music-media'

// Containers the browser never decodes must not hang the serial upload chain forever.
const PROBE_TIMEOUT_MS = 8_000

export function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    // An <audio> element refuses containers that carry a video track, so the probe
    // has to match the kind the library will later play this file as.
    const media: HTMLMediaElement = isVideoMime(file.type) ? document.createElement('video') : new Audio()
    let settled = false
    let timer = 0
    const finish = (value: number): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      media.removeAttribute('src')
      resolve(value)
    }
    timer = window.setTimeout(() => finish(0), PROBE_TIMEOUT_MS)
    media.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0)
    })
    media.addEventListener('error', () => finish(0))
    media.src = url
  })
}

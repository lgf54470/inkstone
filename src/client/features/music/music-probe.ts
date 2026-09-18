// Containers the browser never decodes must not hang the serial upload chain forever.
const PROBE_TIMEOUT_MS = 8_000

export function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false
    let timer = 0
    const finish = (value: number): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      resolve(value)
    }
    timer = window.setTimeout(() => finish(0), PROBE_TIMEOUT_MS)
    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    })
    audio.addEventListener('error', () => finish(0))
    audio.src = url
  })
}

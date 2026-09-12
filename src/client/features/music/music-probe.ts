export function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const finish = (value: number): void => {
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      resolve(value)
    }
    audio.addEventListener('loadedmetadata', () => {
      finish(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    })
    audio.addEventListener('error', () => finish(0))
    audio.src = url
  })
}

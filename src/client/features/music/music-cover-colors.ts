// FEA-C2: the immersive player's gradient mode samples the cover's own colors.
// The canvas read lives in the component; this module keeps the pixel math pure
// and testable — an average for the light stop, its darkened pair for the far stop,
// so lyric text painted over the scrim keeps its token contrast.

export function coverGradientFromPixels(data: Uint8ClampedArray): string | null {
  const pixels = data.length / 4
  if (pixels === 0) return null
  let red = 0
  let green = 0
  let blue = 0
  for (let index = 0; index < data.length; index += 4) {
    red += data[index]!
    green += data[index + 1]!
    blue += data[index + 2]!
  }
  const average = {
    r: Math.round(red / pixels),
    g: Math.round(green / pixels),
    b: Math.round(blue / pixels),
  }
  const dark = { r: Math.round(average.r * 0.45), g: Math.round(average.g * 0.45), b: Math.round(average.b * 0.45) }
  return `linear-gradient(135deg, rgb(${average.r}, ${average.g}, ${average.b}), rgb(${dark.r}, ${dark.g}, ${dark.b}))`
}

export function coverGradientFromUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const size = 16
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve(null)
          return
        }
        context.drawImage(image, 0, 0, size, size)
        resolve(coverGradientFromPixels(context.getImageData(0, 0, size, size).data))
      } catch {
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

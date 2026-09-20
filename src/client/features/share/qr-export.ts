import { QR_BG_COLOR } from '../../lib/qr-colors'

// Lives outside the static barrel (SH-20): only the lazy QR modal calls these,
// and the QR_BG_COLOR import would otherwise keep the qrcode chunk inside the
// shell's static closure.

export function downloadQrSvg(svgElement: SVGElement, filename = 'share-qr.svg') {
  const xml = new XMLSerializer().serializeToString(svgElement)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function downloadQrPng(svgElement: SVGElement, filename = 'share-qr.png', size = 800) {
  const xml = new XMLSerializer().serializeToString(svgElement)
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  img.crossOrigin = 'anonymous'

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = QR_BG_COLOR
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, 0, 0, size, size)

  URL.revokeObjectURL(url)

  canvas.toBlob((blob) => {
    if (!blob) return
    const pngUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(pngUrl)
  }, 'image/png')
}

export async function copyQrImageToClipboard(svgElement: SVGElement): Promise<boolean> {
  try {
    const xml = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.crossOrigin = 'anonymous'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 600
    const ctx = canvas.getContext('2d')
    if (!ctx) return false

    ctx.fillStyle = QR_BG_COLOR
    ctx.fillRect(0, 0, 600, 600)
    ctx.drawImage(img, 0, 0, 600, 600)

    URL.revokeObjectURL(url)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    if (!blob) return false

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob }),
    ])
    return true
  } catch {
    return false
  }
}

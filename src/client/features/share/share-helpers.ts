const QR_CANVAS_BACKGROUND = '#ffffff'

export function countryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode === 'UNKNOWN' || countryCode.length !== 2) {
    return '🌐'
  }
  const code = countryCode.toUpperCase()
  return code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

export function countryNameLocalized(countryCode: string | null | undefined, locale = 'zh-CN'): string {
  if (!countryCode || countryCode === 'UNKNOWN') return countryCode || ''
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' })
    return names.of(countryCode.toUpperCase()) || countryCode
  } catch {
    return countryCode
  }
}

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

  ctx.fillStyle = QR_CANVAS_BACKGROUND
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

    ctx.fillStyle = QR_CANVAS_BACKGROUND
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

export function generateRandomSlug(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstvwxyz'
  let res = ''
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(Math.random() * chars.length)]
  }
  return res
}

export function exportVisitsToCsv(visits: Array<{
  id: number
  visitedAt: number
  noteTitle?: string
  slug: string
  country?: string | null
  city?: string | null
  referrer?: string | null
  referrerHost?: string | null
  deviceType?: string | null
  os?: string | null
  browser?: string | null
  isBot?: boolean
  botName?: string | null
  isOwner?: boolean
  isSelfReferrer?: boolean
}>, filename = 'share-visits.csv') {
  const headers = [
    'ID',
    'Time',
    'Note Title',
    'Slug',
    'Country',
    'City',
    'Referrer',
    'Referrer Host',
    'Device',
    'OS',
    'Browser',
    'Type',
  ]
  const rows = visits.map((v) => [
    v.id,
    new Date(v.visitedAt).toISOString(),
    `"${(v.noteTitle || '').replace(/"/g, '""')}"`,
    v.slug,
    v.country || '',
    v.city || '',
    `"${(v.referrer || '').replace(/"/g, '""')}"`,
    v.referrerHost || '',
    v.deviceType || '',
    v.os || '',
    v.browser || '',
    v.isBot ? `Bot (${v.botName || 'Crawler'})` : v.isOwner ? 'Author' : v.isSelfReferrer ? 'Self' : 'Real',
  ])
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

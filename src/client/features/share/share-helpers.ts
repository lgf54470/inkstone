import { t } from '../../lib/i18n'

export function countryFlag(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode === 'UNKNOWN' || countryCode.length !== 2) {
    return '🌐'
  }
  const code = countryCode.toUpperCase()
  return code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
}

const displayNamesByLocale = new Map<string, Intl.DisplayNames>()

function regionNames(locale: string): Intl.DisplayNames {
  const cached = displayNamesByLocale.get(locale)
  if (cached) return cached
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  displayNamesByLocale.set(locale, names)
  return names
}

export function countryNameLocalized(countryCode: string | null | undefined, locale: string): string {
  if (!countryCode || countryCode === 'UNKNOWN') return t('share.country_unknown')
  try {
    return regionNames(locale).of(countryCode.toUpperCase()) || countryCode
  } catch {
    return countryCode
  }
}

export function localizeReferrerName(name: string): string {
  return name === 'Direct' ? t('share.direct_access') : name
}

export function localizeEnvName(name: string | null | undefined): string {
  if (!name || name.toLowerCase() === 'other') return t('share.env_unknown')
  return name
}

export function generateRandomSlug(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstvwxyz'
  let res = ''
  for (let i = 0; i < length; i++) {
    res += chars[Math.floor(Math.random() * chars.length)]
  }
  return res
}

const CSV_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g
const CSV_FORMULA_LEAD = /^[=+\-@]/

/**
 * RFC 4180 cell: always quoted, embedded quotes doubled, so a comma, a quote or
 * a line break can never split a visit into extra columns or rows. Controlling
 * characters become spaces (these fields are all single line values) and a
 * leading =, +, - or @ gets an apostrophe so a spreadsheet shows the text
 * instead of evaluating a remote formula (CSV injection).
 */
function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? '').replace(CSV_CONTROL_CHARS, ' ')
  const safe = CSV_FORMULA_LEAD.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function exportVisitsToCsv(visits: Array<{
  id: number
  visitedAt: number
  noteTitle?: string | null
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
    v.noteTitle || '',
    v.slug,
    v.country || '',
    v.city || '',
    v.referrer || '',
    v.referrerHost || '',
    v.deviceType || '',
    v.os || '',
    v.browser || '',
    v.isBot ? `Bot (${v.botName || 'Crawler'})` : v.isOwner ? 'Author' : v.isSelfReferrer ? 'Self' : 'Real',
  ])
  const csvContent =
    '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
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

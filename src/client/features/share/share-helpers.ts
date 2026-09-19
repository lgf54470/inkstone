import { prompt } from '../../components/overlay'
import { t } from '../../lib/i18n'


// The wipe-all-logs endpoint requires the current password (SH-12); both clean
// entry points ask through this single prompt so wording stays identical.
export async function promptWipePassword(): Promise<string | null> {
  return prompt({
    title: t('share.verify_password_title'),
    description: t('share.verify_password_clear_all'),
    type: 'password',
    autoComplete: 'current-password',
    confirmLabel: t('share.clean_now'),
  })
}


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

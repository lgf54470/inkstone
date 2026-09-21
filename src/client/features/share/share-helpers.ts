import type { ShareTimelineRange } from '@shared/types'
import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED } from '@shared/share-channel'
import type { VisitLogFilter } from '@shared/share-selection'
import { t } from '../../lib/i18n'

/**
 * The traffic classes a visit list can be narrowed to. It is the shared vocabulary rather than a local
 * union, because the browsing hook, the CSV export walk and the worker's log query all have to agree
 * on what "bot" means — that agreement is what the export of a filtered view rests on.
 */
export type VisitFilter = VisitLogFilter

/**
 * The ranges every share analytics surface offers, in one place: the dashboard's segmented control
 * and the single-note modal both draw this list, so "30d" can never mean two different windows.
 */
export function rangeOptions(): Array<{ value: ShareTimelineRange; label: string }> {
  return [
    { value: '24h', label: '24h' },
    { value: '7d', label: '7d' },
    { value: '30d', label: '30d' },
    { value: 'all', label: t('share.range_all') },
  ]
}

/**
 * The names in the channel split (ADR-0004). The two reserved names become copy; anything else is
 * a token the owner wrote, rendered as text by React and never through a markup API — the stored
 * value is charset-bounded, but the display path does not rely on that alone.
 *
 * `label` is the one name the client cannot derive: a directory's marker is `collection-<slug>`, and
 * the collection's title lives in the account's records, so the worker resolves it (SH-82's rule:
 * the marker ships as a token, the name ships only when the worker can prove it).
 */
export function localizeChannelName(name: string, label?: string): string {
  if (label) return t('share.channel_collection_row', { title: label })
  if (name === CHANNEL_UNMARKED) return t('share.channel_none')
  if (name === CHANNEL_UNRECOGNIZED) return t('share.channel_unrecognized')
  return name
}

/**
 * What to say about unique visitors, in one place: the log table and the sessions panel describe the
 * same caliber, and an instance that keeps no visitor fingerprint has no caliber to describe — every
 * visit is its own row there, and there is no fingerprint to count anyone from.
 */
export function visitorCountNote(fingerprints: boolean): string {
  return t(fingerprints ? 'share.visitor_count_note' : 'share.visitor_count_note_no_fingerprints')
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

/**
 * How the three traffic switches read as one sentence. The badge and the exported CSV both state
 * this, and a file that describes the filters differently from the screen is worse than no file.
 */
export function trafficFilterLabel(
  excludeBots: boolean,
  excludeSelfReferrers: boolean,
  excludeOwner: boolean,
): string {
  if (excludeBots) return t('share.filter_real_visitors_badge')
  if (!excludeSelfReferrers && !excludeOwner) return t('share.filter_all_traffic_badge')
  return t('share.filter_custom_traffic_badge')
}

export function localizeReferrerName(name: string): string {
  return name === 'Direct' ? t('share.direct_access') : name
}

export function localizeEnvName(name: string | null | undefined): string {
  if (!name || name.toLowerCase() === 'other') return t('share.env_unknown')
  return name
}

/**
 * The three device classes the breakdown card names in words. Shared with the dashboard export so a
 * file that leaves the app says "Desktop" where the card said "Desktop", not the raw `desktop`.
 */
export function localizeDeviceName(name: string): string {
  if (name === 'desktop') return t('share.device_desktop')
  if (name === 'mobile') return t('share.device_mobile')
  if (name === 'tablet') return t('share.device_tablet')
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
export function csvCell(value: string | number | null | undefined): string {
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
  channel?: string | null
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
    // Appended last so an existing script that reads the columns before it by position keeps
    // working (ADR-0004).
    'Channel',
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
    v.channel || '',
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

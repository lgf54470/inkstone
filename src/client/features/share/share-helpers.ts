import type { ShareTimelineRange } from '@shared/types'
import { CHANNEL_UNMARKED, CHANNEL_UNRECOGNIZED } from '@shared/share-channel'
import type { VisitLogFilter } from '@shared/share-selection'
import { t } from '../../lib/i18n'
import { localizePlatformName } from '../../lib/visitor-geo'
import { csvCell, toCsv } from '../../lib/csv'

// Kept re-exported here because this module was the original home of the escaping rules and its
// callers (the visit log export) still ask it for them.
export { csvCell, toCsv }

// Sunk into lib: the blog dashboard draws the same labels and must not import this barrel for them.
export { countryFlag, countryNameLocalized, localizeDeviceName, localizeReferrerName } from '../../lib/visitor-geo'

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

export function localizeEnvName(name: string | null | undefined): string {
  return localizePlatformName(name, t('share.env_unknown'))
}

const SLUG_CHARSET = '23456789abcdefghjkmnpqrstvwxyz'
// The largest multiple of the charset size that still fits a byte: rejecting the tail keeps
// `byte % 30` uniform, which plain `Math.random()` also managed but a CSPRNG demands explicitly.
const SLUG_REJECT_FROM = 256 - (256 % SLUG_CHARSET.length)

/**
 * The dice button next to the custom-slug field. The slug becomes a public URL, so the suggestion
 * comes from `crypto.getRandomValues` rather than `Math.random` — the server generates its own
 * 20-character slug for auto-shares, but a suggestion a person can accept outright should not be
 * the weakest link in the chain.
 */
export function generateRandomSlug(length = 6): string {
  let slug = ''
  const bytes = new Uint8Array(length)
  while (slug.length < length) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (slug.length === length) break
      if (byte < SLUG_REJECT_FROM) slug += SLUG_CHARSET[byte % SLUG_CHARSET.length]
    }
  }
  return slug
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
  // Localized headers, so a file that leaves the app speaks the reader's language the same way the
  // dashboard export does. Channel stays appended last so an existing script that reads the columns
  // before it by position keeps working (ADR-0004).
  const headers = [
    t('share.export_col_id'),
    t('share.export_col_time'),
    t('share.export_col_note_title'),
    t('share.export_col_slug'),
    t('share.export_col_country'),
    t('share.export_col_city'),
    t('share.export_col_referrer'),
    t('share.export_col_referrer_host'),
    t('share.export_col_device'),
    t('share.export_col_os'),
    t('share.export_col_browser'),
    t('share.export_col_type'),
    t('share.export_col_channel'),
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
    toCsv([headers, ...rows])
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

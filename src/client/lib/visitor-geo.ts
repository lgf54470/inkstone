import { t } from './i18n'

/**
 * The country and device labels both analytics surfaces draw. They live here rather than in the share
 * feature's helpers because the blog dashboard needs exactly these two answers and used to import
 * the whole share barrel for them, which dragged the share modals into the blog chunk.
 */

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
 * A browser or OS name is a proper noun the UA parser read off the header, with one exception: its
 * own `'Other'` sentinel means it could not read one. That sentinel is a value, not a name, so it
 * becomes the caller's word for "unknown" — as does a missing column. The caller passes that word
 * because the share and blog surfaces word it differently (`share.env_unknown` vs `blog.env_unknown`).
 */
export function localizePlatformName(name: string | null | undefined, fallback: string): string {
  const value = name?.trim()
  return !value || value.toLowerCase() === 'other' ? fallback : value
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

/**
 * The referrer breakdown's `'Direct'` is the server's sentinel for "no referrer at all": a value, not
 * a host. It read as a host name in the blog dashboard, which drew the raw string while the share
 * dashboard had this mapping — moving it next to its siblings is what lets both ask once.
 */
export function localizeReferrerName(name: string): string {
  return name === 'Direct' ? t('share.direct_access') : name
}

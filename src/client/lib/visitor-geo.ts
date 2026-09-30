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
 * The three device classes the breakdown card names in words. Shared with the dashboard export so a
 * file that leaves the app says "Desktop" where the card said "Desktop", not the raw `desktop`.
 */
export function localizeDeviceName(name: string): string {
  if (name === 'desktop') return t('share.device_desktop')
  if (name === 'mobile') return t('share.device_mobile')
  if (name === 'tablet') return t('share.device_tablet')
  return name
}

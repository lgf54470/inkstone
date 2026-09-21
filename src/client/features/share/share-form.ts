import { t } from '../../lib/i18n'
import { LIMITS } from '@shared/constants'

export const KEEP_CURRENT_EXPIRY = 'current'

/**
 * The expiry choices the module offers, in one place: {never, a day, a week, a month}. The share
 * editor and the collection publishing dialog both read them, so "a week from now" cannot mean two
 * different spans depending on which surface asked.
 */
export function shareExpiryOptions(): { value: string; label: string }[] {
  return [
    { value: '0', label: t('share.never_expires') },
    { value: String(24 * 3600000), label: t('share.1_day') },
    { value: String(7 * 24 * 3600000), label: t('share.7_days') },
    { value: String(30 * 24 * 3600000), label: t('share.30_days') },
  ]
}

export function expiresInForSelection(selection: string): number | null | undefined {
  if (selection === KEEP_CURRENT_EXPIRY) return undefined
  const milliseconds = Number(selection)
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : null
}

const CUSTOM_SLUG_PATTERN = new RegExp(
  `^[a-zA-Z0-9_-]{${LIMITS.shareSlugMinLength},${LIMITS.shareSlugMaxLength}}$`,
)

/**
 * The client half of the custom slug rule: the same LIMITS the server enforces,
 * so the hint a person reads can never promise a length the API then rejects.
 */
export function isValidCustomSlugFormat(value: string): boolean {
  return CUSTOM_SLUG_PATTERN.test(value)
}

export function needsNewSharePasscode(
  enabled: boolean,
  alreadyProtected: boolean,
  passcode: string,
): boolean {
  if (!enabled) return false
  if (!alreadyProtected && passcode.length === 0) return true
  // A new or replaced passcode must meet LIMITS.sharePasscodeMinLength (the
  // server enforces the same minimum); short codes are trivially brute-forced.
  return passcode.length > 0 && passcode.length < LIMITS.sharePasscodeMinLength
}


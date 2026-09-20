import { LIMITS } from '@shared/constants'

export const KEEP_CURRENT_EXPIRY = 'current'

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


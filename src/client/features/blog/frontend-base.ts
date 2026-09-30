import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import { safeExternalUrl } from '@shared/url-safety'

/**
 * The blog's own site address, as a link may carry it.
 *
 * The stored value is checked on the way in, but a blog configured before that rule existed still
 * holds whatever was typed, and this address becomes an `href` in the admin session — so a value a
 * link may not use falls back to the shipped default instead of being rendered as written.
 */
export function blogFrontendBase(frontendUrl: string | null | undefined): string {
  const base = safeExternalUrl(frontendUrl) ?? DEFAULT_BLOG_FRONTEND_URL
  return base.replace(/\/+$/, '')
}

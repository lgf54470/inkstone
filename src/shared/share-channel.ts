/**
 * The distribution marker a public link can carry (`?ref=<token>`). Its only job is to answer
 * "which copy of this link did this visit come from" for links the owner sends to several places,
 * which the `Referer` header cannot answer: chat apps, mail clients and QR scans send none, and
 * an in-app tap is a self-referrer (excluded by default).
 *
 * The character set is the privacy mechanism, not a formatting preference. Whatever does not
 * match is refused at the door, so free text — a name, an address, a campaign string with spaces
 * — can never be stored in the column. See ADR-0004.
 */

/** 1–32 chars of `[a-z0-9_-]`, starting with a letter or digit. */
const CHANNEL_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

/**
 * The two names the dashboard uses for visits that carry no usable marker, kept here so the
 * worker that produces them and the client that labels them cannot drift.
 *
 * A valid token always starts with a letter or digit, so a name beginning with `_` can never be
 * a marker someone stored: the namespace cannot be squatted by choosing `?ref=__unmarked__`.
 */
export const CHANNEL_UNMARKED = '__unmarked__'
export const CHANNEL_UNRECOGNIZED = '__unrecognized__'

/** The token itself when it is well formed, otherwise null. */
export function normalizeChannelToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return CHANNEL_TOKEN_PATTERN.test(raw) ? raw : null
}

/** Whether a name out of a breakdown is one of the two reserved labels rather than a real marker. */
export function isReservedChannelName(name: string): boolean {
  return name === CHANNEL_UNMARKED || name === CHANNEL_UNRECOGNIZED
}

/**
 * What the `channel` column stores for one visit:
 *
 * - `null` — the request carried no `ref` at all;
 * - `''` — it carried one that is not a valid token. The visit is still logged (a visitor must not
 *   see an error because the owner mistyped a URL), and the dashboard reports the miss in its own
 *   row rather than folding it into "unmarked" — a marker that silently stops working is exactly
 *   the failure rule 2 exists to prevent;
 * - the token — the marker was well formed.
 *
 * Nothing derived from a rejected value is stored: the raw string never reaches the database. The
 * presence of the parameter is expressed by the field being a string at all, so no separate flag
 * travels with it.
 */
export function storedChannelValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return normalizeChannelToken(raw) ?? ''
}

/**
 * Adds the marker to a share URL. Returns the URL untouched for an absent or malformed marker, so
 * a distribution surface never hands out a link carrying a token the visitor's page would reject.
 */
export function withChannelParam(url: string, raw: unknown): string {
  const token = normalizeChannelToken(raw)
  if (!token) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}ref=${token}`
}

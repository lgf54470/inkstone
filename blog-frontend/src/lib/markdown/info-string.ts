/**
 * Shared scanning of a fence's info string. Mirrors the root app's
 * src/client/lib/markdown/renderer/info-string.ts: the code block options, the
 * example split options and the container option parsers all read the same
 * vocabulary and must agree on how `~~~ts {line-numbers title="x"}` is tokenized
 * (a leading brace group counts as one token even though it holds several).
 */

/** The info string's tokens; a leading brace group counts as one, quoted values stay with their key. */
export function infoTokens(info: string): string[] {
  const trimmed = info.trim()
  const leading = /^(\{[^{}]*\})\s*/.exec(trimmed)
  if (!leading) return trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
  const rest = trimmed.slice(leading[0].length)
  return [leading[1]!, ...(rest.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [])]
}

export function isBraceGroup(token: string): boolean {
  return token.startsWith('{') && token.endsWith('}')
}

/** The tokens inside a brace group, on the same rules as the info string itself. */
export function braceTokens(token: string): string[] {
  return isBraceGroup(token)
    ? token.slice(1, -1).trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? []
    : []
}

/** `key=value` split out of a token; a bare flag has no key. */
export function infoOption(token: string): { key: string; value: string } | null {
  const clean = token.replace(/^["']|["']$/g, '').trim()
  const separator = clean.indexOf('=')
  if (separator === -1) return null
  return {
    key: clean.slice(0, separator).toLowerCase().trim(),
    value: clean.slice(separator + 1).trim().replace(/^["']|["']$/g, ''),
  }
}

/** A bare flag or `.class` token, lowercased without its leading dot. */
export function infoFlag(token: string): string {
  return token.replace(/^["']|["']$/g, '').replace(/^\./, '').toLowerCase().trim()
}

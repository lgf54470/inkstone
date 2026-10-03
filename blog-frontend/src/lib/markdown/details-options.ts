/**
 * What a `::: details` container says about itself, mirroring the root app's
 * renderer/details-options.ts: the title, whether it starts open (the `open` / `+`
 * flag) and which chrome it draws with (`variant=card|plain`).
 */

export type DetailsVariant = 'default' | 'card' | 'plain'

export interface DetailsOptions {
  title: string
  open: boolean
  variant: DetailsVariant
}

export const DETAILS_OPTION_DEFAULTS: DetailsOptions = { title: '', open: false, variant: 'default' }

const VARIANTS: Record<string, DetailsVariant> = { default: 'default', card: 'card', plain: 'plain' }

// The active prefix has no word boundary to lean on: "+" and ":" are non-word characters,
// so a boundary never meets the space that follows them.
const LEADING_FLAG = /^(?:open\b|\+)[ \t]*/

function stripManaged(info: string): string {
  return info
    .replace(LEADING_FLAG, '')
    .replace(/(?:^|\s)variant=(?:"[^"]*"|'[^']*'|[^\s]+)/g, ' ')
    .trim()
}

export function stripBracketTitle(value: string): string {
  const trimmed = value.trim()
  return /^\[[\s\S]*\]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed
}

/** Reads the header the container writes: the flags, the variant, and the rest as the title. */
export function parseDetailsOptions(info: string): DetailsOptions {
  const variantMatch = /(?:^|\s)variant=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(info)
  const variant = VARIANTS[(variantMatch?.[1] ?? variantMatch?.[2] ?? variantMatch?.[3] ?? '').toLowerCase()]
  return {
    title: stripBracketTitle(stripManaged(info)),
    open: LEADING_FLAG.test(info.trim()),
    variant: variant ?? DETAILS_OPTION_DEFAULTS.variant,
  }
}

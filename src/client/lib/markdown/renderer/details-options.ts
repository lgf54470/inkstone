import { t } from '../../i18n'

/**
 * What a `::: details` container lets the note say about itself: the title, whether it starts open
 * (the `open` / `+` flag the container has always taken) and which chrome it draws with. The header
 * line is the block's whole state, so the settings toolbar rewrites exactly that line.
 */

export type DetailsVariant = 'default' | 'card' | 'plain'

export interface DetailsOptions {
  title: string
  open: boolean
  variant: DetailsVariant
}

export const DETAILS_OPTION_DEFAULTS: DetailsOptions = { title: '', open: false, variant: 'default' }

const VARIANTS: Record<string, DetailsVariant> = { default: 'default', card: 'card', plain: 'plain' }

// The active prefix has no word boundary to lean on: "+" and ":" are non-word characters, so a
// boundary never meets the space that follows them.
const LEADING_FLAG = /^(?:open\b|\+)[ \t]*/

function stripManaged(info: string): string {
  return info
    .replace(LEADING_FLAG, '')
    .replace(/(?:^|\s)variant=(?:"[^"]*"|'[^']*'|[^\s]+)/g, ' ')
    .trim()
}

function stripBracketTitle(value: string): string {
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

/** The header with the managed parts put back; a default variant is dropped rather than written. */
export function formatDetailsOptions(options: DetailsOptions): string {
  return [
    options.open ? 'open' : '',
    options.variant !== DETAILS_OPTION_DEFAULTS.variant ? `variant=${options.variant}` : '',
    options.title.trim(),
  ].filter(Boolean).join(' ')
}

/** The summary text to draw, with the container's own fallback for an unnamed block. */
export function detailsTitle(options: DetailsOptions): string {
  return options.title || t('markdown.details')
}

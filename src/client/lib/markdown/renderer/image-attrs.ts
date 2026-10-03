import { braceTokens, infoFlag, infoOption } from './info-string'

export type ImageAlign = 'left' | 'center' | 'right' | 'float-left' | 'float-right'

export interface ImageAttrs {
  widthPct?: number
  widthPx?: number
  heightPx?: number
  align?: ImageAlign
  border?: boolean
  shadow?: boolean
  radius?: boolean
  bare?: boolean
}

/** The sizes the drag can land on: coarse enough that the source stays readable and the image stays responsive. */
export const IMAGE_WIDTH_SNAP_STEPS = [25, 33, 50, 66, 75, 100] as const

const IMAGE_ALIGNS: readonly string[] = ['left', 'center', 'right', 'float-left', 'float-right']

export function isImageAlign(value: string): value is ImageAlign {
  return IMAGE_ALIGNS.includes(value)
}

/**
 * Percentages CSS can apply without reading an attribute value back. Anything finer would need an
 * inline style, which the prose sanitizer forbids, so the vocabulary deliberately stops here and an
 * off-grid value stays visible in the source instead of being quietly rounded.
 */
export function isImageWidthPercent(value: number): boolean {
  return Number.isInteger(value) && value >= 5 && value <= 100 &&
    (value % 5 === 0 || value === 33 || value === 66)
}

export function hasImageAttrs(attrs: ImageAttrs): boolean {
  return attrs.widthPct !== undefined || attrs.widthPx !== undefined || attrs.heightPx !== undefined ||
    attrs.align !== undefined || attrs.border === true || attrs.shadow === true ||
    attrs.radius === true || attrs.bare === true
}

interface Length {
  px?: number
  pct?: number
  auto?: boolean
}

function parseLength(value: string): Length | null {
  if (value.toLowerCase() === 'auto') return { auto: true }
  const match = /^(\d+(?:\.\d+)?)(px|%)$/.exec(value)
  if (!match) return null
  const number = Number(match[1])
  if (!Number.isFinite(number) || number <= 0) return null
  return match[2] === 'px' ? { px: Math.round(number) } : { pct: number }
}

function clearWidth(attrs: ImageAttrs): void {
  delete attrs.widthPct
  delete attrs.widthPx
}

function applyWidthLength(attrs: ImageAttrs, length: Length): boolean {
  if (length.auto) {
    clearWidth(attrs)
    return true
  }
  if (length.px !== undefined) {
    clearWidth(attrs)
    attrs.widthPx = length.px
    return true
  }
  if (length.pct === undefined || !isImageWidthPercent(length.pct)) return false
  clearWidth(attrs)
  attrs.widthPct = length.pct
  return true
}

function applyHeightLength(attrs: ImageAttrs, length: Length): boolean {
  if (length.auto) return true
  if (length.pct !== undefined) return false
  if (length.px === undefined) return false
  attrs.heightPx = length.px
  return true
}

function applyFlag(attrs: ImageAttrs, flag: string): boolean {
  if (flag === 'border') return (attrs.border = true)
  if (flag === 'shadow') return (attrs.shadow = true)
  if (flag === 'radius') return (attrs.radius = true)
  return false
}

function applyOption(attrs: ImageAttrs, key: string, value: string): boolean {
  if (key === 'frame') return value.toLowerCase() === 'none' ? (attrs.bare = true) : false
  if (key === 'align') {
    if (!isImageAlign(value.toLowerCase())) return false
    attrs.align = value.toLowerCase() as ImageAlign
    return true
  }
  const length = parseLength(value)
  if (!length) return false
  return key === 'width' ? applyWidthLength(attrs, length) : key === 'height' ? applyHeightLength(attrs, length) : false
}

export interface ImageAttrParse {
  attrs: ImageAttrs
  /** Tokens outside the vocabulary. A group is only consumed when this comes back empty. */
  unknown: string[]
}

export function parseImageAttrTokens(tokens: string[]): ImageAttrParse {
  const attrs: ImageAttrs = {}
  const unknown: string[] = []
  for (const token of tokens) {
    const option = infoOption(token)
    const handled = option
      ? applyOption(attrs, option.key, option.value)
      : applyFlag(attrs, infoFlag(token))
    if (!handled) unknown.push(token)
  }
  return { attrs, unknown }
}

/** The tokens inside a trailing `{…}` group, on the same rules as a fence info string. */
export function parseImageAttrGroup(group: string): ImageAttrParse {
  return parseImageAttrTokens(braceTokens(group))
}

export function serializeImageAttrTokens(attrs: ImageAttrs): string[] {
  const tokens: string[] = []
  if (attrs.widthPx !== undefined) tokens.push(`width=${attrs.widthPx}px`)
  else if (attrs.widthPct !== undefined) tokens.push(`width=${attrs.widthPct}%`)
  if (attrs.heightPx !== undefined) tokens.push(`height=${attrs.heightPx}px`)
  if (attrs.align) tokens.push(`align=${attrs.align}`)
  if (attrs.border) tokens.push('border')
  if (attrs.shadow) tokens.push('shadow')
  if (attrs.radius) tokens.push('radius')
  if (attrs.bare) tokens.push('frame=none')
  return tokens
}

/** The canonical form the editor writes; empty when nothing is set, so the group disappears. */
export function formatImageAttrs(attrs: ImageAttrs): string {
  const tokens = serializeImageAttrTokens(attrs)
  return tokens.length > 0 ? `{${tokens.join(' ')}}` : ''
}

export function mergeImageAttrs(base: ImageAttrs, override: ImageAttrs): ImageAttrs {
  const merged: ImageAttrs = { ...base }
  if (override.widthPx !== undefined || override.widthPct !== undefined) clearWidth(merged)
  for (const key of ['widthPx', 'widthPct', 'heightPx', 'align', 'border', 'shadow', 'radius', 'bare'] as const) {
    if (override[key] !== undefined) merged[key] = override[key] as never
  }
  return merged
}

/**
 * HTML attributes carrying the state to CSS. Pixel sizes ride the native `width`/`height`
 * attributes because prose only constrains `max-width` and `height`, so a presentational
 * `width` still applies; `data-image-height` is the same value for the enhancer, which has to
 * win back the height that the prose `height: auto` rule takes from the attribute.
 */
export function imageAttrMarkup(attrs: ImageAttrs): Record<string, string> {
  const markup: Record<string, string> = {}
  if (attrs.widthPx !== undefined) markup.width = String(attrs.widthPx)
  if (attrs.widthPct !== undefined) markup['data-image-width'] = String(attrs.widthPct)
  if (attrs.heightPx !== undefined) {
    markup.height = String(attrs.heightPx)
    markup['data-image-height'] = String(attrs.heightPx)
  }
  if (attrs.align) markup['data-image-align'] = attrs.align
  if (attrs.border) markup['data-image-border'] = '1'
  if (attrs.shadow) markup['data-image-shadow'] = '1'
  if (attrs.radius) markup['data-image-radius'] = '1'
  if (attrs.bare) markup['data-image-frame'] = 'none'
  return markup
}

// No whitespace requirement before the `#`: Cherry's own examples write `![caption#100px](src)`
// with the flag glued to the caption, and a segment that matches nothing simply stays put.
const CHERRY_FLAG = /#([^\s#]+)/g

function applyCherryFlag(attrs: ImageAttrs, token: string, sizeIndex: number): boolean {
  const length = parseLength(token)
  if (length) {
    if (sizeIndex === 0) return applyWidthLength(attrs, length)
    if (sizeIndex === 1) return applyHeightLength(attrs, length)
    return false
  }
  if (isImageAlign(token.toLowerCase())) {
    attrs.align = token.toLowerCase() as ImageAlign
    return true
  }
  // Cherry's short forms are case-sensitive on purpose: `#Big` is part of a caption, not a border.
  if (token === 'B' || token === 'border') return (attrs.border = true)
  if (token === 'S' || token === 'shadow') return (attrs.shadow = true)
  if (token === 'R' || token === 'radius') return (attrs.radius = true)
  return false
}

function withoutSpans(text: string, spans: [number, number][]): string {
  if (spans.length === 0) return text
  let cut = 0
  let result = ''
  for (const [start, end] of spans) {
    result += text.slice(cut, start)
    cut = end
  }
  return `${result}${text.slice(cut)}`.replace(/[ \t]{2,}/g, ' ').trim()
}

/**
 * Reads the flags Cherry keeps inside the alt text (`![caption#100px#left#B](src)`) and returns the
 * alt without them. The flags are recognized by shape rather than by position, so a caption that
 * happens to contain `#1` or `C#` survives untouched — unlike Cherry, which rewrites from the
 * first `#` to the closing bracket and eats the rest of the caption.
 */
export function parseCherryImageFlags(alt: string): { alt: string; attrs: ImageAttrs } {
  const attrs: ImageAttrs = {}
  const spans: [number, number][] = []
  let sizeIndex = 0
  CHERRY_FLAG.lastIndex = 0
  for (let match = CHERRY_FLAG.exec(alt); match; match = CHERRY_FLAG.exec(alt)) {
    const token = match[1]!
    if (!applyCherryFlag(attrs, token, sizeIndex)) continue
    sizeIndex += parseLength(token) ? 1 : 0
    spans.push([match.index, match.index + token.length + 1])
  }
  return { alt: withoutSpans(alt, spans), attrs }
}

import MarkdownIt from 'markdown-it'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import { escapeHtml } from '@shared/escape'
import { t } from '../../i18n'
import { isCrossOriginUrl } from '../external-images'
import {
  imageAttrMarkup,
  mergeImageAttrs,
  parseCherryImageFlags,
  parseImageAttrGroup,
  type ImageAttrParse,
} from './image-attrs'
import { setTokenAttribute } from './obsidian'
import { renderEnv } from './env'
import { escapeAttr } from './util'

export function registerMedia(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'image_attributes', applyImageAttributes)

  const defaultImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index]!
    const src = token.attrGet('src') ?? ''
    // External https images are blocked by default (privacy default; the server
    // CSP drops `https:` from img-src while preview.externalImages is off, so
    // this is defense-in-depth for raw-HTML images too). Same-origin http(s)
    // URLs, relative paths, data:/blob: keep loading, and the whole check is
    // skipped when the caller passes `{ externalImages: true }`.
    if (renderEnv(env).externalImages !== true && isCrossOriginUrl(src)) {
      // Placeholder instead of a broken <img>: the browser never loads an
      // external image while blocked, so no request leaves the origin.
      const alt = token.content ? escapeHtml(token.content) : ''
      return `<figure class="image-blocked" data-image-blocked="${escapeAttr(src)}">` +
        `<span class="image-blocked-label">${escapeHtml(t('markdown.external_image_blocked'))}</span>` +
        (alt ? `<figcaption class="image-blocked-fallback">${alt}</figcaption>` : '') +
        `</figure>`
    }
    token.attrSet('loading', 'lazy')
    token.attrSet('decoding', 'async')
    token.attrSet('referrerpolicy', 'no-referrer')
    const title = token.attrGet('title')
    const rendered = defaultImage
      ? defaultImage(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options)
    return title ? `<figure>${rendered}<figcaption>${escapeHtml(title)}</figcaption></figure>` : rendered
  }
  const defaultLink = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index]!.attrGet('href') ?? ''
    if (href.startsWith('/api/files/')) {
      tokens[index]!.attrJoin('class', 'inline-file-chip')
      tokens[index]!.attrSet('data-inline-file', 'true')
    }
    else if (/^https?:/i.test(href)) {
      tokens[index]!.attrSet('target', '_blank')
      tokens[index]!.attrSet('rel', 'noopener noreferrer')
    }
    return defaultLink
      ? defaultLink(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options)
  }
}

/**
 * Reads an image's own attribute vocabulary and writes it onto the token as HTML attributes.
 * Two spellings feed one model: a trailing `{…}` group after the closing paren, and the flags
 * Cherry keeps inside the alt text. The group wins per key, so a note that carries both reads
 * the way the more specific one says.
 */
function applyImageAttributes(state: StateCore): void {
  let paragraphLine: number | undefined
  for (const token of state.tokens) {
    if (token.map) paragraphLine = token.map[0]
    if (token.type !== 'inline' || !token.children) continue
    stampImages(state, token.children, paragraphLine)
  }
}

/**
 * The line the image itself sits on, not the line its paragraph starts on: a write-back has to
 * find this exact image in the note's current text, and a soft-wrapped paragraph puts its images
 * on different lines. Each break token is one newline, which is the only thing that moves an
 * image down inside a paragraph.
 */
function stampImages(state: StateCore, children: Token[], paragraphLine: number | undefined): void {
  let line = paragraphLine ?? 0
  let imagesOnLine = 0
  for (let position = 0; position < children.length; position++) {
    const image = children[position]!
    if (image.type === 'softbreak' || image.type === 'hardbreak') {
      line += 1
      imagesOnLine = 0
      continue
    }
    if (image.type !== 'image') continue
    const group = takeAttrGroup(children, position + 1)
    const flags = parseCherryImageFlags(plainImageAlt(image.children))
    const alt = new state.Token('text', '', 0)
    alt.content = flags.alt
    image.children = [alt]
    image.content = flags.alt
    const attrs = mergeImageAttrs(flags.attrs, group?.attrs ?? {})
    for (const [name, value] of Object.entries(imageAttrMarkup(attrs))) {
      setTokenAttribute(image, name, value)
    }
    setTokenAttribute(image, 'data-image-index', String(imagesOnLine++))
    if (paragraphLine !== undefined) setTokenAttribute(image, 'data-image-line', String(line))
  }
}

/**
 * The alt as markdown-it will finally write it: its own image rule rebuilds the attribute from
 * the children as plain text at render time, so the flags have to be read out of that same
 * flattening rather than out of the raw source text.
 */
function plainImageAlt(children: Token[] | null): string {
  if (!children) return ''
  return children
    .filter((child) => child.type === 'text' || child.type === 'code_inline')
    .map((child) => child.content)
    .join('')
}

/**
 * Consumes the group only when every token in it is understood; an off-grid `width=37%` stays
 * visible in the rendered note rather than being silently dropped or rounded.
 */
function takeAttrGroup(children: Token[], next: number): ImageAttrParse | null {
  const text = children[next]
  if (!text || text.type !== 'text') return null
  const match = /^[ \t]*(\{[^{}]*\})/.exec(text.content)
  if (!match) return null
  const parsed = parseImageAttrGroup(match[1]!)
  if (parsed.unknown.length > 0) return null
  text.content = text.content.slice(match[0].length)
  return parsed
}

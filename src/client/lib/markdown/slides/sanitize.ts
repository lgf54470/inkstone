/**
 * The one gate every piece of markup a slide paints goes through.
 *
 * A block's body is untrusted input: it arrives from a note, from a pasted deck, from an
 * import, or from an agent writing the fence, and the text/table/SVG paths below inject it
 * as markup rather than as text. DOMPurify is the project's sanitizer of record, and the
 * two configs here are deliberately narrower than prose's: a slide's rich text is
 * ATTRIBUTE-FREE except for an anchor's href, so a tag can only ever mean what its name
 * means, and a diagram's markup is an SVG-only allowlist with no HTML and no remote refs.
 * Sanitizing runs on the way in as well as on the way out, so what a person edits is what
 * gets stored — a note never carries the payload forward to the next reader.
 */
import DOMPurify from 'dompurify'

const RICH_TEXT_TAGS = [
  'a',
  'b',
  'br',
  'code',
  'del',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'i',
  'ins',
  'li',
  'mark',
  'ol',
  'p',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'ul',
]

const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_TAGS,
  // Only an anchor's target survives by name; DOMPurify's own URI check keeps
  // `javascript:`/`data:` out of it, so a link can only be a web address.
  ALLOWED_ATTR: ['href'],
  FORBID_TAGS: [
    'base',
    'button',
    'embed',
    'form',
    'iframe',
    'input',
    'link',
    'math',
    'meta',
    'object',
    'script',
    'select',
    'style',
    'svg',
    'template',
    'textarea',
  ],
  FORBID_ATTR: ['id', 'name', 'src', 'srcdoc', 'srcset', 'formaction', 'action', 'style'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Diagrams are SVG, so the allowlist is SVG: DOMPurify's svg profile plus the filters a
 * deck's own grain/bokeh assets use. HTML elements are not on this list, which is what
 * closes the foreign-content breakout (`<svg><rect/><meta http-equiv=refresh></svg>` and
 * friends) without naming every carrier; `foreignObject` goes with them because its
 * children ARE html. `id` stays: gradients and markers resolve through `url(#…)`.
 */
const SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // DOMPurify's svg profile refuses `use` outright, because a use that resolves OUTSIDE the
  // document instances a subtree nobody vetted. Inside it is only a reference to a symbol
  // this same markup already carries — which the walk below strips anyway when the href is
  // not an in-document id, so a deck's symbol artwork survives without that door being open.
  ADD_TAGS: ['use'],
  FORBID_TAGS: [
    'animate',
    'animatemotion',
    'animatetransform',
    'foreignobject',
    'handler',
    'listener',
    'meta',
    'script',
    'set',
    'style',
    'template',
  ],
  FORBID_ATTR: ['style'],
  ALLOW_DATA_ATTR: false,
}

/** A reference a slide may resolve without leaving the note: an in-document id or embedded bytes. */
function isLocalRef(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('data:')
}

export function sanitizeSlideRichText(html: string): string {
  const clean = DOMPurify.sanitize(html, RICH_TEXT_CONFIG)
  const template = document.createElement('template')
  template.innerHTML = clean
  for (const anchor of template.content.querySelectorAll('a[href]')) {
    // A link inside a slide opens in its own tab: following it in place would take the
    // editor (and the note being edited) away from the person who clicked it.
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }
  return template.innerHTML
}

export function sanitizeSlideSvgMarkup(markup: string): string {
  if (!markup) return ''
  const clean = DOMPurify.sanitize(markup, SVG_CONFIG)
  const template = document.createElement('template')
  template.innerHTML = clean
  // A remote reference would fetch on paint: the deck stops being offline, the reader's
  // IP leaves for a third party, and a blocked fetch is a hole in the artwork.
  for (const node of template.content.querySelectorAll('[href]')) {
    const value = node.getAttribute('href') ?? ''
    if (!isLocalRef(value)) node.removeAttribute('href')
  }
  for (const node of template.content.querySelectorAll('[xlink\\:href]')) {
    const value = node.getAttribute('xlink:href') ?? ''
    if (!isLocalRef(value)) node.removeAttribute('xlink:href')
  }
  return template.innerHTML
}

export interface SlidePastePayload {
  html: string | null
  text: string | null
}

/** Pasted text as markup, with the line breaks a plain-text paste carries. */
function textToHtml(text: string): string {
  const holder = document.createElement('div')
  holder.textContent = text
  return holder.innerHTML.replace(/\n/g, '<br>')
}

/**
 * Inserts sanitized clipboard content at the caret and returns whether there was anything
 * to insert. The caller must therefore prevent the browser's own paste whenever this
 * answers true — letting the default run would put the unsanitized markup in the same box
 * this function just cleaned. With no caret inside `target` (a paste arriving from a
 * menu, say) the content lands at the end rather than nowhere.
 */
export function pasteSlideRichText(target: HTMLElement, payload: SlidePastePayload): boolean {
  const raw = payload.html?.trim() ? payload.html : payload.text
  if (!raw) return false
  const html = payload.html?.trim() ? sanitizeSlideRichText(payload.html) : sanitizeSlideRichText(textToHtml(payload.text ?? ''))

  const selection = window.getSelection()
  const range =
    selection && selection.rangeCount > 0 && target.contains(selection.anchorNode)
      ? selection.getRangeAt(0)
      : null
  if (!range) {
    const fragment = document.createRange().createContextualFragment(html)
    target.append(fragment)
    return true
  }

  range.deleteContents()
  const fragment = range.createContextualFragment(html)
  const last = fragment.lastChild
  range.insertNode(fragment)
  if (last && selection) {
    range.setStartAfter(last)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  return true
}

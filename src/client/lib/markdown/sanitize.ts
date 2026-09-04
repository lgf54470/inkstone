/**
 * Single sanitization entry point for every HTML string the markdown pipeline
 * writes into the DOM. The main render pass (markdown-it output) and the
 * async enhancers (Prism token HTML, KaTeX output) must each go through one of
 * these helpers so no producer can bypass the whitelist by inserting DOM after
 * the initial DOMPurify pass.
 */
import DOMPurify from 'dompurify'

const PROSE_CONFIG = {
    // The renderer is the only producer of this HTML, so the whitelist is
    // exact: every tag markdown-it and the Inkstone extensions can emit,
    // nothing else. SVG/MathML/forms stay out entirely to avoid the
    // mXSS-prone element combinations; task checkboxes are re-inserted as
    // DOM nodes after sanitization, so `input` is intentionally absent.
    ALLOWED_TAGS: [
        'a', 'abbr', 'aside', 'b', 'blockquote', 'br', 'button', 'code',
        'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
        'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
        'ins', 'kbd', 'li', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'section',
        'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table',
        'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
    ],
    ADD_ATTR: [
        'data-line',
        'data-math',
        'data-mermaid',
        'data-chart',
        'data-wikilink',
        'data-embed-target',
        'data-block-ref',
        'data-block-id',
        'data-tag',
        'data-lang',
        'data-copy',
        'data-task-placeholder',
        'data-task-line',
        'data-task-checked',
        'data-task-status',
        'data-tabs',
        'data-tab-button',
        'data-tab-panel',
        'data-callout',
        'data-code-start',
        'data-line-numbers',
        'data-highlight-lines',
        'data-markdown-example',
        'data-markdown-example-id',
        'data-image-blocked',
        'data-file-card',
        'data-file-url',
        'data-file-name',
        'data-file-line',
        'data-file-action',
        'data-category',
        'data-inline-file',
        'download',
        'type',
        'target',
        'loading',
        'decoding',
        'referrerpolicy',
        'align',
        'colspan',
        'open',
        'hidden',
        'role',
        'aria-busy',
        'aria-label',
        'aria-selected',
        'aria-checked',
        'aria-controls',
        'aria-labelledby',
        'tabindex',
        'width',
        'height',
        'lang',
        'dir',
    ],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base'],
    FORBID_ATTR: [
        'style',
        'onerror',
        'onload',
        'onclick',
        'onchange',
        'oninput',
        'onfocus',
        'srcdoc',
        'formaction',
        'action',
    ],
    ALLOW_DATA_ATTR: true,
}

/**
 * Prism token HTML is produced by the Prism grammar tokenizer from code text
 * (Prism escapes `<`/`&` inside tokens, so this is defense-in-depth). Only
 * `span` tokens with their `class` survive; anything Prism ever failed to
 * escape is parsed and then dropped as an element while its text content is
 * preserved, so the visible code never changes.
 */
const CODE_CONFIG = {
    ALLOWED_TAGS: ['span'],
    ALLOWED_ATTR: ['class'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcdoc'],
    ALLOW_DATA_ATTR: false,
}

/**
 * KaTeX output spans/svg are generated from math source. `\color` values are
 * strictly validated by KaTeX (hex or lowercase names only) so the `style`
 * attributes it emits never carry attacker-controlled CSS; `\href`/`\url` are
 * inert unless `trust` is enabled, so no link-carrying attributes are needed.
 * Navigation-capable attributes are still forbidden to contain a future KaTeX
 * regression that copies user text into an attribute value.
 */
const MATH_CONFIG = {
    ALLOWED_TAGS: ['span', 'svg', 'path', 'a'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base', 'math', 'annotation', 'foreignobject', 'image'],
    FORBID_ATTR: [
        'href',
        'src',
        'xlink:href',
        'srcdoc',
        'formaction',
        'action',
        'onerror',
        'onload',
        'onclick',
        'onchange',
        'oninput',
        'onfocus',
    ],
    ALLOW_DATA_ATTR: false,
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A' && node.getAttribute('target')?.toLowerCase() === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer')
    }
})

export function sanitizeProseHtml(html: string): string {
    return DOMPurify.sanitize(html, PROSE_CONFIG)
}

export function sanitizeCodeTokenHtml(html: string): string {
    return DOMPurify.sanitize(html, CODE_CONFIG)
}

export function sanitizeMathHtml(html: string): string {
    return DOMPurify.sanitize(html, MATH_CONFIG)
}

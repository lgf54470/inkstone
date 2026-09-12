/**
 * 服务端文章 HTML 唯一净化入口：博客在 Cloudflare Workers 上服务端渲染，
 * 没有 DOM，DOMPurify 无法运行，改用纯 JS 的 sanitize-html（htmlparser2 驱动）。
 *
 * 白名单镜像根仓库 src/client/lib/markdown/sanitize.ts 的 PROSE_CONFIG 规则，
 * 差异仅有三处，均因博客在服务端直接产出这些标记（主应用在净化后用 DOM 重建）：
 * - input：任务列表复选框由核心规则直接输出，净化后保留；
 * - label：javascript-example 行号开关的标签；
 * - span/svg/path + 白名单内联样式：KaTeX 在服务端渲染，布局依赖其 strut 内联样式
 *   （主应用通过独立 MATH_CONFIG 保留同样内容）。style 仅允许在 span/svg/path 上，
 *   且属性值必须匹配 allowedStyles 白名单，其余标签一律剥离。
 */
import sanitizeHtml from 'sanitize-html'

/** 与主应用 PROSE_CONFIG.ALLOWED_TAGS 一致，另加博客服务端产出的 input/label/svg/path */
const ALLOWED_TAGS = [
  'a', 'abbr', 'aside', 'b', 'blockquote', 'br', 'button', 'code',
  'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img',
  'ins', 'kbd', 'label', 'li', 'mark', 'nav', 'ol', 'p', 'pre', 'q',
  'rp', 'rt', 'ruby', 's', 'section', 'small', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
  'input', 'svg', 'path',
]

/**
 * 属性白名单：'*' 上的常见属性 + data-* / aria-*（镜像 PROSE_CONFIG 的
 * ADD_ATTR + DOMPurify 默认属性集里本渲染器会用到的部分）。
 * href/src 仅限 a/img，并按 allowedSchemes 校验协议。
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  '*': [
    'class', 'id', 'title', 'lang', 'dir', 'role', 'tabindex', 'align',
    'colspan', 'rowspan', 'width', 'height', 'loading', 'decoding',
    'referrerpolicy', 'download', 'target', 'rel', 'type', 'open', 'hidden',
    'checked', 'disabled', 'value', 'name', 'for', 'label', 'data-*', 'aria-*',
  ],
  a: ['href'],
  img: ['src', 'alt'],
  span: ['style'],
  svg: ['style', 'xmlns', 'viewbox', 'width', 'height', 'focusable'],
  path: ['style', 'd'],
}

/**
 * KaTeX 输出的内联样式白名单：只允许纯布局数值与已验证过的 \color 值
 * （KaTeX 对 \color 只接受十六进制或小写颜色名），禁止 url()/background 等
 * 可携带脚本或外联资源的值。未匹配的属性会使整个 style 被丢弃（保守处理）。
 */
const ALLOWED_STYLES: sanitizeHtml.IOptions['allowedStyles'] = {
  '*': {
    'height': [/^-?[\d.]+em$/],
    'vertical-align': [/^-?[\d.]+em$/],
    'top': [/^-?[\d.]+em$/],
    'margin-right': [/^-?[\d.]+em$/],
    'padding-left': [/^-?[\d.]+em$/],
    'min-width': [/^-?[\d.]+em$/],
    'width': [/^-?[\d.]+em$/],
    'font-size': [/^-?[\d.]+(?:em|rem)$/],
    'left': [/^-?[\d.]+em$/],
    'position': [/^absolute$/],
    'overflow': [/^visible$/],
    'color': [/^[a-z]+$/, /^#[0-9a-fA-F]{3,8}$/],
  },
}

/**
 * 与 DOMPurify FORBID_CONTENTS 对齐：这些标签的内容一并丢弃，而不是
 * 像默认 discard 模式那样保留文本。svg 不在其中（KaTeX 需要保留其子节点）。
 */
const NON_TEXT_TAGS = [
  'style', 'script', 'textarea', 'option', 'xmp',
  'iframe', 'object', 'embed', 'math', 'noscript', 'template',
  'noembed', 'noframes', 'plaintext',
]

/**
 * sanitize-html 默认把空值属性当非法丢弃，其中包含 hidden —— 标签页用
 * `<section hidden>` 控制显隐，需要放行（checked 本身是布尔属性，不受影响）。
 */
const NON_BOOLEAN_ATTRIBUTES = sanitizeHtml.defaults.nonBooleanAttributes.filter(
  (attr) => attr !== 'hidden'
)

function addNoopenerToBlankLinks(
  _tagName: string,
  attribs: Record<string, string>
): { tagName: string; attribs: Record<string, string> } {
  if (attribs.target === '_blank') {
    attribs.rel = 'noopener noreferrer'
  }
  return { tagName: 'a', attribs }
}

/**
 * 正文图片统一懒加载：长文多图时避免瀑布下载；
 * 作者已显式书写的 loading/decoding 不覆盖。
 */
function addImageLazyLoading(
  _tagName: string,
  attribs: Record<string, string>
): { tagName: string; attribs: Record<string, string> } {
  const next = { ...attribs }
  if (!next.loading) next.loading = 'lazy'
  if (!next.decoding) next.decoding = 'async'
  return { tagName: 'img', attribs: next }
}

export function sanitizeProseHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,
    nonBooleanAttributes: NON_BOOLEAN_ATTRIBUTES,
    nonTextTags: NON_TEXT_TAGS,
    allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    transformTags: { a: addNoopenerToBlankLinks, img: addImageLazyLoading },
  })
}
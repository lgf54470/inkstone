/**
 * workerd 运行时注入的 HTMLRewriter（Cloudflare 的流式 HTML 改写 API）：middleware 用它在
 * 生产响应里给内联脚本逐个打 nonce。这里只声明实际用到的两个成员与元素方法。
 * 完整定义在 @cloudflare/workers-types 里，但那是一整套全局声明，会把浏览器侧的
 * fetch/Response 换成 workerd 版本（本项目的客户端组件与 jsdom 测试依赖 DOM 库），
 * 所以不整包引入；元素类型也不叫 Element，避免与 DOM 的 Element 合并。
 */
declare class HTMLRewriter {
  on(selector: string, handlers: { element: (element: HTMLRewriterElement) => void }): HTMLRewriter
  transform(response: Response): Response
}

interface HTMLRewriterElement {
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt, options?: Record<string, unknown>) => void
  export default plugin
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-ins' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it'
  export const full: (md: MarkdownIt, options?: { defs?: Record<string, string>; shortcuts?: Record<string, string | string[]> }) => void
  export const light: (md: MarkdownIt, options?: { defs?: Record<string, string>; shortcuts?: Record<string, string | string[]> }) => void
  export const bare: (md: MarkdownIt, options?: { defs?: Record<string, string>; shortcuts?: Record<string, string | string[]> }) => void
}

declare module 'markdown-it-deflist' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-abbr' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module 'markdown-it-ruby' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}
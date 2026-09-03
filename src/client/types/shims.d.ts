


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

declare module 'katex/dist/katex.min.css'

declare module 'prismjs/components/prism-core' {
  import Prism from 'prismjs'
  export default Prism
}

declare module 'prismjs/components/*'

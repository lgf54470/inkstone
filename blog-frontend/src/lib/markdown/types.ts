export interface TocHeading {
  level: number
  text: string
  slug: string
}

export interface RenderResult {
  html: string
  headings: TocHeading[]
}

/** 每次 render 的独立状态：渲染器实例跨请求复用，规则只经 env 读写本次状态 */
export interface RenderEnv {
  [key: string | symbol]: unknown
  headings: TocHeading[]
  /** md-example 嵌套渲染深度（顶层为 0），超过上限后不再递归 */
  mdDepth: number
}

export interface RenderOptions {
  /** 本次渲染的嵌套深度，仅供 md-example 递归调用内部使用 */
  depth?: number
}

export type CodeTheme = 'auto' | 'light' | 'dark'

export interface FenceInfo {
  language: string
  title: string
  lineNumbers: boolean
  startLine: number
  highlightedLines: number[]
  /** Long lines wrap instead of scrolling (`wrap` flag). */
  wrap: boolean
  /** Fold beyond this many lines; null follows the reading default, 0 never folds. */
  collapse: number | null
  /** Palette the block draws with; `auto` follows the page theme. */
  theme: CodeTheme
}

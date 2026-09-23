
import type { FenceBodies } from '../fence-bodies'

export interface Heading {
  level: number
  text: string
  slug: string
  line: number
}

export interface RenderResult {
  html: string
  headings: Heading[]
  /**
   * The fence bodies this markup was built from, in document order. They do not ride in the markup
   * (see `../fence-bodies`); whoever inserts the markup registers these so the blocks can read back.
   */
  fences: FenceBodies
  hasMath: boolean
  hasMermaid: boolean
  hasChart: boolean
  hasMindmap: boolean
  hasKanban: boolean
  hasBentoSlides: boolean
  hasEmbeds: boolean
  frontMatter: Record<string, unknown>
  frontMatterErrors: string[]
}
export 
interface RenderEnvironment {
  headings: Heading[]
  hasMath: boolean
  hasMermaid: boolean
  hasChart: boolean
  hasMindmap: boolean
  hasKanban: boolean
  hasBentoSlides: boolean
  hasEmbeds: boolean
  frontMatter: Record<string, unknown>
  frontMatterErrors: string[]
  taskNonce: string
  tabSequence: number
  exampleSequence: number
  /**
   * Where each rich block leaves its fence body, and the block number it gets for it: the position
   * in this set is exactly what `data-<family>-index` says, so nested renders share the outer set
   * instead of restarting the count.
   */
  fences: FenceBodies
  docId: string
  /** `true` when the caller opted into loading external https images (preview.externalImages). */
  externalImages: boolean
  hideFrontMatter?: boolean
}

export interface WikiTarget {
  raw: string
  noteTitle: string
  heading: string | null
  blockId: string | null
  alias: string | null
}

export interface FenceInfo {
  language: string
  title: string
  lineNumbers: boolean
  startLine: number
  highlightedLines: number[]
}

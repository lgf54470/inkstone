
export interface Heading {
  level: number
  text: string
  slug: string
  line: number
}

export interface RenderResult {
  html: string
  headings: Heading[]
  hasMath: boolean
  hasMermaid: boolean
  hasChart: boolean
  hasMindmap: boolean
  hasKanban: boolean
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
  hasEmbeds: boolean
  frontMatter: Record<string, unknown>
  frontMatterErrors: string[]
  taskNonce: string
  tabSequence: number
  exampleSequence: number
  /** Document-scoped block number; the mind map registry identifies blocks by it. */
  mindmapSequence: number
  /** Document-scoped block number; the whiteboard registry identifies blocks by it. */
  excalidrawSequence: number
  /** Document-scoped block number; the kanban registry identifies blocks by it. */
  kanbanSequence: number
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

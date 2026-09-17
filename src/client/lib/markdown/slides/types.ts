export const BENTO_SLIDES_FORMAT = 'bento/slides'
export const BENTO_SLIDES_VERSION = 1

export type SlideTransitionKind = 'none' | 'fade' | 'slide' | 'zoom' | 'morph'

export interface ElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  opacity?: number
}

export interface TextElement extends ElementBase {
  type: 'text'
  html: string
  fontSize: number
  fontWeight?: number | string
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'center' | 'bottom'
  lineHeight?: number
}

export type ShapeType = 'rect' | 'rounded' | 'circle' | 'card'

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeType
  fill: string
  stroke?: string
  strokeWidth?: number
  radius?: number
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  fit?: 'contain' | 'cover' | 'fill'
  radius?: number
}

export interface TableCell {
  html: string
  align?: 'left' | 'center' | 'right'
  bg?: string
  bold?: boolean
}

export interface TableRow {
  cells: TableCell[]
}

export interface TableStyle {
  headerBg?: string
  headerColor?: string
  zebra?: string
  borderColor?: string
  borderWidth?: number
  cellPadX?: number
  cellPadY?: number
  fontSize?: number
  color?: string
  radius?: number
}

export interface TableElement extends ElementBase {
  type: 'table'
  columns: { w?: number }[]
  rows: TableRow[]
  style?: TableStyle
}

export interface ChartDatum {
  label: string
  value: number
}

export interface ChartElement extends ElementBase {
  type: 'chart'
  preset: 'bar' | 'line' | 'pie'
  data: ChartDatum[]
  title?: string
  color?: string
}

export interface CodeElement extends ElementBase {
  type: 'code'
  code: string
  lang?: string
  fontSize?: number
}

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | TableElement
  | ChartElement
  | CodeElement

export interface Slide {
  id: string
  title?: string
  elements: SlideElement[]
  background?: string
  notes?: string
  transition?: SlideTransitionKind
  hidden?: boolean
}

export interface SlidesTheme {
  background: string
  color: string
  accent: string
  fontFamily?: string
}

export interface BentoDoc {
  format: string
  version: number
  title: string
  size: { width: number; height: number }
  theme: SlidesTheme
  slides: Slide[]
}

export type SlidesMode = 'json' | 'outline'

export type SlidesParseResult =
  | { ok: true; data: BentoDoc; mode: SlidesMode }
  | { ok: false; error: string; raw: string }

export interface SlidesFenceRef {
  line: number
  body: string
}

export type SlidesWriteResult = 'written' | 'missing' | 'conflict'

export type SlidesWriter = (ref: SlidesFenceRef, nextBody: string) => SlidesWriteResult


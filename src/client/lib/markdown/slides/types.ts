export const BENTO_SLIDES_FORMAT = 'bento/slides'
export const BENTO_SLIDES_VERSION = 1

export type SlideTransitionKind = 'none' | 'fade' | 'slide' | 'zoom' | 'morph'

/**
 * The picture's window into its frame: the image COVERS the frame, `scale` enlarges it
 * inside, and `x`/`y` (0..1) pick which edge the frame aligns to. Absent means the whole
 * cover-fitted picture, centred at 1:1.
 */
export interface ImageCrop {
  x: number
  y: number
  scale: number
}

export interface ElementFxLoop {
  type?: string
  path?: string
  duration?: number
  delay?: number
  distance?: number
  ease?: string
  speeds?: number[]
}

export interface ElementFxKen {
  dir?: string
  duration?: number
  scale?: number
}

/**
 * Presentation effects on one element. The editor authors these and the show consumes
 * them, which is why they ride in the document rather than in the show's own state.
 */
export interface ElementFx {
  enter?: string
  enterDur?: number
  order?: number
  step?: number
  countUp?: boolean
  ambient?: string
  ken?: ElementFxKen | boolean
  loop?: ElementFxLoop
}

export interface TextStroke {
  width?: number
  color?: string
}

export interface ElementBase {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  opacity?: number
  /** Element identity across slides, which is what a morph transition pairs on. */
  morphId?: string
  shadow?: ShapeShadow[]
  blur?: number
  blend?: string
  backdropFilter?: string
  fx?: ElementFx
  link?: string
  group?: boolean
  groupId?: string
  showOnHover?: string
  /** What a layout calls this element when it is applied to another slide. */
  role?: string
  themeRefs?: string[]
}

export interface TextElement extends ElementBase {
  type: 'text'
  html: string
  fontSize: number
  fontWeight?: number | string
  fontFamily?: string
  color?: string
  colorGradient?: ShapeGradient
  textStroke?: TextStroke
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'center' | 'bottom'
  lineHeight?: number
  letterSpacing?: number
  /** What an empty box shows in the editor; never drawn in a show or a print. */
  placeholder?: string
}

export type ShapeType =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'arrow'
  | 'arrow2'
  | 'line'
  | 'path'
  | 'curve'
  | 'connector'
  | 'curve-connector'
  | 'free'
  | 'poly'
  | 'rounded'
  | 'circle'
  | 'card'

export interface ShapeGradientStop {
  at: number
  color: string
}

export interface ShapeGradient {
  angle: number
  stops: ShapeGradientStop[]
}

export interface ShapeShadow {
  x?: number
  y?: number
  blur: number
  spread?: number
  color: string
}

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: ShapeType
  fill: string
  fillGradient?: ShapeGradient
  stroke?: string
  strokeWidth?: number
  strokeStyle?: 'solid' | 'dashed' | 'dotted'
  radius?: number
  /** SVG path data: a `path` shape's geometry is its own coordinates, not a box. */
  d?: string
  pathBox?: { x?: number; y?: number; w?: number; h?: number }
  from?: { x: number; y: number }
  to?: { x: number; y: number }
  heads?: { start?: string; end?: string }
  lineStart?: unknown
  lineEnd?: unknown
  strokeDash?: number[]
}

export interface SvgElement extends ElementBase {
  type: 'svg'
  asset?: string
  markup?: string
  svg?: string
  css?: string
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  fit?: 'contain' | 'cover' | 'fill'
  radius?: number
  crop?: ImageCrop
  keepAspectRatio?: boolean
}

export interface MediaElement extends ElementBase {
  type: 'media'
  kind: 'video' | 'audio'
  src: string
  poster?: string
  fit?: 'contain' | 'cover' | 'fill'
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
  controls?: boolean
  radius?: number
}

/**
 * Another Bento view carried inside the deck. `view` is inline artwork the file itself
 * carries; `url` is an address, which only runs where embedding is allowed (`live`),
 * because a note is not a viewer for arbitrary pages.
 */
export interface EmbedElement extends ElementBase {
  type: 'embed'
  app?: string
  view?: string
  url?: string
  doc?: string
  live?: boolean
}

export interface TableCell {
  html: string
  align?: 'left' | 'center' | 'right'
  bg?: string
  bold?: boolean
  color?: string
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
  fontFamily?: string
  color?: string
  radius?: number
}

export interface TableElement extends ElementBase {
  type: 'table'
  columns: { w?: number }[]
  rows: TableRow[]
  header?: boolean
  style?: TableStyle
}

export interface ChartDatum {
  label: string
  value: number
}

export interface ChartElement extends ElementBase {
  type: 'chart'
  preset: 'bar' | 'line' | 'pie' | 'scatter'
  data: ChartDatum[]
  title?: string
  color?: string
  /** A chart's own option object, as the format's chart engine carries it. */
  option?: unknown
  source?: string
}

export interface CodeElement extends ElementBase {
  type: 'code'
  code: string
  /** The same source under the format's own name for it: an imported block carries only this. */
  content?: string
  lang?: string
  fontSize?: number
  fontFamily?: string
  lineHeight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'center' | 'bottom'
  grammarAssetId?: string
  grammarName?: string
  themeAssetId?: string
  themeName?: string
}

export type SlideElement =
  | TextElement
  | ShapeElement
  | SvgElement
  | ImageElement
  | MediaElement
  | EmbedElement
  | TableElement
  | ChartElement
  | CodeElement

export interface SlideCommentReply {
  author?: string
  text: string
}

/** A review thread anchored to an element, a point on a slide, or the slide itself. */
export interface SlideComment {
  id: string
  text: string
  author?: string
  elementId?: string
  x?: number
  y?: number
  resolved?: boolean
  replies?: SlideCommentReply[]
}

export interface SlideHover {
  focusGroup?: string
  reveal?: boolean
}

export interface Slide {
  id: string
  title?: string
  name?: string
  elements: SlideElement[]
  background?: string
  notes?: string
  transition?: SlideTransitionKind
  hidden?: boolean
  unnumbered?: boolean
  /** The slide whose interaction state this one continues, which is how states navigate. */
  stateOf?: string
  hover?: SlideHover
  comments?: SlideComment[]
  themeRefs?: string[]
}

export interface SlidesPresentSettings {
  slideNumber?: boolean
  progress?: boolean
  controls?: boolean
  numberHidden?: boolean
  morphSeconds?: number
}

export interface SlidesTheme {
  background: string
  color: string
  accent: string
  fontFamily?: string
  headingFamily?: string
  chartPalette?: string[]
  codePalette?: Record<string, string>
  palette?: Record<string, string>
  table?: TableStyle
}

export interface SlidesMeta {
  author?: string
  company?: string
  event?: string
  keywords?: string
  subject?: string
}

export interface SlidesFont {
  family: string
  asset?: string
  weight?: number | string
  style?: string
}

export interface BentoDoc {
  format: string
  version: number
  title: string
  size: { width: number; height: number }
  theme: SlidesTheme
  slides: Slide[]
  present?: SlidesPresentSettings
  assets?: Record<string, string>
  docId?: string
  modified?: string
  fonts?: SlidesFont[]
  /** Slide-shaped templates the document carries alongside the built-in ones. */
  layouts?: unknown[]
  readonly?: boolean
  template?: boolean
  blobs?: unknown
  collab?: unknown
  meta?: SlidesMeta
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


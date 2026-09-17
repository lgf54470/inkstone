import { imageBoxForAspect } from '../image-asset'
import { secureRandomId } from '../../../id'
import type {
  ChartDatum,
  ChartElement,
  CodeElement,
  ImageElement,
  ShapeElement,
  ShapeType,
  TableElement,
  TextElement,
} from '../types'

export function createDefaultText(): TextElement {
  return {
    id: `text-${Date.now()}`,
    type: 'text',
    html: 'Click to edit text',
    fontSize: 28,
    fontWeight: 400,
    x: 200,
    y: 200,
    w: 400,
    h: 80,
  }
}

export function createDefaultShape(shape: ShapeType, fill: string): ShapeElement {
  const isLineOrArrow = shape === 'line' || shape === 'arrow' || shape === 'arrow2'
  const isSquareLike = shape === 'triangle' || shape === 'ellipse' || shape === 'circle' || shape === 'poly'
  const w = isLineOrArrow ? 240 : isSquareLike ? 200 : 240
  const h = isLineOrArrow ? 48 : isSquareLike ? 200 : 160

  return {
    id: `shape-${Date.now()}`,
    type: 'shape',
    shape,
    fill: isLineOrArrow ? 'transparent' : fill,
    stroke: isLineOrArrow ? fill : undefined,
    strokeWidth: isLineOrArrow ? 3 : undefined,
    x: 300,
    y: 250,
    w,
    h,
    radius: shape === 'rounded' || shape === 'card' ? 12 : 0,
  }
}

/**
 * A picture the person chose. The source is theirs — there is no sample artwork to fall
 * back on, because a placeholder photograph that silently stands in for the file they
 * picked is worse than an insert that says it failed.
 */
export function createDefaultImage(src: string, box?: { w: number; h: number }): ImageElement {
  const fallback = imageBoxForAspect()
  return {
    id: `img-${Date.now()}`,
    type: 'image',
    src,
    x: 240,
    y: 180,
    w: box?.w ?? fallback.w,
    h: box?.h ?? fallback.h,
    radius: 12,
  }
}

/** How much of a paste becomes a text box before the rest is dropped: a page of prose pasted by
 * accident should not become a slide nobody can read past. */
const CLIP_TEXT_LIMIT = 2000

/**
 * A text box made from something that arrived as plain text. The markup is built and escaped
 * here rather than handed on as markup, because the paste came from somewhere this app does not
 * control: the render path sanitizes again, and this is what keeps it from having to repair a
 * document that never should have held someone else's tags in the first place.
 */
export function createTextFromClipboard(text: string): TextElement {
  return {
    id: `text-${secureRandomId()}`,
    type: 'text',
    html: escapePastedText(text.slice(0, CLIP_TEXT_LIMIT)),
    fontSize: 24,
    x: 160,
    y: 160,
    w: 560,
    h: 120,
  }
}

function escapePastedText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

export function createDefaultTable(): TableElement {
  return {
    id: `tbl-${Date.now()}`,
    type: 'table',
    columns: [{ w: 160 }, { w: 220 }, { w: 180 }],
    rows: [
      {
        cells: [
          { html: 'Item', bold: true },
          { html: 'Description', bold: true },
          { html: 'Status', bold: true },
        ],
      },
      {
        cells: [
          { html: 'Architecture' },
          { html: 'Offline-first, 1 file' },
          { html: 'Complete' },
        ],
      },
      {
        cells: [
          { html: 'Presentation' },
          { html: 'Morph transitions & HUD' },
          { html: 'Active' },
        ],
      },
    ],
    x: 180,
    y: 160,
    w: 640,
    h: 220,
  }
}

export function createDefaultChart(preset: 'bar' | 'line' | 'pie' | 'scatter'): ChartElement {
  const chartData: ChartDatum[] = [
    { label: 'Jan', value: 35 },
    { label: 'Feb', value: 55 },
    { label: 'Mar', value: 80 },
    { label: 'Apr', value: 120 },
  ]
  return {
    id: `chart-${Date.now()}`,
    type: 'chart',
    preset,
    data: chartData,
    title: 'Monthly Progress',
    x: 220,
    y: 160,
    w: 520,
    h: 300,
  }
}

export function createDefaultCode(): CodeElement {
  return {
    id: `code-${Date.now()}`,
    type: 'code',
    lang: 'typescript',
    code: `const deck = await loadBentoSlides()\ndeck.present({ transition: 'morph' })`,
    fontSize: 16,
    x: 200,
    y: 180,
    w: 560,
    h: 220,
  }
}

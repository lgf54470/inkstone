import {
  applyBodyAtFence as applyBody,
  fenceRange as rangeOf,
  type FenceRange,
} from '../fence-edit'
import { parseSlidesOutline, serializeSlidesOutline } from './outline'
import { DEFAULT_PAGE_SIZE } from './page'
import {
  DEFAULT_ACCENT_COLOR,
  DEFAULT_DARK_BG,
  DEFAULT_DARK_COLOR,
} from './colors'
import {
  BENTO_SLIDES_FORMAT,
  BENTO_SLIDES_VERSION,
  type BentoDoc,
  type Slide,
  type SlidesFenceRef,
  type SlidesMode,
  type SlidesParseResult,
} from './types'

export const BENTO_SLIDES_LANGUAGES = [
  'bento-slides',
  'bento-slide',
  'slides',
  'ppt',
  'bento',
] as const

export function detectSlidesMode(body: string): SlidesMode {
  const trimmed = body.trimStart()
  return trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'outline'
}

function defaultSlide(title: unknown): Slide {
  const text = typeof title === 'string' ? title : 'Welcome'
  return {
    id: 'slide-1',
    title: text,
    elements: [
      {
        id: 'title-1',
        type: 'text',
        html: text,
        fontSize: 44,
        fontWeight: 700,
        align: 'left',
        valign: 'top',
        x: 96,
        y: 80,
        w: 1088,
        h: 80,
      },
    ],
  }
}

/**
 * Fills in what the editor needs while carrying everything else through: this model
 * is a superset of the body, not a projection of it. The fence body is the user's own
 * document, and an edit rewrites it whole, so a field this build does not model
 * (a layout, an embedded font, a remark on a slide) must survive parse → edit → write
 * rather than disappear because the normalizer never named it. Unknown keys are
 * therefore spread through at every level the writer touches, and a value that is
 * absent here stays absent — inventing a default would put a statement in the file
 * the author never made.
 */
function normalizeBentoDoc(raw: Partial<BentoDoc>): BentoDoc {
  const slides =
    Array.isArray(raw.slides) && raw.slides.length > 0 ? raw.slides : [defaultSlide(raw.title)]
  const rawTheme = raw.theme ?? {
    background: DEFAULT_DARK_BG,
    color: DEFAULT_DARK_COLOR,
    accent: DEFAULT_ACCENT_COLOR,
  }

  return {
    ...raw,
    format: raw.format || BENTO_SLIDES_FORMAT,
    version: raw.version || BENTO_SLIDES_VERSION,
    title: typeof raw.title === 'string' ? raw.title : 'Bento Slides',
    size: raw.size && raw.size.width > 0 ? { ...raw.size } : { ...DEFAULT_PAGE_SIZE },
    theme: {
      ...rawTheme,
      background: rawTheme.background || DEFAULT_DARK_BG,
      color: rawTheme.color || DEFAULT_DARK_COLOR,
      accent: rawTheme.accent || DEFAULT_ACCENT_COLOR,
    },
    slides,
  }
}

export function parseSlidesBody(body: string): SlidesParseResult {
  const mode = detectSlidesMode(body)
  if (mode === 'outline') {
    try {
      const data = parseSlidesOutline(body)
      return { ok: true, data, mode }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), raw: body }
    }
  }

  try {
    const parsed = JSON.parse(body)
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, error: 'Slides JSON body must be an object', raw: body }
    }
    const data = normalizeBentoDoc(parsed as Partial<BentoDoc>)
    return { ok: true, data, mode: 'json' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), raw: body }
  }
}

export function serializeSlides(data: BentoDoc, mode: SlidesMode): string {
  if (mode === 'outline') {
    return serializeSlidesOutline(data)
  }
  return JSON.stringify(data, null, 2)
}

export function applySlidesBodyAtFence(
  content: string,
  target: SlidesFenceRef,
  nextBody: string,
): string | null {
  return applyBody(content, target, nextBody, BENTO_SLIDES_LANGUAGES)
}

export function slidesFenceRange(
  content: string,
  target: SlidesFenceRef,
): FenceRange | null {
  return rangeOf(content, target, BENTO_SLIDES_LANGUAGES)
}

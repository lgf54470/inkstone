import type { MessageKey } from '../../i18n'
import type { PageSize } from './page'
import type { ShapeElement, Slide, SlideElement, TextElement } from './types'

/**
 * Where a new slide starts from.
 *
 * The nine layouts are the ones the bento/slides format offers out of the box, drawn on
 * the format's own 1600x900 authoring page and scaled to whatever page the deck uses, so
 * a 4:3 deck gets 4:3 compositions instead of the 16:9 ones cropped at the right edge.
 * A layout's text is a hint the reader retypes rather than content the deck owns, so it
 * is stored as a message id here and resolved when the slide is created: the hint lands
 * in the reader's own language and is never part of this module's state.
 */
export const LAYOUT_BASE: PageSize = { width: 1600, height: 900 }

/** The colour token a layout's rule/bar takes from the deck rather than naming itself. */
export const ACCENT_FILL = 'accent'

export interface LayoutText extends Omit<TextElement, 'html'> {
  /** Message id resolved to the element's html when the slide is created. */
  htmlKey: MessageKey
}

export type LayoutElement = LayoutText | ShapeElement

export interface SlideLayout {
  id: string
  /** Message id of the layout's name in the picker. */
  nameKey: MessageKey
  background: string
  textColor: string
  elements: LayoutElement[]
}

function text(
  id: string,
  htmlKey: MessageKey,
  box: Pick<TextElement, 'x' | 'y' | 'w' | 'h'>,
  style: Partial<Omit<TextElement, 'id' | 'type' | 'html' | 'x' | 'y' | 'w' | 'h'>> = {},
): LayoutText {
  return { id, type: 'text', htmlKey, ...box, fontSize: 24, ...style }
}

function bar(id: string, box: Pick<ShapeElement, 'x' | 'y' | 'w' | 'h'>): ShapeElement {
  return { id, type: 'shape', shape: 'rect', fill: ACCENT_FILL, ...box }
}

const CARD_FILL = '#F1F4F8'
const BODY_INK = '#586A80'
const MUTED_INK = '#8A98AB'
const SECTION_BG = '#1E2A3A'
const KICKER_INK = '#F7A600'

export const BUILTIN_LAYOUTS: SlideLayout[] = [
  {
    id: 'layout-title',
    nameKey: 'slides.layout_title',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      bar('lt-bar', { x: 160, y: 380, w: 72, h: 8 }),
      text('lt-title', 'slides.layout_hint_title', { x: 160, y: 404, w: 1280, h: 140 }, {
        fontSize: 76,
        fontWeight: 700,
        valign: 'center',
      }),
      text('lt-sub', 'slides.layout_hint_subtitle', { x: 160, y: 556, w: 1100, h: 60 }, {
        fontSize: 28,
        color: BODY_INK,
        valign: 'center',
      }),
    ],
  },
  {
    id: 'layout-title-content',
    nameKey: 'slides.layout_title_content',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      text('ltc-title', 'slides.layout_hint_title', { x: 120, y: 72, w: 1360, h: 84 }, {
        fontSize: 44,
        fontWeight: 700,
        valign: 'center',
      }),
      bar('ltc-rule', { x: 120, y: 168, w: 1360, h: 3 }),
      text('ltc-body', 'slides.layout_hint_body', { x: 120, y: 208, w: 1360, h: 600 }, {
        fontSize: 26,
        color: BODY_INK,
        valign: 'top',
        lineHeight: 1.5,
      }),
    ],
  },
  {
    id: 'layout-two-col',
    nameKey: 'slides.layout_two_columns',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      text('l2c-title', 'slides.layout_hint_title', { x: 120, y: 72, w: 1360, h: 84 }, {
        fontSize: 44,
        fontWeight: 700,
        valign: 'center',
      }),
      bar('l2c-rule', { x: 120, y: 168, w: 1360, h: 3 }),
      text('l2c-left', 'slides.layout_hint_left_column', { x: 120, y: 208, w: 660, h: 600 }, {
        valign: 'top',
        lineHeight: 1.5,
      }),
      text('l2c-right', 'slides.layout_hint_right_column', { x: 820, y: 208, w: 660, h: 600 }, {
        valign: 'top',
        lineHeight: 1.5,
      }),
    ],
  },
  {
    id: 'layout-section',
    nameKey: 'slides.layout_section',
    background: SECTION_BG,
    textColor: '#FFFFFF',
    elements: [
      text('lsec-kicker', 'slides.layout_hint_kicker', { x: 160, y: 350, w: 800, h: 40 }, {
        fontSize: 18,
        fontWeight: 600,
        color: KICKER_INK,
        letterSpacing: 3,
        valign: 'center',
      }),
      bar('lsec-bar', { x: 160, y: 396, w: 72, h: 8 }),
      text('lsec-title', 'slides.layout_hint_section', { x: 160, y: 420, w: 1280, h: 120 }, {
        fontSize: 64,
        fontWeight: 700,
        color: '#FFFFFF',
        valign: 'center',
      }),
    ],
  },
  {
    id: 'layout-three-cards',
    nameKey: 'slides.layout_three_cards',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      text('l3c-title', 'slides.layout_hint_title', { x: 120, y: 72, w: 1360, h: 84 }, {
        fontSize: 44,
        fontWeight: 700,
        valign: 'center',
      }),
      ...card('l3c', 120, 'slides.layout_hint_card_first'),
      ...card('l3c', 587, 'slides.layout_hint_card_second'),
      ...card('l3c', 1054, 'slides.layout_hint_card_third'),
    ],
  },
  {
    id: 'layout-quote',
    nameKey: 'slides.layout_quote',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      bar('lq-bar', { x: 160, y: 300, w: 8, h: 300 }),
      text('lq-quote', 'slides.layout_hint_quote', { x: 208, y: 300, w: 1232, h: 300 }, {
        fontSize: 48,
        fontWeight: 500,
        valign: 'center',
        lineHeight: 1.3,
      }),
      text('lq-attr', 'slides.layout_hint_attribution', { x: 208, y: 620, w: 1232, h: 44 }, {
        color: BODY_INK,
        valign: 'center',
      }),
    ],
  },
  {
    id: 'layout-image-left',
    nameKey: 'slides.layout_image_left',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      text('lil-image', 'slides.layout_hint_image', { x: 120, y: 120, w: 640, h: 660 }, {
        color: MUTED_INK,
        align: 'center',
        valign: 'center',
      }),
      text('lil-title', 'slides.layout_hint_title', { x: 820, y: 120, w: 660, h: 120 }, {
        fontSize: 44,
        fontWeight: 700,
        valign: 'center',
      }),
      text('lil-body', 'slides.layout_hint_body', { x: 820, y: 264, w: 660, h: 516 }, {
        color: BODY_INK,
        valign: 'top',
        lineHeight: 1.5,
      }),
    ],
  },
  {
    id: 'layout-image-right',
    nameKey: 'slides.layout_image_right',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [
      text('lir-title', 'slides.layout_hint_title', { x: 120, y: 120, w: 660, h: 120 }, {
        fontSize: 44,
        fontWeight: 700,
        valign: 'center',
      }),
      text('lir-body', 'slides.layout_hint_body', { x: 120, y: 264, w: 660, h: 516 }, {
        color: BODY_INK,
        valign: 'top',
        lineHeight: 1.5,
      }),
      text('lir-image', 'slides.layout_hint_image', { x: 840, y: 120, w: 640, h: 660 }, {
        color: MUTED_INK,
        align: 'center',
        valign: 'center',
      }),
    ],
  },
  {
    id: 'layout-blank',
    nameKey: 'slides.layout_blank',
    background: '#FFFFFF',
    textColor: '#16273E',
    elements: [],
  },
]

/** A card is a backdrop plus the text that sits on it, inset by the same 32px on every side. */
function card(prefix: string, x: number, htmlKey: MessageKey): LayoutElement[] {
  const index = x
  return [
    {
      id: `${prefix}-bg${index}`,
      type: 'shape',
      shape: 'card',
      fill: CARD_FILL,
      x,
      y: 220,
      w: 426,
      h: 560,
    },
    text(`${prefix}-card${index}`, htmlKey, { x: x + 32, y: 252, w: 362, h: 496 }, {
      valign: 'top',
      lineHeight: 1.5,
    }),
  ]
}

export interface LayoutOptions {
  /** Deck-wide accent, which the layouts' rules and bars take instead of naming a colour. */
  accent: string
  /** Resolves a layout's text hint, so the hint lands in the reader's language. */
  message: (key: MessageKey) => string
  /** Names the new slide; the caller's uniqueness is what keeps two copies apart. */
  seed: string
}

function scaleBox<S extends { x: number; y: number; w: number; h: number }>(
  element: S,
  sx: number,
  sy: number,
): S {
  return {
    ...element,
    x: Math.round(element.x * sx),
    y: Math.round(element.y * sy),
    w: Math.round(element.w * sx),
    h: Math.round(element.h * sy),
  }
}

/**
 * A slide from a layout: geometry rescaled onto this deck's page, text hints resolved,
 * and accent-coloured marks given the deck's accent.
 *
 * Element ids are KEPT rather than regenerated, which is what the format does: an id is
 * how a morph pairs one slide's element with the next one's, so two slides made from the
 * same layout share the ids of the layout they came from. Only the slide's own id is
 * new, and `seed` is what makes it unique in the deck.
 */
export function instantiateLayout(
  layout: SlideLayout,
  page: PageSize,
  options: LayoutOptions,
): Slide {
  const sx = page.width / LAYOUT_BASE.width
  const sy = page.height / LAYOUT_BASE.height
  // Type follows the smaller axis: on a squarer page that is the side that decides
  // whether a heading still fits its box.
  const st = Math.min(sx, sy)

  const elements = layout.elements.map((element): SlideElement => {
    if (element.type === 'shape') {
      const scaled = scaleBox(element, sx, sy)
      return element.fill === ACCENT_FILL ? { ...scaled, fill: options.accent } : scaled
    }
    const { htmlKey, ...rest } = element
    const scaled = scaleBox(rest, sx, sy)
    return {
      ...scaled,
      html: options.message(htmlKey),
      fontSize: Math.max(8, Math.round(scaled.fontSize * st)),
      letterSpacing: scaled.letterSpacing
        ? Math.round(scaled.letterSpacing * st * 10) / 10
        : undefined,
    }
  })

  return {
    id: `slide-${options.seed}`,
    title: options.message(layout.nameKey),
    background: layout.background,
    elements,
  }
}

export function layoutById(id: string): SlideLayout | null {
  return BUILTIN_LAYOUTS.find((layout) => layout.id === id) ?? null
}

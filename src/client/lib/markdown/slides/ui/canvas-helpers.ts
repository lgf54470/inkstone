import type { CSSProperties } from 'react'
import type { PageSize } from '../page'
import type { SlideElement, TextElement, ShapeElement, TableElement } from '../types'

export function getElementBoxStyle(el: SlideElement): CSSProperties {
  const rot = el.rotation ? `rotate(${el.rotation}deg)` : undefined
  const op = typeof el.opacity === 'number' ? el.opacity : undefined

  return {
    position: 'absolute',
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.w}px`,
    height: `${el.h}px`,
    transform: rot,
    opacity: op,
    // The three ways the format lets an element sit INTO the page rather than on it: it can
    // be blurred, mixed with what is under it, or filter what shows through it.
    filter: el.blur ? `blur(${el.blur}px)` : undefined,
    mixBlendMode: (el.blend as CSSProperties['mixBlendMode']) || undefined,
    backdropFilter: el.backdropFilter || undefined,
    boxSizing: 'border-box',
  }
}

export function getTextStyle(el: TextElement): CSSProperties {
  const isHeadline = el.fontSize >= 40
  const defaultFamily = isHeadline ? "'Fraunces', Georgia, serif" : undefined
  const gradient = el.colorGradient?.stops?.length
    ? `linear-gradient(${el.colorGradient.angle}deg, ${el.colorGradient.stops
        .map((stop) => `${stop.color} ${Math.round(stop.at * 100)}%`)
        .join(', ')})`
    : undefined

  return {
    fontSize: `${el.fontSize}px`,
    fontWeight: el.fontWeight ?? (isHeadline ? 900 : 'normal'),
    // A gradient is painted through the glyphs, which is why the fill colour has to go
    // transparent: the letters become the shape the background is clipped to.
    color: gradient ? 'transparent' : (el.color ?? 'inherit'),
    backgroundImage: gradient,
    backgroundClip: gradient ? 'text' : undefined,
    WebkitBackgroundClip: gradient ? 'text' : undefined,
    WebkitTextFillColor: gradient ? 'transparent' : undefined,
    WebkitTextStrokeWidth: el.textStroke?.width ? `${el.textStroke.width}px` : undefined,
    WebkitTextStrokeColor: el.textStroke?.color,
    textAlign: el.align ?? 'left',
    lineHeight: el.lineHeight ?? (isHeadline ? 1.05 : 1.3),
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    fontFamily: el.fontFamily || defaultFamily,
  }
}

export function getShapeStyle(el: ShapeElement): CSSProperties {
  const isCircle = el.shape === 'circle'
  const rad = isCircle
    ? '50%'
    : el.radius !== undefined
      ? `${el.radius}px`
      : el.shape === 'rounded' || el.shape === 'card'
        ? '16px'
        : '0px'

  let bg: string | undefined = el.fill
  if (el.fillGradient && el.fillGradient.stops.length > 0) {
    const stopsStr = el.fillGradient.stops
      .map((s) => `${s.color} ${Math.round(s.at * 100)}%`)
      .join(', ')
    bg = `linear-gradient(${el.fillGradient.angle}deg, ${stopsStr})`
  }

  let shadowStr: string | undefined
  if (el.shadow && el.shadow.length > 0) {
    shadowStr = el.shadow
      .map((s) => `${s.x ?? 0}px ${s.y ?? 0}px ${s.blur}px ${s.spread ?? 0}px ${s.color}`)
      .join(', ')
  }

  return {
    background: bg,
    borderColor: el.stroke,
    borderWidth: el.strokeWidth !== undefined ? `${el.strokeWidth}px` : undefined,
    borderStyle: el.strokeStyle ?? (el.stroke ? 'solid' : undefined),
    borderRadius: rad,
    boxShadow: shadowStr,
  }
}

export function getTableStyle(el: TableElement): CSSProperties {
  const st = el.style ?? {}
  return {
    fontSize: st.fontSize ? `${st.fontSize}px` : '16px',
    color: st.color ?? 'inherit',
    borderColor: st.borderColor ?? 'var(--border-subtle)',
    borderRadius: st.radius ? `${st.radius}px` : '8px',
  }
}

/** The element a pointer landed on, read from the box the canvas tags each element with. */
export function elementIdAt(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target.closest('[data-slide-element]') : null
  return element?.getAttribute('data-slide-element') ?? null
}

/**
 * Who takes a pointer on the canvas. While editing, an element is draggable — except the
 * background layer, which stays inert until it is selected or nothing on top of it could
 * ever be grabbed. In a show nothing is draggable, so only a clip keeps its own controls,
 * which is the whole point of it being on the slide.
 */
export function elementPointerEvents(
  el: SlideElement,
  state: { editable: boolean; isSelected: boolean; isBackground: boolean },
): 'auto' | 'none' {
  if (state.isBackground && !state.isSelected) return 'none'
  if (state.editable) return 'auto'
  return el.type === 'media' ? 'auto' : 'none'
}

export function isBackgroundLayer(el: SlideElement, page: PageSize): boolean {
  return (
    (el.x === 0 && el.y === 0 && el.w >= page.width && el.h >= page.height) ||
    el.id === 'sd-glow' ||
    (el.type === 'svg' && (el.asset === 'grain' || el.asset === 'dots-ink' || el.asset === 'dots-paper'))
  )
}

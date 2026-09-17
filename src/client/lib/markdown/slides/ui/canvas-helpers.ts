import type { CSSProperties } from 'react'
import type { SlideElement, TextElement, ShapeElement, TableElement, ChartElement } from '../types'

export const VIRTUAL_CANVAS_WIDTH = 1280
export const VIRTUAL_CANVAS_HEIGHT = 720

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
    boxSizing: 'border-box',
  }
}

export function getTextStyle(el: TextElement): CSSProperties {
  const isHeadline = el.fontSize >= 40
  const defaultFamily = isHeadline ? "'Fraunces', Georgia, serif" : undefined

  return {
    fontSize: `${el.fontSize}px`,
    fontWeight: el.fontWeight ?? (isHeadline ? 900 : 'normal'),
    color: el.color ?? 'inherit',
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

export function getChartColor(el: ChartElement, defaultAccent: string): string {
  return el.color || defaultAccent || 'var(--accent)'
}

export function isBackgroundLayer(el: SlideElement): boolean {
  return (
    (el.x === 0 && el.y === 0 && el.w >= VIRTUAL_CANVAS_WIDTH && el.h >= VIRTUAL_CANVAS_HEIGHT) ||
    el.id === 'sd-glow' ||
    (el.type === 'svg' && (el.asset === 'grain' || el.asset === 'dots-ink' || el.asset === 'dots-paper'))
  )
}

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
  return {
    fontSize: `${el.fontSize}px`,
    fontWeight: el.fontWeight ?? 'normal',
    color: el.color ?? 'inherit',
    textAlign: el.align ?? 'left',
    lineHeight: el.lineHeight ?? 1.2,
  }
}

export function getShapeStyle(el: ShapeElement): CSSProperties {
  const isCircle = el.shape === 'circle'
  const rad = isCircle ? '50%' : el.radius !== undefined ? `${el.radius}px` : el.shape === 'rounded' ? '16px' : '0px'

  return {
    backgroundColor: el.fill,
    borderColor: el.stroke,
    borderWidth: el.strokeWidth !== undefined ? `${el.strokeWidth}px` : undefined,
    borderStyle: el.stroke ? 'solid' : undefined,
    borderRadius: rad,
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

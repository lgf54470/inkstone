import { useEffect, useRef, type ReactNode } from 'react'
import type {
  ImageElement,
  ShapeElement,
  SlideElement,
  SlidesTheme,
  TableElement,
  TextElement,
} from '../types'
import { getShapeStyle, getTableStyle, getTextStyle } from './canvas-helpers'
import { pasteSlideRichText, sanitizeSlideRichText, sanitizeSlideSvgMarkup } from '../sanitize'
import { SlideChartBlock } from './chart-block'
import { SlideCodeBlock } from './code-block'
import { SlideMediaBlock } from './media-block'

const CIRCLE_RADIUS = '50%'

/**
 * One element's own markup, chosen by its type. Everything a surface needs to draw a deck —
 * the canvas, a thumbnail, a printed page — comes through here, which is what keeps those
 * three from disagreeing about what an element looks like.
 */
export function ElementRenderer({
  el,
  theme,
  editable,
  isSelected,
  editing,
  assets,
  onUpdate,
}: {
  el: SlideElement
  theme: SlidesTheme
  editable: boolean
  isSelected: boolean
  editing: boolean
  assets?: Record<string, string>
  onUpdate?: (patch: Partial<SlideElement>) => void
}): ReactNode {
  switch (el.type) {
    case 'text':
      return (
        <TextRenderer
          el={el}
          editable={editable}
          isSelected={isSelected}
          editing={editing}
          onUpdate={onUpdate}
        />
      )
    case 'shape':
      return <ShapeRenderer el={el} />
    case 'svg': {
      const markup = (el.asset && assets ? assets[el.asset] : el.markup || el.svg) ?? ''
      const sanitized = sanitizeSlideSvgMarkup(markup)
      return sanitized ? (
        <div className='size-full overflow-hidden' dangerouslySetInnerHTML={{ __html: sanitized }} />
      ) : null
    }
    case 'image':
      return <ImageRenderer el={el} />
    case 'media':
      return <SlideMediaBlock el={el} assets={assets} interactive={!editable} />
    case 'table':
      return <TableRenderer el={el} />
    case 'chart':
      return <SlideChartBlock el={el} palette={theme.chartPalette} defaultAccent={theme.accent} />
    case 'code':
      return <SlideCodeBlock el={el} palette={theme.codePalette} />
    default:
      return null
  }
}

function TextRenderer({
  el,
  editable,
  isSelected,
  editing,
  onUpdate,
}: {
  el: TextElement
  editable: boolean
  isSelected: boolean
  editing: boolean
  onUpdate?: (patch: Partial<SlideElement>) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (editing) boxRef.current?.focus()
  }, [editing])

  return (
    <div
      ref={boxRef}
      style={getTextStyle(el)}
      className='size-full overflow-hidden leading-snug break-words'
      contentEditable={editable && isSelected}
      suppressContentEditableWarning
      onBlur={(e) => {
        const nextHtml = sanitizeSlideRichText(e.currentTarget.innerHTML)
        if (nextHtml !== el.html) onUpdate?.({ html: nextHtml })
      }}
      onPaste={(e) => {
        const clipboard = e.clipboardData
        const handled = pasteSlideRichText(e.currentTarget, {
          html: clipboard.getData('text/html') || null,
          text: clipboard.getData('text/plain') || null,
        })
        if (handled) e.preventDefault()
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeSlideRichText(el.html) }}
    />
  )
}

function renderSvgShape(el: ShapeElement): ReactNode {
  const strokeColor = el.stroke || el.fill || 'currentColor'
  const fill = el.fill || 'currentColor'
  if (el.shape === 'triangle') {
    return (
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' className='size-full overflow-visible'>
        <polygon points='50,5 95,95 5,95' fill={fill} stroke={el.stroke} strokeWidth={el.strokeWidth} />
      </svg>
    )
  }
  if (el.shape === 'arrow' || el.shape === 'arrow2') {
    const isDouble = el.shape === 'arrow2'
    return (
      <svg viewBox='0 0 100 40' preserveAspectRatio='none' className='size-full overflow-visible'>
        <line x1={isDouble ? 25 : 8} y1='20' x2='75' y2='20' stroke={strokeColor} strokeWidth={el.strokeWidth || 4} strokeLinecap='round' />
        {isDouble && <polyline points='25,8 8,20 25,32' fill='none' stroke={strokeColor} strokeWidth={el.strokeWidth || 4} strokeLinecap='round' strokeLinejoin='round' />}
        <polyline points='75,8 92,20 75,32' fill='none' stroke={strokeColor} strokeWidth={el.strokeWidth || 4} strokeLinecap='round' strokeLinejoin='round' />
      </svg>
    )
  }
  if (el.shape === 'line') {
    return (
      <svg viewBox='0 0 100 100' preserveAspectRatio='none' className='size-full overflow-visible'>
        <line x1='0' y1='50' x2='100' y2='50' stroke={strokeColor} strokeWidth={el.strokeWidth || 3} strokeLinecap='round' />
      </svg>
    )
  }
  return (
    <svg viewBox='0 0 100 100' preserveAspectRatio='none' className='size-full overflow-visible'>
      <path d='M 10,90 Q 50,10 90,90' fill='none' stroke={strokeColor} strokeWidth={el.strokeWidth || 3} strokeLinecap='round' />
    </svg>
  )
}

function ShapeRenderer({ el }: { el: ShapeElement }) {
  if (el.shape === 'ellipse' || el.shape === 'circle') {
    return <div style={{ ...getShapeStyle(el), borderRadius: CIRCLE_RADIUS }} className='size-full transition-colors' />
  }
  if (el.shape === 'rect' || el.shape === 'rounded' || el.shape === 'card') {
    return <div style={getShapeStyle(el)} className='size-full transition-colors' />
  }
  return renderSvgShape(el)
}

function ImageRenderer({ el }: { el: ImageElement }) {
  const fitClass = el.fit === 'cover' ? 'object-cover' : 'object-contain'
  const style = el.radius ? { borderRadius: `${el.radius}px` } : undefined

  return (
    <img
      src={el.src}
      alt=''
      style={style}
      className={`size-full overflow-hidden ${fitClass}`}
      draggable={false}
    />
  )
}

function TableRenderer({ el }: { el: TableElement }) {
  return (
    <div style={getTableStyle(el)} className='size-full overflow-hidden border'>
      <table className='w-full border-collapse text-left'>
        <tbody>
          {el.rows.map((row, rIdx) => (
            <tr
              key={`r-${rIdx}`}
              className={`border-b border-[var(--border-subtle)] ${
                rIdx % 2 === 1 ? 'bg-[var(--bg-hover)]' : ''
              }`}
            >
              {row.cells.map((cell, cIdx) => (
                <td
                  key={`c-${cIdx}`}
                  className={`p-3 text-sm ${cell.bold ? 'font-semibold' : ''}`}
                  dangerouslySetInnerHTML={{ __html: sanitizeSlideRichText(cell.html) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

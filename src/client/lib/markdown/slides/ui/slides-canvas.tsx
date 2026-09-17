import { memo, useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import type {
  ImageElement,
  ShapeElement,
  Slide,
  SlideElement,
  SlidesTheme,
  TableElement,
  TextElement,
} from '../types'
import {
  getElementBoxStyle,
  getShapeStyle,
  getTableStyle,
  getTextStyle,
  isBackgroundLayer,
} from './canvas-helpers'
import type { PageSize } from '../page'
import { SelectionOverlay } from './selection-overlay'
import { pasteSlideRichText, sanitizeSlideRichText, sanitizeSlideSvgMarkup } from '../sanitize'
import { SlideCodeBlock } from './code-block'
import { SlideChartBlock } from './chart-block'

const CIRCLE_RADIUS = '50%'

interface SlidesCanvasProps {
  slide: Slide
  theme: SlidesTheme
  /** The page this deck is authored against; the canvas never assumes a default one. */
  page: PageSize
  scale?: number
  editable?: boolean
  activeElementId?: string | null
  /** The element the reader is typing into, which is what puts the caret in a text box. */
  editingElementId?: string | null
  assets?: Record<string, string>
  onSelectElement?: (id: string | null) => void
  onUpdateElement?: (id: string, patch: Partial<SlideElement>) => void
}

export const SlidesCanvas = memo(function SlidesCanvas({
  slide,
  theme,
  page,
  scale = 1,
  editable = false,
  activeElementId = null,
  editingElementId = null,
  assets,
  onSelectElement,
  onUpdateElement,
}: SlidesCanvasProps) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const canvasBg = slide.background || theme.background || 'var(--bg-inset)'
  const textColor = theme.color || 'var(--text-primary)'
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePointerDown = (e: MouseEvent, el: SlideElement) => {
    if (!editable) return
    e.stopPropagation()
    onSelectElement?.(el.id)
    dragRef.current = {
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
    }

    const onPointerMove = (moveEv: globalThis.MouseEvent) => {
      if (!dragRef.current || !onUpdateElement) return
      const dx = (moveEv.clientX - dragRef.current.startX) / (scale || 1)
      const dy = (moveEv.clientY - dragRef.current.startY) / (scale || 1)
      const nextX = Math.round(dragRef.current.origX + dx)
      const nextY = Math.round(dragRef.current.origY + dy)
      onUpdateElement(dragRef.current.id, { x: nextX, y: nextY })
    }

    const onPointerUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onPointerMove)
      window.removeEventListener('mouseup', onPointerUp)
    }

    window.addEventListener('mousemove', onPointerMove)
    window.addEventListener('mouseup', onPointerUp)
  }

  const containerStyle = {
    backgroundColor: canvasBg,
    color: textColor,
    fontFamily: theme.fontFamily || 'inherit',
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'top left',
  }

  return (
    <div
      ref={canvasRef}
      className='relative overflow-hidden select-none bento-slide-shadow rounded-xs'
      style={{
        width: `${page.width}px`,
        height: `${page.height}px`,
        ...containerStyle,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelectElement?.(null)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectElement?.(null)
      }}
    >
      {slide.elements.map((el) => {
        const isSelected = editable && activeElementId === el.id
        const isBg = isBackgroundLayer(el, page)
        const pointerEvents = !editable || (isBg && !isSelected) ? 'none' : 'auto'

        return (
          <div
            key={el.id}
            data-slide-element={el.id}
            style={{
              ...getElementBoxStyle(el),
              pointerEvents,
            }}
            onMouseDown={(e) => {
              if (!editable || (isBg && !isSelected)) return
              handlePointerDown(e, el)
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (editable && (!isBg || isSelected)) {
                onSelectElement?.(el.id)
              }
            }}
            className={`group transition-shadow ${
              editable && (!isBg || isSelected) ? 'cursor-move' : ''
            }`}
          >
            <ElementRenderer
              el={el}
              theme={theme}
              editable={editable}
              isSelected={isSelected}
              editing={editingElementId === el.id}
              assets={assets}
              onUpdate={(patch) => onUpdateElement?.(el.id, patch)}
            />
            {isSelected && onUpdateElement && (
              <SelectionOverlay
                element={el}
                scale={scale}
                onUpdate={(patch) => onUpdateElement(el.id, patch)}
                canvasRef={canvasRef}
              />
            )}
          </div>
        )
      })}
    </div>
  )
})

function ElementRenderer({
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
  onUpdate: (patch: Partial<SlideElement>) => void
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
  onUpdate: (patch: Partial<SlideElement>) => void
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
        if (nextHtml !== el.html) onUpdate({ html: nextHtml })
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




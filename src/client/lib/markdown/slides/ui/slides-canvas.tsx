import { memo, useRef, type MouseEvent, type ReactNode } from 'react'
import type {
  ChartElement,
  CodeElement,
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
  getChartColor,
  VIRTUAL_CANVAS_WIDTH,
  VIRTUAL_CANVAS_HEIGHT,
} from './canvas-helpers'

const CIRCLE_RADIUS = '50%'

interface SlidesCanvasProps {
  slide: Slide
  theme: SlidesTheme
  scale?: number
  editable?: boolean
  activeElementId?: string | null
  assets?: Record<string, string>
  onSelectElement?: (id: string | null) => void
  onUpdateElement?: (id: string, patch: Partial<SlideElement>) => void
}

export const SlidesCanvas = memo(function SlidesCanvas({
  slide,
  theme,
  scale = 1,
  editable = false,
  activeElementId = null,
  assets,
  onSelectElement,
  onUpdateElement,
}: SlidesCanvasProps) {
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
      className='relative overflow-hidden select-none bento-slide-shadow rounded-xs'
      style={{
        width: `${VIRTUAL_CANVAS_WIDTH}px`,
        height: `${VIRTUAL_CANVAS_HEIGHT}px`,
        ...containerStyle,
      }}
      onClick={() => onSelectElement?.(null)}
    >
      {slide.elements.map((el) => {
        const isSelected = editable && activeElementId === el.id
        return (
          <div
            key={el.id}
            style={getElementBoxStyle(el)}
            onMouseDown={(e) => handlePointerDown(e, el)}
            className={`group transition-shadow ${
              editable ? 'cursor-move' : ''
            } ${isSelected ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-transparent' : ''}`}
          >
            <ElementRenderer
              el={el}
              theme={theme}
              editable={editable}
              isSelected={isSelected}
              assets={assets}
              onUpdate={(patch) => onUpdateElement?.(el.id, patch)}
            />
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
  assets,
  onUpdate,
}: {
  el: SlideElement
  theme: SlidesTheme
  editable: boolean
  isSelected: boolean
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
          onUpdate={onUpdate}
        />
      )
    case 'shape':
      return <ShapeRenderer el={el} />
    case 'svg': {
      const markup = (el.asset && assets ? assets[el.asset] : el.markup || el.svg) ?? ''
      return markup ? (
        <div className='size-full overflow-hidden' dangerouslySetInnerHTML={{ __html: markup }} />
      ) : null
    }
    case 'image':
      return <ImageRenderer el={el} />
    case 'table':
      return <TableRenderer el={el} />
    case 'chart':
      return <ChartRenderer el={el} defaultAccent={theme.accent} />
    case 'code':
      return <CodeRenderer el={el} />
    default:
      return null
  }
}

function TextRenderer({
  el,
  editable,
  isSelected,
  onUpdate,
}: {
  el: TextElement
  editable: boolean
  isSelected: boolean
  onUpdate: (patch: Partial<SlideElement>) => void
}) {
  return (
    <div
      style={getTextStyle(el)}
      className='size-full overflow-hidden leading-snug break-words'
      contentEditable={editable && isSelected}
      suppressContentEditableWarning
      onBlur={(e) => {
        const nextHtml = e.currentTarget.innerHTML
        if (nextHtml !== el.html) onUpdate({ html: nextHtml })
      }}
      dangerouslySetInnerHTML={{ __html: el.html }}
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
                  dangerouslySetInnerHTML={{ __html: cell.html }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartRenderer({
  el,
  defaultAccent,
}: {
  el: ChartElement
  defaultAccent: string
}) {
  const color = getChartColor(el, defaultAccent)
  const maxVal = Math.max(...el.data.map((d) => d.value), 1)

  return (
    <div className='flex size-full flex-col justify-end p-4 rounded-xl bg-[var(--bg-raised)] border border-[var(--border-subtle)]'>
      {el.title && (
        <span className='mb-2 text-sm font-medium text-[var(--text-secondary)]'>
          {el.title}
        </span>
      )}
      <div className='flex flex-1 items-end gap-3'>
        {el.data.map((d, idx) => {
          const heightPercent = Math.round((d.value / maxVal) * 100)
          return (
            <div key={`cd-${idx}`} className='flex flex-1 flex-col items-center gap-1.5 h-full justify-end'>
              <span className='text-xs font-semibold'>{d.value}</span>
              <div
                className='w-full rounded-t transition-all'
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: color,
                }}
              />
              <span className='truncate text-xs text-[var(--text-tertiary)]'>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CodeRenderer({ el }: { el: CodeElement }) {
  return (
    <div className='size-full overflow-hidden rounded-lg bg-[var(--bg-inset)] p-4 font-mono text-sm border border-[var(--border-subtle)]'>
      <div className='mb-2 flex items-center justify-between text-xs text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] pb-1'>
        <span>{el.lang || 'code'}</span>
      </div>
      <pre className='overflow-x-auto text-[var(--text-primary)]'>
        <code>{el.code}</code>
      </pre>
    </div>
  )
}

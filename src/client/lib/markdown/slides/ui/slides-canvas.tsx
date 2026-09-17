import { memo, useRef } from 'react'
import type { Slide, SlideElement, SlidesTheme } from '../types'
import type { PageSize } from '../page'
import { SlideElementBox } from './slide-element-box'

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

/**
 * The page itself: its size, its colours and the boxes on it. What each box is and what the
 * pointer does to it belong to the box (see slide-element-box.tsx); this file answers the
 * other half of the question — which page is being drawn, and that a click on the page's own
 * background is a click on nothing.
 */
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

  return (
    <div
      ref={canvasRef}
      className='relative overflow-hidden select-none bento-slide-shadow rounded-xs'
      style={{
        width: `${page.width}px`,
        height: `${page.height}px`,
        backgroundColor: slide.background || theme.background || 'var(--bg-inset)',
        color: theme.color || 'var(--text-primary)',
        fontFamily: theme.fontFamily || 'inherit',
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelectElement?.(null)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectElement?.(null)
      }}
    >
      {slide.elements.map((el) => (
        <SlideElementBox
          key={el.id}
          el={el}
          page={page}
          theme={theme}
          scale={scale}
          editable={editable}
          isSelected={editable && activeElementId === el.id}
          editing={editingElementId === el.id}
          assets={assets}
          canvasRef={canvasRef}
          onSelect={onSelectElement}
          onUpdate={
            onUpdateElement ? (patch) => onUpdateElement(el.id, patch) : undefined
          }
        />
      ))}
    </div>
  )
})

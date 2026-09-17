import { memo, useRef, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import type { Slide, SlideElement, SlidesTheme } from '../types'
import type { ElementPosition } from '../edits'
import type { PageSize } from '../page'
import type { Rect } from './canvas-helpers'
import { SlideElementBox } from './slide-element-box'
import { useSlidesMarquee } from './use-slides-marquee'

interface CanvasProps {
  slide: Slide
  theme: SlidesTheme
  /** The page this deck is authored against; the canvas never assumes a default one. */
  page: PageSize
  scale?: number
  editable?: boolean
  /** Every selected box, and the last one picked, which is where the handles go. */
  selectedIds?: string[]
  primaryId?: string | null
  /** The element the reader is typing into, which is what puts the caret in a text box. */
  editingElementId?: string | null
  assets?: Record<string, string>
  onSelectElement?: (id: string | null, additive?: boolean) => void
  onSelectMany?: (ids: string[]) => void
  onUpdateElement?: (id: string, patch: Partial<SlideElement>) => void
  onMoveElements?: (positions: ElementPosition[]) => void
}

interface LayersProps extends CanvasProps {
  scale: number
  editable: boolean
  canvasRef: RefObject<HTMLDivElement | null>
}

/**
 * The page itself: its size, its colours and the boxes on it. What each box is and what the
 * pointer does to it belong to the box (see slide-element-box.tsx); this file answers the
 * other half of the question — which page is being drawn, and what a drag across its own
 * backdrop means (the rubber band, in use-slides-marquee.ts).
 */
export const SlidesCanvas = memo(function SlidesCanvas(props: CanvasProps) {
  const { slide, page, scale = 1, editable = false, onSelectElement, onSelectMany } = props
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const { band, start } = useSlidesMarquee({
    canvasRef,
    enabled: editable && Boolean(onSelectMany),
    scale,
    elements: slide.elements,
    page,
    onSelectMany: (ids) => onSelectMany?.(ids),
    onClear: () => onSelectElement?.(null),
  })

  return (
    <SlidePageBox {...props} scale={scale} canvasRef={canvasRef} onBackdropPress={start}>
      <CanvasLayers {...props} scale={scale} editable={editable} canvasRef={canvasRef} />
      {band && <MarqueeBand band={band} />}
    </SlidePageBox>
  )
})

interface PageBoxProps extends CanvasProps {
  scale: number
  canvasRef: RefObject<HTMLDivElement | null>
  onBackdropPress: (event: ReactMouseEvent<HTMLDivElement>) => void
  children: ReactNode
}

/** The page as a surface: its size, its colours, and the press on its own backdrop. */
function SlidePageBox({
  slide,
  theme,
  page,
  scale,
  canvasRef,
  onBackdropPress,
  children,
}: PageBoxProps) {
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
        if (e.target !== e.currentTarget) return
        onBackdropPress(e)
      }}
    >
      {children}
    </div>
  )
}

/** The rubber band while it is being drawn, over everything it is choosing between. */
function MarqueeBand({ band }: { band: Rect }) {
  return (
    <div
      data-slide-marquee=''
      className='pointer-events-none absolute z-40 border border-[var(--accent)] bg-[var(--accent-soft)]'
      style={{ left: `${band.x}px`, top: `${band.y}px`, width: `${band.w}px`, height: `${band.h}px` }}
    />
  )
}

/**
 * The boxes of one page, in paint order. They are drawn apart from the page box because a drag
 * carries the whole selection: each box needs to know where every other selected box sits right
 * now, which the page is the only thing that can answer.
 */
const CanvasLayers = memo(function CanvasLayers({
  slide,
  theme,
  page,
  scale,
  editable,
  selectedIds,
  primaryId,
  editingElementId,
  assets,
  onSelectElement,
  onUpdateElement,
  onMoveElements,
  canvasRef,
}: LayersProps) {
  const selected = new Set(selectedIds ?? [])
  const targets = slide.elements
    .filter((element) => selected.has(element.id))
    .map((element) => ({ id: element.id, x: element.x, y: element.y }))

  return (
    <>
      {slide.elements.map((el) => (
        <SlideElementBox
          key={el.id}
          el={el}
          page={page}
          theme={theme}
          scale={scale}
          editable={editable}
          isSelected={editable && selected.has(el.id)}
          isPrimary={editable && primaryId === el.id}
          editing={editingElementId === el.id}
          targets={selected.has(el.id) ? targets : [{ id: el.id, x: el.x, y: el.y }]}
          assets={assets}
          canvasRef={canvasRef}
          onSelect={onSelectElement}
          onUpdate={onUpdateElement ? (patch) => onUpdateElement(el.id, patch) : undefined}
          onMove={onMoveElements}
        />
      ))}
    </>
  )
})

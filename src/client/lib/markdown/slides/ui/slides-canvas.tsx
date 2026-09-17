import { memo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import type { Slide, SlideElement, SlidesTheme } from '../types'
import type { ElementPosition } from '../edits'
import type { PageSize } from '../page'
import type { SnapGuide } from '../snap'
import { isBackgroundLayer, type Rect } from './canvas-helpers'
import { SlideElementBox, type DragTarget } from './slide-element-box'
import { useSlidesMarquee } from './use-slides-marquee'

/** The width of a guide line, in page pixels: one, so it reads as a line rather than a band. */
const GUIDE_WIDTH = 1

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
  /** A pan is armed: the page takes no pointer, so the gesture is the view's. */
  frozen?: boolean
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
  /** Where a drag hands the lines it is using, so the page can draw them while it runs. */
  onGuides: (guides: SnapGuide[]) => void
}

/**
 * The page itself: its size, its colours and the boxes on it. What each box is and what the
 * pointer does to it belong to the box (see slide-element-box.tsx); this file answers the
 * other half of the question — which page is being drawn, and what a drag across its own
 * backdrop means (the rubber band, in use-slides-marquee.ts).
 */
export const SlidesCanvas = memo(function SlidesCanvas(props: CanvasProps) {
  const { slide, page, scale = 1, editable = false, frozen, onSelectElement, onSelectMany } = props
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const { band, start } = useSlidesMarquee({
    canvasRef,
    enabled: editable && !frozen && Boolean(onSelectMany),
    scale,
    elements: slide.elements,
    page,
    onSelectMany: (ids) => onSelectMany?.(ids),
    onClear: () => onSelectElement?.(null),
  })

  return (
    <SlidePageBox {...props} scale={scale} canvasRef={canvasRef} onBackdropPress={start}>
      <CanvasLayers
        {...props}
        scale={scale}
        editable={editable}
        canvasRef={canvasRef}
        onGuides={setGuides}
      />
      <GuideLines guides={guides} />
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

/**
 * The lines a drag is lined up on: one per axis, drawn across the page wherever the box it is
 * carrying met something. They are what makes the jump legible — a box that stops six pixels
 * short of where the pointer is is a bug unless the page says why.
 *
 * A guide that carries a span is not a line but a gap, and it is drawn as one (SpacingLine): the
 * `data-slide-gap` marker is what tells the two apart, since both are guides on the axis.
 */
function GuideLines({ guides }: { guides: SnapGuide[] }) {
  return (
    <>
      {guides.map((guide, index) =>
        guide.span ? (
          <SpacingLine key={`gap-${guide.axis}-${guide.at}-${index}`} guide={guide} span={guide.span} />
        ) : (
          <div
            key={`${guide.axis}-${guide.at}-${guide.source}-${index}`}
            data-slide-guide={guide.axis}
            className='pointer-events-none absolute z-30 bg-[var(--accent)]'
            style={
              guide.axis === 'x'
                ? { left: `${guide.at}px`, top: 0, width: `${GUIDE_WIDTH}px`, height: '100%' }
                : { top: `${guide.at}px`, left: 0, height: `${GUIDE_WIDTH}px`, width: '100%' }
            }
          />
        ),
      )}
    </>
  )
}

/**
 * A gap the drag is keeping even: drawn from one edge to the other across the space it measures,
 * with the width written at its middle. A line running the whole page could not say which two
 * boxes its number belongs to, which is the entire question an even spacing asks.
 *
 * The label is on an opaque surface rather than on the accent itself: it is painted over the
 * slide's own background, which is the reader's colour and not one a token can promise contrast
 * against.
 */
function SpacingLine({
  guide,
  span,
}: {
  guide: SnapGuide
  span: NonNullable<SnapGuide['span']>
}) {
  const horizontal = guide.axis === 'x'
  const middle = (span.from + span.to) / 2
  return (
    <>
      <div
        data-slide-guide={guide.axis}
        data-slide-gap=''
        className='pointer-events-none absolute z-30 bg-[var(--accent)]'
        style={
          horizontal
            ? { left: `${span.from}px`, top: `${guide.at}px`, width: `${span.to - span.from}px`, height: `${GUIDE_WIDTH}px` }
            : { top: `${span.from}px`, left: `${guide.at}px`, height: `${span.to - span.from}px`, width: `${GUIDE_WIDTH}px` }
        }
      />
      <span
        data-slide-gap-size=''
        className='tabular pointer-events-none absolute z-30 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-overlay)] px-1 text-[length:var(--text-11)] text-[var(--text-primary)]'
        style={
          horizontal
            ? { left: `${middle}px`, top: `${guide.at}px`, transform: 'translate(-50%, -50%)' }
            : { top: `${middle}px`, left: `${guide.at}px`, transform: 'translate(-50%, -50%)' }
        }
      >
        {Math.round(guide.size ?? span.to - span.from)}
      </span>
    </>
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
  frozen,
  assets,
  onSelectElement,
  onUpdateElement,
  onMoveElements,
  canvasRef,
  onGuides,
}: LayersProps) {
  const selected = new Set(selectedIds ?? [])
  const targets: DragTarget[] = slide.elements
    .filter((element) => selected.has(element.id))
    .map((element) => ({ id: element.id, x: element.x, y: element.y, w: element.w, h: element.h }))
  // Every box on the page as something a drag can line up against, minus the backdrop — it covers
  // the whole page, so it would offer a line on every edge at once. The drag itself takes the
  // boxes it is carrying out of this list.
  const boxes = slide.elements
    .filter((element) => !isBackgroundLayer(element, page))
    .map((element) => ({ id: element.id, x: element.x, y: element.y, w: element.w, h: element.h }))

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
          frozen={frozen}
          targets={selected.has(el.id) ? targets : [{ id: el.id, x: el.x, y: el.y, w: el.w, h: el.h }]}
          snap={{ boxes, report: onGuides }}
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

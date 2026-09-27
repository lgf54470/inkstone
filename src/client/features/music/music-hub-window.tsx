import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { GripHorizontal, Maximize2, Minimize2, MoveDiagonal2, Music, PanelLeft, Settings, SlidersHorizontal, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { TOUCH_TARGET_CLASS } from './music-play-buttons'
import type { MusicHubGeometry } from './music-store'

// REF-1b: the window may be dragged and stretched, but never past the point where it
// stops being usable — or off the screen, where no one could drag it back.
export const HUB_MIN_WIDTH = 720
export const HUB_MIN_HEIGHT = 420
export const HUB_MAX_OFFSET_PX = 240
export const HUB_MOVE_STEP_PX = 24
// FB-U1: the widest the window is allowed to get. The dialog carries this as its max-width, so a
// wider value here would only disagree with what gets painted.
export const HUB_MAX_WIDTH = 1240

function clampHubWidth(width: number): number {
  return Math.min(HUB_MAX_WIDTH, window.innerWidth - 32, Math.max(HUB_MIN_WIDTH, Math.round(width)))
}

function clampHubHeight(height: number): number {
  return Math.min(window.innerHeight - 32, Math.max(HUB_MIN_HEIGHT, Math.round(height)))
}

function clampHubOffset(offset: number): number {
  return Math.min(HUB_MAX_OFFSET_PX, Math.max(-HUB_MAX_OFFSET_PX, Math.round(offset)))
}

// FB-U1: the window keeps the offset it was given when the screen it was sized on goes away.
// Only a resize event knows that happened, and the box has to answer it rather than wait for the
// next drag, which the pointer can no longer reach once the control has left the viewport.
export function clampHubGeometry(geometry: MusicHubGeometry): MusicHubGeometry {
  return {
    width: geometry.width === undefined ? undefined : clampHubWidth(geometry.width),
    height: geometry.height === undefined ? undefined : clampHubHeight(geometry.height),
    dx: geometry.dx === undefined ? undefined : clampHubOffset(geometry.dx),
    dy: geometry.dy === undefined ? undefined : clampHubOffset(geometry.dy),
  }
}

export function useHubViewportClamp(
  windowed: boolean,
  geometry: MusicHubGeometry,
  onChange: (geometry: MusicHubGeometry) => void,
): void {
  useEffect(() => {
    if (!windowed) return
    const reflow = (): void => {
      const next = clampHubGeometry(geometry)
      if (next.width !== geometry.width || next.height !== geometry.height || next.dx !== geometry.dx || next.dy !== geometry.dy) {
        onChange(next)
      }
    }
    // A geometry stored on a bigger screen has to be brought inside this one when the hub opens,
    // not only when the window is next resized.
    reflow()
    window.addEventListener('resize', reflow)
    return () => window.removeEventListener('resize', reflow)
  }, [windowed, geometry, onChange])
}

// REF-1b: geometry is runtime values, so it travels as inline style (AGENTS.md allows
// dynamic values there). A zero offset leaves the dialog centred, which is what an
// untouched hub should look like.
//
// FB-F1: the offset is written as the standalone `translate` property and never as
// `transform`. The dialog carries `.anim-pop`, whose `ink-pop` keyframes end on
// `transform: none` with a `both` fill — an animation's declarations beat inline styles in
// the cascade, so a `transform` written here was painted as `none` for the life of the
// dialog: dragging and the arrow keys moved the store and nothing on screen. `translate` is
// a separate property, so the entrance animation cannot reach it.
export function hubStyle(geometry: MusicHubGeometry): CSSProperties {
  return {
    width: geometry.width,
    height: geometry.height,
    translate: geometry.dx || geometry.dy ? `${geometry.dx ?? 0}px ${geometry.dy ?? 0}px` : undefined,
  }
}

// One step in each direction, read off the key — the same amounts the pointer drag can
// produce, so both roads lead to the same geometry.
function arrowStep(key: string): { dx: number; dy: number } {
  if (key === 'ArrowRight') return { dx: HUB_MOVE_STEP_PX, dy: 0 }
  if (key === 'ArrowLeft') return { dx: -HUB_MOVE_STEP_PX, dy: 0 }
  if (key === 'ArrowDown') return { dx: 0, dy: HUB_MOVE_STEP_PX }
  if (key === 'ArrowUp') return { dx: 0, dy: -HUB_MOVE_STEP_PX }
  return { dx: 0, dy: 0 }
}

// REF-1b: a windowed dialog answers to the pointer through its header and to the
// keyboard through this control; both write the same offset.
export function HubMoveButton({ geometry, onGeometryChange }: {
  geometry: MusicHubGeometry
  onGeometryChange: (geometry: MusicHubGeometry) => void
}) {
  return (
    <IconButton
      label={t('music.move_hub')}
      size='sm'
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        const step = arrowStep(event.key)
        if (step.dx === 0 && step.dy === 0) return
        event.preventDefault()
        onGeometryChange({
          ...geometry,
          dx: clampHubOffset((geometry.dx ?? 0) + step.dx),
          dy: clampHubOffset((geometry.dy ?? 0) + step.dy),
        })
      }}
    >
      <GripHorizontal size={14} />
    </IconButton>
  )
}

export interface HubResizeEdge {
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
}

export interface HubResizeStart {
  width: number
  height: number
  dx: number
  dy: number
}

// FB-U1: the box is centred, so growing it moves both edges and half of every change lands on
// each side. Holding an edge means travelling the half that would otherwise move the edge the
// pointer is holding — which is also why the offset answers to the same budget a drag does.
export function resizeHubGeometry(start: HubResizeStart, edge: HubResizeEdge, delta: { x: number; y: number }): MusicHubGeometry {
  const width = clampHubWidth(start.width + edge.dx * delta.x)
  const height = clampHubHeight(start.height + edge.dy * delta.y)
  return {
    width,
    height,
    dx: clampHubOffset(start.dx + (edge.dx * (width - start.width)) / 2),
    dy: clampHubOffset(start.dy + (edge.dy * (height - start.height)) / 2),
  }
}

interface ResizeZone extends HubResizeEdge {
  key: string
  className: string
  grip?: boolean
}

const RESIZE_EDGE_CLASS = 'inset-x-6 h-1.5 cursor-ns-resize'
const RESIZE_SIDE_CLASS = 'inset-y-6 w-1.5 cursor-ew-resize'
const RESIZE_CORNER_CLASS = 'size-3.5'
// FB-U1: one zone per edge and corner. The south-east corner is the one a keyboard and a screen
// reader are told about — it carries the name and the arrow keys resize both dimensions from it.
// The other seven are pointer affordances of the window frame: keeping them out of the tab order
// and out of the accessibility tree means the header does not read as eight controls that all
// resize, and the seven still answer the pointer exactly where a window's edges are.
const RESIZE_ZONES: readonly ResizeZone[] = [
  { key: 'n', dx: 0, dy: -1, className: cn(RESIZE_EDGE_CLASS, 'top-0') },
  { key: 's', dx: 0, dy: 1, className: cn(RESIZE_EDGE_CLASS, 'bottom-0') },
  { key: 'w', dx: -1, dy: 0, className: cn(RESIZE_SIDE_CLASS, 'left-0') },
  { key: 'e', dx: 1, dy: 0, className: cn(RESIZE_SIDE_CLASS, 'right-0') },
  { key: 'nw', dx: -1, dy: -1, className: cn(RESIZE_CORNER_CLASS, 'left-0 top-0 cursor-nwse-resize') },
  { key: 'ne', dx: 1, dy: -1, className: cn(RESIZE_CORNER_CLASS, 'right-0 top-0 cursor-nesw-resize') },
  { key: 'sw', dx: -1, dy: 1, className: cn(RESIZE_CORNER_CLASS, 'left-0 bottom-0 cursor-nesw-resize') },
  { key: 'se', dx: 1, dy: 1, className: 'right-0 bottom-0 size-4.5 cursor-nwse-resize', grip: true },
]

export function HubResizeZones({ geometry, widthFallback, onResize }: {
  geometry: MusicHubGeometry
  widthFallback: number
  onResize: (geometry: MusicHubGeometry) => void
}) {
  const dragRef = useRef<{ pointerX: number; pointerY: number; start: HubResizeStart } | null>(null)
  // A gesture starts from the box on screen, not from a default: the fallbacks are only what the
  // dialog would paint if the store had never been told a size, and the paint also answers to the
  // frame it sits in — so a drag that began from the fallback could write a width the window never
  // shows. jsdom reports a zero box, which is where the fallbacks still earn their keep.
  const startSize = (target: HTMLElement): HubResizeStart => {
    const box = target.closest('[role="dialog"]')?.getBoundingClientRect()
    return {
      width: box?.width || geometry.width || widthFallback,
      height: box?.height || geometry.height || Math.round(window.innerHeight * 0.84),
      dx: geometry.dx ?? 0,
      dy: geometry.dy ?? 0,
    }
  }
  const begin = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, start: startSize(event.currentTarget) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const drag = (event: ReactPointerEvent<HTMLButtonElement>, edge: ResizeZone): void => {
    const started = dragRef.current
    if (!started) return
    onResize(resizeHubGeometry(started.start, edge, { x: event.clientX - started.pointerX, y: event.clientY - started.pointerY }))
  }
  const end = (): void => { dragRef.current = null }
  const stepBy = (event: KeyboardEvent<HTMLButtonElement>, edge: ResizeZone): void => {
    const step = arrowStep(event.key)
    if (step.dx === 0 && step.dy === 0) return
    event.preventDefault()
    // The keyboard step and the pointer delta say the same thing in two coordinate conventions:
    // a movement (dx/dy) rather than a pointer position (x/y).
    onResize(resizeHubGeometry(startSize(event.currentTarget), edge, { x: step.dx, y: step.dy }))
  }
  return (
    <>
      {RESIZE_ZONES.map((zone) => (
        <HubResizeZone key={zone.key} zone={zone} onBegin={begin} onDrag={drag} onEnd={end} onStep={stepBy} />
      ))}
    </>
  )
}

function HubResizeZone({ zone, onBegin, onDrag, onEnd, onStep }: {
  zone: ResizeZone
  onBegin: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onDrag: (event: ReactPointerEvent<HTMLButtonElement>, zone: ResizeZone) => void
  onEnd: () => void
  onStep: (event: KeyboardEvent<HTMLButtonElement>, zone: ResizeZone) => void
}) {
  return (
    <button
      type='button'
      data-hub-resize={zone.key}
      aria-hidden={zone.grip ? undefined : 'true'}
      tabIndex={zone.grip ? 0 : -1}
      aria-label={zone.grip ? t('music.resize_hub') : undefined}
      className={cn(
        'absolute z-10 flex touch-none items-center justify-center rounded-none border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        zone.className,
      )}
      onPointerDown={onBegin}
      onPointerMove={(event) => onDrag(event, zone)}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      onKeyDown={(event) => onStep(event, zone)}
    >
      {/* The grip is drawn rather than left invisible: a 4px invisible corner is a gesture people
          find by accident, and the mark is what says the window can be stretched. */}
      {zone.grip && <MoveDiagonal2 size={12} aria-hidden='true' className='text-[var(--text-tertiary)]' />}
    </button>
  )
}

export interface HubHeaderProps {
  onClose: () => void
  narrow: boolean
  maximized: boolean
  windowed: boolean
  geometry: MusicHubGeometry
  onGeometryChange: (geometry: MusicHubGeometry) => void
  onToggleMaximized: () => void
  onOpenNavigation: () => void
  onOpenNowPlaying: () => void
  onOpenSettings: () => void
  /** Which folded column is unfolded right now, so the two disclosures can say it. */
  activePanel: 'navigation' | 'nowPlaying' | null
}

export function HubHeader(props: HubHeaderProps) {
  const { windowed, geometry, onGeometryChange, onToggleMaximized } = props
  const dragRef = useRef<{ pointerX: number; pointerY: number; dx: number; dy: number } | null>(null)
  const startDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    // A press that began on a button belongs to that button, not to the window.
    if (!windowed || (event.target as HTMLElement).closest('button')) return
    dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, dx: geometry.dx ?? 0, dy: geometry.dy ?? 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    onGeometryChange({
      ...geometry,
      dx: clampHubOffset(drag.dx + (event.clientX - drag.pointerX)),
      dy: clampHubOffset(drag.dy + (event.clientY - drag.pointerY)),
    })
  }
  const endDrag = (): void => { dragRef.current = null }

  return (
    <header
      // FB-C3: the gate's toolbar sweep needs this row by name — the drawers its two toggles open
      // live under it, and this is the element that has to stay its own height when they do.
      data-hub-header
      // FB-U1: `touch-none` keeps a finger drag from scrolling the page out from under the
      // gesture, and the double click is the shortcut every window's title bar has — it toggles,
      // so the same gesture that fills the screen gives it back.
      className={cn(
        'flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4',
        windowed && 'cursor-grab touch-none select-none active:cursor-grabbing',
      )}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button')) onToggleMaximized() }}
    >
      <div className='flex items-center gap-2'>
        <Music size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>{t('music.hub_title')}</h2>
        {windowed && <HubMoveButton geometry={geometry} onGeometryChange={onGeometryChange} />}
      </div>
      <HubHeaderActions {...props} />
    </header>
  )
}

function HubHeaderActions({ onClose, narrow, maximized, activePanel, onToggleMaximized, onOpenNavigation, onOpenNowPlaying, onOpenSettings }: HubHeaderProps) {
  return (
    <div className='flex items-center gap-1'>
      {narrow && (
        <>
          {/* REF-3: a thumb needs 44px, and these two are the whole navigation on a
              phone, so they carry the touch floor while the desktop header stays tight.
              FB-C3: both disclose a drawer, so both say so — `aria-expanded` was missing, which
              left two controls whose only state was the tint of their own icon. */}
          <IconButton label={t('music.hub_open_navigation')} size='sm' className={TOUCH_TARGET_CLASS} aria-haspopup='dialog' aria-expanded={activePanel === 'navigation'} onClick={onOpenNavigation}><PanelLeft size={15} /></IconButton>
          <IconButton label={t('music.hub_open_now_playing')} size='sm' className={TOUCH_TARGET_CLASS} aria-haspopup='dialog' aria-expanded={activePanel === 'nowPlaying'} onClick={onOpenNowPlaying}><SlidersHorizontal size={15} /></IconButton>
        </>
      )}
      {/* FB-F4: the music preferences live in the settings panel, and this is the way there
          from the library — the same control on a phone, where the hub is the only surface. */}
      <IconButton
        label={t('music.open_settings')}
        size='sm'
        className={narrow ? TOUCH_TARGET_CLASS : undefined}
        onClick={onOpenSettings}
      >
        <Settings size={15} />
      </IconButton>
      {/* REF-1a: the header owned only a close button, so the library could never grow
          past the width it was built with. The toggle is a plain state flip on the same
          dialog — no remount, so the scroll position and the queue survive it. */}
      <IconButton
        label={maximized ? t('music.restore_hub') : t('music.maximize_hub')}
        size='sm'
        active={maximized}
        onClick={onToggleMaximized}
      >
        {maximized ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </IconButton>
      <IconButton label={t('common.close')} size='sm' className={narrow ? TOUCH_TARGET_CLASS : undefined} onClick={onClose}><X size={15} /></IconButton>
    </div>
  )
}

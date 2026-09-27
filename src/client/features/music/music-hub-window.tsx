import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { GripHorizontal, Maximize2, Minimize2, Music, PanelLeft, SlidersHorizontal, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { TOUCH_TARGET_CLASS } from './music-play-buttons'
import type { MusicHubGeometry } from './music-store'

// REF-1b: the window may be dragged and stretched, but never past the point where it
// stops being usable — or off the screen, where no one could drag it back.
const HUB_MIN_WIDTH = 720
const HUB_MIN_HEIGHT = 420
const HUB_MAX_OFFSET_PX = 240
export const HUB_MOVE_STEP_PX = 24

function clampHubWidth(width: number): number {
  return Math.min(window.innerWidth - 32, Math.max(HUB_MIN_WIDTH, Math.round(width)))
}

function clampHubHeight(height: number): number {
  return Math.min(window.innerHeight - 32, Math.max(HUB_MIN_HEIGHT, Math.round(height)))
}

function clampHubOffset(offset: number): number {
  return Math.min(HUB_MAX_OFFSET_PX, Math.max(-HUB_MAX_OFFSET_PX, Math.round(offset)))
}

// REF-1b: geometry is runtime values, so it travels as inline style (AGENTS.md allows
// dynamic values there). A zero offset leaves the dialog centred, which is what an
// untouched hub should look like.
export function hubStyle(geometry: MusicHubGeometry): CSSProperties {
  return {
    width: geometry.width,
    height: geometry.height,
    transform: geometry.dx || geometry.dy ? `translate(${geometry.dx ?? 0}px, ${geometry.dy ?? 0}px)` : undefined,
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

// REF-1b: the grip resizes the window from a pointer drag or from the arrow keys. It is
// a real button, not a bare div, so the keyboard road is the same as the pointer one.
export function HubResizeGrip({ geometry, widthFallback, onResize }: {
  geometry: MusicHubGeometry
  widthFallback: number
  onResize: (width: number, height: number) => void
}) {
  const dragRef = useRef<{ pointerX: number; pointerY: number; width: number; height: number } | null>(null)
  const size = (): { width: number; height: number } => ({
    width: geometry.width ?? widthFallback,
    height: geometry.height ?? Math.round(window.innerHeight * 0.84),
  })
  const commit = (width: number, height: number): void => {
    onResize(clampHubWidth(width), clampHubHeight(height))
  }
  return (
    <button
      type='button'
      aria-label={t('music.resize_hub')}
      className='absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize'
      onPointerDown={(event) => {
        const current = size()
        dragRef.current = { pointerX: event.clientX, pointerY: event.clientY, width: current.width, height: current.height }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) return
        commit(drag.width + (event.clientX - drag.pointerX), drag.height + (event.clientY - drag.pointerY))
      }}
      onPointerUp={() => { dragRef.current = null }}
      onPointerCancel={() => { dragRef.current = null }}
      onKeyDown={(event) => {
        const step = arrowStep(event.key)
        if (step.dx === 0 && step.dy === 0) return
        event.preventDefault()
        const current = size()
        commit(current.width + step.dx, current.height + step.dy)
      }}
    >
      <span aria-hidden='true' className='block size-4' />
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
}

export function HubHeader(props: HubHeaderProps) {
  const { windowed, geometry, onGeometryChange } = props
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
      className={cn('flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4', windowed && 'cursor-grab active:cursor-grabbing')}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
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

function HubHeaderActions({ onClose, narrow, maximized, onToggleMaximized, onOpenNavigation, onOpenNowPlaying }: HubHeaderProps) {
  return (
    <div className='flex items-center gap-1'>
      {narrow && (
        <>
          {/* REF-3: a thumb needs 44px, and these two are the whole navigation on a
              phone, so they carry the touch floor while the desktop header stays tight. */}
          <IconButton label={t('music.hub_open_navigation')} size='sm' className={TOUCH_TARGET_CLASS} onClick={onOpenNavigation}><PanelLeft size={15} /></IconButton>
          <IconButton label={t('music.hub_open_now_playing')} size='sm' className={TOUCH_TARGET_CLASS} onClick={onOpenNowPlaying}><SlidersHorizontal size={15} /></IconButton>
        </>
      )}
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

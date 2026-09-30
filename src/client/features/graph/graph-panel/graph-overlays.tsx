import { type RefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { t } from '../../../lib/i18n'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from '../../preview'
import type { CanvasNode } from './types'

export interface ColorLegendItem {
  label: string
  color: string
}

export interface GraphOverlaysProps {
  data: GraphResponse
  hover: CanvasNode | null
  selected: GraphResponse['nodes'][number] | null
  hint: string
  previewCard?: WikiLinkHoverCardState | null
  anchorPos?: { x: number; y: number; size: number } | null
  anchorRef?: RefObject<HTMLDivElement | null>
  isDark?: boolean
  onClosePreview?: () => void
  onEnterPreview?: () => void
  onLeavePreview?: () => void
  onPinPreview?: (card: WikiLinkHoverCardState, rect: DOMRect) => void
  colorLegends?: ColorLegendItem[]
  liveAnnouncement?: string
}

function TruncatedBadge({ shown, total }: { shown: number; total: number }) {
  return (
    <div
      role='status'
      className='absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3 py-1 text-[length:var(--text-11)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)]'
    >
      {t('graph.showing_limit', { shown, total })}
    </div>
  )
}

function NodeDetailBadge({ node }: { node: CanvasNode | GraphResponse['nodes'][number] }) {
  return (
    <div className='pointer-events-none absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3.5 py-1.5 text-[length:var(--text-12)] shadow-[var(--shadow-pop)]'>
      <span className='max-w-[50vw] truncate'>{node.title || t('common.untitled_note')}</span>
      <span className='ml-2 text-[var(--text-quaternary)]'>
        {t('graph.direction_counts', { incoming: node.inDegree, outgoing: node.outDegree })}
      </span>
    </div>
  )
}

function ColorLegend({ items }: { items: ColorLegendItem[] }) {
  if (items.length === 0) return null
  return (
    <div className='pointer-events-none absolute bottom-4 left-4 z-[var(--z-raised)] flex max-h-36 max-w-56 flex-col gap-1 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/90 p-2 text-[length:var(--text-11)] shadow-[var(--shadow-sm)] backdrop-blur-xs'>
      {items.map((item) => (
        <div key={item.label} className='flex items-center gap-1.5 truncate'>
          <span className='size-2.5 shrink-0 rounded-full' style={{ backgroundColor: item.color }} />
          <span className='truncate text-[var(--text-secondary)]'>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

const OFFSCREEN_COORD = '-9999px'

export function GraphOverlays({
  data,
  hover,
  selected,
  hint,
  previewCard,
  anchorPos,
  anchorRef,
  isDark = true,
  onClosePreview,
  onEnterPreview,
  onLeavePreview,
  onPinPreview,
  colorLegends = [],
  liveAnnouncement,
}: GraphOverlaysProps) {
  const shown = hover ?? selected
  return (
    <>
      {data.meta.truncated && (
        <TruncatedBadge shown={data.nodes.length} total={data.meta.totalNodes} />
      )}
      {shown && <NodeDetailBadge node={shown} />}
      <div className='pointer-events-none absolute top-3 left-4 hidden text-[length:var(--text-11)] text-[var(--text-quaternary)] md:block'>
        {hint}
      </div>
      {anchorRef && (
        <div
          ref={anchorRef}
          aria-hidden='true'
          style={{
            position: 'fixed',
            left: anchorPos ? `${anchorPos.x}px` : OFFSCREEN_COORD,
            top: anchorPos ? `${anchorPos.y}px` : OFFSCREEN_COORD,
            width: anchorPos ? `${anchorPos.size}px` : '1px',
            height: anchorPos ? `${anchorPos.size}px` : '1px',
            pointerEvents: 'none',
          }}
        />
      )}
      {previewCard && onClosePreview && onEnterPreview && onLeavePreview && onPinPreview && (
        <WikiLinkHoverCard
          card={previewCard}
          path={previewCard.noteId ? [previewCard.noteId] : []}
          depth={1}
          dark={isDark}
          onClose={onClosePreview}
          onEnter={onEnterPreview}
          onLeave={onLeavePreview}
          onPin={onPinPreview}
        />
      )}
      <ColorLegend items={colorLegends} />
      <div aria-live='polite' aria-atomic='true' className='sr-only'>
        {liveAnnouncement}
      </div>
    </>
  )
}

import { type RefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { Button } from '../../../components/primitives'
import { t } from '../../../lib/i18n'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from '../../preview'
import type { ColorLegendItem } from './helpers'
import type { CanvasNode } from './types'

export interface GraphOverlaysProps {
  data: GraphResponse
  hover: CanvasNode | null
  selected: GraphResponse['nodes'][number] | null
  hint: string
  /** The canvas names this hint as its description, so the id is the one both sides agree on. */
  hintId: string
  previewCard?: WikiLinkHoverCardState | null
  anchorPos?: { x: number; y: number; size: number } | null
  anchorRef?: RefObject<HTMLDivElement | null>
  isDark: boolean
  onClosePreview?: () => void
  onEnterPreview?: () => void
  onLeavePreview?: () => void
  onPinPreview?: (card: WikiLinkHoverCardState, rect: DOMRect) => void
  colorLegends?: ColorLegendItem[]
  /** The filter line the search box holds; with `onLegendSelect` the legend becomes a control (G-14 ④). */
  legendQuery?: string
  onLegendSelect?: (query: string) => void
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

function ColorLegend({ items, query, onSelect }: {
  items: ColorLegendItem[]
  /** The filter line the search box holds, so the row it names reads as pressed. */
  query?: string
  onSelect?: (query: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className='pointer-events-none absolute bottom-4 left-4 z-[var(--z-raised)] flex max-h-36 max-w-56 flex-col gap-1 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/90 p-2 text-[length:var(--text-11)] shadow-[var(--shadow-sm)] backdrop-blur-xs'>
      {items.map((item) => {
        const swatch = <span className='size-2.5 shrink-0 rounded-full' style={{ backgroundColor: item.color }} />
        if (!onSelect) {
          return (
            <div key={item.label} className='flex items-center gap-1.5 truncate'>
              {swatch}
              <span className='truncate text-[var(--text-secondary)]'>{item.label}</span>
            </div>
          )
        }
        return (
          <Button
            key={item.label}
            variant='ghost'
            size='sm'
            block
            icon={swatch}
            data-legend-query={item.query}
            aria-pressed={query === item.query}
            title={t('graph.legend_filter')}
            className='pointer-events-auto justify-start text-left aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]'
            onClick={() => { onSelect(item.query) }}
          >
            {item.label}
          </Button>
        )
      })}
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
  isDark,
  onClosePreview,
  onEnterPreview,
  onLeavePreview,
  onPinPreview,
  colorLegends = [],
  legendQuery,
  onLegendSelect,
  liveAnnouncement,
  hintId,
}: GraphOverlaysProps) {
  const shown = hover ?? selected
  return (
    <>
      {data.meta.truncated && (
        <TruncatedBadge shown={data.nodes.length} total={data.meta.totalNodes} />
      )}
      {shown && <NodeDetailBadge node={shown} />}
      {/* The hint stops being drawn on a phone, so the text the canvas describes itself with has to
          stay in the accessibility tree there: `hidden` would make the description resolve to nothing. */}
      <div id={hintId} className='pointer-events-none absolute top-3 left-4 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        <span className='sr-only md:not-sr-only'>{hint}</span>
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
      <ColorLegend items={colorLegends} query={legendQuery} onSelect={onLegendSelect} />
      <div aria-live='polite' aria-atomic='true' className='sr-only'>
        {liveAnnouncement}
      </div>
    </>
  )
}

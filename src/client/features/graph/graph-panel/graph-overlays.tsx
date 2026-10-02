import { type RefObject } from 'react'
import type { GraphResponse } from '@shared/types'
import { Button } from '../../../components/primitives'
import { Empty } from '../../../components/feedback'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from '../../preview'
import type { ColorLegendItem } from './helpers'
import type { CanvasNode } from './types'

export interface GraphOverlaysProps {
  data: GraphResponse
  hover: CanvasNode | null
  selected: GraphResponse['nodes'][number] | null
  hint: string
  /** The same list in the few words that fit a phone's top edge; the full sentence stays the description. */
  hintBrief: string
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
    <div data-graph-detail='' className='pointer-events-none max-w-[80vw] rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3.5 py-1.5 text-[length:var(--text-12)] shadow-[var(--shadow-pop)]'>
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
    <div data-graph-legend='' className='pointer-events-none self-start flex max-h-36 max-w-56 flex-col gap-1 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-overlay)]/90 p-2 text-[length:var(--text-11)] shadow-[var(--shadow-sm)] backdrop-blur-xs'>
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

/**
 * A frame that threw stops the loop, so what is on screen is whatever the half of it managed to paint.
 * That picture is not a graph the reader can use, and the physics will not come back on its own: this
 * surface says which part failed and hands back the one thing that can restart the loop (G-13).
 */
export function GraphPaintError({ error, onRetry }: { error: unknown, onRetry: () => void }) {
  return (
    <div data-graph-paint-error='' role='alert' className='absolute inset-0 z-[var(--z-raised)] flex items-center justify-center bg-[var(--bg-base)] p-6'>
      <Empty art='notes' title={t('graph.could_not_draw')} description={errorMessage(error)}
        action={<Button size='sm' variant='secondary' onClick={onRetry}>{t('common.retry')}</Button>}/>
    </div>
  )
}

const OFFSCREEN_COORD = '-9999px'

/**
 * One band for the two bottom overlays. At a phone's width the legend and the badge cannot share a line, and
 * a fixed offset would only clear one particular legend height, so the two are laid out in flow — what keeps
 * them apart is the band's own gap rather than a number this file has to keep true (G-18).
 */
function BottomBand({ node, legends, legendQuery, onLegendSelect }: {
  node: CanvasNode | GraphResponse['nodes'][number] | null
  legends: ColorLegendItem[]
  legendQuery?: string
  onLegendSelect?: (query: string) => void
}) {
  if (!node && legends.length === 0) return null
  return (
    <div className='pointer-events-none absolute inset-x-4 bottom-4 z-[var(--z-raised)] flex flex-col items-center gap-2'>
      <ColorLegend items={legends} query={legendQuery} onSelect={onLegendSelect} />
      {node && <NodeDetailBadge node={node} />}
    </div>
  )
}

/**
 * What the canvas says about itself. The full sentence is the description the canvas names, and it has to
 * survive on a phone as sr-only text: a description inside a `hidden` element is not described at all. What
 * a phone *draws* is the brief line instead, because the sentence does not fit the top edge it sits on and
 * would be read out twice if it joined the description rather than standing in for it (G-27, G-19).
 */
function CanvasHint({ hint, hintBrief, hintId }: { hint: string, hintBrief: string, hintId: string }) {
  return (
    <div className='pointer-events-none absolute top-3 left-4 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
      <span id={hintId} className='sr-only md:not-sr-only'>{hint}</span>
      <span data-graph-hint-brief='' aria-hidden='true' className='md:hidden'>{hintBrief}</span>
    </div>
  )
}

export function GraphOverlays({
  data,
  hover,
  selected,
  hint,
  hintBrief,
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
      <BottomBand node={shown} legends={colorLegends} legendQuery={legendQuery} onLegendSelect={onLegendSelect} />
      <CanvasHint hint={hint} hintBrief={hintBrief} hintId={hintId} />
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
      <div aria-live='polite' aria-atomic='true' className='sr-only'>
        {liveAnnouncement}
      </div>
    </>
  )
}

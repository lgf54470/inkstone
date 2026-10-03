/**
 * The fence-level half of ```chart: which languages draw a chart, which body format a body carries,
 * and the surgery that writes a converted body back into the note.
 *
 * The format is decided by the body alone, so the same block answers the same way in the preview, in
 * a slide, and in an export without any of them being told.
 */
import { applyFencePatchAtSource, fenceAt, type FenceTarget } from '../fence-edit'
import { isChartTableBody } from './table'

export type ChartMode = 'json' | 'table'

/** Fence languages that render as a chart block. */
export const CHART_LANGUAGES = ['chart', 'chartjs'] as const

/** The body text of a chart fence plus the line its opening fence sits on. */
export interface ChartFence extends FenceTarget {}

export function detectChartMode(body: string): ChartMode {
  return isChartTableBody(body) ? 'table' : 'json'
}

export function applyChartBodyAtFence(content: string, target: ChartFence, nextBody: string): string | null {
  return applyFencePatchAtSource(content, target, { body: nextBody }, CHART_LANGUAGES)
}

/**
 * The chart fence sitting on a line of the note, or null when that line holds something else. A block
 * hands over the line its markup was stamped with, so this is how a write re-reads the body it is
 * replacing rather than trusting what travelled through an attribute.
 */
export function chartFenceAt(content: string, line: number): ChartFence | null {
  const fence = fenceAt(content, line, CHART_LANGUAGES)
  return fence === null ? null : { line, body: fence.body }
}

export { normalizeEol } from '../fence-edit'

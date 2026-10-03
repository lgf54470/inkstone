/**
 * The fence-level half of ```echarts: which languages draw one, which body format a body carries,
 * and the `js` flag on its info line.
 *
 * The flag is the whole of the script policy and it is deliberately loud — it sits beside the
 * language where a reader of the note sees it — because the body it unlocks is JavaScript, not data.
 * Whether a surface honours it at all is decided there (see `echartsScript` in the enhance options),
 * so a note shared with a stranger never runs what only its author asked to run.
 */
import { applyFencePatchAtSource, fenceAt, type FenceTarget } from '../fence-edit'
import { isChartTableBody } from '../chart'

export type EchartsMode = 'option' | 'table'

/** Fence languages that render as an echarts block. */
export const ECHARTS_LANGUAGES = ['echarts'] as const

/** The body text of an echarts fence plus the line its opening fence sits on. */
export interface EchartsFence extends FenceTarget {}

/** The bare flag that says a body may be a JavaScript literal rather than JSON5. */
export const ECHARTS_SCRIPT_KEY = 'js'

const SCRIPT_RE = /(?:^|\s)["']?js["']?(?=\s|$)/i
const SCRIPT_WHOLE_RE = /(?:^|\s)["']?js["']?(?=\s|$)/gi

export function detectEchartsMode(body: string): EchartsMode {
  return isChartTableBody(body) ? 'table' : 'option'
}

/** Whether this fence's info line asked to run JavaScript. */
export function readsFenceScript(info: string): boolean {
  return SCRIPT_RE.test(info)
}

/** The same info line with the flag set or cleared, leaving every other token where it was. */
export function withFenceScript(info: string, on: boolean): string {
  const without = info.replace(SCRIPT_WHOLE_RE, '').trim()
  return on ? `${without} ${ECHARTS_SCRIPT_KEY}`.trim() : without
}

export function echartsFenceAt(content: string, line: number): EchartsFence | null {
  const fence = fenceAt(content, line, ECHARTS_LANGUAGES)
  return fence === null ? null : { line, body: fence.body }
}

/**
 * Rewrites the fence's body, its info line, or both in one edit. A body and a flag travel together
 * because a conversion can change what the body is made of: turning a run JavaScript option into a
 * table has to take the flag back with it, or the note would keep claiming to need it.
 */
export function applyEchartsFencePatch(
  content: string,
  target: EchartsFence,
  patch: { body?: string; script?: boolean },
): string | null {
  if (patch.script === undefined) {
    return applyFencePatchAtSource(content, target, { body: patch.body }, ECHARTS_LANGUAGES)
  }
  const info = fenceAt(content, target.line, ECHARTS_LANGUAGES)?.info
  if (info === undefined) return null
  return applyFencePatchAtSource(
    content,
    target,
    { body: patch.body, info: withFenceScript(info, patch.script) },
    ECHARTS_LANGUAGES,
  )
}

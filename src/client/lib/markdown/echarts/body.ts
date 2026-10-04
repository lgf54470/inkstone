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
import { isChartTableBody, withFenceStyle, type DeclaredStyle } from '../chart'

export type EchartsMode = 'option' | 'table'

/** Fence languages that render as an echarts block. */
export const ECHARTS_LANGUAGES = ['echarts'] as const

/** The body an echarts fence holds, the info line that opens it, and the line that holds both. */
export interface EchartsFence extends FenceTarget {
  info: string
}

/** The bare flag that says a body may be a JavaScript literal rather than JSON5. */
export const ECHARTS_SCRIPT_KEY = 'js'

const SCRIPT_RE = /(?:^|\s)["']?js["']?(?=\s|$)/i
const SCRIPT_WHOLE_RE = /(?:^|\s)["']?js["']?(?=\s|$)/gi

export function detectEchartsMode(body: string): EchartsMode {
  return isChartTableBody(body) ? 'table' : 'option'
}

/**
 * The format a block reads its body as. The note's two names are `json` and `table`; this family calls
 * its data body an `option`, which is the one spelling difference and the only translation here. A
 * stated format wins over inference, so the reader that runs is the one the author asked for — see
 * ../chart/style.
 */
export function resolveEchartsMode(body: string, style: DeclaredStyle | null): EchartsMode {
  if (style === null) return detectEchartsMode(body)
  return style === 'table' ? 'table' : 'option'
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
  return fence === null ? null : { line, body: fence.body, info: fence.info }
}

/**
 * Rewrites the fence's body, its info line, or both in one edit. The body and the two marks travel
 * together because a conversion changes what the body is made of: a JavaScript option turned into a
 * table has to give up the `js` flag it was written for, and carries the new format in `style=` so the
 * note says what it now holds.
 */
export function applyEchartsFencePatch(
  content: string,
  target: EchartsFence,
  patch: { body?: string; script?: boolean; style?: DeclaredStyle },
): string | null {
  if (patch.script === undefined && patch.style === undefined) {
    return applyFencePatchAtSource(content, target, { body: patch.body }, ECHARTS_LANGUAGES)
  }
  let info = target.info
  if (patch.script !== undefined) info = withFenceScript(info, patch.script)
  if (patch.style !== undefined) info = withFenceStyle(info, patch.style)
  return applyFencePatchAtSource(content, target, { body: patch.body, info }, ECHARTS_LANGUAGES)
}

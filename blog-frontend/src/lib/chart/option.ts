import { safeReviver } from './model.ts'

/**
 * Reading the option a ` ```echarts ` body states, on a surface that will not run it.
 *
 * JSON5 and nothing else: an option copied out of the echarts gallery is written in it (unquoted keys,
 * single quotes, trailing commas, comments), which covers every body the app can draw without evaluating
 * the note. What is left over is JavaScript — a `formatter` function, a computed series — and a post has
 * no author beside the reader to confirm that it should run. The app keeps that request for the owner's
 * own preview (`echartsScript` in `features/preview/preview-stage.ts`); here the renderer answers it
 * first, so a fence carrying the `js` marker is shown as source and its body never reaches this file.
 */

export type EchartsOptionReason = 'empty' | 'json' | 'not-object'

export class EchartsOptionError extends Error {
  constructor(readonly reason: EchartsOptionReason, readonly cause: unknown = null) {
    super(reason)
  }
}

/** The part of json5's surface this parser needs, so the module itself is loaded by the caller. */
export interface LooseJson {
  parse(text: string, reviver?: (key: string, value: unknown) => unknown): unknown
}

/** A trailing semicolon is how the gallery writes its examples; the rest is the parser's business. */
function bodyText(raw: string): string {
  return raw.trim().replace(/;\s*$/, '')
}

export function parseEchartsOption(raw: string, json5: LooseJson): unknown {
  const text = bodyText(raw)
  if (text.length === 0) throw new EchartsOptionError('empty')
  let parsed: unknown
  try {
    parsed = json5.parse(text, safeReviver)
  }
  catch (err) {
    throw new EchartsOptionError('json', err)
  }
  if (parsed === null || typeof parsed !== 'object') throw new EchartsOptionError('not-object')
  return parsed
}

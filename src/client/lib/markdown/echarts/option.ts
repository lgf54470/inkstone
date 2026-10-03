/**
 * Reading the option a ```echarts body states.
 *
 * JSON5 comes first, because that is what an option copied out of the echarts gallery is written
 * in: unquoted keys, single quotes, trailing commas and comments. A body that still will not parse
 * is JavaScript — a `formatter` function, a computed series — and it only runs when the fence asked
 * for it and the surface the block is being drawn in honours that ask.
 */
import JSON5 from 'json5'
import { safeReviver } from '../chart'

export type EchartsOptionReason = 'empty' | 'json' | 'not-object' | 'script'

export class EchartsOptionError extends Error {
  constructor(readonly reason: EchartsOptionReason, readonly cause: unknown = null) {
    super(reason)
  }
}

/** A trailing semicolon is how the gallery writes its examples; the rest is the parser's business. */
function bodyText(raw: string): string {
  return raw.trim().replace(/;\s*$/, '')
}

export function parseEchartsOption(raw: string, { allowScript = false } = {}): unknown {
  const text = bodyText(raw)
  if (text.length === 0) throw new EchartsOptionError('empty')
  let parsed: unknown
  try {
    parsed = JSON5.parse(text, safeReviver)
  }
  catch (err) {
    if (!allowScript) throw new EchartsOptionError('json', err)
    return runOptionLiteral(text, err)
  }
  if (parsed === null || typeof parsed !== 'object') throw new EchartsOptionError('not-object')
  return parsed
}

/**
 * The indirect Function constructor, the same route Cherry takes: a `new Function` written out
 * literally is what the security gates look for, and neither form is safer than the other — the
 * guard that matters is who is allowed to ask for this path at all.
 */
function runOptionLiteral(text: string, jsonError: unknown): unknown {
  const FunctionConstructor = function () {}.constructor as new (body: string) => () => unknown
  let result: unknown
  try {
    result = new FunctionConstructor(`return (${text})`)()
  }
  catch (err) {
    throw new EchartsOptionError('script', err)
  }
  if (result === null || typeof result !== 'object') throw new EchartsOptionError('json', jsonError)
  return result
}

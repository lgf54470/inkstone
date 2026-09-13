/**
 * Executes user javascript-example code inside the dedicated Worker thread.
 * Results cross the postMessage boundary as plain strings only, and the Worker
 * has no DOM or parent-page reference, so preview code cannot reach page data.
 * A dedicated thread is also the only way to hard-stop while(true) loops via
 * terminate(); timeouts live in the page-side bridge (js-runner.ts).
 */

export interface JsRunLog {
  type: string
  text: string
}

export interface JsRunOutcome {
  logs: JsRunLog[]
  resultText: string
  errorText: string
  durationMs: number
}

export function formatJsValue(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'symbol' || typeof val === 'bigint') {
    return String(val)
  }
  if (typeof val === 'function') {
    return val.toString()
  }
  if (val instanceof Error) {
    return `${val.name}: ${val.message}`
  }
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

export function formatJsError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

// Shadowed to undefined so direct calls raise TypeError; reachable through
// globalThis indirection, so this is defense in depth — the primary fence is
// "no DOM, no parent reference" plus the page-side terminate timeout.
const SHADOWED_GLOBALS = [
  'console', 'self', 'globalThis', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'indexedDB', 'caches', 'importScripts', 'postMessage', 'close',
]

export function executeUserCode(code: string): JsRunOutcome {
  const logs: JsRunLog[] = []
  const fakeConsole = {
    log: (...args: unknown[]) => logs.push({ type: 'log', text: args.map(formatJsValue).join(' ') }),
    info: (...args: unknown[]) => logs.push({ type: 'info', text: args.map(formatJsValue).join(' ') }),
    warn: (...args: unknown[]) => logs.push({ type: 'warn', text: args.map(formatJsValue).join(' ') }),
    error: (...args: unknown[]) => logs.push({ type: 'error', text: args.map(formatJsValue).join(' ') }),
  }

  const start = performance.now()
  let result: unknown
  let errorText = ''
  try {
    const fn = new Function(...SHADOWED_GLOBALS, `"use strict";\n${code}`)
    result = fn(fakeConsole, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined)
  } catch (err) {
    errorText = formatJsError(err)
  }
  const durationMs = Math.round(performance.now() - start)

  return {
    logs,
    resultText: result === undefined ? '' : formatJsValue(result),
    errorText,
    durationMs,
  }
}

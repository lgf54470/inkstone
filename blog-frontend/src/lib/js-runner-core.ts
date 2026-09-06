/**
 * javascript-example 的执行核心：在 Worker 线程内以 new Function 执行用户代码，
 * 结果只允许携带可序列化数据（字符串），因此可以安全地跨 postMessage 边界传递。
 *
 * 隔离说明：博客文章的 javascript-example 代码可能包含恶意内容，绝不可以在
 * 页面主线程执行（可读取父页面 DOM/存储）。执行放在 Worker 里还有第二个原因：
 * 只有独立线程可以被硬性终止，才能真正拦住 while(true) 这类死循环
 * （iframe 与父页面共享主线程，循环一旦开始整页都会卡死）。
 *
 * 已知残余面：Worker 与页面同源，代码仍能经 globalThis 迂回触达 fetch 等能力；
 * 这里把常见网络/存储/通信全局名遮蔽为 undefined 作为纵深防御，
 * 主要防线仍是“Worker 无 DOM、无父页面引用”+ 超时终止。
 */
export interface JsRunLog {
  type: string
  text: string
}

export interface JsRunOutcome {
  logs: JsRunLog[]
  /** 无返回值时为空字符串 */
  resultText: string
  /** 无错误时为空字符串 */
  errorText: string
  durationMs: number
  timedOut: boolean
}

// 与根仓库 src/client/features/preview/js-runner.ts 的 formatJsValue 保持同步，改动需两处一致
export function formatJsValue(val: unknown): string {
  if (val === null) return 'null'
  if (val === undefined) return 'undefined'
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint' || typeof val === 'symbol') return String(val)
  if (typeof val === 'function') return val.toString()
  if (val instanceof Error) return `${val.name}: ${val.message}`
  try {
    return JSON.stringify(val, null, 2)
  } catch {
    return String(val)
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/** 遮蔽为 undefined 的全局名：用户代码直接调用即抛 TypeError，经 globalThis 仍可触达（纵深防御） */
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
    errorText = errorMessage(err)
  }
  const durationMs = Math.round(performance.now() - start)

  return {
    logs,
    resultText: result === undefined ? '' : formatJsValue(result),
    errorText,
    durationMs,
    timedOut: false,
  }
}
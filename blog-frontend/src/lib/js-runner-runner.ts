/**
 * javascript-example 的浏览器侧 glue：Worker 生命周期（含死循环硬终止）、
 * 隔离 iframe 的创建与输出行转发。
 */
import { JS_RUN_TIMEOUT_MS } from './constants'
import type { JsRunLog, JsRunOutcome } from './js-runner-core'
import { buildFrameSrcdoc, type JsExampleFrameTheme } from './js-runner-frame'

export interface JsRunRow {
  kind: string
  prefix: string
  text: string
}

const TIMEOUT_ERROR_TEXT = `TimeoutError: 执行超过 ${JS_RUN_TIMEOUT_MS}ms，已强制终止`

/**
 * 在 Worker 里执行用户代码并等待结果。超时即 terminate()：这是唯一能真正
 * 中断死循环的方式（同一线程内的任何定时器都会被循环饿死）。
 * 本函数永不 reject——任何失败都收敛为带 errorText 的 outcome。
 */
export function runUserCode(code: string): Promise<JsRunOutcome> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./js-runner-worker.ts', import.meta.url), { type: 'module' })
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({
        logs: [],
        resultText: '',
        errorText: TIMEOUT_ERROR_TEXT,
        durationMs: JS_RUN_TIMEOUT_MS,
        timedOut: true,
      })
    }, JS_RUN_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<JsRunOutcome>) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = () => {
      clearTimeout(timer)
      worker.terminate()
      resolve({
        logs: [],
        resultText: '',
        errorText: 'WorkerError: 运行进程异常终止',
        durationMs: 0,
        timedOut: false,
      })
    }
    worker.postMessage(code)
  })
}

const FRAME_THEME_TOKENS: Array<[keyof JsExampleFrameTheme, string, string]> = [
  ['fontMono', '--font-mono', 'monospace'],
  ['textPrimary', '--text-primary', '#1e293b'],
  ['textTertiary', '--text-tertiary', '#64748b'],
  ['textQuaternary', '--text-quaternary', '#94a3b8'],
  ['accent', '--accent', '#3b82f6'],
  ['warning', '--warning', '#f59e0b'],
  ['danger', '--danger', '#ef4444'],
  ['success', '--success', '#10b981'],
  ['syntaxConstant', '--syntax-constant', '#3b82f6'],
  ['borderSubtle', '--border-subtle', 'rgba(100, 116, 139, 0.2)'],
]

function currentFrameTheme(): JsExampleFrameTheme {
  const theme = {} as JsExampleFrameTheme
  for (const [key, token, fallback] of FRAME_THEME_TOKENS) {
    theme[key] = getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback
  }
  return theme
}

/**
 * 创建隔离输出 iframe：sandbox 只给 allow-scripts（无 allow-same-origin），
 * 文档因此是不透明源，即使其中脚本被攻破也无法触达父页面。
 */
export function createJsExampleFrame(): HTMLIFrameElement {
  const frame = document.createElement('iframe')
  frame.className = 'js-example-frame'
  frame.title = '运行结果（隔离环境）'
  frame.setAttribute('data-js-example-frame', '')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.srcdoc = buildFrameSrcdoc(currentFrameTheme())
  return frame
}

export function forwardRowsToFrame(frame: HTMLIFrameElement, rows: JsRunRow[]): void {
  // 目标是不透明源，只能以 '*' 投递；内容仅为预格式化字符串行，无结构数据
  frame.contentWindow?.postMessage({ rows }, '*')
}

export function buildOutputRows(outcome: JsRunOutcome): JsRunRow[] {
  if (outcome.timedOut) {
    return [{ kind: 'error', prefix: '[ERROR]', text: outcome.errorText }]
  }
  const hasAnyOutput = outcome.logs.length > 0 || outcome.resultText !== '' || outcome.errorText !== ''
  if (!hasAnyOutput) {
    return [{ kind: 'empty', prefix: '', text: '代码已执行，无输出内容' }]
  }
  const rows: JsRunRow[] = outcome.logs.map((log: JsRunLog) => ({
    kind: log.type,
    prefix: `[${log.type.toUpperCase()}]`,
    text: log.text,
  }))
  if (outcome.resultText !== '') {
    rows.push({ kind: 'return', prefix: '[RETURN]', text: outcome.resultText })
  }
  if (outcome.errorText !== '') {
    rows.push({ kind: 'error', prefix: '[ERROR]', text: outcome.errorText })
  }
  return rows
}
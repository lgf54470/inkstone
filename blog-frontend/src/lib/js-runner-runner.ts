/**
 * javascript-example 的浏览器侧执行与输出渲染：Worker 生命周期（含死循环硬终止）
 * 与安全纯文本 DOM 渲染（避免 iframe 加载竞态与白屏，对齐主项目预览视觉）。
 */
import { JS_RUN_TIMEOUT_MS } from './constants'
import type { JsRunOutcome } from './js-runner-core'
import { t, type BlogLocale } from './i18n'

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

export function appendLogRow(outputBody: HTMLElement, type: string, prefix: string, text: string): void {
  const row = document.createElement('div')
  row.className = `js-example-log-row is-${type}`
  const prefixEl = document.createElement('span')
  prefixEl.className = 'js-example-log-prefix'
  prefixEl.textContent = prefix
  const textEl = document.createElement('pre')
  textEl.className = 'js-example-log-text'
  textEl.textContent = text
  row.appendChild(prefixEl)
  row.appendChild(textEl)
  outputBody.appendChild(row)
}

/**
 * 将执行结果安全渲染为 DOM 节点写入 outputBody，使用纯文本 textContent 防御 XSS。
 */
export function renderJsOutcome(
  outputBody: HTMLElement,
  outcome: JsRunOutcome,
  locale?: BlogLocale
): void {
  outputBody.replaceChildren()

  const hasLogs = outcome.logs.length > 0
  const hasResult = outcome.resultText !== ''
  const hasError = outcome.timedOut || outcome.errorText !== ''

  if (!hasLogs && !hasResult && !hasError) {
    const emptyRow = document.createElement('div')
    emptyRow.className = 'js-example-empty-hint'
    emptyRow.textContent = t('interactive.executed_no_output', {}, locale)
    outputBody.appendChild(emptyRow)
    return
  }

  for (const item of outcome.logs) {
    const prefix = item.type === 'error' ? '✖' : item.type === 'warn' ? '▲' : '›'
    appendLogRow(outputBody, item.type, prefix, item.text)
  }

  if (hasResult) {
    appendLogRow(outputBody, 'return', '←', outcome.resultText)
  }

  if (hasError) {
    appendLogRow(outputBody, 'error-banner', '✖', outcome.errorText)
  }
}
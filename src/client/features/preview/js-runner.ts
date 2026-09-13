import { t } from '../../lib/i18n'
import type { JsRunOutcome } from './js-runner-core'

export { formatJsValue } from './js-runner-core'

export const JS_RUN_TIMEOUT_MS = 2000

interface JsLogItem {
  type: 'log' | 'info' | 'warn' | 'error'
  text: string
}


interface JsExecutionResult {
  logs: JsLogItem[]
  result?: string
  error?: string
  durationMs: number
}

export interface JsRunnerWorker {
  postMessage(code: string): void
  terminate(): void
  onmessage: ((event: { data: JsRunOutcome }) => void) | null
  onerror: (() => void) | null
}

function spawnDefaultWorker(): JsRunnerWorker {
  return new Worker(new URL('./js-runner.worker.ts', import.meta.url), { type: 'module' }) as unknown as JsRunnerWorker
}

// The Worker thread is the sandbox: user code cannot reach page DOM or
// storage, and terminate() is the only hard stop for endless loops.
export function executeJsExample(
  code: string,
  spawnWorker: () => JsRunnerWorker = spawnDefaultWorker,
): Promise<JsExecutionResult> {
  return new Promise((resolve) => {
    let worker: JsRunnerWorker
    try {
      worker = spawnWorker()
    } catch (err) {
      resolve({ logs: [], error: formatSpawnError(err), durationMs: 0 })
      return
    }
    const timer = setTimeout(() => {
      worker.terminate()
      resolve({
        logs: [],
        error: `TimeoutError: execution exceeded ${JS_RUN_TIMEOUT_MS}ms and was terminated`,
        durationMs: JS_RUN_TIMEOUT_MS,
      })
    }, JS_RUN_TIMEOUT_MS)

    worker.onmessage = (event) => {
      clearTimeout(timer)
      worker.terminate()
      resolve(toExecutionResult(event.data))
    }
    worker.onerror = () => {
      clearTimeout(timer)
      worker.terminate()
      resolve({ logs: [], error: 'WorkerError: the runner terminated unexpectedly', durationMs: 0 })
    }
    worker.postMessage(code)
  })
}

function toExecutionResult(outcome: JsRunOutcome): JsExecutionResult {
  const result: JsExecutionResult = {
    logs: outcome.logs.map((item) => ({ type: item.type as JsLogItem['type'], text: item.text })),
    durationMs: outcome.durationMs,
  }
  if (outcome.resultText) result.result = outcome.resultText
  if (outcome.errorText) result.error = outcome.errorText
  return result
}

function formatSpawnError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

export function handleJsExampleSwitch(switchBtn: HTMLButtonElement): void {
  const isChecked = switchBtn.classList.contains('is-checked')
  const nextChecked = !isChecked
  switchBtn.classList.toggle('is-checked', nextChecked)
  switchBtn.setAttribute('aria-checked', String(nextChecked))

  const block = switchBtn.closest<HTMLElement>('.js-example-block')
  const codeBlock = block?.querySelector<HTMLElement>('.code-block')
  if (codeBlock) {
    codeBlock.classList.toggle('has-line-numbers', nextChecked)
    codeBlock.dataset.lineNumbers = String(nextChecked)
  }
}

export function handleJsExampleRun(runBtn: HTMLButtonElement): void {
  const block = runBtn.closest<HTMLElement>('.js-example-block')
  if (!block) return

  const codeEl = block.querySelector<HTMLElement>('.code-block pre code')
  const outputBody = block.querySelector<HTMLElement>('.js-example-output-body')
  const statusEl = block.querySelector<HTMLElement>('.js-example-output-status')
  if (!codeEl || !outputBody) return

  void executeJsExample(codeEl.textContent ?? '').then(({ logs, result, error, durationMs }) => {
    updateRunStatus(statusEl, error, durationMs)
    outputBody.innerHTML = ''

    if (logs.length === 0 && result === undefined && !error) {
      const emptyRow = document.createElement('div')
      emptyRow.className = 'js-example-empty-hint'
      emptyRow.textContent = t('workspace.executed_no_output')
      outputBody.appendChild(emptyRow)
      return
    }

    logs.forEach((item) => {
      appendLogRow(outputBody, item.type, item.type === 'error' ? '✖' : item.type === 'warn' ? '▲' : '›', item.text)
    })

    if (result !== undefined) {
      appendLogRow(outputBody, 'return', '←', result)
    }

    if (error) {
      appendLogRow(outputBody, 'error-banner', '✖', error)
    }
  })
}

function updateRunStatus(statusEl: HTMLElement | null, error: string | undefined, durationMs: number): void {
  if (!statusEl) return
  if (error) {
    statusEl.className = 'js-example-output-status is-error'
    statusEl.textContent = `✕ ${durationMs}ms`
  } else {
    statusEl.className = 'js-example-output-status is-success'
    statusEl.textContent = `✓ ${durationMs}ms`
  }
}

function appendLogRow(outputBody: HTMLElement, type: string, prefix: string, text: string): void {
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

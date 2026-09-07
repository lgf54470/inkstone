// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../../tests/helpers/fake-worker'
import { JS_RUN_TIMEOUT_MS } from './constants'
import { renderJsOutcome, runUserCode } from './js-runner-runner'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('runUserCode worker glue', () => {
  it('resolves with the outcome from the worker', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const outcome = await runUserCode('const n = 21; console.log("sum", n * 2); return n * 2')
    expect(outcome.logs).toEqual([{ type: 'log', text: 'sum 42' }])
    expect(outcome.resultText).toBe('42')
    expect(outcome.errorText).toBe('')
    expect(outcome.timedOut).toBe(false)
  })

  it('terminates a hanging worker after the timeout and reports timedOut', async () => {
    vi.useFakeTimers()
    class HangingWorker extends FakeWorker {
      constructor() {
        super('hang')
      }
    }
    vi.stubGlobal('Worker', HangingWorker)
    const outcomePromise = runUserCode('while (true) {}')
    await vi.advanceTimersByTimeAsync(JS_RUN_TIMEOUT_MS)
    const outcome = await outcomePromise
    expect(outcome.timedOut).toBe(true)
    expect(outcome.errorText).toContain('TimeoutError')
    expect(outcome.durationMs).toBe(JS_RUN_TIMEOUT_MS)
  })

  it('reports a worker crash as an error outcome instead of rejecting', async () => {
    class CrashingWorker extends FakeWorker {
      constructor() {
        super('fail')
      }
    }
    vi.stubGlobal('Worker', CrashingWorker)
    const outcome = await runUserCode('crash')
    expect(outcome.errorText).toBe('WorkerError: 运行进程异常终止')
    expect(outcome.timedOut).toBe(false)
  })
})

describe('renderJsOutcome log rows', () => {
  it('renders log, warn, error, return, and error banner rows with correct symbols', () => {
    const container = document.createElement('div')
    renderJsOutcome(container, {
      logs: [
        { type: 'log', text: '普通日志' },
        { type: 'warn', text: '警告信息' },
        { type: 'error', text: '错误日志' },
      ],
      resultText: '42',
      errorText: 'BoomError: boom',
      durationMs: 5,
      timedOut: false,
    })

    const rows = container.querySelectorAll('.js-example-log-row')
    expect(rows.length).toBe(5)

    expect(rows[0]?.classList.contains('is-log')).toBe(true)
    expect(rows[0]?.querySelector('.js-example-log-prefix')?.textContent).toBe('›')
    expect(rows[0]?.querySelector('.js-example-log-text')?.textContent).toBe('普通日志')

    expect(rows[1]?.classList.contains('is-warn')).toBe(true)
    expect(rows[1]?.querySelector('.js-example-log-prefix')?.textContent).toBe('▲')
    expect(rows[1]?.querySelector('.js-example-log-text')?.textContent).toBe('警告信息')

    expect(rows[2]?.classList.contains('is-error')).toBe(true)
    expect(rows[2]?.querySelector('.js-example-log-prefix')?.textContent).toBe('✖')
    expect(rows[2]?.querySelector('.js-example-log-text')?.textContent).toBe('错误日志')

    expect(rows[3]?.classList.contains('is-return')).toBe(true)
    expect(rows[3]?.querySelector('.js-example-log-prefix')?.textContent).toBe('←')
    expect(rows[3]?.querySelector('.js-example-log-text')?.textContent).toBe('42')

    expect(rows[4]?.classList.contains('is-error-banner')).toBe(true)
    expect(rows[4]?.querySelector('.js-example-log-prefix')?.textContent).toBe('✖')
    expect(rows[4]?.querySelector('.js-example-log-text')?.textContent).toBe('BoomError: boom')
  })
})

describe('renderJsOutcome edge cases', () => {
  it('renders empty hint when there is no output', () => {
    const container = document.createElement('div')
    renderJsOutcome(container, {
      logs: [],
      resultText: '',
      errorText: '',
      durationMs: 1,
      timedOut: false,
    }, 'zh-CN')

    const empty = container.querySelector('.js-example-empty-hint')
    expect(empty).not.toBeNull()
    expect(empty?.textContent).toBe('代码已执行，无输出内容')
  })

  it('supports en-US locale for empty hint', () => {
    const container = document.createElement('div')
    renderJsOutcome(container, {
      logs: [],
      resultText: '',
      errorText: '',
      durationMs: 1,
      timedOut: false,
    }, 'en-US')

    const empty = container.querySelector('.js-example-empty-hint')
    expect(empty?.textContent).toBe('Code executed with no output')
  })

  it('safely escapes HTML tags in log text using textContent', () => {
    const container = document.createElement('div')
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    renderJsOutcome(container, {
      logs: [{ type: 'log', text: evil }],
      resultText: evil,
      errorText: evil,
      durationMs: 2,
      timedOut: false,
    })

    expect(container.querySelectorAll('script').length).toBe(0)
    expect(container.querySelectorAll('img').length).toBe(0)
    expect(container.querySelector('.is-log .js-example-log-text')?.textContent).toBe(evil)
  })
})
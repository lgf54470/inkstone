// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeWorker } from '../../tests/helpers/fake-worker'
import { JS_RUN_TIMEOUT_MS } from './constants'
import { buildOutputRows, createJsExampleFrame, forwardRowsToFrame, runUserCode } from './js-runner-runner'

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

describe('js-example output frame', () => {
  it('creates a sandboxed iframe without allow-same-origin', () => {
    const frame = createJsExampleFrame()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.srcdoc).toContain('textContent')
    expect(frame.srcdoc).not.toContain('innerHTML')
    expect(frame.srcdoc).toContain('var(--text-primary)')
  })

  it('forwards preformatted rows to the frame via postMessage', () => {
    const postMessage = vi.fn()
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement
    forwardRowsToFrame(frame, [{ kind: 'log', prefix: '[LOG]', text: 'hi' }])
    expect(postMessage).toHaveBeenCalledWith({ rows: [{ kind: 'log', prefix: '[LOG]', text: 'hi' }] }, '*')
  })

  it('forwards nothing when the frame window is not ready', () => {
    const frame = { contentWindow: null } as unknown as HTMLIFrameElement
    expect(() => forwardRowsToFrame(frame, [{ kind: 'log', prefix: '[LOG]', text: 'hi' }])).not.toThrow()
  })
})

describe('buildOutputRows', () => {
  it('maps logs, return value and error into rows', () => {
    const rows = buildOutputRows({
      logs: [{ type: 'warn', text: '小心' }],
      resultText: '42',
      errorText: 'Error: boom',
      durationMs: 3,
      timedOut: false,
    })
    expect(rows).toEqual([
      { kind: 'warn', prefix: '[WARN]', text: '小心' },
      { kind: 'return', prefix: '[RETURN]', text: '42' },
      { kind: 'error', prefix: '[ERROR]', text: 'Error: boom' },
    ])
  })

  it('emits an empty hint when nothing was produced', () => {
    const rows = buildOutputRows({ logs: [], resultText: '', errorText: '', durationMs: 1, timedOut: false })
    expect(rows).toEqual([{ kind: 'empty', prefix: '', text: '代码已执行，无输出内容' }])
  })

  it('emits only the timeout error row on timeout', () => {
    const rows = buildOutputRows({ logs: [], resultText: '', errorText: 'TimeoutError: x', durationMs: 2000, timedOut: true })
    expect(rows).toEqual([{ kind: 'error', prefix: '[ERROR]', text: 'TimeoutError: x' }])
  })
})
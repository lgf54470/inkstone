import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeUserCode, formatJsValue } from './js-runner-core'
import { executeJsExample, JS_RUN_TIMEOUT_MS, type JsRunnerWorker } from './js-runner'
import type { JsRunOutcome } from './js-runner-core'

describe('js-runner core execution', () => {
  it('captures console.log output with primitive values and objects', () => {
    const res = executeUserCode(`
      console.log("Hello", 42, true);
      console.log({ a: 1, b: "test" });
    `)
    expect(res.errorText).toBe('')
    expect(res.logs).toHaveLength(2)
    expect(res.logs[0]!.type).toBe('log')
    expect(res.logs[0]!.text).toBe('Hello 42 true')
    expect(res.logs[1]!.text).toContain('"a": 1')
  })

  it('captures console.warn and console.error', () => {
    const res = executeUserCode(`
      console.warn("Warning msg");
      console.error("Error msg");
    `)
    expect(res.logs.map((item) => item.type)).toEqual(['warn', 'error'])
  })

  it('captures returned values', () => {
    const res = executeUserCode(`
      const x = 10;
      const y = 20;
      return x + y;
    `)
    expect(res.errorText).toBe('')
    expect(res.resultText).toBe('30')
  })

  it('captures runtime exceptions gracefully', () => {
    const res = executeUserCode(`
      const obj = null;
      obj.someMethod();
    `)
    expect(res.errorText).toContain('TypeError')
  })

  it('shadows network and storage globals so direct calls fail closed', () => {
    expect(executeUserCode('return typeof fetch;').resultText).toBe('undefined')
    expect(executeUserCode('return typeof self;').resultText).toBe('undefined')
    expect(executeUserCode('return typeof globalThis;').resultText).toBe('undefined')
  })
})

describe('js-runner formatJsValue', () => {
  it('handles circular references in formatJsValue', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatJsValue(circular)).toBe('[object Object]')
  })
})

class FakeWorker implements JsRunnerWorker {
  onmessage: ((event: { data: JsRunOutcome }) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  posted: string[] = []

  postMessage(code: string): void {
    this.posted.push(code)
  }

  terminate(): void {
    this.terminated = true
  }

  receive(outcome: JsRunOutcome): void {
    this.onmessage?.({ data: outcome })
  }
}

function outcome(overrides: Partial<JsRunOutcome> = {}): JsRunOutcome {
  return {
    logs: [{ type: 'log', text: 'hi' }],
    resultText: '42',
    errorText: '',
    durationMs: 5,
    ...overrides,
  }
}

describe('js-runner worker bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts the code to the worker and maps the outcome', async () => {
    const worker = new FakeWorker()
    const pending = executeJsExample('return 1;', () => worker)
    worker.receive(outcome())
    const res = await pending
    expect(worker.posted).toEqual(['return 1;'])
    expect(worker.terminated).toBe(true)
    expect(res.logs).toEqual([{ type: 'log', text: 'hi' }])
    expect(res.result).toBe('42')
    expect(res.error).toBeUndefined()
    expect(res.durationMs).toBe(5)
  })

  it('maps worker errors to an error-only result', async () => {
    const worker = new FakeWorker()
    const pending = executeJsExample('return 1;', () => worker)
    worker.receive(outcome({ logs: [], resultText: '', errorText: 'SyntaxError: bad code' }))
    const res = await pending
    expect(res.result).toBeUndefined()
    expect(res.error).toBe('SyntaxError: bad code')
  })

  it('resolves with a spawn failure instead of throwing', async () => {
    const res = await executeJsExample('return 1;', () => {
      throw new Error('no worker support')
    })
    expect(res.logs).toEqual([])
    expect(res.error).toBe('Error: no worker support')
  })

})

describe('js-runner bridge failure paths', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('terminates the worker and reports a timeout for endless loops', async () => {
    const worker = new FakeWorker()
    const pending = executeJsExample('while (true) {}', () => worker)
    await vi.advanceTimersByTimeAsync(JS_RUN_TIMEOUT_MS)
    const res = await pending
    expect(worker.terminated).toBe(true)
    expect(res.error).toContain('TimeoutError')
    expect(res.durationMs).toBe(JS_RUN_TIMEOUT_MS)
  })

  it('resolves with a runner failure when the worker errors out', async () => {
    const worker = new FakeWorker()
    const pending = executeJsExample('return 1;', () => worker)
    worker.onerror?.()
    const res = await pending
    expect(worker.terminated).toBe(true)
    expect(res.error).toContain('WorkerError')
  })
})

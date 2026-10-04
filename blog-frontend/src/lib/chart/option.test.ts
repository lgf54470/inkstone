import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { EchartsOptionError, parseEchartsOption } from './option'

/**
 * The reader a ` ```echarts ` body gets on a post: the gallery's own dialect, and nothing that runs.
 */

function failure(raw: string): EchartsOptionError {
  try {
    parseEchartsOption(raw, JSON5)
  }
  catch (err) {
    expect(err).toBeInstanceOf(EchartsOptionError)
    return err as EchartsOptionError
  }
  throw new Error(`expected ${raw} to be refused`)
}

describe('reading an echarts option body', () => {
  it('takes the dialect the echarts gallery writes in', () => {
    const option = parseEchartsOption('{\n  // a comment\n  series: [{ type: \'bar\', data: [1, 2] }],\n}', JSON5)
    expect(option).toMatchObject({ series: [{ type: 'bar', data: [1, 2] }] })
  })

  it('takes the semicolon an example is pasted with, but not parentheses', () => {
    expect(parseEchartsOption("{ title: { text: 'T' } };", JSON5)).toMatchObject({ title: { text: 'T' } })
    expect(failure("({ title: { text: 'T' } });").reason).toBe('json')
  })

  it('reports a body that is JavaScript rather than data', () => {
    expect(failure('{ series: [{ itemStyle: { color: (p) => p.value } }] }').reason).toBe('json')
  })

  it('reports a body with nothing in it', () => {
    expect(failure('   ; ').reason).toBe('empty')
  })

  it('reports a body that is not an object', () => {
    expect(failure('42').reason).toBe('not-object')
    expect(failure('null').reason).toBe('not-object')
  })

  it('keeps a prototype key out of the option it returns', () => {
    const option = parseEchartsOption('{"__proto__": {"polluted": true}, "a": 1}', JSON5) as Record<string, unknown>
    expect(Object.keys(option)).toEqual(['a'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

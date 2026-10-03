import { describe, expect, it } from 'vitest'
import { EchartsOptionError, parseEchartsOption } from './option'

const reasonOf = (run: () => unknown): string => {
  try {
    run()
  }
  catch (err) {
    return err instanceof EchartsOptionError ? err.reason : `other:${String(err)}`
  }
  return 'ok'
}

describe('an echarts option body', () => {
  it('reads the gallery form: unquoted keys, single quotes, a trailing comma and a semicolon', () => {
    expect(parseEchartsOption("{ title: { text: 'Hi' }, series: [{ type: 'bar', data: [1, 2] },], };")).toEqual({
      title: { text: 'Hi' },
      series: [{ type: 'bar', data: [1, 2] }],
    })
  })

  it('reads comments, which strict JSON refuses', () => {
    expect(parseEchartsOption('{ // one\n a: 1 /* two */ }')).toEqual({ a: 1 })
  })

  it('refuses a body that is nothing', () => {
    expect(reasonOf(() => parseEchartsOption('   \n '))).toBe('empty')
  })

  it('refuses a scalar, which is not something the library can draw', () => {
    expect(reasonOf(() => parseEchartsOption('42'))).toBe('not-object')
  })

  it('keeps a function out when the fence did not ask for JavaScript', () => {
    const body = '{ series: [{ type: \'line\', data: [1], tooltip: { formatter: (p) => p.value } }] }'
    expect(reasonOf(() => parseEchartsOption(body))).toBe('json')
    const option = parseEchartsOption(body, { allowScript: true }) as { series: { tooltip: { formatter: (p: { value: number }) => string } }[] }
    expect(option.series[0].tooltip.formatter({ value: 7 })).toBe(7)
  })

  it('still prefers JSON5 when the fence allows JavaScript, so a data body never runs a parser', () => {
    expect(parseEchartsOption('{ a: 1 }', { allowScript: true })).toEqual({ a: 1 })
  })

  it('refuses a literal that evaluates to something other than an object', () => {
    expect(reasonOf(() => parseEchartsOption('1 + 1', { allowScript: true }))).toBe('json')
  })

  it('reports a literal that throws rather than drawing half a chart', () => {
    expect(reasonOf(() => parseEchartsOption('{ a: notDefined()', { allowScript: true }))).toBe('script')
  })

  it('drops a prototype key the option names', () => {
    const option = parseEchartsOption('{ __proto__: { polluted: true }, a: 1 }') as Record<string, unknown>
    expect(option).toEqual({ a: 1 })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

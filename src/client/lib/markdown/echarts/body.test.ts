import { describe, expect, it } from 'vitest'
import {
  applyEchartsFencePatch,
  detectEchartsMode,
  echartsFenceAt,
  readsFenceScript,
  withFenceScript,
} from './body'

const OPTION = '{ title: { text: \'Hi\' } }'
const TABLE = '| :bar: | A |\n| --- | --- |\n| s | 1 |'

describe('an echarts fence', () => {
  it('names its format by the body alone', () => {
    expect(detectEchartsMode(OPTION)).toBe('option')
    expect(detectEchartsMode(TABLE)).toBe('table')
    expect(detectEchartsMode('  \n' + TABLE)).toBe('table')
  })

  it('reads the script flag as its own word', () => {
    expect(readsFenceScript('echarts js')).toBe(true)
    expect(readsFenceScript('echarts title="x" js')).toBe(true)
    expect(readsFenceScript('echarts "js"')).toBe(true)
    expect(readsFenceScript('echarts')).toBe(false)
    expect(readsFenceScript('echarts json')).toBe(false)
    expect(readsFenceScript('echarts jsx')).toBe(false)
  })

  it('writes the flag back without disturbing the rest of the line', () => {
    expect(withFenceScript('echarts title="x"', true)).toBe('echarts title="x" js')
    expect(withFenceScript('echarts title="x" js', false)).toBe('echarts title="x"')
    expect(withFenceScript('echarts js', true)).toBe('echarts js')
    expect(readsFenceScript(withFenceScript('echarts', true))).toBe(true)
    expect(readsFenceScript(withFenceScript('echarts js', false))).toBe(false)
  })

  it('finds its own fence by the line the block was stamped with', () => {
    const note = 'intro\n```echarts\n' + OPTION + '\n```\n'
    expect(echartsFenceAt(note, 1)).toEqual({ line: 1, body: OPTION })
    expect(echartsFenceAt(note, 0)).toBeNull()
    expect(echartsFenceAt('```chart\n{}\n```', 0)).toBeNull()
  })

  it('keeps a CRLF note that way when it rewrites one', () => {
    const note = '```echarts\r\n' + OPTION + '\r\n```\r\n'
    const next = applyEchartsFencePatch(note, { line: 0, body: OPTION }, { body: '{ a: 1 }' })
    expect(next).toBe('```echarts\r\n{ a: 1 }\r\n```\r\n')
  })

  it('changes the body, the flag, or both in one edit', () => {
    const note = '```echarts js\n' + OPTION + '\n```\n'
    const target = { line: 0, body: OPTION }
    expect(applyEchartsFencePatch(note, target, { body: '{ a: 1 }' })).toContain('```echarts js\n{ a: 1 }')
    expect(applyEchartsFencePatch(note, target, { script: false })).toContain('```echarts\n')
    const both = applyEchartsFencePatch(note, target, { body: TABLE, script: false })
    expect(both).toContain('```echarts\n| :bar: | A |')
    expect(both).not.toContain(' js')
  })

  it('declines to write when the fence no longer holds the body it was drawn from', () => {
    const note = '```echarts\n{ other: 1 }\n```\n'
    expect(applyEchartsFencePatch(note, { line: 0, body: OPTION }, { body: '{ a: 1 }' })).toBeNull()
  })
})

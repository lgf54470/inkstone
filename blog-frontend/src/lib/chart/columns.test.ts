import { describe, expect, it } from 'vitest'
import { resolveScatterColumns } from './columns.ts'
import type { ChartTable } from './model.ts'

/**
 * Which columns of a scatter table mean what — the reading both chart backends share, so it is pinned
 * once here rather than twice in each converter.
 */

function table(header: string[], options: Record<string, unknown> = {}): ChartTable {
  return { kind: 'scatter', options, header, rows: [] }
}

describe('the scatter column mapping', () => {
  it('treats a column the mapping does not name as absent, not as the first one', () => {
    // The keyword cell leaves an empty header cell behind, and `indexOf('')` answers 0 for it: a mapping
    // of x and y alone used to come back with a size column and a series column nobody wrote.
    const mapped = resolveScatterColumns(table(['', 'temp', 'sales'], { 'cherry:mapping': { x: 'temp', y: 'sales' } }))
    expect(mapped).toEqual({ x: 1, y: 2, size: -1, series: -1 })
  })

  it('takes every column a mapping does name', () => {
    const mapped = resolveScatterColumns(table(['', 'X', 'Y', 'Size', 'Group'], {
      'cherry:mapping': { x: 'X', y: 'Y', size: 'Size', group: 'Group' },
    }))
    expect(mapped).toEqual({ x: 1, y: 2, size: 3, series: 4 })
  })

  it('refuses a mapping whose x or y the header does not name', () => {
    expect(resolveScatterColumns(table(['', 'a', 'b'], { 'cherry:mapping': { x: 'nope', y: 'b' } }))).toBeNull()
  })

  it('falls back to the documented column words when no mapping is written', () => {
    expect(resolveScatterColumns(table(['', '横坐标', '纵坐标']))).toEqual({ x: 1, y: 2, size: -1, series: -1 })
  })
})
